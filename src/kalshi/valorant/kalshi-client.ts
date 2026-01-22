/**
 * Kalshi API Client
 * 
 * Handles authentication (RSA-PSS signing) and API calls to Kalshi Exchange.
 * Supports both demo and production environments.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { KalshiMarket, KalshiOrder, KalshiPosition } from './types';

// ============================================================================
// Configuration
// ============================================================================

const DEMO_BASE_URL = 'https://demo-api.kalshi.co';
const PROD_BASE_URL = 'https://api.elections.kalshi.com';
const API_PATH_PREFIX = '/trade-api/v2';

interface KalshiConfig {
  apiKeyId: string;
  privateKeyPath: string;
  useDemo: boolean;
}

// ============================================================================
// RSA-PSS Signing
// ============================================================================

function loadPrivateKey(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Kalshi private key file not found: ${absolutePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function signMessage(privateKeyPem: string, message: string): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  
  const signature = sign.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  
  return signature.toString('base64');
}

// ============================================================================
// Kalshi Client
// ============================================================================

export class KalshiClient {
  private baseUrl: string;
  private apiKeyId: string;
  private privateKey: string;
  private isDemo: boolean;
  
  constructor(config: KalshiConfig) {
    this.baseUrl = config.useDemo ? DEMO_BASE_URL : PROD_BASE_URL;
    this.apiKeyId = config.apiKeyId;
    this.privateKey = loadPrivateKey(config.privateKeyPath);
    this.isDemo = config.useDemo;
    
    console.log(`🔐 Kalshi client initialized (${config.useDemo ? 'DEMO' : 'PRODUCTION'})`);
  }
  
  private getAuthHeaders(method: string, path: string): Record<string, string> {
    const timestamp = Date.now().toString();
    // Strip query params for signing
    const pathWithoutQuery = path.split('?')[0];
    const messageToSign = timestamp + method + pathWithoutQuery;
    const signature = signMessage(this.privateKey, messageToSign);
    
    return {
      'KALSHI-ACCESS-KEY': this.apiKeyId,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'Content-Type': 'application/json',
    };
  }
  
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: unknown,
    authenticated: boolean = true
  ): Promise<T> {
    const path = API_PATH_PREFIX + endpoint;
    const url = this.baseUrl + path;
    
    const headers: Record<string, string> = authenticated
      ? this.getAuthHeaders(method, path)
      : { 'Content-Type': 'application/json' };
    
    const options: RequestInit = {
      method,
      headers,
    };
    
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kalshi API error: ${response.status} - ${errorText}`);
    }
    
    return response.json() as Promise<T>;
  }
  
  // ============================================================================
  // Public Market Data (No Auth Required)
  // ============================================================================
  
  /**
   * Get all events (market groups)
   */
  async getEvents(params?: {
    status?: 'open' | 'closed' | 'settled';
    seriesTicker?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ events: KalshiEvent[]; cursor: string }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.seriesTicker) query.set('series_ticker', params.seriesTicker);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.cursor) query.set('cursor', params.cursor);
    
    const queryStr = query.toString();
    const endpoint = `/events${queryStr ? '?' + queryStr : ''}`;
    
    return this.request('GET', endpoint, undefined, false);
  }
  
  /**
   * Search for markets by keyword
   */
  async searchMarkets(query: string): Promise<{ markets: KalshiMarketResponse[] }> {
    const params = new URLSearchParams({ query });
    return this.request('GET', `/markets?${params}`, undefined, false);
  }
  
  /**
   * Get Valorant/esports markets
   */
  async getValorantMarkets(): Promise<KalshiMarket[]> {
    // Search for valorant markets
    const response = await this.searchMarkets('valorant');
    
    return response.markets.map(m => this.transformMarket(m));
  }
  
  /**
   * Get specific market by ticker
   */
  async getMarket(ticker: string): Promise<KalshiMarket> {
    const response = await this.request<{ market: KalshiMarketResponse }>(
      'GET', 
      `/markets/${ticker}`,
      undefined,
      false
    );
    return this.transformMarket(response.market);
  }
  
  /**
   * Get order book for a market
   */
  async getOrderBook(ticker: string): Promise<{
    yes: { price: number; quantity: number }[];
    no: { price: number; quantity: number }[];
  }> {
    const response = await this.request<{ orderbook: KalshiOrderBook }>(
      'GET',
      `/markets/${ticker}/orderbook`,
      undefined,
      false
    );
    
    return {
      yes: response.orderbook.yes || [],
      no: response.orderbook.no || [],
    };
  }
  
  // ============================================================================
  // Authenticated Endpoints
  // ============================================================================
  
  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number; available: number }> {
    const response = await this.request<{ balance: number }>('GET', '/portfolio/balance');
    return {
      balance: response.balance / 100, // Convert cents to dollars
      available: response.balance / 100,
    };
  }
  
  /**
   * Get current positions
   */
  async getPositions(): Promise<KalshiPosition[]> {
    const response = await this.request<{ market_positions: KalshiPositionResponse[] }>(
      'GET',
      '/portfolio/positions'
    );
    
    return response.market_positions.map(p => ({
      ticker: p.ticker,
      yesContracts: p.position,
      noContracts: p.position < 0 ? Math.abs(p.position) : 0,
      avgYesPrice: p.realized_pnl / Math.max(1, Math.abs(p.position)) / 100,
      avgNoPrice: 0,
      unrealizedPnl: 0,
    }));
  }
  
  /**
   * Get open orders
   */
  async getOrders(): Promise<KalshiOrder[]> {
    const response = await this.request<{ orders: KalshiOrderResponse[] }>(
      'GET',
      '/portfolio/orders'
    );
    
    return response.orders.map(o => ({
      orderId: o.order_id,
      ticker: o.ticker,
      side: o.side === 'yes' ? 'yes' : 'no',
      type: o.type === 'limit' ? 'limit' : 'market',
      price: o.yes_price,
      quantity: o.count,
      filledQuantity: o.count - o.remaining_count,
      status: o.status as 'open' | 'filled' | 'cancelled',
      createdAt: new Date(o.created_time),
    }));
  }
  
  /**
   * Create a new order
   */
  async createOrder(params: {
    ticker: string;
    side: 'yes' | 'no';
    type: 'limit' | 'market';
    count: number;
    yesPrice?: number; // In cents (1-99)
    clientOrderId?: string;
  }): Promise<{ orderId: string; order: KalshiOrder }> {
    const body: Record<string, unknown> = {
      ticker: params.ticker,
      action: 'buy',
      side: params.side,
      type: params.type,
      count: params.count,
    };
    
    if (params.type === 'limit' && params.yesPrice) {
      body.yes_price = params.yesPrice;
    }
    
    if (params.clientOrderId) {
      body.client_order_id = params.clientOrderId;
    }
    
    const response = await this.request<{ order: KalshiOrderResponse }>(
      'POST',
      '/portfolio/orders',
      body
    );
    
    return {
      orderId: response.order.order_id,
      order: {
        orderId: response.order.order_id,
        ticker: response.order.ticker,
        side: params.side,
        type: params.type,
        price: response.order.yes_price,
        quantity: params.count,
        filledQuantity: 0,
        status: 'open',
        createdAt: new Date(),
      },
    };
  }
  
  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.request('DELETE', `/portfolio/orders/${orderId}`);
  }
  
  /**
   * Cancel all orders for a market
   */
  async cancelAllOrders(ticker?: string): Promise<void> {
    const body = ticker ? { ticker } : {};
    await this.request('POST', '/portfolio/orders/cancel', body);
  }
  
  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  private transformMarket(m: KalshiMarketResponse): KalshiMarket {
    // Parse team names from title
    const vsMatch = m.title?.match(/(.+?)\s+vs\.?\s+(.+)/i);
    const team1 = vsMatch ? vsMatch[1].trim() : 'Team 1';
    const team2 = vsMatch ? vsMatch[2].trim() : 'Team 2';
    
    return {
      ticker: m.ticker,
      title: m.title || m.ticker,
      team1,
      team2,
      tournament: m.subtitle || 'Unknown Tournament',
      yesPrice: m.yes_bid || 50,
      noPrice: m.no_bid || 50,
      yesAsk: m.yes_ask || 51,
      yesBid: m.yes_bid || 49,
      noAsk: m.no_ask || 51,
      noBid: m.no_bid || 49,
      volume: m.volume || 0,
      openInterest: m.open_interest || 0,
      expirationTime: new Date(m.expiration_time || Date.now()),
      status: m.status === 'active' ? 'active' : 'closed',
    };
  }
  
  /**
   * Check if client is using demo environment
   */
  isUsingDemo(): boolean {
    return this.isDemo;
  }
}

