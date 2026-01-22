#!/usr/bin/env bun
import { tradingExecutor } from '@/services/trading/executor';
import { marketMonitor } from '@/services/monitor';
import { signalDetector } from '@/services/signals/detector';

console.log('💹 Live Trading Terminal');
console.log('========================\n');

// Setup
const MARKET_ID = '21742633143463906290569050155826241533067272736897614950488156847949938836455'; // Replace with real market

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down...');
  
  // Close all open positions
  const openPositions = tradingExecutor.getOpenPositions();
  if (openPositions.length > 0) {
    console.log(`⚠️ Closing ${openPositions.length} open positions...`);
    for (const pos of openPositions) {
      await tradingExecutor.closePosition(pos.id, 'SHUTDOWN');
    }
  }
  
  await marketMonitor.stop();
  process.exit(0);
});

// Display current state
function displayDashboard() {
  console.clear();
  console.log('💹 Live Trading Terminal');
  console.log('========================\n');
  
  // Positions
  const openPositions = tradingExecutor.getOpenPositions();
  const pnl = tradingExecutor.getTotalPnL();
  const exposure = tradingExecutor.getTotalExposure();
  
  console.log('📊 Portfolio:');
  console.log(`   Total PnL: $${pnl.total.toFixed(2)} (Unrealized: $${pnl.unrealized.toFixed(2)}, Realized: $${pnl.realized.toFixed(2)})`);
  console.log(`   Exposure: $${exposure.toFixed(2)}`);
  console.log(`   Open Positions: ${openPositions.length}`);
  
  if (openPositions.length > 0) {
    console.log('\n📈 Open Positions:');
    openPositions.forEach((pos) => {
      const emoji = pos.unrealizedPnL > 0 ? '🟢' : pos.unrealizedPnL < 0 ? '🔴' : '⚪';
      console.log(`   ${emoji} ${pos.side} ${pos.size} @ $${pos.entryPrice.toFixed(4)} → $${pos.currentPrice.toFixed(4)} | PnL: $${pos.unrealizedPnL.toFixed(2)}`);
    });
  }
  
  console.log('\n⌨️  Hotkeys:');
  console.log('   [b] Buy YES  [s] Sell YES  [q] Quit');
  console.log('   [c] Close All Positions\n');
}

// Listen to trading events
tradingExecutor.on('trade_executed', (position) => {
  console.log(`\n✅ Trade executed: ${position.side} ${position.size} @ $${position.entryPrice.toFixed(4)}`);
  displayDashboard();
});

tradingExecutor.on('trade_rejected', ({ request, reason }) => {
  console.log(`\n❌ Trade rejected: ${reason}`);
  setTimeout(displayDashboard, 2000);
});

tradingExecutor.on('position_closed', (position) => {
  const emoji = position.realizedPnL > 0 ? '🎉' : '😞';
  console.log(`\n${emoji} Position closed: $${position.realizedPnL.toFixed(2)} PnL`);
  displayDashboard();
});

// Listen to signals
signalDetector.on('signal', (signal) => {
  console.log(`\n🚨 SIGNAL: ${signal.type} (${signal.confidence}% confidence)`);
  console.log(`   ${signal.description}`);
  if (signal.tradeSide) {
    console.log(`   💡 Recommendation: ${signal.tradeSide}`);
  }
  setTimeout(displayDashboard, 3000);
});

// Update positions with live prices
marketMonitor.on('orderbook', (data) => {
  const openPositions = tradingExecutor.getOpenPositions();
  openPositions.forEach((pos) => {
    if (pos.marketId === data.market) {
      tradingExecutor.updatePosition(pos.id, data.midPrice);
    }
  });
  
  // Refresh dashboard every 5 seconds
  if (Math.floor(Date.now() / 5000) !== Math.floor((Date.now() - 1000) / 5000)) {
    displayDashboard();
  }
});

// Keyboard input
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', async (key) => {
  const char = key.toString();
  
  if (char === 'q' || char === '\u0003') {
    // Ctrl+C or 'q'
    process.emit('SIGINT');
  } else if (char === 'b') {
    // Buy YES
    console.log('\n🎯 Executing: BUY YES');
    await tradingExecutor.executeTrade({
      marketId: MARKET_ID,
      side: 'BUY',
      outcome: 'YES',
      size: 10, // 10 contracts
    });
  } else if (char === 's') {
    // Sell YES
    console.log('\n🎯 Executing: SELL YES');
    await tradingExecutor.executeTrade({
      marketId: MARKET_ID,
      side: 'SELL',
      outcome: 'YES',
      size: 10,
    });
  } else if (char === 'c') {
    // Close all positions
    const openPositions = tradingExecutor.getOpenPositions();
    console.log(`\n🔒 Closing ${openPositions.length} positions...`);
    for (const pos of openPositions) {
      await tradingExecutor.closePosition(pos.id, 'MANUAL');
    }
  }
});

// Start
async function main() {
  displayDashboard();
  console.log('🚀 Starting trading terminal...\n');
  
  await marketMonitor.start();
  await marketMonitor.addMarket(MARKET_ID);
  
  console.log('✅ Trading terminal ready!');
  console.log('   Monitoring market for trading signals...\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
