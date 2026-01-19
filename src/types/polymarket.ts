import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// Polymarket CLOB API Response Types
// ═══════════════════════════════════════════════════════════════════════════

export const TokenSchema = z.object({
  token_id: z.string(),
  outcome: z.string(), // Can be "Yes"/"No" or team names like "Arizona State"
  price: z.coerce.number(),
  winner: z.boolean().optional(),
});

export const MarketSchema = z.object({
  condition_id: z.string(),
  question_id: z.string().optional(),
  tokens: z.array(TokenSchema),
  minimum_order_size: z.coerce.number().optional(),
  minimum_tick_size: z.coerce.number().optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  end_date_iso: z.string().nullable().optional(),
  game_start_time: z.string().nullable().optional(),
  question: z.string().nullable().optional(),
  market_slug: z.string().nullable().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  accepting_orders: z.boolean().optional(),
  accepting_order_timestamp: z.string().nullable().optional(),
  rewards: z.any().optional(), // Can be object, null, or undefined
});

export const OrderBookEntrySchema = z.object({
  price: z.coerce.string(),
  size: z.coerce.string(),
});

export const OrderBookSchema = z.object({
  market: z.string().optional(),
  asset_id: z.string().optional(),
  hash: z.string().optional(),
  timestamp: z.coerce.string().optional(),
  bids: z.array(OrderBookEntrySchema).optional().default([]),
  asks: z.array(OrderBookEntrySchema).optional().default([]),
});

export const TradeSchema = z.object({
  id: z.string().optional(),
  taker_order_id: z.string().optional(),
  market: z.string().optional(),
  asset_id: z.string(),
  side: z.enum(['BUY', 'SELL']),
  size: z.coerce.string(),
  fee_rate_bps: z.coerce.string().optional(),
  price: z.coerce.string(),
  status: z.string().optional(),
  match_time: z.coerce.string().optional(),
  last_update: z.coerce.string().optional(),
  outcome: z.string().optional(),
  bucket_index: z.number().optional(),
  owner: z.string().optional(),
  maker_address: z.string().optional(),
  transaction_hash: z.string().optional(),
  trader_side: z.enum(['TAKER', 'MAKER']).optional(),
});

// Gamma API (markets metadata)
export const GammaMarketSchema = z.object({
  id: z.string(),
  ticker: z.string().optional(),
  slug: z.string(),
  question: z.string(), // API returns "question" not "title"
  title: z.string().optional(), // Sometimes present
  description: z.string().optional(),
  endDate: z.string().optional(),
  liquidity: z.coerce.number().optional(),
  volume: z.coerce.number().optional(),
  volume24hr: z.coerce.number().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  archived: z.boolean().optional(),
  new: z.boolean().optional(),
  featured: z.boolean().optional(),
  restricted: z.boolean().optional(),
  questionID: z.string().optional(),
  conditionId: z.string().optional(),
  outcomePrices: z.string().optional(), // JSON string like "[\"0.52\",\"0.48\"]"
  outcomes: z.string().optional(), // JSON string like "[\"Yes\",\"No\"]"
  clobTokenIds: z.string().optional(), // JSON string
  acceptingOrders: z.boolean().optional(),
});

// Type exports
export type Token = z.infer<typeof TokenSchema>;
export type PolymarketMarket = z.infer<typeof MarketSchema>;
export type OrderBook = z.infer<typeof OrderBookSchema>;
export type OrderBookEntry = z.infer<typeof OrderBookEntrySchema>;
export type PolymarketTrade = z.infer<typeof TradeSchema>;
export type GammaMarket = z.infer<typeof GammaMarketSchema>;