// ============================================================================
// Response Types (Internal)
// ============================================================================

interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  status: string;
}

interface KalshiMarketResponse {
  ticker: string;
  title?: string;
  subtitle?: string;
  status: string;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume?: number;
  open_interest?: number;
  expiration_time?: string;
}

interface KalshiOrderBook {
  yes?: { price: number; quantity: number }[];
  no?: { price: number; quantity: number }[];
}

interface KalshiOrderResponse {
  order_id: string;
  ticker: string;
  side: string;
  type: string;
  yes_price: number;
  count: number;
  remaining_count: number;
  status: string;
  created_time: string;
}

interface KalshiPositionResponse {
  ticker: string;
  position: number;
  realized_pnl: number;
}

// ============================================================================
// Factory Function
// ============================================================================

let clientInstance: KalshiClient | null = null;

export function getKalshiClient(config?: Partial<KalshiConfig>): KalshiClient {
  if (!clientInstance) {
    const fullConfig: KalshiConfig = {
      apiKeyId: process.env.KALSHI_API_KEY_ID || '',
      privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH || './kalshi-private-key.pem',
      useDemo: process.env.KALSHI_USE_DEMO !== 'false', // Default to demo unless explicitly set to 'false'
      ...config,
    };
    
    if (!fullConfig.apiKeyId) {
      throw new Error('KALSHI_API_KEY_ID environment variable is required. Set it in .env file.');
    }
    
    clientInstance = new KalshiClient(fullConfig);
  }
  
  return clientInstance;
}

