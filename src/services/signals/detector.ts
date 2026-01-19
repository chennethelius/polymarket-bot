import { EventEmitter } from 'events';
import { orderBookTracker } from '@/services/orderbook/tracker';
import { prisma } from '@/lib/prisma';

export type SignalType = 
  | 'PANIC_SELL' // Sudden ask depth spike, spread widening
  | 'FOMO_BUY' // Sudden bid depth spike, bid-ask imbalance
  | 'LIQUIDITY_VACUUM' // Spread widening, low depth
  | 'TAPE_BOMB' // Large trades in quick succession
  | 'BID_PULL' // Bid depth drops suddenly (trap)
  | 'ASK_PULL'; // Ask depth drops suddenly (squeeze)

export interface Signal {
  id: string;
  marketId: string;
  type: SignalType;
  confidence: number; // 0-100
  timestamp: Date;
  metrics: {
    spread: number;
    spreadBps: number;
    bidDepth: number;
    askDepth: number;
    imbalance: number;
    volumeRatio?: number; // Current volume / baseline volume
  };
  description: string;
  expectedReversion: number; // Expected price move in cents
  tradeSide?: 'BUY' | 'SELL'; // Recommended trade direction
}

export class SignalDetector extends EventEmitter {
  private lastSignals = new Map<string, number>(); // marketId -> last signal timestamp
  private readonly SIGNAL_COOLDOWN = 5000; // 5 seconds between signals per market

  constructor() {
    super();
  }

  /**
   * Analyze order book for trading signals
   */
  async analyze(marketId: string): Promise<Signal | null> {
    // Check cooldown
    const lastSignal = this.lastSignals.get(marketId);
    if (lastSignal && Date.now() - lastSignal < this.SIGNAL_COOLDOWN) {
      return null;
    }

    const metrics = orderBookTracker.getMetrics(marketId);
    if (!metrics) return null;

    const baseline = orderBookTracker.getBaseline(marketId);
    if (!baseline) {
      // Calculate baseline if not available
      await orderBookTracker.calculateBaseline(marketId);
      return null;
    }

    // Calculate volume ratio
    const currentVolume = metrics.bidDepth + metrics.askDepth;
    const volumeRatio = currentVolume / baseline.avgVolume;

    // Check for panic selling
    const panicSignal = this.detectPanicSell(marketId, metrics, baseline, volumeRatio);
    if (panicSignal) {
      this.lastSignals.set(marketId, Date.now());
      this.emit('signal', panicSignal);
      await this.persistSignal(panicSignal);
      return panicSignal;
    }

    // Check for FOMO buying
    const fomoSignal = this.detectFomoBuy(marketId, metrics, baseline, volumeRatio);
    if (fomoSignal) {
      this.lastSignals.set(marketId, Date.now());
      this.emit('signal', fomoSignal);
      await this.persistSignal(fomoSignal);
      return fomoSignal;
    }

    // Check for liquidity vacuum
    const vacuumSignal = this.detectLiquidityVacuum(marketId, metrics, baseline);
    if (vacuumSignal) {
      this.lastSignals.set(marketId, Date.now());
      this.emit('signal', vacuumSignal);
      await this.persistSignal(vacuumSignal);
      return vacuumSignal;
    }

    // Check for bid/ask pulls
    const pullSignal = await this.detectDepthPull(marketId, metrics, baseline);
    if (pullSignal) {
      this.lastSignals.set(marketId, Date.now());
      this.emit('signal', pullSignal);
      await this.persistSignal(pullSignal);
      return pullSignal;
    }

    return null;
  }

  /**
   * Detect panic selling (opportunity to buy)
   * - Ask depth spikes > 2x baseline
   * - Spread widens > 1.5x baseline
   * - Imbalance heavily favors asks
   */
  private detectPanicSell(
    marketId: string,
    metrics: ReturnType<typeof orderBookTracker.getMetrics>,
    baseline: NonNullable<ReturnType<typeof orderBookTracker.getBaseline>>,
    volumeRatio: number
  ): Signal | null {
    if (!metrics) return null;

    const askRatio = metrics.askDepth / (baseline.avgVolume / 2); // Divide by 2 since baseline is total
    const spreadRatio = metrics.spread / baseline.avgSpread;

    // Panic sell criteria
    if (
      askRatio > 2.0 && // Ask depth 2x baseline
      spreadRatio > 1.5 && // Spread widened 1.5x
      metrics.imbalance < -0.3 && // Heavy ask imbalance
      volumeRatio > 1.5 // Overall volume spike
    ) {
      const confidence = Math.min(
        100,
        50 + askRatio * 10 + spreadRatio * 10 + Math.abs(metrics.imbalance) * 50
      );

      return {
        id: `${marketId}-${Date.now()}`,
        marketId,
        type: 'PANIC_SELL',
        confidence: Math.round(confidence),
        timestamp: new Date(),
        metrics: {
          ...metrics,
          volumeRatio,
        },
        description: `Panic selling detected: Ask depth ${askRatio.toFixed(1)}x baseline, spread ${(spreadRatio * 100).toFixed(0)}% wider`,
        expectedReversion: metrics.spread * 0.5, // Expect to capture half the spread
        tradeSide: 'BUY', // Buy into panic
      };
    }

    return null;
  }

