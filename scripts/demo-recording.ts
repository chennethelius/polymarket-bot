#!/usr/bin/env bun
/**
 * Demo Recording Script
 * 
 * Creates a sample recording with simulated user activity.
 * Run: bun run scripts/demo-recording.ts
 */

import { Recorder } from '../src/recorder/recorder';

async function findActiveMarket() {
  const response = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=50');
  const markets = await response.json();
  
  for (const market of markets) {
    if (market.closed || !market.volume24hr || market.volume24hr < 500) continue;
    
    if (market.clobTokenIds) {
      try {
        const tokenIds = JSON.parse(market.clobTokenIds);
        if (tokenIds.length > 0) {
          return {
            tokenId: tokenIds[0],
            title: market.question,
            conditionId: market.conditionId,
          };
        }
      } catch (e) {
        continue;
      }
    }
  }
  return null;
}

async function main() {
  console.log('🎬 Creating demo recording...\n');
  
  const market = await findActiveMarket();
  if (!market) {
    console.log('❌ No active market found');
    process.exit(1);
  }
  
  console.log(`📊 Market: ${market.title?.slice(0, 50)}...\n`);
  
  const recorder = new Recorder({
    marketId: market.conditionId,
    tokenIds: [market.tokenId],
    marketTitle: market.title,
    sessionName: 'Demo Recording',
  });
  
  recorder.on('event', (event) => {
    const stats = recorder.getStats();
    if (stats.eventCount % 5 === 0 || event.type !== 'book') {
      console.log(`   📦 ${event.type} (${stats.eventCount} total)`);
    }
  });
  
  console.log('▶️  Starting recording (30 seconds)...\n');
  await recorder.start();
  
  // Simulate user trades
  const trades = [
    { delay: 5000, side: 'BUY', price: 0.52, size: 50, notes: 'Initial position - bullish on early momentum' },
    { delay: 10000, side: 'BUY', price: 0.55, size: 100, notes: 'Adding to position on confirmation' },
    { delay: 20000, side: 'SELL', price: 0.58, size: 75, notes: 'Taking partial profit' },
    { delay: 25000, side: 'SELL', price: 0.60, size: 75, notes: 'Closing remaining position' },
  ];
  
  // Simulate game events
  const gameEvents = [
    { delay: 3000, type: 'quarter_start', desc: 'Q1 Start' },
    { delay: 8000, type: 'score', desc: 'Home team scores (7-0)' },
    { delay: 15000, type: 'timeout', desc: 'Away team timeout' },
    { delay: 22000, type: 'score', desc: 'Away team scores (7-7)' },
  ];
  
  // Schedule trades
  for (const trade of trades) {
    setTimeout(() => {
      console.log(`   💰 Logging trade: ${trade.side} ${trade.size} @ ${trade.price}`);
      recorder.recordUserTrade({
        side: trade.side as 'BUY' | 'SELL',
        price: trade.price,
        size: trade.size,
        tokenId: market.tokenId,
        outcome: 'YES',
        notes: trade.notes,
      });
    }, trade.delay);
  }
  
  // Schedule game events
  for (const event of gameEvents) {
    setTimeout(() => {
      console.log(`   🏀 Game event: ${event.desc}`);
      recorder.recordGameEvent(event.type, event.desc);
    }, event.delay);
  }
  
  // Wait for recording
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Stop
  console.log('\n⏹️  Stopping recording...');
  const metadata = recorder.stop();
  
  console.log(`\n✅ Demo recording complete!`);
  console.log(`   Session: ${metadata?.id}`);
  console.log(`   Events: ${recorder.getStats().eventCount}`);
  console.log(`   User trades: 4`);
  console.log(`   Game events: 4`);
  console.log(`\n🌐 View at: http://localhost:3001/`);
}

main();