/**
 * Create a client without authentication (for public data only)
 */
export function createPublicClient(useDemo: boolean = true): {
  searchMarkets: (query: string) => Promise<KalshiMarket[]>;
  getMarket: (ticker: string) => Promise<KalshiMarket>;
  getOrderBook: (ticker: string) => Promise<{ yes: { price: number; quantity: number }[]; no: { price: number; quantity: number }[] }>;
} {
  const baseUrl = useDemo ? DEMO_BASE_URL : PROD_BASE_URL;
  
  const request = async <T>(endpoint: string): Promise<T> => {
    const url = baseUrl + API_PATH_PREFIX + endpoint;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kalshi API error: ${response.status} - ${errorText}`);
    }
    
    return response.json() as Promise<T>;
  };
  
  return {
    searchMarkets: async (query: string) => {
      const params = new URLSearchParams({ query });
      const response = await request<{ markets: KalshiMarketResponse[] }>(`/markets?${params}`);
      return response.markets.map(m => ({
        ticker: m.ticker,
        title: m.title || m.ticker,
        team1: 'Team 1',
        team2: 'Team 2',
        tournament: m.subtitle || 'Unknown',
        yesPrice: m.yes_bid || 50,
        noPrice: m.no_bid || 50,
        yesAsk: m.yes_ask || 51,
        yesBid: m.yes_bid || 49,
        noAsk: m.no_ask || 51,
        noBid: m.no_bid || 49,
        volume: m.volume || 0,
        openInterest: m.open_interest || 0,
        expirationTime: new Date(m.expiration_time || Date.now()),
        status: m.status === 'active' ? 'active' : 'closed',
      } as KalshiMarket));
    },
    getMarket: async (ticker: string) => {
      const response = await request<{ market: KalshiMarketResponse }>(`/markets/${ticker}`);
      const m = response.market;
      return {
        ticker: m.ticker,
        title: m.title || m.ticker,
        team1: 'Team 1',
        team2: 'Team 2',
        tournament: m.subtitle || 'Unknown',
        yesPrice: m.yes_bid || 50,
        noPrice: m.no_bid || 50,
        yesAsk: m.yes_ask || 51,
        yesBid: m.yes_bid || 49,
        noAsk: m.no_ask || 51,
        noBid: m.no_bid || 49,
        volume: m.volume || 0,
        openInterest: m.open_interest || 0,
        expirationTime: new Date(m.expiration_time || Date.now()),
        status: m.status === 'active' ? 'active' : 'closed',
      } as KalshiMarket;
    },
    getOrderBook: async (ticker: string) => {
      const response = await request<{ orderbook: KalshiOrderBook }>(`/markets/${ticker}/orderbook`);
      return {
        yes: response.orderbook.yes || [],
        no: response.orderbook.no || [],
      };
    },
  };
}
