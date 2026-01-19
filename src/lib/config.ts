import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  // Polymarket
  POLYMARKET_API_URL: z.string().default('https://clob.polymarket.com'),
  POLYMARKET_WS_URL: z.string().default('wss://ws-subscriptions-clob.polymarket.com'),
  POLYMARKET_GAMMA_URL: z.string().default('https://gamma-api.polymarket.com'),

  // AI
  ANTHROPIC_API_KEY: z.string().optional(),

  // Blockchain
  ALCHEMY_API_KEY: z.string().optional(),
  POLYGON_RPC_URL: z.string().default('https://polygon-rpc.com'),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Parse with defaults for missing optional values
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.warn('⚠️ Some environment variables are missing. Using defaults where possible.');
    return envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/polymarket',
    });
  }
};

export const env = parseEnv();

export const config = {
  api: {
    polymarket: {
      baseUrl: env.POLYMARKET_API_URL,
      gammaUrl: env.POLYMARKET_GAMMA_URL,
      wsUrl: env.POLYMARKET_WS_URL,
      rateLimit: {
        maxRequests: 100,
        windowMs: 60_000, // 1 minute
      },
    },
  },

  data: {
    snapshotInterval: 5 * 60 * 1000, // 5 minutes
    tradeHistoryDays: 90,
    correlationWindows: [7, 14, 30], // days
  },

  analysis: {
    minTradesForClassification: 20,
    minTradersForInsight: 10,
    confidenceThresholds: {
      low: 50,
      medium: 70,
      high: 85,
      veryHigh: 95,
    },
  },
};
