/**
 * Polymarket Recorder Service
 * 
 * Combines the WebSocket client with file-based storage
 * to record live market data for replay.
 */

import { EventEmitter } from 'events';
import { 
  PolymarketClient, 
  fetchOrderBook, 
  fetchMarketInfo,
  type OrderBookUpdate,
  type PriceChange,
  type LastTrade,
  type MarketEvent,
} from './polymarket-ws';
import {
  createSession,
  loadSession,
  appendEvent,
  updateSession,
  stopSession,
  addUserTrade,
  type SessionMetadata,
  type RecordingEvent,
  type UserTrade,
} from './storage';

export interface RecorderOptions {
  marketId: string;           // Market condition ID or slug
  tokenIds: string[];         // Token IDs to record
  sessionName?: string;       // Custom session name
  marketTitle?: string;       // Market question/title
  gameInfo?: {                // For sports markets
    sport: string;
    teams: string[];
    startTime: Date;
  };
}

export interface RecorderStats {
  sessionId: string;
  eventCount: number;
  bookUpdates: number;
  priceChanges: number;
  trades: number;
  userTrades: number;
  duration: number;           // ms since start
  startTime: Date;
  isRecording: boolean;
}

export class Recorder extends EventEmitter {
  private client: PolymarketClient | null = null;
  private sessionId: string | null = null;
  private metadata: SessionMetadata | null = null;
  private options: RecorderOptions;
  private stats = {
    eventCount: 0,
    bookUpdates: 0,
    priceChanges: 0,
    trades: 0,
    userTrades: 0,
    startTime: new Date(),
  };

  constructor(options: RecorderOptions) {
    super();
    this.options = options;
  }

  /**
   * Start recording
   */
  async start(): Promise<string> {
    if (this.sessionId) {
      throw new Error('Recording already in progress');
    }

    // Create session - storage API uses positional args
    this.metadata = createSession(
      this.options.marketId,
      this.options.marketTitle || 'Unknown Market',
      this.options.tokenIds[0]  // Primary token
    );
    this.sessionId = this.metadata.id;
    this.stats.startTime = new Date();

    // Fetch initial order book
    const initialBooks: Record<string, OrderBookUpdate> = {};
    for (const tokenId of this.options.tokenIds) {
      const book = await fetchOrderBook(tokenId);
      if (book) {
        initialBooks[tokenId] = {
          type: 'book',
          timestamp: Date.now(),
          asset_id: tokenId,
          market: this.options.marketId,
          bids: book.bids,
          asks: book.asks,
        };
        
        // Record initial book
        this.recordEvent({
          type: 'book',
          data: initialBooks[tokenId],
        });
      }
    }

    // Connect WebSocket
    this.client = new PolymarketClient({
      tokenIds: this.options.tokenIds,
    });

    // Wire up events
    this.client.on('book', (update: OrderBookUpdate) => {
      this.stats.bookUpdates++;
      this.recordEvent({ type: 'book', data: update });
    });

    this.client.on('price', (change: PriceChange) => {
      this.stats.priceChanges++;
      this.recordEvent({ type: 'price', data: change });
    });

    this.client.on('trade', (trade: LastTrade) => {
      this.stats.trades++;
      this.recordEvent({ type: 'trade', data: trade });
    });

    this.client.on('connected', () => {
      this.emit('connected');
    });

    this.client.on('disconnected', ({ code, reason }) => {
      this.emit('disconnected', { code, reason });
    });

    this.client.on('error', (error) => {
      this.emit('error', error);
    });

    await this.client.connect();
    this.emit('started', { sessionId: this.sessionId });

    return this.sessionId;
  }

  /**
   * Stop recording
   */
  stop(): SessionMetadata | null {
    if (!this.sessionId || !this.metadata) {
      return null;
    }

    const currentSessionId = this.sessionId;
    
    // Disconnect WebSocket
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    // Update session metadata
    stopSession(currentSessionId);
    const finalMetadata = loadSession(currentSessionId);
    
    const stats = this.getStats();
    this.emit('stopped', { sessionId: currentSessionId, stats });

    // Reset state
    this.sessionId = null;
    this.metadata = null;
    this.stats = {
      eventCount: 0,
      bookUpdates: 0,
      priceChanges: 0,
      trades: 0,
      userTrades: 0,
      startTime: new Date(),
    };

    return finalMetadata;
  }

  /**
   * Record a market event
   */
  private recordEvent(event: { type: string; data: any }): void {
    if (!this.sessionId) return;

    this.stats.eventCount++;
    
    const recordingEvent: RecordingEvent = {
      timestamp: event.data.timestamp || Date.now(),
      type: event.type as RecordingEvent['type'],
      data: event.data,
    };

    appendEvent(this.sessionId, recordingEvent);
    this.emit('event', recordingEvent);

    // Update session periodically (every 100 events)
    if (this.stats.eventCount % 100 === 0) {
      updateSession(this.sessionId, {
        eventCount: this.stats.eventCount,
      });
    }
  }

  /**
   * Record a user trade (manual entry)
   */
  recordUserTrade(trade: Omit<UserTrade, 'id' | 'timestamp'>): UserTrade | null {
    if (!this.sessionId) return null;

    const userTrade: UserTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...trade,
    };

    addUserTrade(this.sessionId, userTrade);
    this.stats.userTrades++;
    this.emit('userTrade', userTrade);