  /**
   * Detect FOMO buying (opportunity to sell)
   * - Bid depth spikes > 2x baseline
   * - Imbalance heavily favors bids
   * - Price near recent high
   */
  private detectFomoBuy(
    marketId: string,
    metrics: ReturnType<typeof orderBookTracker.getMetrics>,
    baseline: NonNullable<ReturnType<typeof orderBookTracker.getBaseline>>,
    volumeRatio: number
  ): Signal | null {
    if (!metrics) return null;

    const bidRatio = metrics.bidDepth / (baseline.avgVolume / 2);

    // FOMO buy criteria
    if (
      bidRatio > 2.0 && // Bid depth 2x baseline
      metrics.imbalance > 0.4 && // Heavy bid imbalance
      volumeRatio > 1.5 // Volume spike
    ) {
      const confidence = Math.min(
        100,
        50 + bidRatio * 10 + metrics.imbalance * 50
      );

      return {
        id: `${marketId}-${Date.now()}`,
        marketId,
        type: 'FOMO_BUY',
        confidence: Math.round(confidence),
        timestamp: new Date(),
        metrics: {
          ...metrics,
          volumeRatio,
        },
        description: `FOMO buying detected: Bid depth ${bidRatio.toFixed(1)}x baseline, imbalance ${(metrics.imbalance * 100).toFixed(0)}%`,
        expectedReversion: metrics.spread * 0.5,
        tradeSide: 'SELL', // Sell into FOMO
      };
    }

    return null;
  }

  /**
   * Detect liquidity vacuum (avoid trading)
   * - Spread > 3x baseline
   * - Very low depth on both sides
   */
  private detectLiquidityVacuum(
    marketId: string,
    metrics: ReturnType<typeof orderBookTracker.getMetrics>,
    baseline: NonNullable<ReturnType<typeof orderBookTracker.getBaseline>>
  ): Signal | null {
    if (!metrics) return null;

    const spreadRatio = metrics.spread / baseline.avgSpread;
    const totalDepth = metrics.bidDepth + metrics.askDepth;
    const depthRatio = totalDepth / baseline.avgVolume;

    // Liquidity vacuum criteria
    if (spreadRatio > 3.0 && depthRatio < 0.3) {
      return {
        id: `${marketId}-${Date.now()}`,
        marketId,
        type: 'LIQUIDITY_VACUUM',
        confidence: 90,
        timestamp: new Date(),
        metrics,
        description: `Liquidity vacuum: Spread ${(spreadRatio * 100).toFixed(0)}% wider, depth ${(depthRatio * 100).toFixed(0)}% of baseline`,
        expectedReversion: 0, // Don't trade
      };
    }

    return null;
  }

  /**
   * Detect sudden depth pulls (traps/squeezes)
   * - Compare current depth to recent average
   * - Sudden drops indicate hidden orders or stop hunting
   */
  private async detectDepthPull(
    marketId: string,
    metrics: ReturnType<typeof orderBookTracker.getMetrics>,
    baseline: NonNullable<ReturnType<typeof orderBookTracker.getBaseline>>
  ): Promise<Signal | null> {
    if (!metrics) return null;

    // Get recent snapshots (last 30 seconds)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const recentSnapshots = await prisma.orderBookSnapshot.findMany({
      where: {
        marketId,
        timestamp: { gte: thirtySecondsAgo },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    if (recentSnapshots.length < 5) return null;

    const avgRecentBidDepth =
      recentSnapshots.reduce((sum, s) => sum + s.bidDepth, 0) /
      recentSnapshots.length;

    const avgRecentAskDepth =
      recentSnapshots.reduce((sum, s) => sum + s.askDepth, 0) /
      recentSnapshots.length;

    const bidDropRatio = avgRecentBidDepth / metrics.bidDepth;
    const askDropRatio = avgRecentAskDepth / metrics.askDepth;

    // Bid pull (potential trap before move down)
    if (bidDropRatio > 2.0) {
      return {
        id: `${marketId}-${Date.now()}`,
        marketId,
        type: 'BID_PULL',
        confidence: 70,
        timestamp: new Date(),
        metrics,
        description: `Bid pull detected: Bid depth dropped ${((bidDropRatio - 1) * 100).toFixed(0)}%`,
        expectedReversion: -metrics.spread * 0.3, // Small downward move expected
        tradeSide: 'SELL',
      };
    }

    // Ask pull (potential squeeze before move up)
    if (askDropRatio > 2.0) {
      return {
        id: `${marketId}-${Date.now()}`,
        marketId,
        type: 'ASK_PULL',
        confidence: 70,
        timestamp: new Date(),
        metrics,
        description: `Ask pull detected: Ask depth dropped ${((askDropRatio - 1) * 100).toFixed(0)}%`,
        expectedReversion: metrics.spread * 0.3, // Small upward move expected
        tradeSide: 'BUY',
      };
    }

    return null;
  }

  /**
   * Persist signal to database
   */
  private async persistSignal(signal: Signal) {
    try {
      await prisma.psychologySignal.create({
        data: {
          marketId: signal.marketId,
          signalType: signal.type,
          score: signal.confidence / 100, // Convert 0-100 to 0-1
          timestamp: signal.timestamp,
          volumeRatio: signal.metrics.volumeRatio || null,
          spreadRatio: signal.metrics.spread,
          priceChange: signal.expectedReversion,
        },
      });
    } catch (err) {
      console.error('Failed to persist signal:', err);
    }
  }

  /**
   * Get recent signals for a market
   */
  async getRecentSignals(marketId: string, limit: number = 10) {
    return prisma.psychologySignal.findMany({
      where: { marketId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Calculate signal accuracy (for backtesting)
   */
  async calculateAccuracy(marketId: string, lookbackMinutes: number = 60) {
    const lookbackTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);

    const signals = await prisma.psychologySignal.findMany({
      where: {
        marketId,
        timestamp: { gte: lookbackTime },
      },
    });

    const accurate = signals.filter(s => s.reverted && s.maxProfit && s.maxProfit > 0).length;
    const total = signals.filter(s => s.reverted !== null).length;

    return total > 0 ? (accurate / total) * 100 : null;
  }
}

// Singleton instance
export const signalDetector = new SignalDetector();
