# 🚀 Implementation Phases (Market Microstructure + Live Trading)

## 📦 Phase 1: Real-Time Data Pipeline (Weeks 1-2)

### Goals
- Ingest order book updates via WebSocket
- Store snapshots for historical analysis
- Track trades in real time
- Manual event logging (round wins/losses)

### Day 1-2: WebSocket Ingestion

```typescript
// src/services/polymarket/websocket.ts
import WebSocket from 'ws';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export class PolymarketWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  
  connect() {
    this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
    
    this.ws.on('open', () => {
      console.log('✅ WebSocket connected');
      this.resubscribe();
    });
    
    this.ws.on('message', async (data) => {
      const message = JSON.parse(data.toString());
      await this.handleMessage(message);
    });
    
    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
    
    this.ws.on('close', () => {
      console.warn('WebSocket closed, reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    });
  }
  
  subscribeToMarket(marketId: string) {
    this.subscriptions.add(marketId);
    this.ws?.send(JSON.stringify({
      type: 'subscribe',
      market: marketId,
      assets: ['book', 'trades']
    }));
  }
  
  private async handleMessage(message: any) {
    if (message.type === 'book_update') {
      await this.handleOrderBookUpdate(message);
    } else if (message.type === 'trade') {
      await this.handleTrade(message);
    }
  }
  
  private async handleOrderBookUpdate(message: any) {
    const { market, bids, asks, timestamp } = message;
    
    // Store in Redis for fast access
    await redis.set(
      `orderbook:${market}`,
      JSON.stringify({ bids, asks, timestamp }),
      'EX',
      60 // 60 seconds TTL
    );
    
    // Calculate metrics
    const bestBid = parseFloat(bids[0]?.price || '0');
    const bestAsk = parseFloat(asks[0]?.price || '1');
    const spread = bestAsk - bestBid;
    const bidDepth = bids.slice(0, 5).reduce((sum, b) => sum + parseFloat(b.size), 0);
    const askDepth = asks.slice(0, 5).reduce((sum, a) => sum + parseFloat(a.size), 0);
    
    // Store snapshot every 500ms (throttled)
    const lastSnapshot = await redis.get(`last_snapshot:${market}`);
    const now = Date.now();
    
    if (!lastSnapshot || now - parseInt(lastSnapshot) > 500) {
      await prisma.orderBookSnapshot.create({
        data: {
          marketId: market,
          timestamp: new Date(timestamp),
          bestBid,
          bestAsk,
          spread,
          bidDepth,
          askDepth,
          midPrice: (bestBid + bestAsk) / 2,
          bids: JSON.stringify(bids),
          asks: JSON.stringify(asks),
        },
      });
      
      await redis.set(`last_snapshot:${market}`, now.toString());
    }
  }
  
  private async handleTrade(message: any) {
    const { market, side, price, size, timestamp } = message;
    
    // Emit to subscribers (for live dashboard)
    this.emit('trade', { market, side, price, size, timestamp });
    
    // Store in database
    await prisma.trade.create({
      data: {
        marketId: market,
        side,
        price: parseFloat(price),
        size: parseFloat(size),
        entryTime: new Date(timestamp),
        // traderId and other fields filled later
      },
    });
  }
}
```

### Day 3-4: Order Book Reconstruction

