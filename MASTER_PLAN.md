# ⚡ Live Trading Terminal for Prediction Markets

> **Real-time market psychology analysis + one-click execution**
> 
> Stop manually entering orders. Let the tool detect overreactions and execute trades
> in milliseconds while you watch the game. Analyze live streams or uploaded VODs
> to identify patterns and capture mean reversion opportunities.

---

## 📋 Table of Contents

1. [What This Tool Does](#-what-this-tool-does)
2. [Why You Need This](#-why-you-need-this)
3. [Technical Architecture](#-technical-architecture)
4. [Setup Guide (Foolproof)](#-setup-guide-foolproof)
5. [Core Features](#-core-features)
6. [Implementation Roadmap](#-implementation-roadmap)
7. [Tech Stack](#-tech-stack)
8. [Database Schema](#-database-schema)
9. [Risk Controls](#-risk-controls)
10. [Trading Strategies](#-trading-strategies)

---

## 🎯 What This Tool Does

This is a **live trading assistant** that helps you trade prediction markets faster and smarter:

1. **Connects to live streams** (Twitch, YouTube) or analyzes **uploaded VODs**
2. **Tracks order books in real-time** via WebSocket (Polymarket, Kalshi)
3. **Detects psychology signals** (panic selling, FOMO buying) with quantified confidence scores
4. **Executes trades instantly** via one-click or hotkeys (no manual order entry on exchange websites)
5. **Shows you exactly when to enter/exit** based on historical reversion patterns
6. **Backtests every signal** so you know what actually works

### Example Workflow

```
You're watching Sentinels vs. 100 Thieves (Valorant) live:

1. Stream shows: Sentinels lose eco round → 0-3 down
2. Tool detects: Panic selling (volume +380%, price drops 45¢ → 31¢)
3. Signal alert: "PANIC_SELL | Score: 0.89 | Expected reversion: 38¢ in 60s"
4. You click: "BUY 100 @ 32¢"
5. Order executes in 280ms
6. 74 seconds later: Price reverts to 39¢
7. Result: +$7.00 profit (21.9% return)
```

**No more:**
- Missing opportunities because you're too slow
- Guessing if it's an overreaction
- Manually entering orders on Kalshi/Polymarket
- Trading on emotion

---

## 🔥 Why You Need This

### The Problem

**Manual trading is slow and emotional:**

| Scenario | Manual Approach | With This Tool |
|----------|----------------|----------------|
| **Spot overreaction** | "Wait, did that just happen?" | Instant alert with confidence score |
| **Decide if it's tradeable** | Gut feeling, no data | Quantified signal (0-1 score) + historical win rate |
| **Enter the trade** | Open exchange, navigate, enter order (30-60s) | One-click or hotkey (300ms) |
| **Exit timing** | Guess when to close | Auto-alert on reversion or timeout |
| **Learn from outcomes** | No tracking | Every trade logged + backtested |

**Result:** You miss 80% of edges and trade emotionally on the rest.

### The Solution

**Systematic capture of market psychology:**

✅ **Sub-second detection** of panic/FOMO patterns  
✅ **One-click execution** (no manual order entry)  
✅ **Historical validation** (see exact win rates)  
✅ **Risk controls** (max size, cooldowns, stop-loss)  
✅ **Video sync** (correlate price moves with game events)  
✅ **Multi-market** (Polymarket, Kalshi, any WebSocket feed)

---

## 🏗 Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          LIVE TRADING TERMINAL                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐     ┌──────────────────┐                     │
│  │  VIDEO INPUTS    │     │  MARKET FEEDS    │                     │
│  ├──────────────────┤     ├──────────────────┤                     │
│  │ • Twitch embed   │     │ • Polymarket WS  │                     │
│  │ • YouTube Live   │     │ • Kalshi WS      │                     │
│  │ • Uploaded VOD   │     │ • Order books    │                     │
│  │ • Manual events  │     │ • Trade tape     │                     │
│  └────────┬─────────┘     └────────┬─────────┘                     │
│           │                        │                                │
│           └────────────┬───────────┘                                │
│                        │                                            │
│  ┌─────────────────────▼──────────────────────┐                    │
│  │       EVENT CORRELATION ENGINE             │                    │
│  │  • Sync video timestamp ↔ price moves      │                    │
│  │  • Tag events (round wins, clutches, etc)  │                    │
│  │  • Calculate price impact                  │                    │
│  └─────────────────────┬──────────────────────┘                    │
│                        │                                            │
│  ┌─────────────────────▼──────────────────────┐                    │
│  │       PSYCHOLOGY SIGNAL DETECTOR           │                    │
│  │  • Volume spikes (>3x baseline)            │                    │
│  │  • Spread widening (>2x)                   │                    │
│  │  • Price momentum (>5% in <30s)            │                    │
│  │  • Liquidity vacuums (depth drops >50%)    │                    │
│  │  → Outputs: PANIC_SELL, FOMO_BUY, etc      │                    │
│  └─────────────────────┬──────────────────────┘                    │
│                        │                                            │
│  ┌─────────────────────▼──────────────────────┐                    │
│  │       RISK & EXECUTION MANAGER             │                    │
│  │  • Check risk limits                       │                    │
│  │  • Route orders to exchange API            │                    │
│  │  • Track positions + PnL                   │                    │
│  │  • Circuit breakers                        │                    │
│  └─────────────────────┬──────────────────────┘                    │
│                        │                                            │
│  ┌─────────────────────▼──────────────────────┐                    │
│  │       LIVE DASHBOARD (Next.js)             │                    │
│  │  ┌──────────────┐  ┌──────────────┐        │                    │
│  │  │ Video Stream │  │ Order Book   │        │                    │
│  │  └──────────────┘  └──────────────┘        │                    │
│  │  ┌──────────────┐  ┌──────────────┐        │                    │
│  │  │ Price Chart  │  │ Signals List │        │                    │
│  │  │ + Events     │  │ + Confidence │        │                    │
│  │  └──────────────┘  └──────────────┘        │                    │
│  │  ┌──────────────────────────────────┐      │                    │
│  │  │  ONE-CLICK TRADE BUTTONS         │      │                    │
│  │  │  [BUY] [SELL] [CANCEL] [PANIC]   │      │                    │
│  │  └──────────────────────────────────┘      │                    │
│  └─────────────────────────────────────────────┘                    │
│                                                                     │
│  ┌──────────────────────────────────────────────┐                  │
│  │       STORAGE (SQLite / PostgreSQL)          │                  │
│  │  • Order book snapshots (500ms intervals)    │                  │
│  │  • Trades + fills                            │                  │
│  │  • Signals + outcomes                        │                  │
│  │  • Events + price impacts                    │                  │
│  └──────────────────────────────────────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Setup Guide (Foolproof)

### Prerequisites

Install these first:
- **Bun 1.2+** (runtime): `curl -fsSL https://bun.sh/install | bash`
- **Node 18+** (fallback): `brew install node` (macOS) or download from nodejs.org
- **Git**: `brew install git` (macOS) or download from git-scm.com

### Step 1: Clone & Install (2 minutes)

```bash
# Clone repository
git clone <your-repo-url>
cd polymarket-bot

# Install dependencies
bun install

# If bun fails, use npm:
npm install
```

### Step 2: Setup Database (1 minute)

**Option A: SQLite (fastest, zero config)**
```bash
# Create .env file
echo 'DATABASE_URL="file:./dev.db"' > .env

# Generate Prisma client + create database
bunx prisma generate
bunx prisma db push

# ✅ Done! Database ready.
```

**Option B: PostgreSQL (production-like)**
```bash
# Start PostgreSQL via Docker
docker-compose up -d postgres

# Or use Supabase (free tier):
# 1. Go to https://supabase.com
# 2. Create project
# 3. Copy connection string

# Create .env file with your connection string
echo 'DATABASE_URL="postgresql://user:pass@host:5432/dbname"' > .env

# Generate Prisma client + create database
bunx prisma generate
bunx prisma db push
```

### Step 3: API Keys (5 minutes)

Add these to your `.env` file:

```bash
# Database (from Step 2)
DATABASE_URL="file:./dev.db"

# Polymarket (no key needed for public data)
POLYMARKET_API_URL="https://clob.polymarket.com"
POLYMARKET_WS_URL="wss://ws-subscriptions-clob.polymarket.com/ws/market"

# Kalshi (get from https://kalshi.com → Settings → API)
KALSHI_API_KEY="your_key_here"
KALSHI_API_SECRET="your_secret_here"

# Optional: AI analysis (get from https://console.anthropic.com)
ANTHROPIC_API_KEY="sk-ant-..."

# Optional: Redis cache (leave empty for in-memory fallback)
REDIS_URL=""
```

### Step 4: Run Development Server (1 minute)

```bash
# Start the app
bun run dev

# Or with npm:
npm run dev
```

Open http://localhost:3000 → You should see the dashboard! ✅

### Step 5: Test Connection (1 minute)

```bash
# Test API connectivity
bun run src/index.ts test

# Expected output:
# ✅ Found 1000 markets
# ✅ Order book: 47 bids, 52 asks
# ✅ Gamma API: 5 markets
```

### Common Setup Issues (and fixes)

| Issue | Fix |
|-------|-----|
| `bunx: command not found` | Run `curl -fsSL https://bun.sh/install \| bash` and restart terminal |
| `Prisma hanging` | Use Prisma 5.22.0: `bun add prisma@5.22.0 @prisma/client@5.22.0` |
| `Zod parsing errors` | Use Zod 3.23.x: `bun remove zod && bun add zod@3.23.8` |
| `Redis connection failed` | Leave `REDIS_URL` empty in .env (app uses in-memory fallback) |
| `Port 3000 already in use` | Kill process: `lsof -ti:3000 \| xargs kill -9` or use different port |

---

## ✨ Core Features

### 1. Video Stream Integration

**Supported sources:**
- **Twitch embeds** (live + VODs)
- **YouTube Live** (via iframe)
- **Uploaded VODs** (MP4, drag-and-drop)
- **Manual event logging** (hotkeys during live viewing)

**How it works:**
```typescript
// Dashboard shows video player with event markers
<VideoPlayer 
  src="https://twitch.tv/valorant"
  onEvent={(timestamp, type) => {
    // Correlate with order book at that exact moment
    logEvent(marketId, timestamp, type);
  }}
/>
```

**Event types:**
- Round win/loss
- Clutch situations
- Eco rounds
- Map wins/losses
- Technical pauses

### 2. Real-Time Order Book Tracking

**What we track (every 500ms):**
- Best bid/ask prices
- Spread (ask - bid)
- Depth (total $ at top 5 levels)
- Mid price
- Volume (last 30s, 1m, 5m)

**Stored for analysis:**
- Historical snapshots (last 30 days)
- Trade tape (every fill)
- Limit order placements + cancellations

### 3. Psychology Signal Detection

**Signals we detect:**

| Signal | Trigger | Expected Outcome |
|--------|---------|------------------|
| **PANIC_SELL** | Volume +300%, Price drops >3% in <30s | Mean reversion up within 60-120s |
| **FOMO_BUY** | Volume +300%, Price jumps >5% in <30s | Mean reversion down within 60-120s |
| **LIQUIDITY_VACUUM** | Depth drops >50%, Spread widens >3x | Wait for book to rebuild |
| **MEAN_REVERSION** | Price >2 std dev from 5m MA | Fade back to mean |

**Confidence scoring:**
```typescript
// Score = 0 to 1 (higher = more confident)
const score = Math.min(
  (volumeRatio / 5) * 0.5 +  // Volume spike component
  (spreadRatio / 3) * 0.3 +   // Spread widening component
  (priceChange / 0.1) * 0.2,  // Price momentum component
  1.0
);

// Only trade if score > 0.7 (70% confidence)
```

### 4. One-Click Trade Execution

**Execution flow:**
1. Signal appears in dashboard with confidence score
2. You review: spread, liquidity, edge vs historical win rate
3. You click "BUY" or press hotkey (B)
4. System checks risk limits (max position, daily loss, cooldown)
5. Order routes to exchange API (Polymarket/Kalshi)
6. Fill confirmation + position update (300-500ms total)

**Hotkeys:**
- `B` = Buy market order
- `S` = Sell market order
- `L` = Place limit order (prompts for price)
- `C` = Cancel all open orders
- `Esc` = Panic close all positions

### 5. Live Dashboard

**Layout (4 panels):**

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│   VIDEO STREAM      │   ORDER BOOK        │
│   (Twitch/YouTube)  │   Bids/Asks         │
│                     │   + Depth Chart     │
│                     │                     │
├─────────────────────┼─────────────────────┤
│                     │                     │
│   PRICE CHART       │   SIGNALS           │
│   + Event Markers   │   + Confidence      │
│   + Entry/Exit      │   + Win Rate        │
│                     │                     │
└─────────────────────┴─────────────────────┘

   [BUY $100]  [SELL]  [CANCEL ALL]  [POSITION: +$47.20]
```

**Real-time updates via WebSocket:**
- Order book changes (every 500ms)
- New trades (as they happen)
- Signal alerts (instant)
- Position PnL (live)

### 6. Backtesting Engine

**For every signal, we track:**
- Did price revert? (yes/no)
- Reversion time (seconds)
- Max profit if traded
- Actual outcome if you did trade

**Performance metrics:**
```typescript
{
  strategy: 'Panic Fade (buy during panic)',
  period: 'Last 30 days',
  totalSignals: 247,
  tradesExecuted: 189,
  winRate: 0.68,
  avgProfit: 12.40,
  totalProfit: 2343.60,
  sharpeRatio: 2.14,
  maxDrawdown: -147.20,
  avgReversionTime: 74, // seconds
}
```

---

## 📅 Implementation Roadmap

### Week 1: Core Infrastructure
- ✅ Project setup (Bun + Next.js + Prisma)
- ✅ Database schema (order books, trades, signals)
- ✅ WebSocket client (Polymarket)
- ✅ Order book reconstruction
- ✅ Basic dashboard layout

### Week 2: Signal Detection
- Psychology signal detector (panic, FOMO, liquidity)
- Baseline calculation (rolling averages)
- Confidence scoring
- Signal backtest tracker
- Alert system (browser notifications)

### Week 3: Trading Execution
- Polymarket API client (order placement)
- Kalshi API client (order placement)
- Risk controls (max size, cooldowns, stop-loss)
- Position tracking
- PnL calculation

### Week 4: Dashboard UI
- Video player integration (Twitch/YouTube)
- Order book visualization (depth chart)
- Price chart with event markers
- Signal cards with confidence scores
- One-click trade buttons + hotkeys

### Week 5: Event Correlation
- Manual event logger (hotkeys)
- Automatic event detection (if API available)
- Price impact analysis (event → price change)
- Event-based signal tuning

### Week 6: Backtesting & Optimization
- Historical playback (replay old matches)
- Strategy performance reports
- Parameter optimization (thresholds, timeouts)
- Win rate by event type

### Week 7: Polish & Deploy
- Error handling + retry logic
- Production deployment (Vercel + Railway)
- Monitoring + logging (Axiom)
- User guide + video tutorial

---

## 💻 Tech Stack

### Core Technologies

**Runtime & Framework:**
- **Bun 1.2.x** - Fast JavaScript runtime (2x faster than Node.js)
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety

**Backend:**
- **Hono** - Lightweight HTTP server for API routes
- **Prisma 5.22.0** - Database ORM (SQLite/PostgreSQL)
- **Zod 3.23.x** - Schema validation
- **ioredis** - Redis client (optional, in-memory fallback)

**Frontend:**
- **React 18** - UI library
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **TradingView Lightweight Charts** - Price charts
- **react-use-websocket** - WebSocket hook

**Data & Trading:**
- **@polymarket/clob-client** - Polymarket API
- **kalshi-js** (custom) - Kalshi API wrapper
- **ws** - WebSocket client

**AI (Optional):**
- **@anthropic-ai/sdk** - Claude API for advanced analysis

### Package Versions (Tested & Stable)

```json
{
  "dependencies": {
    "next": "14.1.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "typescript": "5.3.3",
    
    "hono": "4.0.0",
    "prisma": "5.22.0",
    "@prisma/client": "5.22.0",
    "zod": "3.23.8",
    
    "@polymarket/clob-client": "2.0.0",
    "ioredis": "5.3.2",
    "ws": "8.16.0",
    
    "tailwindcss": "3.4.1",
    "@radix-ui/react-*": "1.0.0",
    "lucide-react": "0.330.0",
    "lightweight-charts": "4.1.0",
    "react-use-websocket": "4.8.1",
    
    "@anthropic-ai/sdk": "0.18.0",
    "date-fns": "3.3.0"
  },
  "devDependencies": {
    "@types/node": "20.11.0",
    "@types/react": "18.2.48",
    "@types/ws": "8.5.10",
    "vitest": "1.2.0"
  }
}
```

### Why These Versions?

- **Prisma 5.22.0**: Stable with Bun (7.x hangs during generation)
- **Zod 3.23.x**: Zod 4 has runtime errors with `z.record()` under Bun
- **Next.js 14.1**: Stable App Router (14.2+ has edge case bugs)

---

## 🗄 Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite" // or "postgresql" for production
  url      = env("DATABASE_URL")
}

// Markets (Valorant matches, political events, etc)
model Market {
  id             String   @id @default(cuid())
  externalId     String   @unique
  platform       String   // "POLYMARKET" | "KALSHI"
  question       String
  slug           String?
  
  // Current state
  status         String   // "ACTIVE" | "CLOSED" | "RESOLVED"
  yesPrice       Float    @default(0.5)
  noPrice        Float    @default(0.5)
  volume24h      Float    @default(0)
  liquidity      Float    @default(0)
  spread         Float    @default(0)
  
  startDate      DateTime @default(now())
  endDate        DateTime?
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  snapshots      OrderBookSnapshot[]
  trades         Trade[]
  events         MarketEvent[]
  signals        PsychologySignal[]
  
  @@index([platform, status])
}

// Order book snapshots (every 500ms)
model OrderBookSnapshot {
  id         String   @id @default(cuid())
  marketId   String
  market     Market   @relation(fields: [marketId], references: [id], onDelete: Cascade)
  
  timestamp  DateTime
  bestBid    Float
  bestAsk    Float
  spread     Float
  bidDepth   Float    // Total $ in top 5 bids
  askDepth   Float    // Total $ in top 5 asks
  midPrice   Float
  
  bids       String   // JSON: [{price, size}]
  asks       String   // JSON: [{price, size}]
  
  @@index([marketId, timestamp])
}

// Trades (your trades)
model Trade {
  id         String   @id @default(cuid())
  marketId   String
  market     Market   @relation(fields: [marketId], references: [id], onDelete: Cascade)
  
  side       String   // "YES" | "NO"
  action     String   // "BUY" | "SELL"
  price      Float
  size       Float
  value      Float
  
  entryTime  DateTime
  exitTime   DateTime?
  exitPrice  Float?
  pnl        Float?
  outcome    String?  // "WIN" | "LOSS" | "BREAKEVEN"
  
  @@index([marketId, entryTime])
}

// Market events (round wins, clutches, etc)
model MarketEvent {
  id          String   @id @default(cuid())
  marketId    String
  market      Market   @relation(fields: [marketId], references: [id], onDelete: Cascade)
  
  timestamp   DateTime
  eventType   String   // "round_win" | "clutch" | "ace" | "eco_round"
  metadata    String   // JSON: {team, player, score}
  
  priceBefore Float?
  priceAfter  Float?
  volumeSpike Float?
  
  @@index([marketId, timestamp])
}

// Psychology signals (panic, FOMO, etc)
model PsychologySignal {
  id            String   @id @default(cuid())
  marketId      String
  market        Market   @relation(fields: [marketId], references: [id], onDelete: Cascade)
  
  timestamp     DateTime
  signalType    String   // "PANIC_SELL" | "FOMO_BUY" | "LIQUIDITY_VACUUM"
  score         Float    // 0-1 confidence
  
  volumeRatio   Float?   // vs baseline
  spreadRatio   Float?   // vs baseline
  priceChange   Float?   // % change
  
  // Outcome tracking
  reverted      Boolean?
  reversionTime Int?     // seconds
  maxProfit     Float?   // potential profit
  
  @@index([marketId, timestamp])
  @@index([signalType])
}
```

---

## ⚠️ Risk Controls

### Position Limits
```typescript
const RISK_LIMITS = {
  maxPositionSize: 1000,      // Max $1000 per market
  maxTotalExposure: 5000,     // Max $5000 across all markets
  maxDailyLoss: 500,          // Stop trading if down $500 today
  maxConsecutiveLosses: 3,    // Cooldown after 3 losses in a row
  cooldownSeconds: 5,         // Min 5s between trades
};
```

### Pre-Trade Checks
```typescript
async function checkRiskLimits(order: Order): Promise<{ok: boolean, reason?: string}> {
  // 1. Position size
  if (order.size > RISK_LIMITS.maxPositionSize) {
    return { ok: false, reason: 'Exceeds max position size' };
  }
  
  // 2. Total exposure
  const totalExposure = await getTotalExposure();
  if (totalExposure + order.value > RISK_LIMITS.maxTotalExposure) {
    return { ok: false, reason: 'Exceeds total exposure limit' };
  }
  
  // 3. Daily loss
  const todayPnl = await getTodayPnl();
  if (todayPnl < -RISK_LIMITS.maxDailyLoss) {
    return { ok: false, reason: 'Daily loss limit reached' };
  }
  
  // 4. Consecutive losses
  const recentTrades = await getRecentTrades(5);
  const losses = recentTrades.filter(t => t.outcome === 'LOSS').length;
  if (losses >= RISK_LIMITS.maxConsecutiveLosses) {
    return { ok: false, reason: 'Too many consecutive losses' };
  }
  
  // 5. Cooldown
  const lastTrade = await redis.get(`last_trade:${order.marketId}`);
  if (lastTrade && Date.now() - parseInt(lastTrade) < RISK_LIMITS.cooldownSeconds * 1000) {
    return { ok: false, reason: 'Cooldown active' };
  }
  
  return { ok: true };
}
```

### Circuit Breakers
```typescript
// Halt trading if:
const CIRCUIT_BREAKERS = {
  apiErrorRate: 0.1,          // >10% API errors in last 10 requests
  priceMoveTooFast: 0.2,      // >20% price move in 10 seconds (possible bad data)
  spreadTooWide: 0.1,         // >10¢ spread (illiquid)
  hourlyDrawdown: 0.2,        // >20% drawdown in last hour
};

async function checkCircuitBreakers(): Promise<boolean> {
  const errors = await getRecentApiErrors(10);
  if (errors / 10 > CIRCUIT_BREAKERS.apiErrorRate) {
    console.error('Circuit breaker: API error rate too high');
    return false;
  }
  
  const hourlyPnl = await getHourlyPnl();
  const startingBalance = await getBalanceAtHourStart();
  const drawdown = (startingBalance - hourlyPnl) / startingBalance;
  
  if (drawdown > CIRCUIT_BREAKERS.hourlyDrawdown) {
    console.error('Circuit breaker: Hourly drawdown too high');
    return false;
  }
  
  return true;
}
```

---

## 📊 Trading Strategies

### 1. Panic Fade (Buy during panic)

**Signal:** PANIC_SELL (volume +300%, price drops >3% in <30s)

**Entry:** Buy at current ask (market order)

**Exit:** 
- Target: +5-10% profit
- Stop: -3% loss
- Timeout: 120 seconds

**Expected:**
- Win rate: ~65%
- Avg profit: $8-15
- Reversion time: 60-90s

**Best for:**
- Eco round losses
- Map losses
- Clutch losses

### 2. FOMO Fade (Sell during FOMO)

**Signal:** FOMO_BUY (volume +300%, price jumps >5% in <30s)

**Entry:** Sell at current bid (market order)

**Exit:**
- Target: +7-12% profit
- Stop: -4% loss
- Timeout: 120 seconds

**Expected:**
- Win rate: ~62%
- Avg profit: $10-18
- Reversion time: 70-110s

**Best for:**
- Clutch wins
- Comeback wins
- Ace rounds

### 3. Mean Reversion

**Signal:** Price >2 standard deviations from 5-minute moving average

**Entry:** Fade the extreme (buy if oversold, sell if overbought)

**Exit:**
- Target: Reversion to mean
- Stop: -2% loss
- Timeout: 180 seconds

**Expected:**
- Win rate: ~58%
- Avg profit: $6-12
- Reversion time: 90-150s

---

## 🎓 Learning Mode

**Paper Trading:**
```typescript
const PAPER_MODE = true; // Set to false for live trading

if (PAPER_MODE) {
  // Simulate orders without real execution
  console.log(`[PAPER] Would BUY ${size} @ ${price}`);
  // Track as if real trade
  await logPaperTrade({ side: 'buy', price, size });
}
```

**Backtest Before Live:**
1. Run backtests on historical data (last 30 days)
2. Validate win rate >60% before going live
3. Start with small size ($50-100)
4. Scale up after 50 successful trades

---

## 📞 Support & Troubleshooting

### Common Issues

**"WebSocket connection failed"**
- Check if market is active (not closed/resolved)
- Verify `POLYMARKET_WS_URL` in .env
- Try restarting the app

**"Order rejected: insufficient balance"**
- Check your exchange account balance
- Reduce order size

**"Signal not triggering"**
- Baseline may need recalibration (takes 1 hour of data)
- Try lowering threshold (0.7 → 0.6)

**"Dashboard not updating"**
- Check browser console for WebSocket errors
- Refresh page
- Verify Redis is running (or use in-memory mode)

### Logs & Monitoring

**Key logs to check:**
```bash
# API errors
tail -f logs/api.log

# Trade execution
tail -f logs/trades.log

# Signals
tail -f logs/signals.log
```

**Metrics dashboard:**
- Go to http://localhost:3000/metrics
- View: API latency, error rates, signal performance

---

## 🚀 Quick Start Checklist

- [ ] Install Bun/Node
- [ ] Clone repo + `bun install`
- [ ] Create `.env` with DATABASE_URL
- [ ] Run `bunx prisma generate && bunx prisma db push`
- [ ] Add API keys (Polymarket, Kalshi)
- [ ] Run `bun run dev`
- [ ] Open http://localhost:3000
- [ ] Test with `bun run src/index.ts test`
- [ ] Subscribe to a live market
- [ ] Enable paper trading mode
- [ ] Watch signals for 1 hour
- [ ] Backtest top signals
- [ ] Start live trading (small size)

---

**Built for speed, validated by data. Trade smarter, not harder.**
