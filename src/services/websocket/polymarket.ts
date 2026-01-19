import WebSocket from 'ws';
import { prisma } from '@/lib/prisma';
import { redisClient as redis } from '@/lib/redis';
import { EventEmitter } from 'events';
import { orderBookTracker } from '@/services/orderbook/tracker';

interface OrderBookUpdate {
  market: string;
  timestamp: number;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

interface Trade {
  market: string;
  side: 'buy' | 'sell';
  price: string;
  size: string;
  timestamp: number;
}

export class PolymarketWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor() {
    super();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.isConnected) {
        console.log('⚠️ Already connected');
        resolve();
        return;
      }

      console.log('🔌 Connecting to Polymarket WebSocket...');
      this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 30000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ WebSocket connected');
        this.isConnected = true;
        this.startHeartbeat();
        this.resubscribe();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(message);
        } catch (err) {
          console.error('Error handling message:', err);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error('❌ WebSocket error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      this.ws.on('close', () => {
        console.warn('🔌 WebSocket closed, reconnecting in 5s...');
        this.isConnected = false;
        this.stopHeartbeat();
        
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }
        
        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, 5000);
      });
    });
  }

  disconnect() {
    console.log('🔌 Disconnecting WebSocket...');
    this.isConnected = false;
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribeToMarket(marketId: string) {
    if (!this.isConnected) {
      console.warn(`⚠️ Not connected, queuing subscription for ${marketId}`);
      this.subscriptions.add(marketId);
      return;
    }

    console.log(`📡 Subscribing to market: ${marketId}`);
    this.subscriptions.add(marketId);
    // Initialize order book from REST API
    orderBookTracker.initialize(marketId).catch(err => {
      console.error(`Failed to initialize order book for ${marketId}:`, err);
    });
    this.ws?.send(
      JSON.stringify({
        type: 'subscribe',
        market: marketId,
        assets: ['book', 'trades'],
      })
    );
  }

  unsubscribeFromMarket(marketId: string) {
    console.log(`📡 Unsubscribing from market: ${marketId}`);
    this.subscriptions.delete(marketId);

    this.ws?.send(
      JSON.stringify({
        type: 'unsubscribe',
        market: marketId,
      })
    );
  }

  private resubscribe() {
    if (this.subscriptions.size === 0) {
      console.log('📡 No subscriptions to restore');
      return;
    }

    console.log(`📡 Resubscribing to ${this.subscriptions.size} markets...`);
    for (const marketId of this.subscriptions) {
      this.ws?.send(
        JSON.stringify({
          type: 'subscribe',
          market: marketId,
          assets: ['book', 'trades'],
        })
      );
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async handleMessage(message: any) {
    if (message.type === 'pong') {
      return; // Heartbeat response
    }

    if (message.type === 'book_update') {
      await this.handleOrderBookUpdate(message);
    } else if (message.type === 'trade') {
      await this.handleTrade(message);
    } else if (message.type === 'subscribed') {
      console.log(`✅ Subscribed to ${message.market}`);
    } else {
      // Log unknown message types for debugging
      console.log('📨 Unknown message type:', message.type);
    }
  }

  private async handleOrderBookUpdate(message: any) {
    const { market, bids, asks, timestamp } = message;

    if (!bids || !asks) {
      return; // Invalid data
    }

    try {
      // Update in-memory order book
      orderBookTracker.applyUpdate(market, bids, asks);

      // Get metrics from tracker
      const metrics = orderBookTracker.getMetrics(market);
      if (!metrics) {
        console.warn(`⚠️ Could not calculate metrics for ${market}`);
        return;
      }

      // Store in Redis for fast access (60s TTL)
      await redis.set(
        `orderbook:${market}`,
        JSON.stringify({ 
          bids, 
          asks, 
          timestamp,
          metrics,
        }),
        'EX',
        60
      );

      // Emit for live dashboard
      this.emit('orderbook', {
        market,
        timestamp: new Date(timestamp),
        ...metrics,
        bids,
        asks,
      });

      // Throttle database writes to 500ms per market
      const lastSnapshot = await redis.get(`last_snapshot:${market}`);
      const now = Date.now();

      if (!lastSnapshot || now - parseInt(lastSnapshot) > 500) {
        // Store snapshot in database
        await prisma.orderBookSnapshot.create({
          data: {
            marketId: market,
            timestamp: new Date(timestamp),
            bestBid: metrics.bestBid,
            bestAsk: metrics.bestAsk,
            spread: metrics.spread,
            bidDepth: metrics.bidDepth,
            askDepth: metrics.askDepth,
            midPrice: metrics.midPrice,
            bids: JSON.stringify(bids),
            asks: JSON.stringify(asks),
          },
        });

        await redis.set(`last_snapshot:${market}`, now.toString());
      }
    } catch (err) {
      console.error(`Error handling order book update for ${market}:`, err);
    }
  }

  private async handleTrade(message: any) {
    const { market, side, price, size, timestamp } = message;

    try {
      // Emit for live dashboard
      this.emit('trade', {
        market,
        side,
        price: parseFloat(price),
        size: parseFloat(size),
        timestamp: new Date(timestamp),
      });

      // Store in Redis (last 100 trades per market)
      const tradesKey = `trades:${market}`;
      await redis.lpush(
        tradesKey,
        JSON.stringify({ side, price, size, timestamp })
      );
      await redis.ltrim(tradesKey, 0, 99); // Keep last 100
      await redis.expire(tradesKey, 3600); // 1 hour TTL
    } catch (err) {
      console.error(`Error handling trade for ${market}:`, err);
    }
  }
}

// Singleton instance
export const polymarketWS = new PolymarketWebSocket();