```typescript
// src/services/orderbook/tracker.ts
export class OrderBookTracker {
  private books = new Map<string, OrderBook>();
  
  async initialize(marketId: string) {
    // Fetch initial order book from REST API
    const response = await fetch(`https://clob.polymarket.com/book?market=${marketId}`);
    const data = await response.json();
    
    this.books.set(marketId, {
      bids: new Map(data.bids.map(b => [b.price, b.size])),
      asks: new Map(data.asks.map(a => [a.price, a.size])),
    });
  }
  
  handleUpdate(marketId: string, update: any) {
    const book = this.books.get(marketId);
    if (!book) return;
    
    // Apply incremental updates
    for (const bid of update.bids) {
      if (bid.size === '0') {
        book.bids.delete(bid.price);
      } else {
        book.bids.set(bid.price, bid.size);
      }
    }
    
    for (const ask of update.asks) {
      if (ask.size === '0') {
        book.asks.delete(ask.price);
      } else {
        book.asks.set(ask.price, ask.size);
      }
    }
  }
  
  getBook(marketId: string): OrderBook | undefined {
    return this.books.get(marketId);
  }
  
  calculateMetrics(marketId: string) {
    const book = this.getBook(marketId);
    if (!book) return null;
    
    const bids = Array.from(book.bids.entries())
      .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    const asks = Array.from(book.asks.entries())
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
    
    const bestBid = parseFloat(bids[0]?.[0] || '0');
    const bestAsk = parseFloat(asks[0]?.[0] || '1');
    const spread = bestAsk - bestBid;
    const spreadBps = (spread / bestBid) * 10000;
    
    return {
      bestBid,
      bestAsk,
      spread,
      spreadBps,
      bidDepth: bids.slice(0, 5).reduce((sum, [_, size]) => sum + parseFloat(size), 0),
      askDepth: asks.slice(0, 5).reduce((sum, [_, size]) => sum + parseFloat(size), 0),
    };
  }
}
```

### Day 5-7: Event Logging System

```typescript
// src/services/events/logger.ts
export class EventLogger {
  async logRoundEvent(marketId: string, event: {
    type: 'round_win' | 'round_loss' | 'clutch' | 'ace' | 'eco_round';
    team: string;
    player?: string;
    score: string;
  }) {
    // Get price before event
    const orderbook = await redis.get(`orderbook:${marketId}`);
    const priceBefore = orderbook ? JSON.parse(orderbook).bids[0]?.price : null;
    
    // Store event
    await prisma.marketEvent.create({
      data: {
        marketId,
        timestamp: new Date(),
        eventType: event.type,
        metadata: JSON.stringify(event),
        priceBefore: priceBefore ? parseFloat(priceBefore) : null,
      },
    });
    
    // Wait 10 seconds, then capture price after
    setTimeout(async () => {
      const orderbookAfter = await redis.get(`orderbook:${marketId}`);
      const priceAfter = orderbookAfter ? JSON.parse(orderbookAfter).bids[0]?.price : null;
      
      if (priceAfter && priceBefore) {
        const priceChange = parseFloat(priceAfter) - parseFloat(priceBefore);
        console.log(`Event ${event.type}: Price moved ${priceChange.toFixed(4)} (${((priceChange / parseFloat(priceBefore)) * 100).toFixed(2)}%)`);
      }
    }, 10000);
  }
}
```

**Manual logging UI (simple):**
```typescript
// src/app/events/page.tsx
'use client';

import { useState } from 'react';

export default function EventLogger() {
  const [market, setMarket] = useState('');
  const [eventType, setEventType] = useState<string>('round_win');
  const [team, setTeam] = useState('');
  
  const logEvent = async () => {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketId: market, eventType, team }),
    });
    alert('Event logged!');
  };
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Event Logger</h1>
      <div className="space-y-4">
        <input
          placeholder="Market ID"
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          className="border p-2 w-full"
        />
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="border p-2 w-full"
        >
          <option value="round_win">Round Win</option>
          <option value="round_loss">Round Loss</option>
          <option value="clutch">Clutch</option>
          <option value="ace">Ace</option>
          <option value="eco_round">Eco Round</option>
        </select>
        <input
          placeholder="Team"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="border p-2 w-full"
        />
        <button
          onClick={logEvent}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Log Event
        </button>
      </div>
    </div>
  );
}
```

---

## 📊 Phase 2: Psychology Signal Engine (Weeks 3-4)

### Goals
- Detect panic selling, FOMO buying, liquidity vacuums
- Score signals with confidence (0-1)
- Track reversion times and profitability

### Day 1-3: Signal Detection

```typescript
// src/services/signals/detector.ts
export class SignalDetector {
  private baselines = new Map<string, {
    avgVolume: number;
    avgSpread: number;
  }>();
  
