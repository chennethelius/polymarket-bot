import { EventEmitter } from 'events';
import { PolymarketWebSocket } from '@/services/websocket/polymarket';
import { orderBookTracker } from '@/services/orderbook/tracker';
import { signalDetector } from '@/services/signals/detector';

export class MarketMonitor extends EventEmitter {
  private ws: PolymarketWebSocket;
  private analysisInterval: NodeJS.Timeout | null = null;
  private monitoredMarkets = new Set<string>();

  constructor() {
    super();
    this.ws = new PolymarketWebSocket();

    // Forward WebSocket events
    this.ws.on('orderbook', (data) => {
      this.emit('orderbook', data);
      // Trigger signal analysis on order book updates
      this.analyzeMarket(data.market);
    });

    this.ws.on('trade', (data) => {
      this.emit('trade', data);
    });

    // Forward signal detector events
    signalDetector.on('signal', (signal) => {
      this.emit('signal', signal);
      console.log(`🚨 Signal detected: ${signal.type} on ${signal.marketId} (${signal.confidence}% confidence)`);
    });
  }

  /**
   * Start monitoring markets
   */
  async start() {
    console.log('🚀 Starting market monitor...');

    // Connect WebSocket
    await this.ws.connect();

    // Start periodic analysis (every 2 seconds)
    this.analysisInterval = setInterval(() => {
      this.analyzeAllMarkets();
    }, 2000);

    // Start stale book cleanup (every 5 minutes)
    setInterval(() => {
      orderBookTracker.clearStaleBooks();
    }, 5 * 60 * 1000);

    console.log('✅ Market monitor started');
  }

  /**
   * Stop monitoring
   */
  async stop() {
    console.log('🛑 Stopping market monitor...');

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.ws.disconnect();

    console.log('✅ Market monitor stopped');
  }

  /**
   * Add market to monitor
   */
  async addMarket(marketId: string) {
    if (this.monitoredMarkets.has(marketId)) {
      console.log(`⚠️ Already monitoring ${marketId}`);
      return;
    }

    console.log(`➕ Adding market ${marketId} to monitor...`);
    this.monitoredMarkets.add(marketId);

    // Subscribe to WebSocket
    this.ws.subscribeToMarket(marketId);

    // Initialize baseline (after 1 minute of data)
    setTimeout(() => {
      orderBookTracker.calculateBaseline(marketId);
    }, 60 * 1000);
  }

  /**
   * Remove market from monitoring
   */
  removeMarket(marketId: string) {
    console.log(`➖ Removing market ${marketId} from monitor...`);
    this.monitoredMarkets.delete(marketId);
    this.ws.unsubscribeFromMarket(marketId);
  }

  /**
   * Analyze a specific market for signals
   */
  private async analyzeMarket(marketId: string) {
    try {
      // Only analyze if we're monitoring this market
      if (!this.monitoredMarkets.has(marketId)) {
        return;
      }

      // Skip if order book is not healthy
      if (!orderBookTracker.isHealthy(marketId)) {
        return;
      }

      await signalDetector.analyze(marketId);
    } catch (err) {
      console.error(`Error analyzing market ${marketId}:`, err);
    }
  }

  /**
   * Analyze all monitored markets
   */
  private async analyzeAllMarkets() {
    for (const marketId of this.monitoredMarkets) {
      await this.analyzeMarket(marketId);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      connected: this.ws['isConnected'],
      monitoredMarkets: Array.from(this.monitoredMarkets),
      trackedBooks: orderBookTracker.getTrackedMarkets(),
    };
  }

  /**
   * Get order book for a market
   */
  getOrderBook(marketId: string) {
    return orderBookTracker.getFormattedBook(marketId);
  }

  /**
   * Get metrics for a market
   */
  getMetrics(marketId: string) {
    return orderBookTracker.getMetrics(marketId);
  }

  /**
   * Get recent signals for a market
   */
  async getRecentSignals(marketId: string, limit?: number) {
    return signalDetector.getRecentSignals(marketId, limit);
  }
}

// Singleton instance
export const marketMonitor = new MarketMonitor();
