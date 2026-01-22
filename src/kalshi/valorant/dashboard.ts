/**
 * Live Trading Dashboard
 * 
 * Real-time monitoring of Kalshi markets with auto-refresh
 */

import { getKalshiClient } from './kalshi-client';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

function c(text: string, ...colors: string[]): string {
  return colors.join('') + text + COLORS.reset;
}

function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

interface MarketData {
  ticker: string;
  title: string;
  subtitle?: string;
  yesBid: number;
  yesAsk: number;
  volume: number;
  lastPrice: number;
  closeTime: string;
}

interface DashboardState {
  balance: { balance: number; available: number };
  positions: Array<{ ticker: string; position: number; pnl: number }>;
  markets: MarketData[];
  lastUpdate: Date;
  refreshCount: number;
}

async function fetchMarketData(tickers: string[]): Promise<MarketData[]> {
  const baseUrl = 'https://api.elections.kalshi.com';
  const markets: MarketData[] = [];
  
  for (const ticker of tickers) {
    try {
      const response = await fetch(`${baseUrl}/trade-api/v2/markets/${ticker}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      const m = data.market;
      
      if (m) {
        markets.push({
          ticker: m.ticker,
          title: m.title || m.subtitle || ticker,
          subtitle: m.subtitle,
          yesBid: m.yes_bid || 0,
          yesAsk: m.yes_ask || 0,
          volume: m.volume || 0,
          lastPrice: m.last_price || 0,
          closeTime: m.close_time,
        });
      }
    } catch (e) {
      // Skip failed markets
    }
  }
  
  return markets;
}

async function fetchNBAGames(): Promise<string[]> {
  const baseUrl = 'https://api.elections.kalshi.com';
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  try {
    const response = await fetch(`${baseUrl}/trade-api/v2/events?series_ticker=KXNBAGAME&limit=20`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    
    // Get markets for today's games
    const markets: string[] = [];
    for (const event of data.events || []) {
      // Fetch markets for this event
      const marketsResp = await fetch(`${baseUrl}/trade-api/v2/markets?event_ticker=${event.event_ticker}&limit=5`, {
        headers: { 'Content-Type': 'application/json' }
      });
      const marketsData = await marketsResp.json();
      
      // Get the main game market (winner)
      const mainMarket = marketsData.markets?.find((m: any) => 
        m.ticker.includes(event.event_ticker) && m.status === 'active'
      );
      if (mainMarket) {
        markets.push(mainMarket.ticker);
      }
      
      if (markets.length >= 8) break; // Limit to 8 games
    }
    
    return markets;
  } catch (e) {
    console.error('Error fetching NBA games:', e);
    return [];
  }
}

function renderDashboard(state: DashboardState): void {
  clearScreen();
  
  const now = new Date();
  const header = `
${c('╔════════════════════════════════════════════════════════════════════════════╗', COLORS.cyan)}
${c('║', COLORS.cyan)}${c('                    KALSHI LIVE TRADING DASHBOARD                         ', COLORS.bold, COLORS.white)}${c('║', COLORS.cyan)}
${c('╠════════════════════════════════════════════════════════════════════════════╣', COLORS.cyan)}
${c('║', COLORS.cyan)} Last Update: ${c(state.lastUpdate.toLocaleTimeString(), COLORS.green)}  |  Refresh #${state.refreshCount}  |  Press ${c('Ctrl+C', COLORS.yellow)} to exit     ${c('║', COLORS.cyan)}
${c('╚════════════════════════════════════════════════════════════════════════════╝', COLORS.cyan)}
`;
  
  console.log(header);
  
  // Account section
  console.log(c('┌─ ACCOUNT ────────────────────────────────────────────────────────────────┐', COLORS.dim));
  console.log(`│  Balance: ${c('$' + state.balance.balance.toFixed(2), COLORS.green)}  |  Available: ${c('$' + state.balance.available.toFixed(2), COLORS.cyan)}  |  Positions: ${state.positions.length}`);
  console.log(c('└──────────────────────────────────────────────────────────────────────────┘', COLORS.dim));
  
  // Positions
  if (state.positions.length > 0) {
    console.log();
    console.log(c('┌─ OPEN POSITIONS ─────────────────────────────────────────────────────────┐', COLORS.yellow));
    state.positions.forEach(p => {
      const pnlColor = p.pnl >= 0 ? COLORS.green : COLORS.red;
      const pnlSign = p.pnl >= 0 ? '+' : '';
      console.log(`│  ${p.ticker.slice(0, 40).padEnd(40)}  Qty: ${p.position}  P&L: ${c(pnlSign + '$' + p.pnl.toFixed(2), pnlColor)}`);
    });
    console.log(c('└──────────────────────────────────────────────────────────────────────────┘', COLORS.yellow));
  }
  
  // Markets
  console.log();
  console.log(c('┌─ LIVE MARKETS (NBA GAMES) ───────────────────────────────────────────────┐', COLORS.magenta));
  console.log(c('│  Match                                    Bid    Ask    Spread   Volume  │', COLORS.dim));
  console.log(c('├──────────────────────────────────────────────────────────────────────────┤', COLORS.dim));
  
  if (state.markets.length === 0) {
    console.log('│  ' + c('Loading markets...', COLORS.yellow));
  } else {
    state.markets.forEach(m => {
      const title = (m.subtitle || m.title || m.ticker).slice(0, 38).padEnd(38);
      const bid = m.yesBid ? `${m.yesBid}¢` : '--';
      const ask = m.yesAsk ? `${m.yesAsk}¢` : '--';
      const spread = m.yesBid && m.yesAsk ? `${m.yesAsk - m.yesBid}¢` : '--';
      const spreadColor = m.yesAsk - m.yesBid <= 3 ? COLORS.green : 
                          m.yesAsk - m.yesBid <= 6 ? COLORS.yellow : COLORS.red;
      
      console.log(`│  ${title}  ${bid.padStart(5)}  ${ask.padStart(5)}  ${c(spread.padStart(6), spreadColor)}  ${String(m.volume).padStart(7)}  │`);
    });
  }
  
  console.log(c('└──────────────────────────────────────────────────────────────────────────┘', COLORS.magenta));
  
  // VLR.gg upcoming matches preview
  console.log();
  console.log(c('┌─ VALORANT MATCHES (VLR.gg) ─────────────────────────────────────────────┐', COLORS.cyan));
  console.log('│  Tomorrow: Natus Vincere vs Karmine Corp | VCT EMEA Kickoff | 10:00 AM  │');
  console.log('│  Tomorrow: FUT Esports vs Gentle Mates   | VCT EMEA Kickoff | 1:00 PM   │');
  console.log('│  ' + c('Run: bun run valorant signal 1', COLORS.dim) + '  to analyze                         │');
  console.log(c('└──────────────────────────────────────────────────────────────────────────┘', COLORS.cyan));
  
  console.log();
  console.log(c('  Auto-refreshing every 5 seconds... Press Ctrl+C to stop', COLORS.dim));
}

async function runDashboard(): Promise<void> {
  console.log('🚀 Starting live dashboard...');
  
  const client = getKalshiClient();
  
  // Get NBA game market tickers
  console.log('📊 Finding active NBA markets...');
  const marketTickers = await fetchNBAGames();
  console.log(`Found ${marketTickers.length} active markets`);
  
  let refreshCount = 0;
  
  const refresh = async () => {
    try {
      refreshCount++;
      
      // Fetch account data
      const balance = await client.getBalance();
      const positions = await client.getPositions();
      
      // Fetch market data
      const markets = await fetchMarketData(marketTickers);
      
      const state: DashboardState = {
        balance,
        positions: positions.map(p => ({
          ticker: p.ticker,
          position: p.yesContracts - p.noContracts,
          pnl: p.unrealizedPnl,
        })),
        markets,
        lastUpdate: new Date(),
        refreshCount,
      };
      
      renderDashboard(state);
    } catch (error) {
      console.error('Error refreshing:', error);
    }
  };
  
  // Initial render
  await refresh();
  
  // Auto-refresh every 5 seconds
  const interval = setInterval(refresh, 5000);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n\n👋 Dashboard stopped. Goodbye!');
    process.exit(0);
  });
}

// Run dashboard
runDashboard().catch(console.error);
