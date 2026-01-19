import { MarketSchema } from '../src/types/polymarket';

async function test() {
  const response = await fetch('https://clob.polymarket.com/markets?limit=3');
  const data = await response.json();

  console.log('Total markets:', data.data.length);

  for (const m of data.data) {
    try {
      const parsed = MarketSchema.parse(m);
      console.log('✅ Parsed:', parsed.condition_id.slice(0, 20));
    } catch (e: any) {
      console.log('❌ Failed to parse market');
      console.log('  Error:', e.errors?.[0] || e.message);
    }
  }
}

test();
