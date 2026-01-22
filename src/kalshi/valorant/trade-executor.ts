/**
 * Trade Executor
 * 
 * Generates trade signals, calculates optimal bet sizing,
 * and executes trades on Kalshi with proper risk management.
 */

import { 
  SeriesAnalysis, 
  KalshiMarket, 
  TradeSignal, 
  TradeExecution,
  TradingConfig,
  DEFAULT_TRADING_CONFIG 
} from './types';
import { KalshiClient, getKalshiClient } from './kalshi-client';

// ============================================================================
// Kelly Criterion
// ============================================================================

/**
 * Calculate optimal bet size using Kelly Criterion
 * 
 * Kelly = (bp - q) / b
 * Where:
 *   b = odds received on the bet (decimal odds - 1)
 *   p = probability of winning
 *   q = probability of losing (1 - p)
 */
function kellyBetSize(
  probability: number,
  odds: number, // Decimal odds (e.g., 2.0 for even money)
  fraction: number = 0.25 // Use fractional Kelly for safety
): number {
  const b = odds - 1;
  const p = probability;
  const q = 1 - p;
  
  const kelly = (b * p - q) / b;
  
  // Never bet negative Kelly (no edge)
  if (kelly <= 0) return 0;
  
  // Apply fractional Kelly
  return kelly * fraction;
}

/**
 * Convert Kalshi price to decimal odds
 * Kalshi prices are in cents (1-99)
 */
function priceToOdds(priceInCents: number): number {
  // If you buy YES at 60¢, you win $1 if correct
  // So decimal odds = 100 / price
  return 100 / priceInCents;
}

// ============================================================================
// Signal Generator
// ============================================================================

export function generateTradeSignal(
  analysis: SeriesAnalysis,
  market: KalshiMarket,
  config: TradingConfig = DEFAULT_TRADING_CONFIG
): TradeSignal {
  const { team1, team2, seriesWinProb, warnings, edgeFactors } = analysis;
  
  // Get market implied probability
  // If YES = Team 1 wins, then yesPrice / 100 = implied prob
  const impliedProb = market.yesPrice / 100;
  const modelProb = seriesWinProb.team1;
  
  // Calculate edge
  const edgeOnTeam1 = modelProb - impliedProb;
  const edgeOnTeam2 = (1 - modelProb) - (1 - impliedProb);
  
  // Determine which side has edge
  let recommendation: 'BET_TEAM1' | 'BET_TEAM2' | 'NO_EDGE' | 'SKIP' = 'NO_EDGE';
  let edge = 0;
  let betSide: 'yes' | 'no' = 'yes';
  let betPrice = market.yesAsk;
  let betOdds = priceToOdds(betPrice);
  
  if (edgeOnTeam1 > config.minEdge) {
    recommendation = 'BET_TEAM1';
    edge = edgeOnTeam1;
    betSide = 'yes';
    betPrice = market.yesAsk;
    betOdds = priceToOdds(betPrice);
  } else if (edgeOnTeam2 > config.minEdge) {
    recommendation = 'BET_TEAM2';
    edge = edgeOnTeam2;
    betSide = 'no';
    betPrice = market.noAsk;
    betOdds = priceToOdds(betPrice);
  }
  
  // Check confidence threshold
  if (seriesWinProb.confidence < config.minConfidence) {
    recommendation = 'SKIP';
  }
  
  // Check for high-severity warnings
  const hasHighWarning = warnings.some(w => w.severity === 'high');
  if (hasHighWarning && config.excludeNewRosters) {
    recommendation = 'SKIP';
  }
  
  // Calculate suggested stake using Kelly
  let suggestedStake = 0;
  if (recommendation === 'BET_TEAM1' || recommendation === 'BET_TEAM2') {
    const probToUse = recommendation === 'BET_TEAM1' ? modelProb : (1 - modelProb);
    const kellyFraction = kellyBetSize(probToUse, betOdds, config.kellyFraction);
    suggestedStake = Math.min(
      config.bankroll * kellyFraction,
      config.bankroll * config.maxBetPercent,
      config.maxExposurePerMatch
    );
    suggestedStake = Math.round(suggestedStake * 100) / 100; // Round to cents
  }
  
  // Build reasoning
  const reasoning: string[] = [];
  
  if (recommendation === 'BET_TEAM1') {
    reasoning.push(`Model: ${team1.name} wins ${(modelProb * 100).toFixed(1)}%`);
    reasoning.push(`Market: Implied ${(impliedProb * 100).toFixed(1)}%`);
    reasoning.push(`Edge: ${(edge * 100).toFixed(1)}% on ${team1.name}`);
  } else if (recommendation === 'BET_TEAM2') {
    reasoning.push(`Model: ${team2.name} wins ${((1 - modelProb) * 100).toFixed(1)}%`);
    reasoning.push(`Market: Implied ${((1 - impliedProb) * 100).toFixed(1)}%`);
    reasoning.push(`Edge: ${(edge * 100).toFixed(1)}% on ${team2.name}`);
  } else if (recommendation === 'NO_EDGE') {
    reasoning.push(`No sufficient edge found (min: ${(config.minEdge * 100).toFixed(0)}%)`);
    reasoning.push(`Team 1 edge: ${(edgeOnTeam1 * 100).toFixed(1)}%`);
    reasoning.push(`Team 2 edge: ${(edgeOnTeam2 * 100).toFixed(1)}%`);
  } else if (recommendation === 'SKIP') {
    if (seriesWinProb.confidence < config.minConfidence) {
      reasoning.push(`Low confidence: ${(seriesWinProb.confidence * 100).toFixed(0)}%`);
    }
    if (hasHighWarning) {
      reasoning.push('High severity warnings detected');
      warnings.filter(w => w.severity === 'high').forEach(w => {
        reasoning.push(`⚠️ ${w.message}`);
      });
    }
  }
  
  // Add edge factors to reasoning
  edgeFactors.forEach(f => {
    reasoning.push(`${f.impact > 0 ? '📈' : '📉'} ${f.description}`);
  });
  
  return {
    matchId: `${team1.id}_vs_${team2.id}`,
    market,
    analysis,
    recommendation,
    edge,
    impliedProbability: impliedProb,
    modelProbability: modelProb,
    confidence: seriesWinProb.confidence,
    suggestedStake,
    reasoning,
  };
}