  async calculateBaseline(marketId: string) {
    // Get last 1 hour of data
    const snapshots = await prisma.orderBookSnapshot.findMany({
      where: {
        marketId,
        timestamp: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    });
    
    const avgVolume = snapshots.reduce((sum, s) => sum + s.bidDepth + s.askDepth, 0) / snapshots.length;
    const avgSpread = snapshots.reduce((sum, s) => sum + s.spread, 0) / snapshots.length;
    
    this.baselines.set(marketId, { avgVolume, avgSpread });
  }
  
  async detectSignals(marketId: string) {
    const baseline = this.baselines.get(marketId);
    if (!baseline) return null;
    
    // Get current order book
    const current = await this.getCurrentBook(marketId);
    if (!current) return null;
    
    const volumeRatio = (current.bidDepth + current.askDepth) / baseline.avgVolume;
    const spreadRatio = current.spread / baseline.avgSpread;
    
    // Panic selling: high volume spike + price drop + spread widening
    if (volumeRatio > 3 && spreadRatio > 2) {
      const priceChange = await this.getPriceChange(marketId, 30); // last 30 seconds
      
      if (priceChange < -0.03) { // 3% drop
        await this.emitSignal(marketId, 'PANIC_SELL', {
          score: Math.min(volumeRatio / 5, 1),
          volumeRatio,
          spreadRatio,
          priceChange,
        });
      }
    }
    
    // FOMO buying: high volume spike + price jump
    if (volumeRatio > 3) {
      const priceChange = await this.getPriceChange(marketId, 30);
      
      if (priceChange > 0.05) { // 5% jump
        await this.emitSignal(marketId, 'FOMO_BUY', {
          score: Math.min(volumeRatio / 5, 1),
          volumeRatio,
          spreadRatio,
          priceChange,
        });
      }
    }
    
    // Liquidity vacuum: depth drops >50%
    if (volumeRatio < 0.5 && spreadRatio > 3) {
      await this.emitSignal(marketId, 'LIQUIDITY_VACUUM', {
        score: 1 - volumeRatio,
        volumeRatio,
        spreadRatio,
      });
    }
  }
  
  private async emitSignal(
    marketId: string,
    type: 'PANIC_SELL' | 'FOMO_BUY' | 'LIQUIDITY_VACUUM',
    metrics: any
  ) {
    const signal = await prisma.psychologySignal.create({
      data: {
        marketId,
        timestamp: new Date(),
        signalType: type,
        score: metrics.score,
        volumeRatio: metrics.volumeRatio,
        spreadRatio: metrics.spreadRatio,
        priceChange: metrics.priceChange,
      },
    });
    
    // Emit to live dashboard
    this.emit('signal', { marketId, type, ...metrics, signalId: signal.id });
    
    // Track reversion
    this.trackReversion(signal.id, marketId);
  }
  
  private async trackReversion(signalId: string, marketId: string) {
    const startTime = Date.now();
    const startPrice = await this.getCurrentPrice(marketId);
    
    // Poll every 5 seconds for 3 minutes
    const interval = setInterval(async () => {
      const currentPrice = await this.getCurrentPrice(marketId);
      const priceChange = Math.abs(currentPrice - startPrice);
      
      // Reverted if price moved back >50% of original move
      if (priceChange < 0.02) { // within 2¢
        const reversionTime = Math.floor((Date.now() - startTime) / 1000);
        
        await prisma.psychologySignal.update({
          where: { id: signalId },
          data: {
            reverted: true,
            reversionTime,
            maxProfit: Math.abs(startPrice - currentPrice),
          },
        });
        
        clearInterval(interval);
      }
      
      // Stop tracking after 3 minutes
      if (Date.now() - startTime > 180_000) {
        clearInterval(interval);
      }
    }, 5000);
  }
}
```

### Day 4-7: Backtesting Framework

```typescript
// src/services/backtest/engine.ts
export class BacktestEngine {
  async runBacktest(marketId: string, strategy: 'panic_fade' | 'fomo_fade') {
    // Get all signals for this market
    const signals = await prisma.psychologySignal.findMany({
      where: { marketId, signalType: strategy === 'panic_fade' ? 'PANIC_SELL' : 'FOMO_BUY' },
      orderBy: { timestamp: 'asc' },
    });
    
    let totalTrades = 0;
    let winners = 0;
    let totalProfit = 0;
    
    for (const signal of signals) {
      // Simulate trade: enter at signal, exit after reversion or timeout
      const entryPrice = signal.priceChange! > 0 ? 
        await this.getPriceAt(marketId, signal.timestamp) : 
        await this.getPriceAt(marketId, signal.timestamp);
      
      const exitPrice = signal.reverted ?
        await this.getPriceAt(marketId, new Date(signal.timestamp.getTime() + (signal.reversionTime! * 1000))) :
        entryPrice; // no reversion = breakeven
      
      const profit = strategy === 'panic_fade' ?
        (exitPrice - entryPrice) : // buy low, sell high
        (entryPrice - exitPrice); // sell high, buy low
      
      totalTrades++;
      if (profit > 0) winners++;
      totalProfit += profit;
    }
    
    return {
      totalTrades,
      winRate: winners / totalTrades,
      avgProfit: totalProfit / totalTrades,
      totalProfit,
      sharpe: this.calculateSharpe(signals.map(s => s.maxProfit || 0)),
    };
  }
}
```

---

## 🖥️ Phase 3: Live Trading Terminal (Weeks 5-6)

### Goals
- One-click buy/sell execution
- Hotkey support
- Position tracking
- Risk controls (max size, cooldowns)

### Day 1-3: Trading Service

```typescript
// src/services/trading/executor.ts
import { PolymarketClobClient } from '@polymarket/clob-client';

export class TradingExecutor {
  private client: PolymarketClobClient;
  private positions = new Map<string, Position>();
  
