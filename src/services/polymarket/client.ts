import { config } from '@/lib/config';
import { cache } from '@/lib/redis';
import { sleep, retry } from '@/lib/utils';
import {
  MarketSchema,
  OrderBookSchema,
  TradeSchema,
  GammaMarketSchema,
  type PolymarketMarket,
  type OrderBook,
  type PolymarketTrade,
  type GammaMarket,
} from '@/types/polymarket';

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════

class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillMs: number
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens <= 0) {
      const waitTime = this.refillMs - (Date.now() - this.lastRefill);
      console.log(`⏳ Rate limited, waiting ${waitTime}ms...`);
      await sleep(waitTime);
      this.refill();
    }

    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.refillMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POLYMARKET CLIENT
// ═══════════════════════════════════════════════════════════════════════════

class PolymarketClient {
  private rateLimiter: RateLimiter;
  private baseUrl: string;
  private gammaUrl: string;

  constructor() {
    this.baseUrl = config.api.polymarket.baseUrl;
    this.gammaUrl = config.api.polymarket.gammaUrl;
    this.rateLimiter = new RateLimiter(
      config.api.polymarket.rateLimit.maxRequests,
      config.api.polymarket.rateLimit.windowMs
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════

  private async fetch<T>(
    url: string,
    options?: RequestInit & { skipRateLimit?: boolean }
  ): Promise<T> {
    if (!options?.skipRateLimit) {
      await this.rateLimiter.acquire();
    }

    return retry(async () => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...options?.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return response.json();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLOB API - Markets
  // ═══════════════════════════════════════════════════════════════════════

  async getMarkets(options?: {
    limit?: number;
    cursor?: string;
    active?: boolean;
  }): Promise<{ markets: PolymarketMarket[]; nextCursor?: string }> {
    const cacheKey = `polymarket:markets:${JSON.stringify(options)}`;
    const cached = await cache.get<{ markets: PolymarketMarket[]; nextCursor?: string }>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.cursor) params.set('next_cursor', options.cursor);

    const url = `${this.baseUrl}/markets?${params}`;
    const response = await this.fetch<any>(url);

    // Handle both array and object responses
    const marketsData = Array.isArray(response) ? response : response.data || [];
    const markets = marketsData
      .map((m: unknown) => {
        try {
          return MarketSchema.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as PolymarketMarket[];

    const result = {
      markets,
      nextCursor: response.next_cursor,
    };

    await cache.set(cacheKey, result, 60); // Cache 1 minute
    return result;
  }

  async getMarket(conditionId: string): Promise<PolymarketMarket | null> {
    const cacheKey = `polymarket:market:${conditionId}`;
    const cached = await cache.get<PolymarketMarket>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/markets/${conditionId}`;
      const response = await this.fetch<unknown>(url);
      const market = MarketSchema.parse(response);
      await cache.set(cacheKey, market, 30); // Cache 30 seconds
      return market;
    } catch (error) {
      console.error(`Failed to fetch market ${conditionId}:`, error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLOB API - Order Book
  // ═══════════════════════════════════════════════════════════════════════

  async getOrderBook(tokenId: string): Promise<OrderBook> {
    const url = `${this.baseUrl}/book?token_id=${tokenId}`;
    const response = await this.fetch<unknown>(url);
    return OrderBookSchema.parse(response);
  }

  async getMidpoint(tokenId: string): Promise<number | null> {
    try {
      const url = `${this.baseUrl}/midpoint?token_id=${tokenId}`;
      const response = await this.fetch<{ mid: string }>(url);
      return parseFloat(response.mid);
    } catch {
      return null;
    }
  }

  async getSpread(tokenId: string): Promise<{ bid: number; ask: number; spread: number } | null> {
    try {
      const url = `${this.baseUrl}/spread?token_id=${tokenId}`;
      const response = await this.fetch<{ bid: string; ask: string; spread: string }>(url);
      return {
        bid: parseFloat(response.bid),
        ask: parseFloat(response.ask),
        spread: parseFloat(response.spread),
      };
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLOB API - Trades
  // ═══════════════════════════════════════════════════════════════════════

  async getTradesForMarket(
    tokenId: string,
    options?: { limit?: number; before?: string }
  ): Promise<PolymarketTrade[]> {
    const params = new URLSearchParams();
    params.set('asset_id', tokenId);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.before) params.set('before', options.before);

    const url = `${this.baseUrl}/trades?${params}`;
    const response = await this.fetch<unknown[]>(url);

    return response
      .map((t) => {
        try {
          return TradeSchema.parse(t);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as PolymarketTrade[];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GAMMA API - Enhanced Market Data
  // ═══════════════════════════════════════════════════════════════════════

  async getGammaMarkets(options?: {
    limit?: number;
    offset?: number;
    active?: boolean;
    closed?: boolean;
  }): Promise<GammaMarket[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());
    if (options?.active !== undefined) params.set('active', options.active.toString());
    if (options?.closed !== undefined) params.set('closed', options.closed.toString());

    const url = `${this.gammaUrl}/markets?${params}`;
    const response = await this.fetch<unknown[]>(url);

    return response
      .map((m) => {
        try {
          return GammaMarketSchema.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as GammaMarket[];
  }

  async getGammaMarket(slug: string): Promise<GammaMarket | null> {
    const cacheKey = `gamma:market:${slug}`;
    const cached = await cache.get<GammaMarket>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.gammaUrl}/markets/${slug}`;
      const response = await this.fetch<unknown>(url);
      const market = GammaMarketSchema.parse(response);
      await cache.set(cacheKey, market, 60);
      return market;
    } catch {
      return null;
    }
  }

  async searchGammaMarkets(query: string, limit = 20): Promise<GammaMarket[]> {
    const params = new URLSearchParams();
    params.set('_q', query);
    params.set('_limit', limit.toString());
    params.set('active', 'true');

    const url = `${this.gammaUrl}/markets?${params}`;
    const response = await this.fetch<unknown[]>(url);

    return response
      .map((m) => {
        try {
          return GammaMarketSchema.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as GammaMarket[];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEADERBOARD / TRADERS (via Gamma)
  // ═══════════════════════════════════════════════════════════════════════

  async getTopTraders(
    marketId?: string,
    limit = 100
  ): Promise<Array<{ address: string; volume: number; pnl: number }>> {
    // Note: Polymarket doesn't have a public leaderboard API
    // This would need to be built from trade history
    // For now, return empty - we'll build from trades
    console.warn('getTopTraders: Building from trade history not yet implemented');
    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════

  async healthCheck(): Promise<{
    clob: boolean;
    gamma: boolean;
    latency: { clob: number; gamma: number };
  }> {
    const checkEndpoint = async (url: string): Promise<{ ok: boolean; latency: number }> => {
      const start = Date.now();
      try {
        await this.fetch(`${url}/markets?limit=1`, { skipRateLimit: true });
        return { ok: true, latency: Date.now() - start };
      } catch {
        return { ok: false, latency: -1 };
      }
    };

    const [clobResult, gammaResult] = await Promise.all([
      checkEndpoint(this.baseUrl),
      checkEndpoint(this.gammaUrl),
    ]);

    return {
      clob: clobResult.ok,
      gamma: gammaResult.ok,
      latency: {
        clob: clobResult.latency,
        gamma: gammaResult.latency,
      },
    };
  }
}

// Export singleton instance
export const polymarket = new PolymarketClient();

// Re-export types
export type { PolymarketMarket, OrderBook, PolymarketTrade, GammaMarket };
