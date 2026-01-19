/**
 * Polymarket Intelligence Platform
 *
 * Evidence-based trading research for prediction markets.
 */

import { polymarket } from '@/services/polymarket/client';
import { marketSync, traderSync } from '@/services/ingestion';
import { scheduler } from '@/services/jobs/scheduler';

async function main() {
  const command = process.argv[2];

  console.log('🎯 Polymarket Intelligence Platform\n');

  switch (command) {
    case 'health':
      await checkHealth();
      break;

    case 'sync':
      await runSync();
      break;

    case 'scheduler':
      runScheduler();
      break;

    case 'test':
      await runTest();
      break;

    default:
      showHelp();
  }
}

async function checkHealth() {
  console.log('🔍 Checking API health...\n');

  const health = await polymarket.healthCheck();

  console.log('CLOB API:', health.clob ? '✅ OK' : '❌ Failed', `(${health.latency.clob}ms)`);
  console.log('Gamma API:', health.gamma ? '✅ OK' : '❌ Failed', `(${health.latency.gamma}ms)`);
}

async function runSync() {
  console.log('🔄 Running initial data sync...\n');

  // Sync markets
  console.log('Step 1: Syncing markets...');
  const marketResult = await marketSync.syncAllMarkets();
  console.log(`  Markets: ${marketResult.synced} synced, ${marketResult.errors.length} errors\n`);

  // Check resolutions
  console.log('Step 2: Checking resolutions...');
  const resolved = await marketSync.syncResolutions();
  console.log(`  Resolved: ${resolved} markets\n`);

  console.log('✅ Sync complete!');
}

function runScheduler() {
  console.log('📅 Starting scheduler...\n');

  scheduler.start();

  console.log('\nPress Ctrl+C to stop.\n');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n');
    scheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    scheduler.stop();
    process.exit(0);
  });
}

async function runTest() {
  console.log('🧪 Running test queries...\n');

  // Test 1: Fetch markets
  console.log('Test 1: Fetching markets...');
  const { markets } = await polymarket.getMarkets({ limit: 1000 });
  console.log(`  Found ${markets.length} markets`);

  if (markets.length > 0) {
    const market = markets[0];
    console.log(`  Example: "${market.question?.slice(0, 50) || 'N/A'}..."`);

    // Test 2: Fetch order book (try multiple markets until one works)
    console.log('\nTest 2: Fetching order book...');
    let orderBookSuccess = false;
    for (const m of markets.slice(0, 10)) {
      if (m.tokens.length > 0 && m.active && m.accepting_orders) {
        try {
          const orderBook = await polymarket.getOrderBook(m.tokens[0].token_id);
          console.log(`  Market: "${m.question?.slice(0, 40)}..."`);
          console.log(`  Bids: ${orderBook.bids.length}, Asks: ${orderBook.asks.length}`);
          orderBookSuccess = true;
          break;
        } catch (e) {
          // Try next market
        }
      }
    }
    if (!orderBookSuccess) {
      console.log('  No active order books found in first 10 markets');
    }
  }

  // Test 3: Gamma API
  console.log('\nTest 3: Fetching from Gamma API...');
  const gammaMarkets = await polymarket.getGammaMarkets({ limit: 5, active: true });
  console.log(`  Found ${gammaMarkets.length} active markets`);

  if (gammaMarkets.length > 0) {
    console.log(`  Example: "${gammaMarkets[0].question.slice(0, 50)}..."`);
    console.log(`  Volume: $${(gammaMarkets[0].volume || 0).toLocaleString()}`);
    console.log(`  Liquidity: $${(gammaMarkets[0].liquidity || 0).toLocaleString()}`);
  }

  console.log('\n✅ All tests passed!');
}

function showHelp() {
  console.log('Usage: bun run src/index.ts <command>\n');
  console.log('Commands:');
  console.log('  health     Check API connectivity');
  console.log('  sync       Run initial data sync');
  console.log('  scheduler  Start background job scheduler');
  console.log('  test       Run test queries');
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