    return userTrade;
  }

  /**
   * Record a game event (score, timeout, etc.)
   */
  recordGameEvent(eventType: string, description: string, details?: any): void {
    if (!this.sessionId) return;

    const event: RecordingEvent = {
      timestamp: Date.now(),
      type: 'game_event',
      data: {
        eventType,
        description,
        ...details,
      },
    };

    appendEvent(this.sessionId, event);
    this.stats.eventCount++;
    this.emit('gameEvent', event);
  }

  /**
   * Get recording stats
   */
  getStats(): RecorderStats {
    return {
      sessionId: this.sessionId || '',
      eventCount: this.stats.eventCount,
      bookUpdates: this.stats.bookUpdates,
      priceChanges: this.stats.priceChanges,
      trades: this.stats.trades,
      userTrades: this.stats.userTrades,
      duration: Date.now() - this.stats.startTime.getTime(),
      startTime: this.stats.startTime,
      isRecording: !!this.sessionId,
    };
  }

  /**
   * Check if recording
   */
  isRecording(): boolean {
    return !!this.sessionId;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get market title
   */
  getMarketTitle(): string {
    return this.options.marketTitle || 'Unknown Market';
  }
}

/**
 * Helper: Create recorder from market URL
 */
export async function createRecorderFromUrl(url: string): Promise<Recorder> {
  // Parse Polymarket URL
  // Format: https://polymarket.com/event/xxx or https://polymarket.com/event/xxx/market-slug
  const urlMatch = url.match(/polymarket\.com\/event\/([^\/\?]+)(?:\/([^\/\?]+))?/i);
  
  if (!urlMatch) {
    throw new Error('Invalid Polymarket URL. Expected format: https://polymarket.com/event/slug');
  }

  const eventSlug = urlMatch[1];
  const marketSlug = urlMatch[2]; // optional specific market within event
  
  console.log(`[Recorder] Looking up event: ${eventSlug}${marketSlug ? `, market: ${marketSlug}` : ''}`);
  
  // Try events endpoint first (this is what Polymarket uses)
  let response = await fetch(`https://gamma-api.polymarket.com/events?slug=${eventSlug}`);
  let data = await response.json();
  
  if (data.length > 0 && data[0].markets?.length > 0) {
    const event = data[0];
    
    // If specific market slug provided, use just that market
    if (marketSlug) {
      const market = event.markets.find((m: any) => m.slug === marketSlug || m.slug?.includes(marketSlug)) || event.markets[0];
      const tokenIds = JSON.parse(market.clobTokenIds || '[]');
      if (!tokenIds.length) {
        throw new Error('No token IDs found for market');
      }
      console.log(`[Recorder] Found market: ${market.question}`);
      return new Recorder({
        marketId: market.conditionId || eventSlug,
        tokenIds: tokenIds,
        marketTitle: market.question,
        sessionName: `Recording: ${market.question?.slice(0, 50)}`,
      });
    }
    
    // Otherwise, collect ALL token IDs from ALL active markets in the event
    const allTokenIds: string[] = [];
    const activeMarkets: any[] = [];
    
    for (const market of event.markets) {
      if (market.active && market.clobTokenIds) {
        const tokenIds = JSON.parse(market.clobTokenIds || '[]');
        if (tokenIds.length > 0) {
          allTokenIds.push(...tokenIds);
          activeMarkets.push(market);
        }
      }
    }
    
    console.log(`[Recorder] Found ${activeMarkets.length} active markets with ${allTokenIds.length} tokens`);
    
    if (allTokenIds.length === 0) {
      throw new Error('No active markets with token IDs found');
    }
    
    // Use event title
    const eventTitle = event.title || activeMarkets[0]?.question || 'Unknown Event';
    console.log(`[Recorder] Recording event: ${eventTitle}`);
    console.log(`[Recorder] Sample markets: ${activeMarkets.slice(0, 3).map((m: any) => m.question).join(', ')}...`);
    
    return new Recorder({
      marketId: event.id || eventSlug,
      tokenIds: allTokenIds,
      marketTitle: eventTitle,
      sessionName: `Recording: ${eventTitle.slice(0, 50)}`,
    });
  }
  
  // Fallback to markets endpoint
  response = await fetch(`https://gamma-api.polymarket.com/markets?slug=${eventSlug}`);
  const markets = await response.json();
  
  if (!markets.length) {
    throw new Error(`Market not found: ${eventSlug}. Make sure the URL is from an active Polymarket event.`);
  }

  const market = markets[0];
  const tokenIds = JSON.parse(market.clobTokenIds || '[]');
  
  if (!tokenIds.length) {
    throw new Error('No token IDs found for market');
  }

  return new Recorder({
    marketId: market.conditionId || eventSlug,
    tokenIds: tokenIds,
    marketTitle: market.question,
    sessionName: `Recording: ${market.question?.slice(0, 50)}`,
  });
}

/**
 * Helper: Create recorder from token IDs
 */
export function createRecorderFromTokens(
  tokenIds: string[],
  options: Partial<RecorderOptions> = {}
): Recorder {
  return new Recorder({
    marketId: options.marketId || tokenIds[0],
    tokenIds: tokenIds,
    marketTitle: options.marketTitle || 'Custom Recording',
    sessionName: options.sessionName,
    gameInfo: options.gameInfo,
  });
}
