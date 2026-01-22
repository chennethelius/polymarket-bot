# 🎯 Live Trading Dashboard

## Quick Start

### 1. Start the Backend Server
```bash
bun run server
```
This starts the WebSocket server on port 3001 that connects to Polymarket and streams:
- Real-time order book updates
- Trading signals
- Price movements

### 2. Start the Dashboard (in a new terminal)
```bash
bun run dashboard
```
Opens at http://localhost:3000

## How to Use

### Basic Setup
1. **Enter a Video URL** (top left input)
   - YouTube: `https://youtube.com/watch?v=...`
   - Twitch: `https://twitch.tv/channelname`
   - Or paste any stream URL

2. **Enter a Market ID** (top right input)
   - Get from Polymarket
   - Or run `bun run dev` to see available markets

### What You'll See

```
┌─────────────────────────────────────────────────────────┐
│  Video URL: [...] │ Market ID: [...]                    │
├───────────────────┬─────────────────┬────────────────────┤
│                   │                 │  🚨 Signals        │
│  🎥 VIDEO         │  📈 PRICE      │  ─────────────     │
│     PLAYER        │     CHART       │  PANIC_SELL 87%   │
│                   │                 │  Buy opportunity  │
│                   │                 ├────────────────────┤
├───────────────────┤                 │  📊 Order Book    │
│  ⚡ GAME EVENTS   │                 │  ─────────────     │
│  ─────────────    │                 │  Asks:            │
│  Round Won!       │                 │  $0.527  150      │
│  +2.3% price ↑    │                 │  $0.526  200      │
│                   │                 │  ----SPREAD----   │
│                   │                 │  $0.523  180      │
│                   │                 │  $0.522  220      │
└───────────────────┴─────────────────┴────────────────────┘
```

### Features

#### 🎥 Video Player
- Watch live streams or VODs
- Supports YouTube and Twitch
- Syncs with game events

#### 📈 Price Chart
- Real-time price updates
- Signal markers (red = panic sell, blue = FOMO buy, yellow = liquidity vacuum)
- 100-point history

#### 🚨 Signal Panel
- Live trading signals with confidence scores
- Trade recommendations (BUY/SELL)
- Pattern descriptions

#### 📊 Order Book
- Top 10 bid/ask levels
- Live spread indicator
- Real-time depth updates

#### ⚡ Game Events
- Manually log events or connect to game API
- Price impact tracking
- Event timeline

## Usage Pattern

### For Watching and Learning:
1. Put on a Valorant/sports stream
2. Enter the market ID for that game
3. **Watch for patterns:**
   - When team wins a round → price jumps → FOMO signal
   - When team loses crucial round → price crashes → PANIC signal
   - After big play → spread widens → LIQUIDITY VACUUM

### For Trading:
1. Wait for signal (shows in top-right panel)
2. Check order book depth (bottom-right)
3. Watch price chart for confirmation
4. Execute trade via CLI (`bun run trade`) or add trade buttons to dashboard

## Advanced

### Subscribe to Multiple Markets
```bash
curl -X POST http://localhost:3001/api/markets/MARKET_ID/subscribe
```

### Get Active Markets
```bash
curl http://localhost:3001/api/markets
```

### Manually Log Game Event
Add a button to the GameEvents component that sends:
```javascript
fetch('http://localhost:3001/api/events', {
  method: 'POST',
  body: JSON.stringify({
    marketId: 'xxx',
    type: 'ROUND_WON',
    description: 'Team A wins round 5',
  })
})
```

## Troubleshooting

### Dashboard shows "Waiting for data"
- Make sure `bun run server` is running first
- Check the server terminal for connection messages
- Verify the market ID is correct

### WebSocket not connecting
- Check if port 3001 is free: `lsof -i :3001`
- Check browser console for errors
- Try refreshing the page

### No video showing
- Verify the URL is a direct stream link
- For Twitch, just use: `https://twitch.tv/channelname`
- For YouTube, use the full watch URL

## What's Next

- [ ] Add trade execution buttons to dashboard
- [ ] Position tracking panel
- [ ] PnL chart
- [ ] Historical signal backtest viewer
- [ ] Game event parser (auto-detect from chat/API)

---

**You now have a complete analysis dashboard!**

Watch games, spot patterns, and trade based on real-time signals.