  async executeOrder(order: {
    marketId: string;
    side: 'buy' | 'sell';
    price: number;
    size: number;
    type: 'market' | 'limit';
  }) {
    // Check risk controls
    const canTrade = await this.checkRiskControls(order);
    if (!canTrade.ok) {
      throw new Error(canTrade.reason);
    }
    
    // Create idempotent order ID
    const orderId = `${order.marketId}-${Date.now()}-${Math.random()}`;
    
    try {
      const result = await this.client.createOrder({
        market: order.marketId,
        side: order.side,
        price: order.price.toString(),
        size: order.size.toString(),
        orderType: order.type,
        clientOrderId: orderId,
      });
      
      // Store in database
      await prisma.limitOrder.create({
        data: {
          orderId: result.orderId,
          marketId: order.marketId,
          side: order.side === 'buy' ? 'YES' : 'NO',
          price: order.price,
          size: order.size,
          placedAt: new Date(),
          status: 'OPEN',
        },
      });
      
      // Update position
      this.updatePosition(order.marketId, order.side, order.size, order.price);
      
      return { success: true, orderId: result.orderId };
    } catch (err) {
      console.error('Order failed:', err);
      return { success: false, error: err.message };
    }
  }
  
  private async checkRiskControls(order: any) {
    // Max position size
    const position = this.positions.get(order.marketId);
    if (position && position.size + order.size > 1000) {
      return { ok: false, reason: 'Max position size exceeded' };
    }
    
    // Max loss per session
    const todayPnl = await this.getTodayPnl();
    if (todayPnl < -500) {
      return { ok: false, reason: 'Daily loss limit reached' };
    }
    
    // Cooldown (no more than 1 trade per 5 seconds)
    const lastTrade = await redis.get(`last_trade:${order.marketId}`);
    if (lastTrade && Date.now() - parseInt(lastTrade) < 5000) {
      return { ok: false, reason: 'Cooldown active (5s)' };
    }
    
    return { ok: true };
  }
  
  async cancelOrder(orderId: string) {
    await this.client.cancelOrder(orderId);
    
    await prisma.limitOrder.update({
      where: { orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }
  
  async cancelAllOrders(marketId: string) {
    const orders = await prisma.limitOrder.findMany({
      where: { marketId, status: 'OPEN' },
    });
    
    for (const order of orders) {
      await this.cancelOrder(order.orderId);
    }
  }
}
```

### Day 4-6: Terminal UI

```typescript
// src/app/terminal/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

export default function TradingTerminal() {
  const [market, setMarket] = useState('');
  const [orderBook, setOrderBook] = useState<any>(null);
  const [position, setPosition] = useState<any>(null);
  const [size, setSize] = useState(100);
  
  // Hotkeys
  useHotkeys('b', () => buyMarket()); // B = buy market
  useHotkeys('s', () => sellMarket()); // S = sell market
  useHotkeys('c', () => cancelAll()); // C = cancel all
  useHotkeys('esc', () => panicClose()); // ESC = panic close
  
  const buyMarket = async () => {
    const bestAsk = orderBook?.asks[0]?.price;
    if (!bestAsk) return;
    
    const result = await fetch('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketId: market,
        side: 'buy',
        price: bestAsk,
        size,
        type: 'market',
      }),
    }).then(r => r.json());
    
    if (result.success) {
      alert(`Bought ${size} @ ${bestAsk}`);
    } else {
      alert(`Error: ${result.error}`);
    }
  };
  
