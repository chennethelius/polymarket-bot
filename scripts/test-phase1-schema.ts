#!/usr/bin/env bun
/**
 * Phase 1a Test: Database Schema
 * 
 * This script verifies that the recording schema is set up correctly
 * by creating a test recording session and adding events.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testSchema() {
  console.log('🧪 Phase 1a: Testing Recording Schema\n');

  try {
    // Test 1: Create a recording session
    console.log('1️⃣  Creating recording session...');
    const session = await prisma.recordingSession.create({
      data: {
        marketId: 'test-market-123',
        marketTitle: 'Lakers @ Celtics (Test)',
        tokenId: 'token-yes-123',
        status: 'RECORDING',
      },
    });
    console.log(`   ✅ Session created: ${session.id}\n`);

    // Test 2: Add a book snapshot event
    console.log('2️⃣  Adding order book event...');
    const bookEvent = await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        timestamp: BigInt(Date.now()),
        sequence: 1,
        eventType: 'book',
        payload: JSON.stringify({
          bids: [[0.52, 1420], [0.51, 890]],
          asks: [[0.53, 1100], [0.54, 760]],
          mid: 0.525,
          spread: 0.01,
        }),
      },
    });
    console.log(`   ✅ Book event created (seq: ${bookEvent.sequence})\n`);

    // Test 3: Add a trade event
    console.log('3️⃣  Adding trade event...');
    const tradeEvent = await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        timestamp: BigInt(Date.now() + 1000),
        sequence: 2,
        eventType: 'trade',
        payload: JSON.stringify({
          price: 0.52,
          size: 100,
          side: 'BUY',
        }),
      },
    });
    console.log(`   ✅ Trade event created (seq: ${tradeEvent.sequence})\n`);

    // Test 4: Add a user trade
    console.log('4️⃣  Adding user trade...');
    const userTrade = await prisma.userTrade.create({
      data: {
        sessionId: session.id,
        timestamp: BigInt(Date.now() + 2000),
        direction: 'BUY',
        price: 0.52,
        size: 50,
        total: 26.0,
      },
    });
    console.log(`   ✅ User trade created (ID: ${userTrade.id})\n`);

    // Test 5: Query back the session with events
    console.log('5️⃣  Querying session with events...');
    const fullSession = await prisma.recordingSession.findUnique({
      where: { id: session.id },
      include: {
        events: {
          orderBy: { sequence: 'asc' },
        },
        userTrades: true,
      },
    });

    console.log(`   ✅ Session retrieved:`);
    console.log(`      - Events: ${fullSession?.events.length}`);
    console.log(`      - User trades: ${fullSession?.userTrades.length}\n`);

    // Test 6: Clean up
    console.log('6️⃣  Cleaning up test data...');
    await prisma.recordingSession.delete({
      where: { id: session.id },
    });
    console.log(`   ✅ Test data cleaned up\n`);

    console.log('✨ All tests passed! Schema is ready.\n');
    console.log('Next step: Phase 1b - Build WebSocket client');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testSchema();
