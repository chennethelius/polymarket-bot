/**
 * Polymarket WebSocket Client
 * 
 * Connects to Polymarket's public market channel for order book updates.
 * Handles reconnection, heartbeat, and event normalization.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

// Polymarket WebSocket endpoint
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// Types
export interface OrderBookUpdate {
  type: 'book';
  timestamp: number;
  asset_id: string;
  market: string;
  bids: Array<[number, number]>; // [price, size]
  asks: Array<[number, number]>;
  hash?: string;
}

export interface PriceChange {
  type: 'price_change';
  timestamp: number;
  asset_id: string;
  price: number;
  side: 'BUY' | 'SELL';
}

export interface LastTrade {
  type: 'last_trade_price';
  timestamp: number;
  asset_id: string;
  price: number;
}

export type MarketEvent = OrderBookUpdate | PriceChange | LastTrade;

interface PolymarketClientOptions {
  tokenIds: string[];           // Asset/token IDs to subscribe
  reconnectDelay?: number;      // Delay between reconnects (ms)
  maxReconnects?: number;       // Max reconnect attempts
  heartbeatInterval?: number;   // Heartbeat interval (ms)
}

export class PolymarketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private tokenIds: string[];
  private reconnectDelay: number;
  private maxReconnects: number;
  private heartbeatInterval: number;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(options: PolymarketClientOptions) {
    super();
    this.tokenIds = options.tokenIds;
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.maxReconnects = options.maxReconnects || 10;
    this.heartbeatInterval = options.heartbeatInterval || 10000;
  }

  /**
   * Connect to WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Already connecting'));
        return;
      }

      this.isConnecting = true;
      this.shouldReconnect = true;

      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connected');
        this.subscribe();
        this.startHeartbeat();
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnecting = false;
        this.stopHeartbeat();
        this.emit('disconnected', { code, reason: reason.toString() });
        
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        this.isConnecting = false;
        this.emit('error', error);
        
        if (this.reconnectAttempts === 0) {
          reject(error);
        }
      });
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to market channels
   */
  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Subscribe to each token
    const subscribeMsg = {
      type: 'subscribe',
      channel: 'market',
      assets_ids: this.tokenIds,
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    this.emit('subscribed', { tokenIds: this.tokenIds });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle different message types
      if (Array.isArray(message)) {
        // Batch of events
        for (const event of message) {
          this.processEvent(event);
        }
      } else if (message.type) {
        this.processEvent(message);
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }

  /**
   * Process a single event
   */
  private processEvent(event: any): void {
    const timestamp = Date.now();

    switch (event.type || event.event_type) {
      case 'book':
        const bookUpdate: OrderBookUpdate = {
          type: 'book',
          timestamp,
          asset_id: event.asset_id,
          market: event.market,
          bids: this.parseOrderBookSide(event.bids),
          asks: this.parseOrderBookSide(event.asks),
          hash: event.hash,
        };
        this.emit('book', bookUpdate);
        break;

      case 'price_change':
        const priceChange: PriceChange = {
          type: 'price_change',
          timestamp,
          asset_id: event.asset_id,
          price: parseFloat(event.price),
          side: event.side,
        };
        this.emit('price', priceChange);
        break;

      case 'last_trade_price':
        const lastTrade: LastTrade = {
          type: 'last_trade_price',
          timestamp,
          asset_id: event.asset_id,
          price: parseFloat(event.price),
        };
        this.emit('trade', lastTrade);
        break;

      default:
        // Unknown event type, emit raw
        this.emit('raw', event);
    }
  }

  /**
   * Parse order book side (bids or asks)
   */
  private parseOrderBookSide(side: any): Array<[number, number]> {
    if (!Array.isArray(side)) return [];
    
    return side.map((level: any) => {
      if (Array.isArray(level)) {
        return [parseFloat(level[0]), parseFloat(level[1])];
      }
      return [parseFloat(level.price), parseFloat(level.size)];
    });
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) {
      this.emit('max_reconnects');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    
    this.emit('reconnecting', { 
      attempt: this.reconnectAttempts, 
      maxAttempts: this.maxReconnects,
      delay,
    });

    setTimeout(() => {
      this.connect().catch(() => {
        // Error handled in connect()
      });
    }, delay);
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Fetch initial order book snapshot via REST
 */
export async function fetchOrderBook(tokenId: string): Promise<OrderBookUpdate | null> {
  try {
    const url = `https://clob.polymarket.com/book?token_id=${tokenId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      type: 'book',
      timestamp: Date.now(),
      asset_id: tokenId,
      market: data.market || '',
      bids: (data.bids || []).map((b: any) => [parseFloat(b.price), parseFloat(b.size)]),
      asks: (data.asks || []).map((a: any) => [parseFloat(a.price), parseFloat(a.size)]),
      hash: data.hash,
    };
  } catch (error) {
    console.error('Failed to fetch order book:', error);
    return null;
  }
}

/**
 * Lookup market info from Polymarket
 */
export async function fetchMarketInfo(conditionId: string): Promise<{
  title: string;
  tokenId: string;
  outcome: string;
} | null> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const markets = await response.json();
    if (!markets.length) return null;
    
    const market = markets[0];
    return {
      title: market.question || market.title,
      tokenId: market.tokens?.[0]?.token_id || '',
      outcome: market.tokens?.[0]?.outcome || 'YES',
    };
  } catch (error) {
    console.error('Failed to fetch market info:', error);
    return null;
  }
}