  const sellMarket = async () => {
    const bestBid = orderBook?.bids[0]?.price;
    if (!bestBid) return;
    
    const result = await fetch('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketId: market,
        side: 'sell',
        price: bestBid,
        size,
        type: 'market',
      }),
    }).then(r => r.json());
    
    if (result.success) {
      alert(`Sold ${size} @ ${bestBid}`);
    } else {
      alert(`Error: ${result.error}`);
    }
  };
  
  const cancelAll = async () => {
    await fetch(`/api/cancel-all?market=${market}`, { method: 'POST' });
    alert('All orders cancelled');
  };
  
  const panicClose = async () => {
    if (!confirm('PANIC CLOSE ALL POSITIONS?')) return;
    
    await fetch('/api/panic-close', { method: 'POST' });
    alert('All positions closed!');
  };
  
  return (
    <div className="h-screen flex">
      {/* Left: Order Book */}
      <div className="w-1/3 border-r p-4">
        <h2 className="font-bold mb-4">Order Book</h2>
        {orderBook && (
          <>
            <div className="mb-4">
              <h3 className="text-sm text-gray-500">Asks</h3>
              {orderBook.asks.slice(0, 10).reverse().map((ask: any, i: number) => (
                <div key={i} className="flex justify-between text-red-500">
                  <span>{ask.price}</span>
                  <span>{ask.size}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-2">
              <h3 className="text-sm text-gray-500">Bids</h3>
              {orderBook.bids.slice(0, 10).map((bid: any, i: number) => (
                <div key={i} className="flex justify-between text-green-500">
                  <span>{bid.price}</span>
                  <span>{bid.size}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      
      {/* Center: Trade Controls */}
      <div className="w-1/3 p-4">
        <h2 className="font-bold mb-4">Trade Controls</h2>
        <input
          placeholder="Size"
          value={size}
          onChange={(e) => setSize(parseInt(e.target.value))}
          className="border p-2 w-full mb-4"
        />
        <div className="space-y-2">
          <button
            onClick={buyMarket}
            className="w-full bg-green-500 text-white p-3 rounded font-bold"
          >
            BUY MARKET (B)
          </button>
          <button
            onClick={sellMarket}
            className="w-full bg-red-500 text-white p-3 rounded font-bold"
          >
            SELL MARKET (S)
          </button>
          <button
            onClick={cancelAll}
            className="w-full bg-gray-500 text-white p-2 rounded"
          >
            CANCEL ALL (C)
          </button>
          <button
            onClick={panicClose}
            className="w-full bg-red-900 text-white p-2 rounded"
          >
            PANIC CLOSE (ESC)
          </button>
        </div>
      </div>
      
      {/* Right: Position & PnL */}
      <div className="w-1/3 border-l p-4">
        <h2 className="font-bold mb-4">Position</h2>
        {position && (
          <div className="space-y-2">
            <div>Size: {position.size}</div>
            <div>Avg Price: {position.avgPrice}</div>
            <div className={position.pnl > 0 ? 'text-green-500' : 'text-red-500'}>
              PnL: ${position.pnl.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 📹 Phase 4: Video + Order Flow Dashboard (Weeks 7-8)

### Goals
- Sync video with order flow
- Visualize psychology signals
- Playback historical matches

### Day 1-4: Dashboard Layout

```typescript
// src/app/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';

export default function Dashboard() {
  const [market, setMarket] = useState('');
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  
  // WebSocket for live updates
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/ws');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'price_update') {
        setPriceHistory(prev => [...prev, data]);
      } else if (data.type === 'signal') {
        setSignals(prev => [...prev, data]);
      }
    };
    
    return () => ws.close();
  }, []);
  
  return (
    <div className="h-screen flex flex-col">
      {/* Video */}
      <div className="h-1/2 bg-black">
        {videoUrl && (
          <iframe
            src={videoUrl}
            className="w-full h-full"
            allowFullScreen
          />
        )}
      </div>
      
      {/* Order Flow Chart */}
      <div className="h-1/2 p-4">
        <div className="flex space-x-4">
          {/* Price Chart */}
          <div className="w-2/3">
            <h3 className="font-bold mb-2">Price + Signals</h3>
            <Line
              data={{
                labels: priceHistory.map(p => p.timestamp),
                datasets: [
                  {
                    label: 'Price',
                    data: priceHistory.map(p => p.price),
                    borderColor: 'blue',
                  },
                ],
              }}
              options={{
                plugins: {
                  annotation: {
                    annotations: signals.map(s => ({
                      type: 'line',
                      xMin: s.timestamp,
                      xMax: s.timestamp,
                      borderColor: s.type === 'PANIC_SELL' ? 'red' : 'green',
                      borderWidth: 2,
                      label: {
                        content: s.type,
                        enabled: true,
                      },
                    })),
                  },
                },
              }}
            />
          </div>
          
          {/* Signals List */}
          <div className="w-1/3">
            <h3 className="font-bold mb-2">Signals</h3>
            <div className="space-y-2 overflow-y-auto max-h-96">
              {signals.map((signal, i) => (
                <div
                  key={i}
                  className={`p-2 rounded ${
                    signal.type === 'PANIC_SELL' ? 'bg-red-100' :
                    signal.type === 'FOMO_BUY' ? 'bg-green-100' :
                    'bg-yellow-100'
                  }`}
                >
                  <div className="font-bold">{signal.type}</div>
                  <div className="text-sm">Score: {signal.score.toFixed(2)}</div>
                  <div className="text-sm">Volume: {signal.volumeRatio.toFixed(1)}x</div>
                  {signal.reverted && (
                    <div className="text-sm text-green-600">
                      ✅ Reverted in {signal.reversionTime}s
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 🧪 Phase 5: Backtesting & Strategy Validation (Weeks 9-10)

### Goals
- Validate all psychology signals historically
- Calculate win rates, Sharpe ratios, max drawdowns
- Generate strategy performance reports

### Backtest Results Format

```
Strategy: Panic Fade (Buy during panic sells)
==================================================
Period: 2024-01-01 to 2025-01-18
Markets: 47 Valorant matches

Results:
- Total Signals: 143
- Trades Taken: 127 (score > 0.7 threshold)
- Win Rate: 67.7%
- Avg Profit per Trade: $12.40
- Total Profit: $1,574.80
- Sharpe Ratio: 2.14
- Max Drawdown: -$147.20 (3 consecutive losses)
- Avg Reversion Time: 74 seconds

Top Performing Substrategies:
1. Eco round losses (83% win rate, 34 trades)
2. Map losses (72% win rate, 41 trades)
3. Clutch losses (64% win rate, 52 trades)

Risk Adjusted:
- Kelly Criterion: 12% position size
- Max recommended bet: $150 per trade
- Expected annual return: ~280% (with $1000 starting capital)
```

---

## ⚠️ Risk Management

### Trading Limits
- Max position size: $1,000 per market
- Max daily loss: $500
- Max consecutive losses: 3 (then cooldown)
- Cooldown period: 5 seconds between trades

### Circuit Breakers
- API error rate >10%: halt trading for 5 minutes
- PnL drops >20% in 1 hour: halt trading until manual review
- Spread >10x baseline: skip trade (liquidity too thin)

### Monitoring
- Log every trade with: timestamp, market, side, price, size, result
- Track latency: signal detection → order submit → fill
- Alert on: unusual slippage, failed orders, risk limit breaches

---

## 📈 Success Metrics

### Technical
- Order book latency: <300ms (signal detection)
- Execution latency: <500ms (signal → order submit)
- WebSocket uptime: >99.5%
- Data accuracy: 100% (verified against API)

### Trading
- Win rate: >60%
- Sharpe ratio: >1.5
- Max drawdown: <15%
- Avg profit per trade: >$10

### Product
- Signals per day: >20 (across all markets)
- False positive rate: <20%
- Reversion prediction accuracy: >70%

---

## 💡 Future Enhancements

1. **Multi-Sport Expansion**
   - Add CS:GO, LoL, Dota 2
   - Track liquidity across all markets
   - Auto-select highest liquidity opportunities

2. **Automated Trading**
   - Optional auto-execute on high-confidence signals
   - Require manual approval for >$500 trades
   - Paper trading mode for testing

3. **Machine Learning**
   - Train ML model on signal features → reversion probability
   - Predict optimal entry/exit timing
   - Adaptive thresholds based on market conditions

4. **Social/Copy Trading**
   - Share signal alerts with subscribers
   - Leaderboard of best signal traders
   - API for third-party integrations

---

**Built with ⚡ for speed and 🧠 for psychology**
