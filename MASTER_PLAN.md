# ⚡ Sports Trading Replay System for Polymarket

> **Record. Replay. Learn. Improve.**
> 
> A personal trading psychology lab for sports prediction markets. Record your live
> trading sessions, replay them like film, and get AI analysis on your decisions.
> Built for traders who want to learn from repeated events (NBA, tennis, etc.)
> instead of guessing what went wrong.

---

## 📋 Table of Contents

1. [What This Tool Does](#-what-this-tool-does)
2. [Why This Exists](#-why-this-exists)
3. [Technical Architecture](#-technical-architecture)
4. [Setup Guide](#-setup-guide)
5. [Core Features](#-core-features)
6. [Implementation Roadmap](#-implementation-roadmap)
7. [Tech Stack](#-tech-stack)
8. [Database Schema](#-database-schema)

---

## 🎯 What This Tool Does

This is a **trading psychology learning system** for sports prediction markets:

### The Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. RECORD                                                   │
├─────────────────────────────────────────────────────────────┤
│ • Subscribe to Polymarket market WebSocket                  │
│ • Capture full order book snapshots (every 500ms)           │
│ • Record all trades and price changes                       │
│ • Track YOUR orders/fills (authenticated feed)              │
│ • Tag game events manually or via stream sync               │
│ • Duration: Entire game (2-3 hours typical)                 │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. REPLAY                                                   │
├─────────────────────────────────────────────────────────────┤
│ • Timeline scrubber (pause, rewind, fast-forward)           │
│ • Reconstruct order book at any timestamp                   │
│ • See your trades overlaid on price chart                   │
│ • Watch stream/game alongside (if recorded/available)       │
│ • Jump to key moments (your entries/exits)                  │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. ANALYZE                                                  │
├─────────────────────────────────────────────────────────────┤
│ • AI breakdown of each trade decision                       │
│ • Pattern detection (panic sells, FOMO buys)                │
│ • "What if" scenarios (held longer, cut earlier)            │
│ • Psychology insights (overtrading, emotional decisions)    │
│ • Comparative analysis across sessions                      │
└─────────────────────────────────────────────────────────────┘
```

### Example Session Review

```
Session: Lakers @ Celtics (Jan 19, 2026)
Market: "Lakers to win" (Polymarket)
Your P&L: +$23.40
Trades: 7 total (4 wins, 3 losses)

🤖 AI Analysis:

Trade #3 @ 8:47 PM - ❌ Panic Sell
• Sold 50 contracts @ $0.38 after 3-0 Lakers run
• Order book showed strong bid support @ $0.35
• Price recovered to $0.44 within 90 seconds
• Lost opportunity: $3.00
• Pattern: Emotional response to momentum shift

Trade #5 @ 9:12 PM - ✅ Correct Read
• Bought 75 @ $0.52 during halftime consolidation
• Order book depth increased 40% (smart money accumulating)
• Exited @ $0.61 in Q3 after 8-0 run
• Profit: $6.75
• Pattern: Patient entry, rode the trend

Recommendations:
• Wait 30s before panic selling (avoid 2/3 mistakes)
• Check order book depth before sizing
• You overtrade in Q2 (5 trades vs 2 in other quarters)
```

---

## 🔥 Why This Exists

### The Problem with Sports Trading

**Unlike news-based markets, sports repeat:**
- NBA games happen daily
- Tennis matches are hourly during tournaments
- Same patterns emerge (comebacks, blowouts, clutch moments)

**But traders don't learn because:**
1. No replay system exists for order book evolution
2. Can't review decisions with full context
3. Emotional trades are forgotten/rationalized
4. No data on what *actually* works for you

### What Poker/Esports Players Have (That Traders Don't)

| Tool | Purpose | Trading Equivalent |
|------|---------|-------------------|
| PokerTracker | Hand history review | ❌ Doesn't exist |
| Film Review (athletes) | Study game tape | ❌ Doesn't exist |
| Replay Systems (CS:GO) | Rewatch rounds | ❌ Doesn't exist |

**This tool is that missing layer.**

### Why Focus on Sports Markets?

✅ **Repeated events** - Patterns are learnable  
✅ **Fast feedback** - Games end in 2-3 hours  
✅ **Psychology-driven** - Momentum, panic, FOMO are exploitable  
✅ **High frequency** - NBA = 82 games/team, tennis = daily  
✅ **Personal improvement** - You get better at reading games  

---

## 🏗 Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRADING REPLAY SYSTEM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    RECORDING MODE                             │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │  │
│  │  │ Polymarket WS   │  │ User Orders WS  │  │ Game Events  │ │  │
│  │  │ (market channel)│  │ (authenticated) │  │ (manual tag) │ │  │
│  │  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘ │  │
│  │           │                    │                   │         │  │
│  │           └────────────────────┼───────────────────┘         │  │
│  │                                │                             │  │
│  │  ┌─────────────────────────────▼──────────────────────────┐  │  │
│  │  │           EVENT STREAM AGGREGATOR                      │  │  │
│  │  │  • Normalize timestamps (all to Unix ms)               │  │  │
│  │  │  • Tag event types (book, trade, user_order, game)     │  │  │
│  │  │  • Sequence numbering for gap detection                │  │  │
│  │  └─────────────────────────────┬──────────────────────────┘  │  │
│  │                                │                             │  │
│  │  ┌─────────────────────────────▼──────────────────────────┐  │  │
│  │  │           APPEND-ONLY EVENT LOG                         │  │  │
│  │  │  Table: session_events                                  │  │  │
│  │  │  { session_id, timestamp, type, payload }               │  │  │
│  │  │  • ~1-10 events/sec during active trading               │  │  │
│  │  │  • Compressed JSON storage                              │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    REPLAY MODE                                │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐ │  │
│  │  │         EVENT PLAYBACK ENGINE                           │ │  │
│  │  │  • Load events for session_id                           │ │  │
│  │  │  • Build order book state at timestamp T                │ │  │
│  │  │  • Support: seek, pause, step-forward/back              │ │  │
│  │  │  • Speed controls: 0.5x, 1x, 2x, 10x                    │ │  │
│  │  └─────────────────────────────┬───────────────────────────┘ │  │
│  │                                │                             │  │
│  │  ┌─────────────────────────────▼───────────────────────────┐ │  │
│  │  │         REPLAY DASHBOARD                                │ │  │
│  │  │  ┌──────────────┐  ┌──────────────┐                    │ │  │
│  │  │  │  Timeline    │  │  Order Book  │                    │ │  │
│  │  │  │  Scrubber    │  │  @timestamp  │                    │ │  │
│  │  │  └──────────────┘  └──────────────┘                    │ │  │
│  │  │  ┌──────────────┐  ┌──────────────┐                    │ │  │
│  │  │  │ Price Chart  │  │ Your Trades  │                    │ │  │
│  │  │  │ + Events     │  │ + Analysis   │                    │ │  │
│  │  │  └──────────────┘  └──────────────┘                    │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    ANALYSIS MODE                              │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐ │  │
│  │  │         AI ANALYSIS ENGINE                              │ │  │
│  │  │  • Extract all user trades from session                 │ │  │
│  │  │  • Compare entry/exit vs order book state               │ │  │
│  │  │  • Detect patterns (panic, FOMO, overtrading)           │ │  │
│  │  │  • Calculate "what if" scenarios                        │ │  │
│  │  │  • Generate written feedback (Claude API)               │ │  │
│  │  └─────────────────────────────┬───────────────────────────┘ │  │
│  │                                │                             │  │
│  │  ┌─────────────────────────────▼───────────────────────────┐ │  │
│  │  │         SESSION REPORT                                  │ │  │
│  │  │  • Trade-by-trade breakdown                             │ │  │
│  │  │  • Psychology insights                                  │ │  │
│  │  │  • Pattern frequency (across sessions)                  │ │  │
│  │  │  • Improvement recommendations                          │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Setup Guide


## 🚀 Setup Guide

### Prerequisites

- **Bun 1.2+** or **Node 18+**: `curl -fsSL https://bun.sh/install | bash`
- **Git**: `brew install git` (macOS)
- **Polymarket account** (for authenticated recording of your trades)

### Step 1: Clone & Install (2 minutes)

```bash
git clone <your-repo-url>
cd polymarket-bot
bun install
```

### Step 2: Setup Database (1 minute)

```bash
# Using SQLite (simplest)
echo 'DATABASE_URL="file:./dev.db"' > .env
bunx prisma generate
bunx prisma db push
```

### Step 3: Polymarket API Keys (5 minutes)

Get your API credentials from Polymarket:
1. Go to https://polymarket.com → Settings → API
2. Create new API key
3. Add to `.env`:

```bash
DATABASE_URL="file:./dev.db"

# Polymarket
POLYMARKET_API_KEY="your_key_here"
POLYMARKET_SECRET="your_secret_here"
POLYMARKET_PASSPHRASE="your_passphrase_here"

# Public endpoints (no key needed)
POLYMARKET_WS_MARKET="wss://ws-subscriptions-clob.polymarket.com/ws/market"
POLYMARKET_WS_USER="wss://ws-subscriptions-clob.polymarket.com/ws/user"
POLYMARKET_CLOB_API="https://clob.polymarket.com"

# AI Analysis (optional - get from https://console.anthropic.com)
ANTHROPIC_API_KEY="sk-ant-..."
```

### Step 4: Run (1 minute)

```bash
bun run dev
# Open http://localhost:3000
```

---

## ✨ Core Features

### 1. Recording Sessions

**Start a new recording:**

```typescript
// Dashboard UI
<RecordingPanel>
  <input placeholder="Polymarket market URL or ID" />
  <button onClick={startRecording}>● Start Recording</button>
  
  {isRecording && (
    <div>
      Recording: Lakers @ Celtics
      Duration: 00:47:23
      Events: 1,247 snapshots, 89 trades, 3 your orders
      <button onClick={stopRecording}>■ Stop</button>
    </div>
  )}
</RecordingPanel>
```

**What gets recorded:**

| Data Type | Source | Frequency | Storage |
|-----------|--------|-----------|---------|
| Order book snapshots | WS market channel | 500ms | Compressed JSON |
| Price changes | WS price_change | Real-time | Event log |
| Trades | WS last_trade_price | Real-time | Event log |
| Your orders/fills | WS user channel | Real-time | Highlighted |
| Manual game events | Keyboard shortcuts | On-demand | Tagged |

**Recording storage:**

```typescript
// session_events table structure
{
  id: number,
  session_id: string,        // "lakers-celtics-20260119"
  timestamp: number,          // Unix ms
  sequence: number,           // Gap detection
  event_type: string,         // "book" | "trade" | "user_order" | "game_event"
  payload: JSON              // Full event data (compressed)
}

// Example: Order book snapshot
{
  event_type: "book",
  payload: {
    bids: [[0.52, 1420], [0.51, 890], ...],
    asks: [[0.53, 1100], [0.54, 760], ...],
    mid: 0.525,
    spread: 0.01,
    depth_bid_5: 5240,  // Total $ in top 5 bids
    depth_ask_5: 4890
  }
}
```

### 2. Replay Timeline

**Replay any recorded session:**

```
┌──────────────────────────────────────────────────────────────┐
│  Lakers @ Celtics (Jan 19, 2026) - Your P&L: +$23.40        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ORDER BOOK @ 21:37:42                             │     │
│  │  ┌─────────────────┬─────────────────┐             │     │
│  │  │ BIDS            │ ASKS            │             │     │
│  │  │ 0.52   1,420    │ 0.53   1,100    │             │     │
│  │  │ 0.51     890    │ 0.54     760    │             │     │
│  │  │ 0.50   1,240    │ 0.55     520    │             │     │
│  │  └─────────────────┴─────────────────┘             │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │  PRICE CHART                                       │     │
│  │  0.60┤                                             │     │
│  │  0.55┤        ╭────╮                               │     │
│  │  0.50┤    ╭──╯    ╰─╮   ◄ YOU BOUGHT               │     │
│  │  0.45┤ ╭──╯         ╰──╮                           │     │
│  │  0.40┤─╯               ╰─╮ ◄ YOU SOLD               │     │
│  │      └──────────────────────────────────────────   │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  ──●──────────────────────────────────────────  Timeline    │
│    ↑                                    ↑                    │
│  Q1 Start                           Current (21:37)          │
│                                                              │
│  [◄◄ 10s] [◄ Step] [▶ Play] [▶▶ 2x] [▶▶▶ 10x]              │
└──────────────────────────────────────────────────────────────┘
```

**Timeline controls:**
- Scrub to any point in the game
- Pause and step forward/back by seconds
- Speed up (2x, 10x) to skip boring periods
- Jump to your trades instantly
- Add notes/bookmarks

### 3. AI Trade Analysis

**Post-session breakdown:**

```typescript
// AI analyzes your session
async function analyzeSession(sessionId: string) {
  // 1. Extract all your trades
  const yourTrades = await getUserTrades(sessionId);
  
  // 2. For each trade, get order book context
  const tradesWithContext = yourTrades.map(trade => ({
    ...trade,
    bookBefore: getOrderBookAt(trade.timestamp - 5000),
    bookAfter: getOrderBookAt(trade.timestamp + 60000),
    priceMove: calculatePriceMove(trade.timestamp, 120000)
  }));
  
  // 3. Detect patterns
  const patterns = detectPatterns(tradesWithContext);
  
  // 4. Generate AI insights
  const analysis = await claude.analyze({
    trades: tradesWithContext,
    patterns: patterns,
    prompt: "Analyze this trader's psychology and decisions"
  });
  
  return analysis;
}
```

**Example AI output:**

```
Session Analysis: Lakers @ Celtics

Overall Performance:
• 7 trades, 4 wins (57% win rate)
• P&L: +$23.40
• Best trade: +$8.90 (Trade #6)
• Worst trade: -$4.20 (Trade #3)

Trade #3 (21:18:34) - MISTAKE: Panic Sell
Entry: Sold 50 @ $0.38
Context: Lakers on 7-0 run, price dropped from $0.44
Order book: Strong bid support @ $0.35 (1,800 contracts)
Outcome: Price recovered to $0.46 in 120 seconds
Your exit: Too early, left $4.00 on table
Pattern: Emotional response to short-term momentum

Recommendation: Next time, check bid depth before panic.
If >1,500 contracts within 3¢, it's support (not breakdown).

Trade #6 (22:03:11) - EXCELLENT: Patient Entry
Entry: Bought 80 @ $0.49 during timeout
Context: Price consolidating after Q3 spike
Order book: Depth increased 45% (accumulation)
Outcome: Rode to $0.60 in Q4 (+22.4%)
Your exit: Perfectly timed with game momentum
Pattern: Value buying in low-volatility periods

Psychology Insights:
• You overtrade in Q2 (4 trades vs 1-2 per other quarter)
• 3/4 losses came from chasing momentum <30s after price moves
• Your best trades (60%+ win rate) = waiting >2 min after events

Action Items:
1. Implement 30-second "cooldown" after big price moves
2. Always check order book depth (top 5 levels) before sizing
3. Reduce Q2 trading (emotional quarter for you)
```

### 4. Pattern Library

**Build a personal playbook:**

| Pattern | Win Rate | Avg Profit | Trades | Notes |
|---------|----------|------------|--------|-------|
| **Halftime Value** | 71% | $6.20 | 18 | Buy during consolidation |
| **Panic Fade** | 64% | $4.80 | 31 | Buy after 10%+ drop if support |
| **FOMO Avoid** | 85% | N/A | 22 | Did NOT chase, saved losses |
| **Q4 Momentum** | 58% | $3.10 | 12 | Ride winner in final period |

**Pattern detection:**

```typescript
// Automatically tag patterns
function detectTradePattern(trade, bookContext) {
  if (trade.direction === 'buy' && 
      bookContext.priceChange < -0.10 &&
      bookContext.bidDepth > baseline * 1.5) {
    return 'PANIC_FADE';
  }
  
  if (trade.direction === 'buy' &&
      bookContext.volatility < baseline * 0.5 &&
      bookContext.gamePhase === 'halftime') {
    return 'HALFTIME_VALUE';
  }
  
  // ... more patterns
}
```

### 5. Comparative Analysis

**Track improvement over time:**

```
┌────────────────────────────────────────────────────┐
│  YOUR PROGRESS                                     │
├────────────────────────────────────────────────────┤
│                                                    │
│  Win Rate by Week                                  │
│  80%┤                           ●                  │
│  70%┤                   ●   ●                      │
│  60%┤           ●   ●                              │
│  50%┤   ●   ●                                      │
│      └─────────────────────────────────────────    │
│      W1  W2  W3  W4  W5  W6  W7  W8               │
│                                                    │
│  Pattern Evolution                                 │
│  • Panic sells: 47% → 12% (↓ 74%)                 │
│  • FOMO buys: 31% → 8% (↓ 74%)                    │
│  • Patient entries: 22% → 61% (↑ 177%)            │
│                                                    │
│  Best Improvement: Waiting after events            │
│  Week 1: Avg wait = 8s                             │
│  Week 8: Avg wait = 94s (↑ 1,075%)                │
│  Impact: Win rate +28%                             │
└────────────────────────────────────────────────────┘
```

---

## 📅 Implementation Roadmap


## 📅 Implementation Roadmap

### Phase 1: Recording Infrastructure (Week 1-2)

**Goal:** Capture and store all market data

- [ ] Polymarket WebSocket client
  - Connect to market channel (public order book)
  - Connect to user channel (authenticated for your trades)
  - Handle reconnection + gap detection
- [ ] Event storage system
  - Append-only log (session_events table)
  - Compression (gzip JSON payloads)
  - Sequence numbering
- [ ] Recording UI
  - Start/stop recording
  - Status display (events captured, duration)
  - Manual event tagging (keyboard shortcuts)

**Deliverable:** Can record full session to database

### Phase 2: Replay Engine (Week 3)

**Goal:** Reconstruct market state at any timestamp

- [ ] Event playback system
  - Load events for session_id
  - Build order book from snapshots
  - Seek to timestamp
- [ ] Timeline controls
  - Scrubber component
  - Play/pause/step
  - Speed controls (0.5x to 10x)
- [ ] Replay dashboard
  - Order book at timestamp T
  - Price chart with timeline
  - Your trades highlighted

**Deliverable:** Can replay any recorded session

### Phase 3: AI Analysis (Week 4)

**Goal:** Generate insights from your trades

- [ ] Trade extraction
  - Parse user orders from session
  - Match with order book context
  - Calculate outcomes
- [ ] Pattern detection
  - Panic sells
  - FOMO buys
  - Overtrading periods
- [ ] AI integration
  - Claude API setup
  - Prompt engineering for trading psychology
  - Generate session report

**Deliverable:** Post-session AI breakdown

### Phase 4: Pattern Library (Week 5)

**Goal:** Build personal playbook over time

- [ ] Pattern tagging system
  - Manual labels
  - Auto-detection rules
  - Pattern database
- [ ] Performance tracking
  - Win rate by pattern
  - Profit by pattern
  - Frequency analysis
- [ ] Pattern library UI
  - Browse all patterns
  - Filter by performance
  - Export to CSV

**Deliverable:** Queryable pattern database

### Phase 5: Polish & Features (Week 6+)

- [ ] Multi-session comparison
- [ ] Export session data
- [ ] Share replays (optional)
- [ ] Mobile-friendly replay
- [ ] Stream sync (embed Twitch/YouTube)
- [ ] Hotkey customization

---

## 💻 Tech Stack

### Core

- **Runtime:** Bun 1.2+ (or Node 18+)
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** Prisma + SQLite (or PostgreSQL)
- **Styling:** Tailwind CSS + shadcn/ui

### Data & APIs

- **Polymarket:** Official clob-client + WebSocket
- **AI:** Anthropic Claude API
- **Charts:** TradingView Lightweight Charts
- **Storage:** Compressed JSON in Postgres/SQLite

### Key Packages

```json
{
  "dependencies": {
    "next": "14.1.0",
    "react": "18.2.0",
    "@polymarket/clob-client": "latest",
    "@anthropic-ai/sdk": "latest",
    "prisma": "5.22.0",
    "@prisma/client": "5.22.0",
    "zod": "3.23.8",
    "lightweight-charts": "latest",
    "ws": "latest"
  }
}
```

---

## 🗄 Database Schema

### Core Tables

```prisma
model Session {
  id          String   @id @default(cuid())
  marketId    String   // Polymarket condition ID
  marketTitle String
  startTime   DateTime
  endTime     DateTime?
  totalEvents Int      @default(0)
  yourPnL     Float?
  
  events      SessionEvent[]
  trades      UserTrade[]
  analysis    SessionAnalysis?
}

model SessionEvent {
  id         Int      @id @default(autoincrement())
  sessionId  String
  timestamp  BigInt   // Unix ms
  sequence   Int      // Gap detection
  eventType  String   // "book" | "trade" | "user_order" | "game_event"
  payload    Json     // Compressed event data
  
  session    Session  @relation(fields: [sessionId], references: [id])
  @@index([sessionId, timestamp])
  @@index([sessionId, sequence])
}

model UserTrade {
  id          Int      @id @default(autoincrement())
  sessionId   String
  timestamp   BigInt
  direction   String   // "buy" | "sell"
  price       Float
  size        Int
  pnl         Float?
  pattern     String?  // Tagged pattern
  
  session     Session  @relation(fields: [sessionId], references: [id])
}

model SessionAnalysis {
  id          Int      @id @default(autoincrement())
  sessionId   String   @unique
  aiSummary   String   // Full AI-generated report
  winRate     Float
  totalTrades Int
  patterns    Json     // Detected patterns
  
  session     Session  @relation(fields: [sessionId], references: [id])
}

model Pattern {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String
  winRate     Float
  avgProfit   Float
  totalTrades Int
  lastUpdated DateTime
}
```

### Event Payload Examples

**Order book snapshot:**
```json
{
  "type": "book",
  "timestamp": 1737334662000,
  "bids": [
    [0.52, 1420],
    [0.51, 890]
  ],
  "asks": [
    [0.53, 1100],
    [0.54, 760]
  ],
  "mid": 0.525,
  "spread": 0.01,
  "depth_bid_5": 5240,
  "depth_ask_5": 4890
}
```

**User trade:**
```json
{
  "type": "user_order",
  "timestamp": 1737334680000,
  "orderId": "0x123...",
  "side": "BUY",
  "price": 0.52,
  "size": 50,
  "status": "FILLED"
}
```

**Game event:**
```json
{
  "type": "game_event",
  "timestamp": 1737334690000,
  "event": "ROUND_WIN",
  "team": "Lakers",
  "score": "45-42",
  "notes": "Clutch 3-pointer by LeBron"
}
```

---

## 🎓 Learning Resources

### How to Use This Tool

1. **Record your first session**
   - Find an NBA/tennis game on Polymarket
   - Click "Start Recording" before the game
   - Trade normally during the game
   - Stop recording when done

2. **Review the replay**
   - Open "My Sessions"
   - Click the session
   - Scrub through timeline
   - See your trades in context

3. **Read the AI analysis**
   - Click "Analyze Session"
   - Review trade-by-trade breakdown
   - Note patterns and mistakes
   - Save insights to personal notes

4. **Build your playbook**
   - Tag successful patterns
   - Track win rates over time
   - Compare across sessions
   - Refine your approach

### Trading Psychology Resources

- **Books:**
  - "Trading in the Zone" by Mark Douglas
  - "The Mental Game of Trading" by Jared Tendler
  - "Thinking, Fast and Slow" by Daniel Kahneman

- **Similar Tools (Other Domains):**
  - PokerTracker (poker hand history)
  - Tradervue (stock trading journal)
  - Film review software (sports coaching)

---

## 🚧 Future Ideas

### Advanced Features

- **Live mode:** Record + trade simultaneously with real-time analysis
- **Multi-market:** Record multiple games at once
- **Social sharing:** Share replays with community
- **Pattern marketplace:** Share/discover patterns
- **AI coach:** Real-time suggestions during live trading
- **Mobile app:** Review sessions on phone
- **Voice notes:** Add commentary during replay
- **Export:** Download session data as CSV/JSON

### Integration Ideas

- **Stream sync:** Auto-sync with Twitch/YouTube timestamps
- **OCR:** Extract game score from stream
- **Bet tracking:** Import from multiple sportsbooks
- **Discord bot:** Post session summaries
- **Telegram alerts:** AI insights delivered to your phone

---

## 📝 Notes

### Why Polymarket Only?

- **Best WebSocket API:** Full order book + user trades
- **Sports focus:** Largest selection of game markets
- **No auth for public data:** Easy to record order books
- **Active markets:** Liquidity for sports is best here

### Why Not Kalshi?

- Kalshi's public API doesn't provide full order book depth
- Would need to poll REST endpoints (slower, incomplete)
- Polymarket has better WebSocket infrastructure

### Data Storage Estimates

| Session Length | Events | Storage (compressed) |
|----------------|--------|----------------------|
| NBA game (2.5h) | ~18,000 | ~15-25 MB |
| Tennis match (3h) | ~21,600 | ~18-30 MB |
| 100 sessions | ~2M events | ~2-3 GB |

**Retention:** Keep all sessions locally, optionally sync to cloud

---

## 🤝 Contributing

This is a personal learning tool, but contributions welcome:

1. Fork the repo
2. Create feature branch
3. Make changes
4. Submit PR with description

Focus areas:
- Better AI prompts for trading psychology
- New pattern detection algorithms
- UI/UX improvements
- Performance optimizations

---

## 📄 License

MIT - Use it, learn from it, build on it.

---

**Ready to get started?** Follow the [Setup Guide](#-setup-guide) above.
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
