import { redisClient as redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

interface OrderBookLevel {
  price: string;
  size: string;
}

interface OrderBook {
  bids: Map<string, string>; // price -> size
  asks: Map<string, string>; // price -> size
  lastUpdate: number;
}

interface OrderBookMetrics {
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadBps: number;
  midPrice: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number; // (bidDepth - askDepth) / (bidDepth + askDepth)
}

export class OrderBookTracker {
  private books = new Map<string, OrderBook>();
  private baselines = new Map<string, {
    avgVolume: number;
    avgSpread: number;
    avgSpreadBps: number;
    calculatedAt: number;
  }>();

  /**
   * Initialize order book for a market
   */
  async initialize(marketId: string) {
    console.log(`📊 Initializing order book for ${marketId}...`);

    try {
      // Try to get from Redis first
      const cached = await redis.get(`orderbook:${marketId}`);
      if (cached) {
        const data = JSON.parse(cached) as { bids?: OrderBookLevel[]; asks?: OrderBookLevel[] };
        this.applySnapshot(marketId, data.bids || [], data.asks || []);
        console.log(`✅ Loaded order book from cache for ${marketId}`);
        return;
      }

      // Fetch from REST API
      const response = await fetch(
        `https://clob.polymarket.com/book?token_id=${marketId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      this.applySnapshot(marketId, data.bids || [], data.asks || []);
      console.log(`✅ Initialized order book for ${marketId}`);
    } catch (err) {
      console.error(`❌ Failed to initialize order book for ${marketId}:`, err);
      // Initialize empty book
      this.books.set(marketId, {
        bids: new Map(),
        asks: new Map(),
        lastUpdate: Date.now(),
      });
    }
  }

  /**
   * Apply full order book snapshot
   */
  applySnapshot(
    marketId: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[]
  ) {
    const book: OrderBook = {
      bids: new Map(bids.map((b) => [b.price, b.size])),
      asks: new Map(asks.map((a) => [a.price, a.size])),
      lastUpdate: Date.now(),
    };

    this.books.set(marketId, book);
  }

  /**
   * Apply incremental order book update
   */
  applyUpdate(
    marketId: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[]
  ) {
    const book = this.books.get(marketId);
    if (!book) {
      console.warn(`⚠️ No book found for ${marketId}, initializing...`);
      this.applySnapshot(marketId, bids, asks);
      return;
    }

    // Apply bid updates
    for (const bid of bids) {
      if (parseFloat(bid.size) === 0) {
        book.bids.delete(bid.price);
      } else {
        book.bids.set(bid.price, bid.size);
      }
    }

    // Apply ask updates
    for (const ask of asks) {
      if (parseFloat(ask.size) === 0) {
        book.asks.delete(ask.price);
      } else {
        book.asks.set(ask.price, ask.size);
      }
    }

    book.lastUpdate = Date.now();
  }

  /**
   * Get order book for a market
   */
  getBook(marketId: string): OrderBook | undefined {
    return this.books.get(marketId);
  }

  /**
   * Calculate order book metrics
   */
  getMetrics(marketId: string): OrderBookMetrics | null {
    const book = this.getBook(marketId);
    if (!book) return null;

    // Sort bids descending (highest first)
    const bids = Array.from(book.bids.entries())
      .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));

    // Sort asks ascending (lowest first)
    const asks = Array.from(book.asks.entries())
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

    if (bids.length === 0 || asks.length === 0) {
      return null;
    }

    const bestBidEntry = bids[0];
    const bestAskEntry = asks[0];
    
    if (!bestBidEntry || !bestAskEntry) {
      return null;
    }

    const bestBid = parseFloat(bestBidEntry[0]);
    const bestAsk = parseFloat(bestAskEntry[0]);
    const spread = bestAsk - bestBid;
    const spreadBps = (spread / bestBid) * 10000;
    const midPrice = (bestBid + bestAsk) / 2;

    // Calculate depth (top 5 levels)
    const bidDepth = bids
      .slice(0, 5)
      .reduce((sum, [_, size]) => sum + parseFloat(size), 0);
    const askDepth = asks
      .slice(0, 5)
      .reduce((sum, [_, size]) => sum + parseFloat(size), 0);

    const totalDepth = bidDepth + askDepth;
    const imbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;

    return {
      bestBid,
      bestAsk,
      spread,
      spreadBps,
      midPrice,
      bidDepth,
      askDepth,
      imbalance,
    };
  }

  /**
   * Get formatted order book for display
   */
  getFormattedBook(marketId: string, levels: number = 10) {
    const book = this.getBook(marketId);
    if (!book) return null;

    const bids = Array.from(book.bids.entries())
      .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
      .slice(0, levels)
      .map(([price, size]) => ({
        price: parseFloat(price),
        size: parseFloat(size),
      }));

    const asks = Array.from(book.asks.entries())
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .slice(0, levels)
      .map(([price, size]) => ({
        price: parseFloat(price),
        size: parseFloat(size),
      }));

    return { bids, asks };
  }

  /**
   * Calculate baseline metrics (for signal detection)
   */
  async calculateBaseline(marketId: string) {
    console.log(`📊 Calculating baseline for ${marketId}...`);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const snapshots = await prisma.orderBookSnapshot.findMany({
      where: {
        marketId,
        timestamp: { gte: oneHourAgo },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (snapshots.length < 10) {
      console.warn(`⚠️ Not enough data for baseline (${snapshots.length} snapshots)`);
      return null;
    }

    const avgVolume =
      snapshots.reduce((sum, s) => sum + s.bidDepth + s.askDepth, 0) /
      snapshots.length;

    const avgSpread =
      snapshots.reduce((sum, s) => sum + s.spread, 0) / snapshots.length;

    const avgSpreadBps =
      snapshots.reduce(
        (sum, s) => sum + (s.spread / s.bestBid) * 10000,
        0
      ) / snapshots.length;

    const baseline = {
      avgVolume,
      avgSpread,
      avgSpreadBps,
      calculatedAt: Date.now(),
    };

    this.baselines.set(marketId, baseline);
    console.log(`✅ Baseline calculated for ${marketId}:`, baseline);

    return baseline;
  }

  /**
   * Get baseline for a market
   */
  getBaseline(marketId: string) {
    const baseline = this.baselines.get(marketId);
    
    // Recalculate if older than 1 hour
    if (baseline && Date.now() - baseline.calculatedAt > 60 * 60 * 1000) {
      this.calculateBaseline(marketId);
    }
    
    return baseline;
  }

  /**
   * Detect if order book is healthy
   */
  isHealthy(marketId: string): boolean {
    const book = this.getBook(marketId);
    if (!book) return false;

    const metrics = this.getMetrics(marketId);
    if (!metrics) return false;

    // Check if book is fresh (updated in last 5 seconds)
    const age = Date.now() - book.lastUpdate;
    if (age > 5000) return false;

    // Check if spread is reasonable (< 10¢)
    if (metrics.spread > 0.1) return false;

    // Check if there's depth
    if (metrics.bidDepth < 10 || metrics.askDepth < 10) return false;

    return true;
  }

  /**
   * Get all tracked markets
   */
  getTrackedMarkets(): string[] {
    return Array.from(this.books.keys());
  }

  /**
   * Clear stale books (older than 5 minutes)
   */
  clearStaleBooks() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [marketId, book] of this.books.entries()) {
      if (now - book.lastUpdate > staleThreshold) {
        console.log(`🗑️ Removing stale book for ${marketId}`);
        this.books.delete(marketId);
        this.baselines.delete(marketId);
      }
    }
  }
}

// Singleton instance
export const orderBookTracker = new OrderBookTracker();
