import { EventEmitter } from 'events';
import { prisma } from '@/lib/prisma';
import { orderBookTracker } from '@/services/orderbook/tracker';

export interface Position {
  id: string;
  marketId: string;
  side: 'YES' | 'NO';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  openedAt: Date;
  closedAt?: Date;
  status: 'OPEN' | 'CLOSED';
}

export interface OrderRequest {
  marketId: string;
  side: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  size: number;
  price?: number; // If undefined, use market order
  postOnly?: boolean; // Only place limit orders (no taker fees)
}

export interface RiskLimits {
  maxPositionSize: number; // Max contracts per position
  maxTotalExposure: number; // Max $ across all positions
  maxLossPerTrade: number; // Stop loss per trade
  maxDrawdown: number; // Max portfolio drawdown
}

export class TradingExecutor extends EventEmitter {
  private positions = new Map<string, Position>();
  private riskLimits: RiskLimits = {
    maxPositionSize: 1000,
    maxTotalExposure: 10000,
    maxLossPerTrade: 100,
    maxDrawdown: 500,
  };

  constructor(riskLimits?: Partial<RiskLimits>) {
    super();
    if (riskLimits) {
      this.riskLimits = { ...this.riskLimits, ...riskLimits };
    }
  }

  /**
   * Execute a trade (one-click)
   */
  async executeTrade(request: OrderRequest): Promise<Position | null> {
    console.log(`🎯 Executing trade: ${request.side} ${request.size} ${request.outcome} @ $${request.price || 'MARKET'}`);

    // Pre-trade checks
    const checks = await this.preTradeChecks(request);
    if (!checks.passed) {
      console.error(`❌ Pre-trade check failed: ${checks.reason}`);
      this.emit('trade_rejected', { request, reason: checks.reason });
      return null;
    }

    try {
      // Execute the order
      const execution = await this.placeOrder(request);
      if (!execution) {
        console.error('❌ Order execution failed');
        return null;
      }

      // Create position
      const position = await this.createPosition(request, execution);

      // Store in database
      await this.persistTrade(position);

      console.log(`✅ Trade executed: ${position.id}`);
      this.emit('trade_executed', position);

      return position;
    } catch (err) {
      console.error('❌ Trade execution error:', err);
      this.emit('trade_error', { request, error: err });
      return null;
    }
  }

  /**
   * Pre-trade risk checks
   */
  private async preTradeChecks(request: OrderRequest): Promise<{
    passed: boolean;
    reason?: string;
  }> {
    // Check position size
    if (request.size > this.riskLimits.maxPositionSize) {
      return {
        passed: false,
        reason: `Position size ${request.size} exceeds max ${this.riskLimits.maxPositionSize}`,
      };
    }

    // Check total exposure
    const currentExposure = this.getTotalExposure();
    const tradeValue = request.size * (request.price || 0.5); // Assume 0.5 if market order
    if (currentExposure + tradeValue > this.riskLimits.maxTotalExposure) {
      return {
        passed: false,
        reason: `Total exposure $${(currentExposure + tradeValue).toFixed(2)} exceeds max $${this.riskLimits.maxTotalExposure}`,
      };
    }

    // Check order book health
    const isHealthy = orderBookTracker.isHealthy(request.marketId);
    if (!isHealthy) {
      return {
        passed: false,
        reason: 'Order book is unhealthy (stale, wide spread, or low depth)',
      };
    }

    // Check spread (don't trade if > 5%)
    const metrics = orderBookTracker.getMetrics(request.marketId);
    if (metrics && metrics.spreadBps > 500) {
      return {
        passed: false,
        reason: `Spread too wide: ${metrics.spreadBps.toFixed(1)} bps`,
      };
    }

    return { passed: true };
  }

  /**
   * Place order on Polymarket
   * (Simulated for now - real implementation needs Polymarket API keys)
   */
  private async placeOrder(request: OrderRequest): Promise<{
    fillPrice: number;
    fillSize: number;
    orderId: string;
  } | null> {
    // Get current market price
    const metrics = orderBookTracker.getMetrics(request.marketId);
    if (!metrics) {
      console.error('❌ No order book metrics available');
      return null;
    }

    // Determine fill price
    let fillPrice: number;
    if (request.price) {
      // Limit order
      fillPrice = request.price;
    } else {
      // Market order - use best bid/ask
      fillPrice = request.side === 'BUY' ? metrics.bestAsk : metrics.bestBid;
    }

    // TODO: Replace with real Polymarket API call
    // For now, simulate immediate fill
    console.log(`📝 [SIMULATED] Order placed: ${request.side} ${request.size} @ $${fillPrice.toFixed(4)}`);

    return {
      fillPrice,
      fillSize: request.size,
      orderId: `sim_${Date.now()}`,
    };
  }

