#!/usr/bin/env bun
/**
 * Phase 1c Test: Full Recorder Service
 * 
 * Run: bun run scripts/test-recorder.ts
 * 
 * This tests the complete recording pipeline:
 * 1. Finds an active market
 * 2. Creates a recording session
 * 3. Records events for 20 seconds
 * 4. Stops and verifies the saved data
 */

import { Recorder, createRecorderFromUrl } from '../src/recorder/recorder';
import { loadSession, loadEvents, loadUserTrades, listSessions, formatDuration } from '../src/recorder/storage';
import * as fs from 'fs';
import * as path from 'path';

async function findActiveMarket(): Promise<{ tokenId: string; title: string; conditionId: string } | null> {
  console.log('🔍 Finding an active market...\n');
  
  const response = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=50');
  const markets = await response.json();
  
  for (const market of markets) {
    if (market.closed || !market.volume24hr || market.volume24hr < 100) continue;
    
    if (market.clobTokenIds) {
      try {
        const tokenIds = JSON.parse(market.clobTokenIds);
        if (tokenIds.length > 0) {
          const title = market.question || 'Unknown';
          console.log(`   ✅ Found: ${title.slice(0, 60)}...`);
          console.log(`   📊 24h Volume: $${market.volume24hr?.toFixed(0) || 0}\n`);
          return { 
            tokenId: tokenIds[0], 
            title,
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
  console.log('═'.repeat(50));
  console.log('🧪 Phase 1c: Testing Full Recorder Service');
  console.log('═'.repeat(50) + '\n');
  
  // Find a market
  const market = await findActiveMarket();
  if (!market) {
    console.log('❌ No active market found');
    process.exit(1);
  }
  
  // Create recorder
  console.log('📼 Creating recorder...\n');
  const recorder = new Recorder({
    marketId: market.conditionId,
    tokenIds: [market.tokenId],
    marketTitle: market.title,
    sessionName: 'Test Recording',
  });
  
  // Event handlers
  recorder.on('started', ({ sessionId }) => {
    console.log(`   ✅ Recording started: ${sessionId.slice(0, 20)}...`);
  });
  
  recorder.on('connected', () => {
    console.log('   ✅ WebSocket connected');
  });
  
  recorder.on('event', (event) => {
    const stats = recorder.getStats();
    // Log every 5th event to avoid spam
    if (stats.eventCount <= 3 || stats.eventCount % 5 === 0) {
      console.log(`   📦 Event #${stats.eventCount}: ${event.type}`);
    }
  });
  
  recorder.on('disconnected', ({ code }) => {
    console.log(`   ⚠️  WebSocket disconnected (${code})`);
  });
  
  // Start recording
  console.log('▶️  Starting recording (20 seconds)...\n');
  let sessionId: string;
  
  try {
    sessionId = await recorder.start();
  } catch (error: any) {
    console.log(`❌ Failed to start: ${error.message}`);
    process.exit(1);
  }
  
  // Simulate a user trade
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('\n💰 Simulating user trade...');
  const trade = recorder.recordUserTrade({
    side: 'BUY',
    price: 0.65,
    size: 100,
    tokenId: market.tokenId,
    outcome: 'YES',
    notes: 'Test trade entry',
  });
  console.log(`   ✅ Trade recorded: ${trade?.id}\n`);
  
  // Simulate a game event
  recorder.recordGameEvent('score', 'Lakers score 3-pointer', { team: 'Lakers', points: 3 });
  console.log('🏀 Game event recorded\n');
  
  // Wait and record
  await new Promise(resolve => setTimeout(resolve, 18000));
  
  // Stop recording
  console.log('\n⏹️  Stopping recording...');
  const finalMetadata = recorder.stop();
  
  if (!finalMetadata) {
    console.log('❌ Failed to get final metadata');
    process.exit(1);
  }
  
  // Verify saved data
  console.log('\n📊 Verifying saved data...\n');
  
  const loadedSession = loadSession(sessionId);
  const events = loadEvents(sessionId);
  const userTrades = loadUserTrades(sessionId);
  const sessions = listSessions();
  
  console.log(`   Session ID: ${sessionId.slice(0, 20)}...`);
  console.log(`   Market: ${loadedSession?.marketTitle?.slice(0, 40)}...`);
  console.log(`   Duration: ${formatDuration(loadedSession?.duration || 0)}`);
  console.log(`   Events recorded: ${events.length}`);
  console.log(`   User trades: ${userTrades.length}`);
  console.log(`   Status: ${loadedSession?.status}`);
  console.log(`   Total sessions: ${sessions.length}`);
  
  // Check files exist
  const sessionDir = path.join('data', 'sessions', sessionId);
  const filesExist = {
    metadata: fs.existsSync(path.join(sessionDir, 'metadata.json')),
    events: fs.existsSync(path.join(sessionDir, 'events.jsonl')),
    trades: fs.existsSync(path.join(sessionDir, 'trades.json')),
  };
  
  console.log('\n   Files created:');
  console.log(`     ✓ metadata.json: ${filesExist.metadata ? '✅' : '❌'}`);
  console.log(`     ✓ events.jsonl: ${filesExist.events ? '✅' : '❌'}`);
  console.log(`     ✓ trades.json: ${filesExist.trades ? '✅' : '❌'}`);
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  
  const allGood = filesExist.metadata && filesExist.events && events.length > 0;
  
  if (allGood) {
    console.log('✨ Phase 1c complete! Full recorder is working.\n');
    console.log('📁 Session saved to: ' + sessionDir);
    console.log('\nNext steps:');
    console.log('  1. Phase 2: Build replay engine with timeline scrubber');
    console.log('  2. Phase 3: Add AI analysis integration');
  } else {
    console.log('❌ Phase 1c failed. Check errors above.');
    process.exit(1);
  }
  
  console.log('═'.repeat(50));
}

main();