// ============================================================================
// Trade Executor
// ============================================================================

export class TradeExecutor {
  private client: KalshiClient;
  private config: TradingConfig;
  private dailyPnL: number = 0;
  private openPositions: number = 0;
  
  constructor(config: TradingConfig = DEFAULT_TRADING_CONFIG) {
    this.config = config;
    this.client = getKalshiClient({ useDemo: config.useDemo });
  }
  
  /**
   * Execute a trade based on a signal
   */
  async executeTrade(signal: TradeSignal): Promise<TradeExecution | null> {
    // Pre-flight checks
    if (!this.canTrade(signal)) {
      console.log('❌ Trade blocked by risk checks');
      return null;
    }
    
    if (!this.config.autoExecute) {
      console.log('⏸️ Auto-execute disabled. Manual confirmation required.');
      return null;
    }
    
    const { market, recommendation, suggestedStake } = signal;
    
    // Determine side and price
    const side = recommendation === 'BET_TEAM1' ? 'yes' : 'no';
    const price = side === 'yes' ? market.yesAsk : market.noAsk;
    
    // Calculate number of contracts
    // Each contract costs `price` cents and pays $1 if correct
    const contracts = Math.floor((suggestedStake * 100) / price);
    
    if (contracts < 1) {
      console.log('❌ Stake too small for even 1 contract');
      return null;
    }
    
    try {
      console.log(`📤 Placing order: ${contracts} ${side.toUpperCase()} @ ${price}¢ on ${market.ticker}`);
      
      const result = await this.client.createOrder({
        ticker: market.ticker,
        side,
        type: 'limit',
        count: contracts,
        yesPrice: side === 'yes' ? price : (100 - price),
        clientOrderId: `vb_${Date.now()}_${market.ticker}`,
      });
      
      this.openPositions++;
      
      const execution: TradeExecution = {
        signalId: signal.matchId,
        orderId: result.orderId,
        ticker: market.ticker,
        side,
        price,
        quantity: contracts,
        executedAt: new Date(),
        status: 'pending',
      };
      
      console.log(`✅ Order placed: ${result.orderId}`);
      
      return execution;
    } catch (error) {
      console.error('❌ Order failed:', error);
      return null;
    }
  }
  
  /**
   * Check if we can place this trade based on risk limits
   */
  private canTrade(signal: TradeSignal): boolean {
    // Check daily loss limit
    if (this.dailyPnL < -this.config.maxDailyLoss) {
      console.log('🛑 Daily loss limit reached');
      return false;
    }
    
    // Check open positions limit
    if (this.openPositions >= this.config.maxOpenPositions) {
      console.log('🛑 Max open positions reached');
      return false;
    }
    
    // Check if recommendation is actionable
    if (signal.recommendation === 'NO_EDGE' || signal.recommendation === 'SKIP') {
      return false;
    }
    
    // Check minimum stake
    if (signal.suggestedStake < 1) {
      console.log('🛑 Stake too small');
      return false;
    }
    
    return true;
  }
  
  /**
   * Get current account status
   */
  async getAccountStatus(): Promise<{
    balance: number;
    available: number;
    openOrders: number;
    positions: number;
    dailyPnL: number;
  }> {
    const balance = await this.client.getBalance();
    const orders = await this.client.getOrders();
    const positions = await this.client.getPositions();
    
    return {
      balance: balance.balance,
      available: balance.available,
      openOrders: orders.filter(o => o.status === 'open').length,
      positions: positions.length,
      dailyPnL: this.dailyPnL,
    };
  }
  
  /**
   * Cancel all open orders
   */
  async cancelAllOrders(): Promise<void> {
    await this.client.cancelAllOrders();
    console.log('🗑️ All orders cancelled');
  }
  
  /**
   * Reset daily P&L tracking (call at start of each day)
   */
  resetDailyTracking(): void {
    this.dailyPnL = 0;
    this.openPositions = 0;
  }
  
  /**
   * Update P&L (call when positions settle)
   */
  updatePnL(pnl: number): void {
    this.dailyPnL += pnl;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const tradeExecutor = {
  kellyBetSize,
  priceToOdds,
  generateTradeSignal,
  TradeExecutor,
};