  /**
   * Create position from execution
   */
  private async createPosition(
    request: OrderRequest,
    execution: { fillPrice: number; fillSize: number; orderId: string }
  ): Promise<Position> {
    const position: Position = {
      id: `pos_${Date.now()}`,
      marketId: request.marketId,
      side: request.outcome,
      size: execution.fillSize,
      entryPrice: execution.fillPrice,
      currentPrice: execution.fillPrice,
      unrealizedPnL: 0,
      realizedPnL: 0,
      openedAt: new Date(),
      status: 'OPEN',
    };

    this.positions.set(position.id, position);
    return position;
  }

  /**
   * Update position with current price
   */
  updatePosition(positionId: string, currentPrice: number) {
    const position = this.positions.get(positionId);
    if (!position || position.status === 'CLOSED') return;

    position.currentPrice = currentPrice;

    // Calculate unrealized PnL
    if (position.side === 'YES') {
      position.unrealizedPnL = (currentPrice - position.entryPrice) * position.size;
    } else {
      position.unrealizedPnL = (position.entryPrice - currentPrice) * position.size;
    }

    // Check stop loss
    if (Math.abs(position.unrealizedPnL) > this.riskLimits.maxLossPerTrade) {
      console.warn(`⚠️ Stop loss triggered for ${positionId}: $${position.unrealizedPnL.toFixed(2)}`);
      this.closePosition(positionId, 'STOP_LOSS');
    }

    this.emit('position_updated', position);
  }

  /**
   * Close a position
   */
  async closePosition(positionId: string, reason: string = 'MANUAL') {
    const position = this.positions.get(positionId);
    if (!position || position.status === 'CLOSED') return;

    console.log(`🔒 Closing position ${positionId} (${reason})`);

    // Execute closing trade
    const closeRequest: OrderRequest = {
      marketId: position.marketId,
      side: position.side === 'YES' ? 'SELL' : 'BUY',
      outcome: position.side,
      size: position.size,
    };

    const metrics = orderBookTracker.getMetrics(position.marketId);
    const exitPrice = metrics
      ? closeRequest.side === 'SELL'
        ? metrics.bestBid
        : metrics.bestAsk
      : position.currentPrice;

    // Update position
    position.status = 'CLOSED';
    position.closedAt = new Date();
    position.currentPrice = exitPrice;
    position.realizedPnL = position.unrealizedPnL;

    // Persist to database
    await this.persistTrade(position);

    console.log(`✅ Position closed: $${position.realizedPnL.toFixed(2)} PnL`);
    this.emit('position_closed', position);
  }

  /**
   * Persist trade to database
   */
  private async persistTrade(position: Position) {
    try {
      // Ensure system trader exists
      let trader = await prisma.trader.findUnique({
        where: { address: 'system' },
      });

      if (!trader) {
        trader = await prisma.trader.create({
          data: {
            address: 'system',
            strategy: 'AUTOMATED',
          },
        });
      }

      await prisma.trade.create({
        data: {
          traderId: trader.id,
          marketId: position.marketId,
          side: position.side,
          action: 'BUY', // Simplified
          price: position.entryPrice,
          exitPrice: position.status === 'CLOSED' ? position.currentPrice : null,
          size: position.size,
          value: position.size * position.entryPrice,
          pnl: position.status === 'CLOSED' ? position.realizedPnL : null,
          entryTime: position.openedAt,
          exitTime: position.closedAt || null,
          outcome: position.status === 'CLOSED' 
            ? (position.realizedPnL > 0 ? 'WIN' : position.realizedPnL < 0 ? 'LOSS' : 'BREAKEVEN')
            : 'PENDING',
        },
      });
    } catch (err) {
      console.error('Failed to persist trade:', err);
    }
  }

  /**
   * Get all open positions
   */
  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(
      (p) => p.status === 'OPEN'
    );
  }

  /**
   * Get position by ID
   */
  getPosition(id: string): Position | undefined {
    return this.positions.get(id);
  }

  /**
   * Get total exposure across all positions
   */
  getTotalExposure(): number {
    return Array.from(this.positions.values())
      .filter((p) => p.status === 'OPEN')
      .reduce((sum, p) => sum + p.size * p.entryPrice, 0);
  }

  /**
   * Get total PnL
   */
  getTotalPnL(): { unrealized: number; realized: number; total: number } {
    const positions = Array.from(this.positions.values());

    const unrealized = positions
      .filter((p) => p.status === 'OPEN')
      .reduce((sum, p) => sum + p.unrealizedPnL, 0);

    const realized = positions
      .filter((p) => p.status === 'CLOSED')
      .reduce((sum, p) => sum + p.realizedPnL, 0);

    return {
      unrealized,
      realized,
      total: unrealized + realized,
    };
  }

  /**
   * Update risk limits
   */
  updateRiskLimits(limits: Partial<RiskLimits>) {
    this.riskLimits = { ...this.riskLimits, ...limits };
    console.log('📊 Risk limits updated:', this.riskLimits);
  }
}

// Singleton instance
export const tradingExecutor = new TradingExecutor();
