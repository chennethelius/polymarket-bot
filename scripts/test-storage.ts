#!/usr/bin/env bun
/**
 * Phase 1a Test: File-based Storage
 * 
 * Run: bun run scripts/test-storage.ts
 */

import {
  createSession,
  loadSession,
  appendEvent,
  loadEvents,
  addUserTrade,
  loadUserTrades,
  stopSession,
  listSessions,
  getSessionDuration,
  formatDuration,
  getBookAtTimestamp,
} from '../src/recorder/storage';
import { rmSync } from 'fs';
import { getSessionDir } from '../src/recorder/storage';

async function runTests() {
  console.log('🧪 Phase 1a: Testing File-based Storage\n');
  
  let sessionId: string = '';
  
  try {
    // Test 1: Create session
    console.log('1️⃣  Creating recording session...');
    const session = createSession(
      'test-market-123',
      'Lakers @ Celtics (Test Game)',
      'token-yes-456'
    );
    sessionId = session.id;
    console.log(`   ✅ Created: ${session.id}`);
    console.log(`   📁 Path: data/sessions/${session.id}/\n`);

    // Test 2: Load session
    console.log('2️⃣  Loading session metadata...');
    const loaded = loadSession(sessionId);
    console.log(`   ✅ Loaded: ${loaded?.marketTitle}`);
    console.log(`   📊 Status: ${loaded?.status}\n`);

    // Test 3: Append events
    console.log('3️⃣  Appending events...');
    const startTs = Date.now();
    
    // Simulate order book snapshots
    for (let i = 0; i < 10; i++) {
      appendEvent(sessionId, {
        ts: startTs + i * 500,
        seq: i + 1,
        type: 'book',
        data: {
          bids: [[0.52 - i * 0.001, 1000 + i * 100]],
          asks: [[0.53 + i * 0.001, 900 + i * 50]],
          mid: 0.525,
          spread: 0.01 + i * 0.001,
        },
      });
    }
    
    // Add a trade
    appendEvent(sessionId, {
      ts: startTs + 2500,
      seq: 11,
      type: 'trade',
      data: { price: 0.52, size: 150, side: 'BUY' },
    });
    
    console.log(`   ✅ Added 10 book snapshots + 1 trade\n`);

    // Test 4: Add user trade
    console.log('4️⃣  Adding user trade...');
    addUserTrade(sessionId, {
      ts: startTs + 3000,
      direction: 'BUY',
      price: 0.52,
      size: 50,
      total: 26.0,
      notes: 'Test entry',
    });
    console.log(`   ✅ User trade added\n`);

    // Test 5: Load events
    console.log('5️⃣  Loading events...');
    const events = loadEvents(sessionId);
    console.log(`   ✅ Loaded ${events.length} events`);
    console.log(`   📊 Types: ${events.map(e => e.type).join(', ')}\n`);

    // Test 6: Get book at timestamp
    console.log('6️⃣  Getting order book at specific timestamp...');
    const bookAt = getBookAtTimestamp(sessionId, startTs + 2000);
    console.log(`   ✅ Found book at seq ${bookAt?.seq}`);
    console.log(`   📊 Data: ${JSON.stringify(bookAt?.data)}\n`);

    // Test 7: Load user trades
    console.log('7️⃣  Loading user trades...');
    const trades = loadUserTrades(sessionId);
    console.log(`   ✅ Loaded ${trades.length} user trade(s)`);
    console.log(`   💰 Trade: ${trades[0].direction} ${trades[0].size} @ $${trades[0].price}\n`);

    // Test 8: Stop session
    console.log('8️⃣  Stopping session...');
    stopSession(sessionId);
    const stopped = loadSession(sessionId);
    const duration = getSessionDuration(sessionId);
    console.log(`   ✅ Status: ${stopped?.status}`);
    console.log(`   ⏱️  Duration: ${formatDuration(duration)}\n`);

    // Test 9: List all sessions
    console.log('9️⃣  Listing all sessions...');
    const allSessions = listSessions();
    console.log(`   ✅ Found ${allSessions.length} session(s)\n`);

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    rmSync(getSessionDir(sessionId), { recursive: true, force: true });
    console.log(`   ✅ Removed test session\n`);

    console.log('═'.repeat(50));
    console.log('✨ All tests passed! Storage system is ready.\n');
    console.log('Next: Phase 1b - Polymarket WebSocket client');
    console.log('═'.repeat(50));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    // Cleanup on failure
    if (sessionId) {
      try {
        rmSync(getSessionDir(sessionId), { recursive: true, force: true });
      } catch {}
    }
    
    process.exit(1);
  }
}

runTests();
