#!/usr/bin/env bun
import { marketMonitor } from '@/services/monitor';

// Example Polymarket market ID (replace with actual market)
const EXAMPLE_MARKET = '21742633143463906290569050155826241533067272736897614950488156847949938836455';

console.log('🤖 Polymarket Live Trading Monitor');
console.log('==================================\n');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down...');
  await marketMonitor.stop();
  process.exit(0);
});

// Listen to events
marketMonitor.on('orderbook', (data) => {
  const status = marketMonitor.getStatus();
  console.clear();
  console.log('🤖 Polymarket Live Trading Monitor');
  console.log('==================================\n');
  console.log(`📊 Market: ${data.market.slice(0, 20)}...`);
  console.log(`⏰ Time: ${data.timestamp.toLocaleTimeString()}`);
  console.log(`\n📈 Order Book:`);
  console.log(`   Best Bid: $${data.bestBid.toFixed(3)}`);
  console.log(`   Best Ask: $${data.bestAsk.toFixed(3)}`);
  console.log(`   Spread: $${data.spread.toFixed(4)} (${data.spreadBps.toFixed(1)} bps)`);
  console.log(`   Mid Price: $${data.midPrice.toFixed(3)}`);
  console.log(`\n📊 Depth:`);
  console.log(`   Bid Depth: ${data.bidDepth.toFixed(0)} contracts`);
  console.log(`   Ask Depth: ${data.askDepth.toFixed(0)} contracts`);
  console.log(`   Imbalance: ${(data.imbalance * 100).toFixed(1)}%`);
  console.log(`\n🔌 Status: ${status.connected ? '✅ Connected' : '❌ Disconnected'}`);
  console.log(`📡 Monitoring: ${status.monitoredMarkets.length} markets`);
});

marketMonitor.on('signal', (signal) => {
  console.log('\n🚨 ==================== SIGNAL DETECTED ====================');
  console.log(`   Type: ${signal.type}`);
  console.log(`   Confidence: ${signal.confidence}%`);
  console.log(`   Description: ${signal.description}`);
  console.log(`   Expected Reversion: $${signal.expectedReversion.toFixed(4)}`);
  if (signal.tradeSide) {
    console.log(`   💡 Trade Recommendation: ${signal.tradeSide}`);
  }
  console.log('🚨 ==========================================================\n');
});

marketMonitor.on('trade', (data) => {
  const emoji = data.side === 'buy' ? '🟢' : '🔴';
  console.log(`${emoji} Trade: ${data.side.toUpperCase()} ${data.size} @ $${data.price}`);
});

// Start monitoring
async function main() {
  console.log('Starting monitor...\n');
  
  await marketMonitor.start();
  
  console.log('Adding example market...\n');
  await marketMonitor.addMarket(EXAMPLE_MARKET);
  
  console.log('✅ Monitor running. Press Ctrl+C to stop.\n');
  console.log('Waiting for order book updates...\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
