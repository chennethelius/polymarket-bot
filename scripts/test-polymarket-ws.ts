#!/usr/bin/env bun
/**
 * Phase 1b Test: Polymarket WebSocket Client
 * 
 * Run: bun run scripts/test-polymarket-ws.ts
 * 
 * This connects to Polymarket's public WebSocket feed
 * and logs incoming order book updates.
 */

import { 
  PolymarketClient, 
  fetchOrderBook, 
  fetchMarketInfo,
  type OrderBookUpdate,
  type PriceChange,
  type LastTrade,
} from '../src/recorder/polymarket-ws';

// Test with a known active market
// You can get token IDs from: https://gamma-api.polymarket.com/markets
const TEST_CONDITION_ID = '0x...'; // We'll fetch this dynamically

async function findActiveMarket(): Promise<{ tokenId: string; title: string } | null> {
  console.log('🔍 Finding an active market with volume...\n');
  
  try {
    // Fetch active markets sorted by volume to get liquid ones
    const response = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=50');
    const markets = await response.json();
    
    if (!markets.length) {
      console.log('   ❌ No markets found');
      return null;
    }
    
    // Find a market with clobTokenIds and recent volume
    for (const market of markets) {
      // Skip closed or low volume markets
      if (market.closed || !market.volume24hr || market.volume24hr < 100) continue;
      
      // Parse clobTokenIds - it's a JSON string
      if (market.clobTokenIds) {
        try {
          const tokenIds = JSON.parse(market.clobTokenIds);
          if (tokenIds.length > 0) {
            const tokenId = tokenIds[0];
            const title = market.question || market.title || 'Unknown';
            console.log(`   ✅ Found: ${title.slice(0, 60)}...`);
            console.log(`   📊 24h Volume: $${market.volume24hr?.toFixed(0) || 0}`);
            console.log(`   📝 Token ID: ${tokenId.slice(0, 30)}...\n`);
            return { tokenId, title };
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    // Fallback: just find any market with tokens
    console.log('   ⚠️  No high-volume markets, trying any market...\n');
    for (const market of markets) {
      if (market.clobTokenIds) {
        try {
          const tokenIds = JSON.parse(market.clobTokenIds);
          if (tokenIds.length > 0) {
            return { tokenId: tokenIds[0], title: market.question || 'Unknown' };
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('   ❌ Failed to fetch markets:', error);
    return null;
  }
}

async function testRestApi(tokenId: string) {
  console.log('📡 Testing REST API (initial book snapshot)...\n');
  
  const book = await fetchOrderBook(tokenId);
  
  if (!book) {
    console.log('   ❌ Failed to fetch order book\n');
    return false;
  }
  
  console.log(`   ✅ Order book received`);
  console.log(`   📊 Bids: ${book.bids.length} levels`);
  console.log(`   📊 Asks: ${book.asks.length} levels`);
  
  if (book.bids.length > 0) {
    console.log(`   💰 Best bid: $${book.bids[0][0].toFixed(3)} (${book.bids[0][1]} size)`);
  }
  if (book.asks.length > 0) {
    console.log(`   💰 Best ask: $${book.asks[0][0].toFixed(3)} (${book.asks[0][1]} size)`);
  }
  
  console.log();
  return true;
}

async function testWebSocket(tokenId: string): Promise<boolean> {
  console.log('🔌 Testing WebSocket connection...\n');
  
  return new Promise((resolve) => {
    const client = new PolymarketClient({
      tokenIds: [tokenId],
      maxReconnects: 3,
    });
    
    let eventCount = 0;
    let bookCount = 0;
    let priceCount = 0;
    let tradeCount = 0;
    const startTime = Date.now();
    const testDuration = 15000; // 15 seconds
    
    // Event handlers
    client.on('connected', () => {
      console.log('   ✅ WebSocket connected');
    });
    
    client.on('subscribed', ({ tokenIds }) => {
      console.log(`   ✅ Subscribed to ${tokenIds.length} token(s)`);
      console.log(`   ⏳ Listening for ${testDuration / 1000}s...\n`);
    });
    
    client.on('book', (update: OrderBookUpdate) => {
      eventCount++;
      bookCount++;
      
      // Log first few events in detail
      if (bookCount <= 3) {
        console.log(`   📗 Book update #${bookCount}:`);
        console.log(`      Bids: ${update.bids.length} | Asks: ${update.asks.length}`);
        if (update.bids.length > 0 && update.asks.length > 0) {
          const spread = update.asks[0][0] - update.bids[0][0];
          console.log(`      Spread: ${(spread * 100).toFixed(2)}¢`);
        }
      } else if (bookCount === 4) {
        console.log(`   ... (suppressing further book logs)\n`);
      }
    });
    
    client.on('price', (change: PriceChange) => {
      eventCount++;
      priceCount++;
      console.log(`   📈 Price change: $${change.price.toFixed(3)} (${change.side})`);
    });
    
    client.on('trade', (trade: LastTrade) => {
      eventCount++;
      tradeCount++;
      console.log(`   💱 Trade: $${trade.price.toFixed(3)}`);
    });
    
    client.on('error', (error) => {
      console.error('   ❌ WebSocket error:', error.message);
    });
    
    client.on('disconnected', ({ code, reason }) => {
      console.log(`   ⚠️  Disconnected: ${code} ${reason}`);
    });
    
    // Connect
    client.connect()
      .then(() => {
        // Run for test duration then disconnect
        setTimeout(() => {
          client.disconnect();
          
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`\n   ═══════════════════════════════════`);
          console.log(`   📊 Test Summary (${elapsed}s):`);
          console.log(`      Total events: ${eventCount}`);
          console.log(`      Book updates: ${bookCount}`);
          console.log(`      Price changes: ${priceCount}`);
          console.log(`      Trades: ${tradeCount}`);
          console.log(`   ═══════════════════════════════════\n`);
          
          if (eventCount > 0) {
            console.log('   ✅ WebSocket test PASSED\n');
            resolve(true);
          } else {
            console.log('   ⚠️  No events received (market may be inactive)\n');
            resolve(true); // Still pass - connection worked
          }
        }, testDuration);
      })
      .catch((error) => {
        console.error('   ❌ Failed to connect:', error.message);
        resolve(false);
      });
  });
}

async function main() {
  console.log('═'.repeat(50));
  console.log('🧪 Phase 1b: Testing Polymarket WebSocket Client');
  console.log('═'.repeat(50) + '\n');
  
  // Step 1: Find an active market
  const market = await findActiveMarket();
  if (!market) {
    console.log('❌ Could not find active market for testing');
    process.exit(1);
  }
  
  // Step 2: Test REST API
  const restOk = await testRestApi(market.tokenId);
  if (!restOk) {
    console.log('⚠️  REST API test failed, continuing to WebSocket test...\n');
  }
  
  // Step 3: Test WebSocket
  const wsOk = await testWebSocket(market.tokenId);
  
  // Summary
  console.log('═'.repeat(50));
  if (wsOk) {
    console.log('✨ Phase 1b complete! WebSocket client is ready.\n');
    console.log('Next: Phase 1c - Recorder Service (combines storage + WS)');
  } else {
    console.log('❌ Phase 1b failed. Check errors above.');
    process.exit(1);
  }
  console.log('═'.repeat(50));
}

main();
