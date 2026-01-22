#!/usr/bin/env bun
// Demo of trading system without real market connection

import { tradingExecutor, OrderRequest } from '@/services/trading/executor';

console.log('💹 Trading System Demo');
console.log('======================\n');

// Setup demo risk limits
tradingExecutor.updateRiskLimits({
  maxPositionSize: 100,
  maxTotalExposure: 1000,
  maxLossPerTrade: 50,
  maxDrawdown: 200,
});

// Mock market ID
const MARKET_ID = 'demo_market_123';

// Listen to events
tradingExecutor.on('trade_executed', (position) => {
  console.log(`\n✅ Trade Executed:`);
  console.log(`   Position ID: ${position.id}`);
  console.log(`   Side: ${position.side}`);
  console.log(`   Size: ${position.size} contracts`);
  console.log(`   Entry Price: $${position.entryPrice.toFixed(4)}`);
  console.log(`   Status: ${position.status}`);
});

tradingExecutor.on('trade_rejected', ({ request, reason }) => {
  console.log(`\n❌ Trade Rejected:`);
  console.log(`   Reason: ${reason}`);
});

tradingExecutor.on('position_updated', (position) => {
  const emoji = position.unrealizedPnL > 0 ? '🟢' : position.unrealizedPnL < 0 ? '🔴' : '⚪';
  console.log(`${emoji} Position ${position.id.slice(-8)}: $${position.unrealizedPnL.toFixed(2)} PnL`);
});

tradingExecutor.on('position_closed', (position) => {
  console.log(`\n🔒 Position Closed:`);
  console.log(`   Position ID: ${position.id}`);
  console.log(`   Entry: $${position.entryPrice.toFixed(4)} → Exit: $${position.currentPrice.toFixed(4)}`);
  console.log(`   Realized PnL: $${position.realizedPnL.toFixed(2)}`);
});

async function runDemo() {
  console.log('📋 Demo Scenario: Trading on market price movements\n');
  
  // Test 1: Execute a buy trade
  console.log('1️⃣ Executing BUY trade...');
  const buyRequest: OrderRequest = {
    marketId: MARKET_ID,
    side: 'BUY',
    outcome: 'YES',
    size: 50,
    price: 0.52,
  };
  
  // We need to mock the order book for this demo
  // In real usage, the order book tracker would provide this
  const { orderBookTracker } = await import('@/services/orderbook/tracker');
  orderBookTracker['books'].set(MARKET_ID, {
    bids: new Map([['0.52', '100'], ['0.51', '200']]),
    asks: new Map([['0.53', '100'], ['0.54', '200']]),
    lastUpdate: Date.now(),
  });
  
  const position1 = await tradingExecutor.executeTrade(buyRequest);
  
  if (position1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Simulate price movement (profit)
    console.log('\n2️⃣ Simulating price increase to $0.55...');
    tradingExecutor.updatePosition(position1.id, 0.55);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 3: Close position
    console.log('\n3️⃣ Closing position (take profit)...');
    await tradingExecutor.closePosition(position1.id, 'TAKE_PROFIT');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 4: Execute another trade
  console.log('\n4️⃣ Executing another BUY trade...');
  const position2 = await tradingExecutor.executeTrade({
    marketId: MARKET_ID,
    side: 'BUY',
    outcome: 'YES',
    size: 30,
    price: 0.55,
  });
  
  if (position2) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 5: Simulate price drop (loss trigger stop loss)
    console.log('\n5️⃣ Simulating price drop to $0.48 (triggers stop loss)...');
    tradingExecutor.updatePosition(position2.id, 0.48);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Test 6: Try to exceed risk limits
  console.log('\n6️⃣ Attempting trade that exceeds risk limits...');
  await tradingExecutor.executeTrade({
    marketId: MARKET_ID,
    side: 'BUY',
    outcome: 'YES',
    size: 200, // Exceeds maxPositionSize
    price: 0.50,
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Final stats
  console.log('\n' + '='.repeat(50));
  console.log('📊 Final Statistics:');
  const pnl = tradingExecutor.getTotalPnL();
  const exposure = tradingExecutor.getTotalExposure();
  const openPositions = tradingExecutor.getOpenPositions();
  
  console.log(`   Total PnL: $${pnl.total.toFixed(2)}`);
  console.log(`   Unrealized: $${pnl.unrealized.toFixed(2)}`);
  console.log(`   Realized: $${pnl.realized.toFixed(2)}`);
  console.log(`   Current Exposure: $${exposure.toFixed(2)}`);
  console.log(`   Open Positions: ${openPositions.length}`);
  
  console.log('\n✅ Demo complete!');
  console.log('\n💡 What you just saw:');
  console.log('   ✅ Order execution with pre-trade risk checks');
  console.log('   ✅ Position tracking with real-time PnL updates');
  console.log('   ✅ Automatic stop loss trigger');
  console.log('   ✅ Risk limit enforcement');
  console.log('   ✅ Event-driven architecture');
  
  console.log('\n📋 Next: Run `bun run trade` to use the live terminal');
  console.log('   (requires valid Polymarket market ID)\n');
  
  process.exit(0);
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
