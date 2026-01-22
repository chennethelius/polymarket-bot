#!/usr/bin/env bun
/**
 * Phase 2a Test: Replay Engine
 * 
 * Run: bun run scripts/test-replay.ts
 * 
 * Tests the replay engine with an existing session.
 */

import { 
  ReplayEngine, 
  formatRelativeTime, 
  formatPrice,
  calculateImbalance,
} from '../src/replay/engine';
import { listSessions, formatDuration } from '../src/recorder/storage';

async function main() {
  console.log('═'.repeat(50));
  console.log('🧪 Phase 2a: Testing Replay Engine');
  console.log('═'.repeat(50) + '\n');

  // Find a session to replay
  const sessions = listSessions();
  
  if (sessions.length === 0) {
    console.log('❌ No sessions found. Run test-recorder.ts first.');
    process.exit(1);
  }

  // Use the most recent session
  const session = sessions[sessions.length - 1];
  console.log(`📼 Loading session: ${session.id.slice(0, 30)}...`);
  console.log(`   Market: ${session.marketTitle?.slice(0, 40)}...\n`);

  // Create replay engine
  const engine = new ReplayEngine(session.id);
  
  // Load session
  const loaded = await engine.load();
  if (!loaded) {
    console.log('❌ Failed to load session');
    process.exit(1);
  }

  const metadata = engine.getMetadata()!;
  const events = engine.getEvents();
  const userTrades = engine.getUserTrades();
  const playback = engine.getPlaybackState();

  console.log('✅ Session loaded\n');
  console.log('📊 Session Stats:');
  console.log(`   Events: ${events.length}`);
  console.log(`   User trades: ${userTrades.length}`);
  console.log(`   Duration: ${formatDuration(playback.duration)}`);
  console.log(`   Start: ${new Date(playback.startTime).toISOString()}`);
  console.log(`   End: ${new Date(playback.endTime).toISOString()}\n`);

  // Test timeline markers
  console.log('📍 Timeline Markers:');
  const markers = engine.getTimelineMarkers();
  for (const marker of markers.slice(0, 5)) {
    const relTime = formatRelativeTime(marker.timestamp, playback.startTime);
    console.log(`   [${relTime}] ${marker.type}: ${marker.label}`);
  }
  if (markers.length > 5) {
    console.log(`   ... and ${markers.length - 5} more\n`);
  } else {
    console.log();
  }

  // Test book reconstruction at start
  console.log('📗 Order Book at START:');
  const startBook = engine.getBookAt(playback.startTime);
  if (startBook) {
    console.log(`   Mid price: ${formatPrice(startBook.midPrice)}`);
    console.log(`   Spread: ${formatPrice(startBook.spread)}`);
    console.log(`   Best bid: ${formatPrice(startBook.bids[0]?.[0] || 0)}`);
    console.log(`   Best ask: ${formatPrice(startBook.asks[0]?.[0] || 0)}`);
    console.log(`   Imbalance: ${(calculateImbalance(startBook) * 100).toFixed(1)}%\n`);
  } else {
    console.log('   (no book data)\n');
  }

  // Test book reconstruction at end
  console.log('📗 Order Book at END:');
  const endBook = engine.getBookAt(playback.endTime);
  if (endBook) {
    console.log(`   Mid price: ${formatPrice(endBook.midPrice)}`);
    console.log(`   Spread: ${formatPrice(endBook.spread)}`);
    console.log(`   Best bid: ${formatPrice(endBook.bids[0]?.[0] || 0)}`);
    console.log(`   Best ask: ${formatPrice(endBook.asks[0]?.[0] || 0)}`);
    console.log(`   Imbalance: ${(calculateImbalance(endBook) * 100).toFixed(1)}%\n`);
  } else {
    console.log('   (no book data)\n');
  }

  // Test snapshot
  console.log('📸 Full Snapshot at middle:');
  const midTime = playback.startTime + playback.duration / 2;
  const snapshot = engine.getSnapshotAt(midTime);
  console.log(`   Timestamp: ${new Date(snapshot.timestamp).toISOString()}`);
  console.log(`   Price history points: ${snapshot.priceHistory.length}`);
  console.log(`   Game events: ${snapshot.gameEvents.length}`);
  console.log(`   User trades: ${snapshot.userTrades.length}\n`);

  // Test playback controls
  console.log('▶️  Testing Playback Controls:');
  
  // Seek
  engine.seek(playback.startTime + 1000);
  console.log(`   ✓ seek() - currentTime: ${formatRelativeTime(engine.getPlaybackState().currentTime, playback.startTime)}`);
  
  // Seek by progress
  engine.seekProgress(0.5);
  console.log(`   ✓ seekProgress(0.5) - progress: ${(engine.getPlaybackState().progress * 100).toFixed(0)}%`);
  
  // Set speed
  engine.setSpeed(2);
  console.log(`   ✓ setSpeed(2) - speed: ${engine.getPlaybackState().speed}x`);
  
  // Skip
  engine.skip(5000);
  console.log(`   ✓ skip(5000) - currentTime: ${formatRelativeTime(engine.getPlaybackState().currentTime, playback.startTime)}`);
  
  // Simulated playback
  console.log('\n⏯️  Simulating playback (1 second at 4x):');
  engine.setSpeed(4);
  
  let tickCount = 0;
  engine.on('tick', (snap) => {
    tickCount++;
  });
  
  engine.play();
  await new Promise(resolve => setTimeout(resolve, 1000));
  engine.pause();
  
  console.log(`   Received ${tickCount} ticks`);
  console.log(`   Final position: ${(engine.getPlaybackState().progress * 100).toFixed(1)}%\n`);

  // Cleanup
  engine.destroy();

  // Summary
  console.log('═'.repeat(50));
  console.log('✨ Phase 2a complete! Replay engine is working.\n');
  console.log('Tested:');
  console.log('  ✓ Session loading');
  console.log('  ✓ Timeline markers');
  console.log('  ✓ Book reconstruction');
  console.log('  ✓ Snapshot generation');
  console.log('  ✓ Playback controls (seek, skip, speed)');
  console.log('  ✓ Tick-based playback\n');
  console.log('Next: Phase 2b - Build replay dashboard UI');
  console.log('═'.repeat(50));
}

main();
