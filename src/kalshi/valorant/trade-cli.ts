#!/usr/bin/env bun
/**
 * Kalshi Trading CLI
 * 
 * Interactive trading tool with Valorant analysis integration:
 * - View positions, P&L, orders
 * - Browse upcoming VCT matches
 * - Deep analysis with map probabilities
 * - Get trade signals with edge detection
 * - Execute trades directly
 */

import * as readline from 'readline';
import { getKalshiClient } from './kalshi-client';
import { vlrScraper, fetchMatchCompositions, analyzeMatchComposition, MatchComposition } from './vlr-scraper';
import { mapAnalyzer } from './map-analyzer';
import { generateTradeSignal } from './trade-executor';
import { database } from './database';
import { 
  AGENT_META, 
  MAP_META, 
  getStrongAgentsForMap, 
  getMapMetaInsights,
  analyzeCompOnMap,
  analyzePlaystyleMatch,
  AgentMeta,
  MapMeta 
} from './agent-meta';
import { 
  VLRMatch, 
  VLRTeamFull, 
  SeriesAnalysis,
  TradeSignal,
  ACTIVE_MAP_POOL,
  ValorantMap,
  DEFAULT_TRADING_CONFIG
} from './types';
import {
  liveStrategy,
  LiveMatchState,
  MomentumState,
  EconomyState,
  UltimateState,
  LiveBettingSignal,
  generateLiveSignals,
  calculateRoundWinProbability,
  calculateLiveMapWinProbability,
  MAP_SIDE_ADVANTAGE,
  ULT_IMPACT,
} from './live-strategy';

const client = getKalshiClient();

// ============================================================================
// Colors & Formatting
// ============================================================================

const C = {
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
  bgBlue: '\x1b[44m',
};

const color = (text: string, ...codes: string[]) => codes.join('') + text + C.reset;
const green = (s: string) => color(s, C.green);
const red = (s: string) => color(s, C.red);
const yellow = (s: string) => color(s, C.yellow);
const cyan = (s: string) => color(s, C.cyan);
const magenta = (s: string) => color(s, C.magenta);
const dim = (s: string) => color(s, C.dim);
const bold = (s: string) => color(s, C.bold);

function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[0f');
}

// ============================================================================
// Position & Market Cache
// ============================================================================

interface EnrichedPosition {
  ticker: string;
  title: string;
  side: 'YES' | 'NO';
  quantity: number;
  avgPrice: number;
  currentBid: number;
  currentAsk: number;
  pnl: number;
  pnlPercent: number;
}

interface MarketInfo {
  ticker: string;
  title: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  volume: number;
  spread: number;
}

let cachedPositions: EnrichedPosition[] = [];
let cachedBalance = { balance: 0, available: 0 };

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchEnrichedPositions(): Promise<EnrichedPosition[]> {
  const positions = await client.getPositions();
  const enriched: EnrichedPosition[] = [];
  
  for (const p of positions) {
    if (p.yesContracts === 0 && p.noContracts === 0) continue;
    
    try {
      const market = await client.getMarket(p.ticker);
      const orderbook = await client.getOrderBook(p.ticker);
      
      const currentBid = orderbook.yes[0]?.price ?? market.yesBid;
      const currentAsk = orderbook.yes[orderbook.yes.length - 1]?.price ?? market.yesAsk;
      
      // Calculate P&L (simplified - would need fill history for accurate calc)
      const qty = p.yesContracts > 0 ? p.yesContracts : p.noContracts;
      const side = p.yesContracts > 0 ? 'YES' : 'NO';
      const avgPrice = p.avgYesPrice || 50; // Fallback if not available
      const currentPrice = side === 'YES' ? currentBid : (100 - currentBid);
      const pnl = (currentPrice - avgPrice) * qty / 100;
      const pnlPercent = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
      
      enriched.push({
        ticker: p.ticker,
        title: market.title,
        side,
        quantity: qty,
        avgPrice,
        currentBid,
        currentAsk,
        pnl,
        pnlPercent,
      });
    } catch (e) {
      // Market may have closed, still show position
      enriched.push({
        ticker: p.ticker,
        title: p.ticker,
        side: p.yesContracts > 0 ? 'YES' : 'NO',
        quantity: p.yesContracts > 0 ? p.yesContracts : p.noContracts,
        avgPrice: 0,
        currentBid: 0,
        currentAsk: 0,
        pnl: 0,
        pnlPercent: 0,
      });
    }
  }
  
  cachedPositions = enriched;
  return enriched;
}

async function searchMarkets(query: string): Promise<MarketInfo[]> {
  const result = await client.searchMarkets(query);
  
  return result.markets.slice(0, 15).map(m => ({
    ticker: m.ticker,
    title: m.title || m.ticker,
    yesBid: m.yes_bid || 0,
    yesAsk: m.yes_ask || 0,
    noBid: m.no_bid || 0,
    noAsk: m.no_ask || 0,
    volume: m.volume || 0,
    spread: (m.yes_ask || 0) - (m.yes_bid || 0),
  }));
}

// ============================================================================
// Display Functions
// ============================================================================

function printHeader() {
  console.log();
  console.log(cyan('╔═══════════════════════════════════════════════════════════════════════════╗'));
  console.log(cyan('║') + bold('                      KALSHI TRADING CLI                                   ') + cyan('║'));
  console.log(cyan('╚═══════════════════════════════════════════════════════════════════════════╝'));
}

function printBalance() {
  console.log();
  console.log(dim('─'.repeat(77)));
  console.log(`  💰 Balance: ${green('$' + cachedBalance.balance.toFixed(2))}  │  Available: ${cyan('$' + cachedBalance.available.toFixed(2))}`);
  console.log(dim('─'.repeat(77)));
}

function printPositions(positions: EnrichedPosition[]) {
  console.log();
  console.log(yellow(bold('  📊 POSITIONS')));
  console.log();
  
  if (positions.length === 0) {
    console.log(dim('  No open positions'));
    return;
  }
  
  // Header
  console.log(dim('  #   Market                                           Side   Qty   Bid→Ask    P&L'));
  console.log(dim('  ─'.repeat(40)));
  
  positions.forEach((p, i) => {
    const pnlStr = p.pnl >= 0 ? green(`+$${p.pnl.toFixed(2)}`) : red(`-$${Math.abs(p.pnl).toFixed(2)}`);
    const sideStr = p.side === 'YES' ? green('YES') : red('NO ');
    const title = p.title.length > 45 ? p.title.slice(0, 42) + '...' : p.title.padEnd(45);
    const priceRange = `${p.currentBid}¢→${p.currentAsk}¢`;
    
    console.log(`  ${(i + 1).toString().padStart(2)}  ${title}  ${sideStr}  ${p.quantity.toString().padStart(4)}  ${priceRange.padStart(10)}  ${pnlStr}`);
  });
}

function printOrders(orders: any[]) {
  console.log();
  console.log(cyan(bold('  📋 OPEN ORDERS')));
  console.log();
  
  if (orders.length === 0) {
    console.log(dim('  No open orders'));
    return;
  }
  
  console.log(dim('  #   Market                                    Side   Price   Qty   Filled'));
  console.log(dim('  ─'.repeat(40)));
  
  orders.forEach((o, i) => {
    const sideStr = o.side === 'yes' ? green('YES') : red('NO ');
    const title = o.ticker.length > 40 ? o.ticker.slice(0, 37) + '...' : o.ticker.padEnd(40);
    console.log(`  ${(i + 1).toString().padStart(2)}  ${title}  ${sideStr}  ${(o.price + '¢').padStart(5)}  ${o.quantity.toString().padStart(4)}  ${o.filledQuantity}/${o.quantity}`);
  });
}

function printMarkets(markets: MarketInfo[], title: string = 'MARKETS') {
  console.log();
  console.log(cyan(bold(`  🔍 ${title}`)));
  console.log();
  
  if (markets.length === 0) {
    console.log(dim('  No markets found'));
    return;
  }
  
  console.log(dim('  #   Market                                                   Bid    Ask   Spread   Vol'));
  console.log(dim('  ─'.repeat(45)));
  
  markets.forEach((m, i) => {
    const title = m.title.length > 55 ? m.title.slice(0, 52) + '...' : m.title.padEnd(55);
    console.log(`  ${(i + 1).toString().padStart(2)}  ${title}  ${(m.yesBid + '¢').padStart(4)}  ${(m.yesAsk + '¢').padStart(4)}  ${(m.spread + '¢').padStart(5)}  ${m.volume.toString().padStart(5)}`);
  });
}

function printHelp() {
  console.log();
  console.log(bold('  � ACCOUNT'));
  console.log();
  console.log(`  ${green('positions')} or ${green('p')}        Show your open positions with P&L`);
  console.log(`  ${green('orders')} or ${green('o')}           Show your open orders`);
  console.log(`  ${green('balance')} or ${green('b')}          Show account balance`);
  console.log();
  console.log(bold('  🎮 VALORANT ANALYSIS'));
  console.log();
  console.log(`  ${cyan('matches')} or ${cyan('m')}           List upcoming VCT matches`);
  console.log(`  ${cyan('analyze <#>')} or ${cyan('a <#>')}   Deep analysis of match (map pools, H2H)`);
  console.log(`  ${cyan('signal <#>')} or ${cyan('s <#>')}    Get trade signal with edge calculation`);
  console.log(`  ${cyan('agents')}                  Show all agent meta data (pick/win rates)`);
  console.log(`  ${cyan('agent <name>')}            Show specific agent details (e.g., "agent Jett")`);
  console.log(`  ${cyan('map <name>')}              Show map meta & best agents (e.g., "map Ascent")`);
  console.log(`  ${cyan('comps <#>')} or ${cyan('c <#>')}      Show LIVE team compositions from VLR`);
  console.log();
  console.log(bold('  ⚡ LIVE BETTING STRATEGY'));
  console.log();
  console.log(`  ${magenta('watch')} or ${magenta('dashboard')}   Launch live match dashboard (auto-refresh)`);
  console.log(`  ${magenta('live <map> <t1> <t2>')}     Analyze live round (e.g., "live Split 8 5")`);
  console.log(`  ${magenta('sim <map> <t1> <t2> <e1> <e2>')}  Simulate with economy (e.g., "sim Split 8 5 full eco")`);
  console.log(`  ${magenta('econ <buy1> <buy2>')}       Economy advantage (full/force/eco/bonus)`);
  console.log(`  ${magenta('ults')}                    Show ultimate impact ratings`);
  console.log(`  ${magenta('sides')}                   Show map attack/defense win rates`);
  console.log(`  ${magenta('round <map> <side>')}       Round win calc (e.g., "round Split attack")`);
  console.log();
  console.log(bold('  🔍 MARKET SEARCH'));
  console.log();
  console.log(`  ${green('search <query>')}        Search for markets (e.g., "search Lakers")`);
  console.log(`  ${green('nba')}                   Show today's NBA game markets`);
  console.log(`  ${green('tennis')}                Show ATP tennis markets`);
  console.log();
  console.log(bold('  💹 TRADING'));
  console.log();
  console.log(`  ${yellow('buy <ticker> <qty> [price]')}    Buy YES contracts (limit if price given)`);
  console.log(`  ${yellow('buyno <ticker> <qty> [price]')}  Buy NO contracts`);
  console.log(`  ${yellow('close <#>')}                     Close position # from list`);
  console.log(`  ${yellow('cancel <#>')}                    Cancel order # from list`);
  console.log(`  ${yellow('cancel all')}                    Cancel all open orders`);
  console.log();
  console.log(bold('  🔧 OTHER'));
  console.log();
  console.log(`  ${dim('refresh')} or ${dim('r')}          Refresh all data`);
  console.log(`  ${dim('clear')} or ${dim('c')}            Clear screen`);
  console.log(`  ${dim('help')} or ${dim('h')}             Show this help`);
  console.log(`  ${dim('quit')} or ${dim('q')}             Exit`);
  console.log();
}

// ============================================================================
// Trade Execution
// ============================================================================

async function executeBuy(ticker: string, qty: number, price?: number, side: 'yes' | 'no' = 'yes') {
  const orderType = price ? 'limit' : 'market';
  
  console.log();
  console.log(dim(`  Placing ${orderType} order: BUY ${qty} ${side.toUpperCase()} @ ${price ? price + '¢' : 'market'}...`));
  
  try {
    const result = await client.createOrder({
      ticker,
      side,
      type: orderType,
      count: qty,
      yesPrice: price,
    });
    
    console.log(green(`  ✓ Order placed! ID: ${result.orderId}`));
    return result;
  } catch (e: any) {
    console.log(red(`  ✗ Order failed: ${e.message}`));
    return null;
  }
}

async function executeClose(positionIndex: number) {
  if (positionIndex < 1 || positionIndex > cachedPositions.length) {
    console.log(red(`  Invalid position #${positionIndex}`));
    return;
  }
  
  const pos = cachedPositions[positionIndex - 1];
  if (!pos) {
    console.log(red(`  Position #${positionIndex} not found`));
    return;
  }
  
  console.log();
  console.log(dim(`  Closing position: ${pos.title}`));
  console.log(dim(`  Selling ${pos.quantity} ${pos.side} contracts at market...`));
  
  // To close, we sell the opposite side or sell our side
  // For now, just show confirmation needed
  console.log();
  console.log(yellow(`  ⚠️  This will sell ${pos.quantity} contracts at current bid (${pos.currentBid}¢)`));
  console.log(yellow(`     Estimated proceeds: $${(pos.quantity * pos.currentBid / 100).toFixed(2)}`));
  console.log();
  console.log(`  Type ${green("'confirm'")} to execute, or any other key to cancel`);
}

async function cancelOrder(orderIndex: number, orders: any[]) {
  if (orderIndex < 1 || orderIndex > orders.length) {
    console.log(red(`  Invalid order #${orderIndex}`));
    return;
  }
  
  const order = orders[orderIndex - 1];
  console.log(dim(`  Cancelling order ${order.orderId}...`));
  
  try {
    await client.cancelOrder(order.orderId);
    console.log(green(`  ✓ Order cancelled`));
  } catch (e: any) {
    console.log(red(`  ✗ Cancel failed: ${e.message}`));
  }
}

// ============================================================================
// Main REPL
// ============================================================================

let lastSearchResults: MarketInfo[] = [];
let lastOrders: any[] = [];
let cachedMatches: VLRMatch[] = [];
let lastAnalysis: SeriesAnalysis | null = null;
let lastSignal: TradeSignal | null = null;

// ============================================================================
// Agent Meta Analysis Functions
// ============================================================================

function showAllAgents(): void {
  console.log();
  console.log(cyan(bold('  🎮 VALORANT AGENT META (Pro Play)')));
  console.log();
  
  const roles = ['Duelist', 'Initiator', 'Controller', 'Sentinel'] as const;
  
  for (const role of roles) {
    const agents = Object.values(AGENT_META).filter(a => a.role === role);
    console.log(yellow(bold(`  ${role.toUpperCase()}S`)));
    console.log(dim('  Agent          Pick%   Win%   Top Maps'));
    console.log(dim('  ─'.repeat(35)));
    
    agents.sort((a, b) => b.pickRate - a.pickRate).forEach(agent => {
      const topMaps = Object.entries(agent.mapPickRates)
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, 2)
        .map(([map]) => map)
        .join(', ');
      
      const pickStr = (agent.pickRate * 100).toFixed(0) + '%';
      const winStr = agent.winRate >= 0.51 ? green((agent.winRate * 100).toFixed(0) + '%') : 
                     agent.winRate <= 0.49 ? red((agent.winRate * 100).toFixed(0) + '%') : 
                     (agent.winRate * 100).toFixed(0) + '%';
      
      console.log(`  ${agent.name.padEnd(14)} ${pickStr.padStart(5)}  ${winStr.padStart(5)}   ${topMaps}`);
    });
    console.log();
  }
}

function showAgentDetails(agentName: string): void {
  // Find agent (case-insensitive)
  const key = Object.keys(AGENT_META).find(k => k.toLowerCase() === agentName.toLowerCase());
  
  if (!key) {
    console.log(red(`  Agent "${agentName}" not found. Use 'agents' to see all.`));
    return;
  }
  
  const agent = AGENT_META[key];
  if (!agent) {
    console.log(red(`  Agent data not found for "${key}".`));
    return;
  }
  
  console.log();
  console.log(cyan(bold(`  🎮 ${agent.name.toUpperCase()} (${agent.role})`)));
  console.log();
  
  // Overall stats
  console.log(yellow('  OVERALL STATS'));
  console.log(`  Pick Rate: ${(agent.pickRate * 100).toFixed(0)}%`);
  console.log(`  Win Rate:  ${agent.winRate >= 0.51 ? green((agent.winRate * 100).toFixed(0) + '%') : (agent.winRate * 100).toFixed(0) + '%'}`);
  console.log();
  
  // Playstyle
  console.log(yellow('  PLAYSTYLE'));
  const aggrBar = '█'.repeat(Math.round(agent.playstyle.aggression * 10)) + '░'.repeat(10 - Math.round(agent.playstyle.aggression * 10));
  const utilBar = '█'.repeat(Math.round(agent.playstyle.utility * 10)) + '░'.repeat(10 - Math.round(agent.playstyle.utility * 10));
  console.log(`  Aggression: [${aggrBar}] ${(agent.playstyle.aggression * 100).toFixed(0)}%`);
  console.log(`  Utility:    [${utilBar}] ${(agent.playstyle.utility * 100).toFixed(0)}%`);
  
  const traits: string[] = [];
  if (agent.playstyle.entry) traits.push('Entry');
  if (agent.playstyle.lurk) traits.push('Lurk');
  if (agent.playstyle.anchor) traits.push('Anchor');
  if (agent.playstyle.execHeavy) traits.push('Exec');
  if (agent.playstyle.retakeStrong) traits.push('Retake');
  console.log(`  Traits:     ${traits.join(', ')}`);
  console.log();
  
  // Map performance
  console.log(yellow('  MAP PERFORMANCE'));
  console.log(dim('  Map          Pick%   Win%'));
  console.log(dim('  ─'.repeat(20)));
  
  Object.entries(agent.mapPickRates)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .forEach(([map, pickRate]) => {
      const winRate = agent.mapWinRates[map as ValorantMap] || 0.5;
      const pickStr = ((pickRate || 0) * 100).toFixed(0) + '%';
      const winStr = winRate >= 0.52 ? green((winRate * 100).toFixed(0) + '%') : 
                     winRate <= 0.48 ? red((winRate * 100).toFixed(0) + '%') : 
                     (winRate * 100).toFixed(0) + '%';
      
      const indicator = (pickRate || 0) >= 0.7 ? cyan('★') : (pickRate || 0) >= 0.5 ? '◆' : ' ';
      console.log(`  ${indicator} ${map.padEnd(12)} ${pickStr.padStart(5)}  ${winStr.padStart(5)}`);
    });
  console.log();
  
  // Synergies & Counters
  console.log(yellow('  TEAM SYNERGIES'));
  console.log(`  Works well with: ${green(agent.synergies.join(', '))}`);
  console.log(`  Weak against:    ${red(agent.counters.join(', '))}`);
  console.log(`  Team role:       ${agent.compRole.join(', ')}`);
  console.log();
}

function showMapMeta(mapName: string): void {
  // Find map (case-insensitive, partial match)
  const mapKey = Object.keys(MAP_META).find(k => 
    k.toLowerCase().includes(mapName.toLowerCase())
  ) as ValorantMap | undefined;
  
  if (!mapKey) {
    console.log(red(`  Map "${mapName}" not found. Available: ${Object.keys(MAP_META).join(', ')}`));
    return;
  }
  
  const mapMeta = MAP_META[mapKey];
  
  console.log();
  console.log(cyan(bold(`  🗺️  ${mapKey.toUpperCase()} META`)));
  console.log();
  
  // Map characteristics
  console.log(yellow('  MAP CHARACTERISTICS'));
  const openBar = '█'.repeat(Math.round(mapMeta.characteristics.openness * 10)) + '░'.repeat(10 - Math.round(mapMeta.characteristics.openness * 10));
  const vertBar = '█'.repeat(Math.round(mapMeta.characteristics.verticalPlay * 10)) + '░'.repeat(10 - Math.round(mapMeta.characteristics.verticalPlay * 10));
  const rotBar = '█'.repeat(Math.round(mapMeta.characteristics.rotationSpeed * 10)) + '░'.repeat(10 - Math.round(mapMeta.characteristics.rotationSpeed * 10));
  const opBar = '█'.repeat(Math.round(mapMeta.characteristics.opViability * 10)) + '░'.repeat(10 - Math.round(mapMeta.characteristics.opViability * 10));
  
  console.log(`  Openness:     [${openBar}] ${mapMeta.characteristics.openness >= 0.7 ? 'Open sightlines' : mapMeta.characteristics.openness <= 0.3 ? 'Tight corridors' : 'Mixed'}`);
  console.log(`  Verticality:  [${vertBar}] ${mapMeta.characteristics.verticalPlay >= 0.7 ? 'High vertical' : mapMeta.characteristics.verticalPlay <= 0.3 ? 'Flat' : 'Moderate'}`);
  console.log(`  Rotations:    [${rotBar}] ${mapMeta.characteristics.rotationSpeed >= 0.7 ? 'Fast rotates' : mapMeta.characteristics.rotationSpeed <= 0.3 ? 'Slow rotates' : 'Average'}`);
  console.log(`  Op Viability: [${opBar}] ${mapMeta.characteristics.opViability >= 0.7 ? green('Op-friendly') : mapMeta.characteristics.opViability <= 0.4 ? red('Anti-Op') : 'Neutral'}`);
  console.log(`  Favored Style: ${mapMeta.favoredStyle === 'aggressive' ? red('Aggressive') : mapMeta.favoredStyle === 'structured' ? cyan('Structured') : 'Mixed'}`);
  console.log();
  
  // Meta comp
  console.log(yellow('  META COMPOSITION'));
  console.log(`  ${green(mapMeta.metaComp.agents.join(' + '))}`);
  console.log(`  Win Rate: ${(mapMeta.metaComp.winRate * 100).toFixed(0)}%  |  Pick Rate: ${(mapMeta.metaComp.pickRate * 100).toFixed(0)}%`);
  console.log();
  
  // Alt comps
  if (mapMeta.altComps.length > 0) {
    console.log(yellow('  ALTERNATIVE COMPOSITIONS'));
    mapMeta.altComps.forEach(comp => {
      console.log(`  ${comp.agents.join(' + ')}`);
      console.log(dim(`    ↳ ${comp.context} (${(comp.winRate * 100).toFixed(0)}% WR)`));
    });
    console.log();
  }
  
  // Strong agents on this map
  console.log(yellow('  TOP AGENTS ON THIS MAP'));
  const strongAgents = getStrongAgentsForMap(mapKey, 0.5);
  console.log(dim('  Agent          Pick%   Win%   Role'));
  console.log(dim('  ─'.repeat(25)));
  
  strongAgents.slice(0, 8).forEach(agent => {
    const pickRate = agent.mapPickRates[mapKey] || 0;
    const winRate = agent.mapWinRates[mapKey] || 0.5;
    const pickStr = (pickRate * 100).toFixed(0) + '%';
    const winStr = winRate >= 0.52 ? green((winRate * 100).toFixed(0) + '%') : (winRate * 100).toFixed(0) + '%';
    console.log(`  ${agent.name.padEnd(14)} ${pickStr.padStart(5)}  ${winStr.padStart(5)}   ${agent.role}`);
  });
  console.log();
  
  // Quick insights
  console.log(yellow('  KEY INSIGHTS'));
  getMapMetaInsights(mapKey).forEach(insight => {
    console.log(`  • ${insight}`);
  });
  console.log();
}

async function showLiveComps(matchIndex: number): Promise<void> {
  if (cachedMatches.length === 0) {
    console.log(dim('  Loading matches first...'));
    await listValorantMatches();
  }
  
  const match = cachedMatches[matchIndex - 1];
  if (!match) {
    console.log(red(`  Match #${matchIndex} not found. Use 'matches' to see list.`));
    return;
  }
  
  // Extract match ID from the VLR URL (id is like "602708/team1-vs-team2-...")
  const matchId = match.id;
  
  console.log();
  console.log(cyan(bold(`  🎮 LIVE COMPOSITIONS: ${match.team1.name} vs ${match.team2.name}`)));
  console.log(dim(`  ${match.tournament}`));
  console.log();
  
  try {
    console.log(dim('  Fetching live composition data...'));
    const comp = await fetchMatchCompositions(matchId);
    
    // Status indicator
    const statusIcon = comp.status === 'live' ? '🔴 LIVE' : comp.status === 'completed' ? '✅ COMPLETED' : '⏳ UPCOMING';
    console.log(`  Status: ${statusIcon}`);
    console.log();
    
    // Maps played/to be played
    if (comp.maps.length > 0) {
      console.log(yellow('  MAPS'));
      comp.maps.forEach(map => {
        const scoreStr = map.team1Score !== undefined ? ` (${map.team1Score}-${map.team2Score})` : '';
        console.log(`  Map ${map.mapNumber}: ${cyan(map.mapName.toString())}${scoreStr}`);
      });
      console.log();
    }
    
    // Team compositions
    if (comp.team1Players.length > 0) {
      console.log(yellow(`  ${match.team1.name.toUpperCase()} COMPOSITION`));
      console.log(dim('  Player         Agents Played'));
      console.log(dim('  ─'.repeat(25)));
      comp.team1Players.forEach(player => {
        const agentsStr = player.agentsPlayed.join(', ');
        console.log(`  ${player.name.padEnd(14)} ${agentsStr}`);
      });
      console.log();
      
      // Analyze comp on current/last map
      if (comp.maps.length > 0) {
        const currentMap = comp.maps[comp.maps.length - 1].mapName;
        if (ACTIVE_MAP_POOL.includes(currentMap as ValorantMap)) {
          const team1Analysis = analyzeCompOnMap(comp.team1Players.map(p => p.agentsPlayed[0]), currentMap as ValorantMap);
          console.log(dim(`  Comp strength on ${currentMap}: ${(team1Analysis.avgWinRate * 100).toFixed(0)}% expected WR`));
          if (team1Analysis.synergies.length > 0) {
            console.log(dim(`  Synergies: ${team1Analysis.synergies.join(', ')}`));
          }
          if (team1Analysis.weaknesses.length > 0) {
            console.log(yellow(`  ⚠️ ${team1Analysis.weaknesses.join(', ')}`));
          }
        }
      }
      console.log();
    }
    
    if (comp.team2Players.length > 0) {
      console.log(yellow(`  ${match.team2.name.toUpperCase()} COMPOSITION`));
      console.log(dim('  Player         Agents Played'));
      console.log(dim('  ─'.repeat(25)));
      comp.team2Players.forEach(player => {
        const agentsStr = player.agentsPlayed.join(', ');
        console.log(`  ${player.name.padEnd(14)} ${agentsStr}`);
      });
      console.log();
      
      // Analyze comp on current/last map  
      if (comp.maps.length > 0) {
        const currentMap = comp.maps[comp.maps.length - 1].mapName;
        if (ACTIVE_MAP_POOL.includes(currentMap as ValorantMap)) {
          const team2Analysis = analyzeCompOnMap(comp.team2Players.map(p => p.agentsPlayed[0]), currentMap as ValorantMap);
          console.log(dim(`  Comp strength on ${currentMap}: ${(team2Analysis.avgWinRate * 100).toFixed(0)}% expected WR`));
          if (team2Analysis.synergies.length > 0) {
            console.log(dim(`  Synergies: ${team2Analysis.synergies.join(', ')}`));
          }
          if (team2Analysis.weaknesses.length > 0) {
            console.log(yellow(`  ⚠️ ${team2Analysis.weaknesses.join(', ')}`));
          }
        }
      }
      console.log();
    }
    
    // Playstyle comparison
    if (comp.team1Players.length > 0 && comp.team2Players.length > 0 && comp.maps.length > 0) {
      const currentMap = comp.maps[comp.maps.length - 1].mapName;
      if (ACTIVE_MAP_POOL.includes(currentMap as ValorantMap)) {
        const team1Agents = comp.team1Players.map(p => p.agentsPlayed[0]);
        const team2Agents = comp.team2Players.map(p => p.agentsPlayed[0]);
        const playstyleMatch = analyzePlaystyleMatch(team1Agents, team2Agents, currentMap as ValorantMap);
        
        console.log(yellow('  PLAYSTYLE ANALYSIS'));
        const t1AggBar = '█'.repeat(Math.round(playstyleMatch.team1Style.aggression * 10)) + '░'.repeat(10 - Math.round(playstyleMatch.team1Style.aggression * 10));
        const t2AggBar = '█'.repeat(Math.round(playstyleMatch.team2Style.aggression * 10)) + '░'.repeat(10 - Math.round(playstyleMatch.team2Style.aggression * 10));
        
        console.log(`  ${match.team1.name}: [${t1AggBar}] ${(playstyleMatch.team1Style.aggression * 100).toFixed(0)}% aggression`);
        console.log(`  ${match.team2.name}: [${t2AggBar}] ${(playstyleMatch.team2Style.aggression * 100).toFixed(0)}% aggression`);
        console.log();
        console.log(`  💡 ${playstyleMatch.insight}`);
        if (playstyleMatch.mapFavors !== 'neutral') {
          console.log(green(`  → Comp advantage: ${playstyleMatch.mapFavors === 'team1' ? match.team1.name : match.team2.name}`));
        }
        console.log();
      }
    }
    
    // Overall insights
    const analysisResult = analyzeMatchComposition(comp);
    if (analysisResult.insights.length > 0) {
      console.log(yellow('  INSIGHTS'));
      analysisResult.insights.forEach(insight => {
        console.log(`  • ${insight}`);
      });
      console.log();
    }
    
  } catch (e: any) {
    console.log(red(`  Error fetching compositions: ${e.message}`));
    console.log(dim('  Note: Comp data is only available for live/completed matches'));
  }
}

// ============================================================================
// Live Betting Strategy Display Functions
// ============================================================================

function showLiveAnalysis(mapName: string, team1Score: number, team2Score: number): void {
  const mapData = MAP_SIDE_ADVANTAGE[mapName];
  if (!mapData) {
    console.log(red(`  Map "${mapName}" not found.`));
    console.log(dim(`  Available: ${Object.keys(MAP_SIDE_ADVANTAGE).join(', ')}`));
    return;
  }
  
  const currentRound = team1Score + team2Score + 1;
  const isSecondHalf = currentRound > 12;
  const team1Side = isSecondHalf ? 'defense' : 'attack'; // Assuming team1 started attack
  
  console.log();
  console.log(cyan(bold(`  ⚡ LIVE MATCH ANALYSIS`)));
  console.log();
  
  // Score and round info
  console.log(yellow('  CURRENT STATE'));
  console.log(`  Score: ${bold(`${team1Score} - ${team2Score}`)}`);
  console.log(`  Round: ${currentRound} / ${isSecondHalf ? 'Second Half' : 'First Half'}`);
  console.log(`  Team 1 is on: ${team1Side.toUpperCase()}`);
  console.log();
  
  // Side advantage for this round
  const sideWR = team1Side === 'attack' ? mapData.attackWR : mapData.defenseWR;
  const sideAdvStr = sideWR > 0.52 ? green(`+${((sideWR - 0.5) * 100).toFixed(1)}%`) : 
                     sideWR < 0.48 ? red(`${((sideWR - 0.5) * 100).toFixed(1)}%`) : 
                     dim('Neutral');
  console.log(`  Side advantage: ${sideAdvStr} (${(sideWR * 100).toFixed(0)}% WR for ${team1Side})`);
  console.log();
  
  // Calculate map win probability
  const mapWinResult = calculateLiveMapWinProbability({
    map: mapName,
    team1Score,
    team2Score,
    currentRound,
    side: isSecondHalf ? 'second' : 'first',
    team1Side: team1Side as 'attack' | 'defense',
    team2Side: team1Side === 'attack' ? 'defense' : 'attack',
    momentum: { team1Streak: 0, team2Streak: 0, team1Timeouts: 2, team2Timeouts: 2, lastThrillerWin: null, pistolWinner: null, halfScore: null },
    economy: { team1Credits: 4000, team2Credits: 4000, team1BuyType: 'full', team2BuyType: 'full', team1LossStreak: 0, team2LossStreak: 0 },
    ultimates: { team1Ults: [], team2Ults: [], team1KeyUltsReady: 0, team2KeyUltsReady: 0 },
  }, 0.5);
  
  console.log(yellow('  MAP WIN PROBABILITY'));
  const prob = mapWinResult.probability;
  const probBar = '█'.repeat(Math.round(prob * 20)) + '░'.repeat(20 - Math.round(prob * 20));
  const probStr = (prob * 100).toFixed(1) + '%';
  const t2ProbStr = ((1-prob) * 100).toFixed(1) + '%';
  console.log(`  Team 1: [${probBar}] ${prob > 0.6 ? green(probStr) : prob < 0.4 ? red(probStr) : probStr}`);
  console.log(`  Team 2: ${prob < 0.4 ? green(t2ProbStr) : prob > 0.6 ? red(t2ProbStr) : t2ProbStr}`);
  console.log(`  Expected final: ${mapWinResult.expectedScore}`);
  console.log();
  
  // Key rounds remaining
  const roundsToWin = 13;
  const t1Needs = roundsToWin - team1Score;
  const t2Needs = roundsToWin - team2Score;
  
  console.log(yellow('  ROUNDS NEEDED TO WIN'));
  console.log(`  Team 1 needs: ${t1Needs} round${t1Needs > 1 ? 's' : ''}`);
  console.log(`  Team 2 needs: ${t2Needs} round${t2Needs > 1 ? 's' : ''}`);
  console.log();
  
  // Betting insight
  console.log(yellow('  💡 BETTING INSIGHT'));
  if (team1Score >= 10 && team2Score <= 5) {
    console.log(green('  Strong close-out position for Team 1'));
    console.log(dim('  Low value in Team 1 bet, consider skip or small Team 2 hedge'));
  } else if (team2Score >= 10 && team1Score <= 5) {
    console.log(green('  Strong close-out position for Team 2'));
    console.log(dim('  Low value in Team 2 bet, consider skip or small Team 1 hedge'));
  } else if (Math.abs(team1Score - team2Score) <= 2 && currentRound >= 18) {
    console.log(yellow('  Close game in late rounds - HIGH VARIANCE'));
    console.log(dim('  Consider hedging or small bets only'));
  } else if (team1Score === 11 && team2Score >= 9) {
    console.log(red('  ⚠️ CHOKE WATCH - Team 1 at 11 with opponent close'));
    console.log(dim('  Good spot for Team 2 comeback bet'));
  } else if (team2Score === 11 && team1Score >= 9) {
    console.log(red('  ⚠️ CHOKE WATCH - Team 2 at 11 with opponent close'));
    console.log(dim('  Good spot for Team 1 comeback bet'));
  } else {
    console.log(dim('  Standard game state - use economy and momentum for edge'));
  }
  console.log();
}

function showEconAnalysis(buy1: 'full' | 'force' | 'eco' | 'bonus', buy2: 'full' | 'force' | 'eco' | 'bonus'): void {
  const econAdvantage = liveStrategy.calculateEconomyAdvantage(buy1, buy2);
  
  console.log();
  console.log(cyan(bold(`  💰 ECONOMY ANALYSIS`)));
  console.log();
  
  console.log(`  Team 1: ${bold(buy1.toUpperCase())}`);
  console.log(`  Team 2: ${bold(buy2.toUpperCase())}`);
  console.log();
  
  const probBar = '█'.repeat(Math.round(econAdvantage * 20)) + '░'.repeat(20 - Math.round(econAdvantage * 20));
  const probColor = econAdvantage > 0.6 ? C.green : econAdvantage < 0.4 ? C.red : '';
  
  console.log(yellow('  ROUND WIN PROBABILITY'));
  console.log(`  Team 1: [${probBar}] ${probColor}${(econAdvantage * 100).toFixed(1)}%${C.reset}`);
  console.log();
  
  // Buy type descriptions
  console.log(yellow('  BUY TYPE REFERENCE'));
  console.log(`  ${green('FULL')}:   Rifles + Full Armor + Full Utility (100% firepower)`);
  console.log(`  ${cyan('BONUS')}: Saved guns from win + Light util (85% firepower)`);
  console.log(`  ${yellow('FORCE')}: Spectre/Sheriff + Light Armor (60% firepower)`);
  console.log(`  ${red('ECO')}:   Classic/Ghost only (25% firepower)`);
  console.log();
  
  // Key matchups
  console.log(yellow('  KEY ECON MATCHUPS'));
  console.log(`  Full vs Eco:    ${green('~85%')} round win for full buyer`);
  console.log(`  Full vs Force:  ${green('~70%')} round win for full buyer`);
  console.log(`  Full vs Full:   ${dim('~50%')} pure skill matchup`);
  console.log(`  Force vs Eco:   ${cyan('~65%')} round win for force buyer`);
  console.log(`  Bonus vs Full:  ${dim('~45%')} slight disadvantage (less util)`);
  console.log();
  
  // Betting advice
  console.log(yellow('  💡 BETTING ADVICE'));
  if (buy1 === 'full' && buy2 === 'eco') {
    console.log(green('  Strong Team 1 round favorite'));
    console.log(dim('  But watch for thrifty upset with Sheriffs/Marshalls'));
  } else if (buy1 === 'eco' && buy2 === 'full') {
    console.log(green('  Strong Team 2 round favorite'));
    console.log(dim('  But Team 1 may hit a thrifty with good aim'));
  } else if (buy1 === 'force' && buy2 === 'force') {
    console.log(yellow('  Chaos round - both teams on weaker buys'));
    console.log(dim('  High variance, individual plays matter more'));
  } else if (buy1 === buy2) {
    console.log(dim('  Even economy - pure skill differential'));
  }
  console.log();
}

function showUltImpacts(): void {
  console.log();
  console.log(cyan(bold(`  ⚡ ULTIMATE IMPACT RATINGS`)));
  console.log();
  
  // Group by impact tier
  const highImpact = Object.entries(ULT_IMPACT).filter(([_, v]) => v.impact >= 8);
  const midImpact = Object.entries(ULT_IMPACT).filter(([_, v]) => v.impact >= 6 && v.impact < 8);
  const lowImpact = Object.entries(ULT_IMPACT).filter(([_, v]) => v.impact < 6);
  
  console.log(yellow('  HIGH IMPACT (8-10) - Can swing rounds'));
  highImpact.sort((a, b) => b[1].impact - a[1].impact).forEach(([agent, data]) => {
    const impactBar = '█'.repeat(data.impact) + '░'.repeat(10 - data.impact);
    const typeColor = data.type === 'fight' ? red : data.type === 'utility' ? cyan : green;
    console.log(`  ${agent.padEnd(12)} [${impactBar}] ${data.impact}/10  ${typeColor(data.type)}${C.reset}`);
  });
  console.log();
  
  console.log(yellow('  MEDIUM IMPACT (6-7) - Strong contribution'));
  midImpact.sort((a, b) => b[1].impact - a[1].impact).forEach(([agent, data]) => {
    const impactBar = '█'.repeat(data.impact) + '░'.repeat(10 - data.impact);
    const typeColor = data.type === 'fight' ? red : data.type === 'utility' ? cyan : green;
    console.log(`  ${agent.padEnd(12)} [${impactBar}] ${data.impact}/10  ${typeColor(data.type)}${C.reset}`);
  });
  console.log();
  
  console.log(yellow('  LOWER IMPACT (4-5) - Useful but not decisive'));
  lowImpact.sort((a, b) => b[1].impact - a[1].impact).forEach(([agent, data]) => {
    const impactBar = '█'.repeat(data.impact) + '░'.repeat(10 - data.impact);
    const typeColor = data.type === 'fight' ? red : data.type === 'utility' ? cyan : green;
    console.log(`  ${agent.padEnd(12)} [${impactBar}] ${data.impact}/10  ${typeColor(data.type)}${C.reset}`);
  });
  console.log();
  
  console.log(dim('  Types: ') + red('fight') + dim(' (damage), ') + cyan('utility') + dim(' (info/control), ') + green('save') + dim(' (recovery)'));
  console.log();
  
  console.log(yellow('  💡 BETTING INSIGHT'));
  console.log('  When a team has 3+ high-impact ults ready, expect a strong round.');
  console.log('  Sage Resurrection alone can change a round from 4v5 to 5v5.');
  console.log();
}

function showMapSides(): void {
  console.log();
  console.log(cyan(bold(`  🗺️  MAP SIDE WIN RATES`)));
  console.log();
  
  console.log(yellow('  DEFENSE-SIDED MAPS'));
  Object.entries(MAP_SIDE_ADVANTAGE)
    .filter(([_, v]) => v.defenseWR > 0.51)
    .sort((a, b) => b[1].defenseWR - a[1].defenseWR)
    .forEach(([map, data]) => {
      const defAdv = ((data.defenseWR - 0.5) * 100).toFixed(1);
      console.log(`  ${map.padEnd(10)} ATK: ${(data.attackWR * 100).toFixed(0)}%  DEF: ${green((data.defenseWR * 100).toFixed(0))}% (+${defAdv}%)`);
    });
  console.log();
  
  console.log(yellow('  ATTACK-SIDED MAPS'));
  Object.entries(MAP_SIDE_ADVANTAGE)
    .filter(([_, v]) => v.attackWR > 0.51)
    .sort((a, b) => b[1].attackWR - a[1].attackWR)
    .forEach(([map, data]) => {
      const atkAdv = ((data.attackWR - 0.5) * 100).toFixed(1);
      console.log(`  ${map.padEnd(10)} ATK: ${green((data.attackWR * 100).toFixed(0))}% (+${atkAdv}%)  DEF: ${(data.defenseWR * 100).toFixed(0)}%`);
    });
  console.log();
  
  console.log(yellow('  BALANCED MAPS'));
  Object.entries(MAP_SIDE_ADVANTAGE)
    .filter(([_, v]) => Math.abs(v.attackWR - 0.5) <= 0.01)
    .forEach(([map, data]) => {
      console.log(`  ${map.padEnd(10)} ATK: ${(data.attackWR * 100).toFixed(0)}%  DEF: ${(data.defenseWR * 100).toFixed(0)}%  (Even)`);
    });
  console.log();
  
  console.log(yellow('  💡 BETTING INSIGHT'));
  console.log('  On Split: Start CT? Need 8+ rounds to be comfortable.');
  console.log('  On Fracture: Start T? Need 7+ rounds to be comfortable.');
  console.log('  Half-time score matters more on heavily-sided maps.');
  console.log();
}

function showRoundAnalysis(mapName: string, side: 'attack' | 'defense'): void {
  const mapData = MAP_SIDE_ADVANTAGE[mapName];
  if (!mapData) {
    console.log(red(`  Map "${mapName}" not found.`));
    return;
  }
  
  console.log();
  console.log(cyan(bold(`  🎯 ROUND ANALYSIS: ${mapName} - ${side.toUpperCase()}`)));
  console.log();
  
  const sideWR = side === 'attack' ? mapData.attackWR : mapData.defenseWR;
  const advantage = sideWR - 0.5;
  
  console.log(yellow('  BASE ROUND WIN PROBABILITY'));
  const probBar = '█'.repeat(Math.round(sideWR * 20)) + '░'.repeat(20 - Math.round(sideWR * 20));
  const sideWRStr = (sideWR * 100).toFixed(1) + '%';
  console.log(`  ${side.toUpperCase()}: [${probBar}] ${sideWR > 0.52 ? green(sideWRStr) : sideWR < 0.48 ? red(sideWRStr) : sideWRStr}`);
  console.log();
  
  // Economy impact on this
  console.log(yellow('  WITH ECONOMY FACTORS'));
  
  const scenarios = [
    { label: 'Full vs Full', t1: 'full' as const, t2: 'full' as const },
    { label: 'Full vs Eco', t1: 'full' as const, t2: 'eco' as const },
    { label: 'Eco vs Full', t1: 'eco' as const, t2: 'full' as const },
    { label: 'Force vs Force', t1: 'force' as const, t2: 'force' as const },
  ];
  
  scenarios.forEach(s => {
    const econProb = liveStrategy.calculateEconomyAdvantage(s.t1, s.t2);
    // Combine side advantage with econ
    const combinedProb = (sideWR * 0.4) + (econProb * 0.6);
    const probStr = (combinedProb * 100).toFixed(0) + '%';
    const coloredProbStr = combinedProb > 0.6 ? green(probStr) : combinedProb < 0.4 ? red(probStr) : probStr;
    console.log(`  ${s.label.padEnd(15)} → Team 1: ${coloredProbStr}`);
  });
  console.log();
}

function showSimulatedSignals(
  mapName: string, 
  team1Score: number, 
  team2Score: number,
  team1Econ: 'full' | 'force' | 'eco' | 'bonus',
  team2Econ: 'full' | 'force' | 'eco' | 'bonus'
): void {
  const mapData = MAP_SIDE_ADVANTAGE[mapName];
  if (!mapData) {
    console.log(red(`  Map "${mapName}" not found.`));
    console.log(dim(`  Available: ${Object.keys(MAP_SIDE_ADVANTAGE).join(', ')}`));
    return;
  }
  
  const currentRound = team1Score + team2Score + 1;
  const isSecondHalf = currentRound > 12;
  const team1Side = isSecondHalf ? 'defense' : 'attack';
  
  // Build match state
  const state: LiveMatchState = {
    map: mapName,
    team1Score,
    team2Score,
    currentRound,
    side: isSecondHalf ? 'second' : 'first',
    team1Side: team1Side as 'attack' | 'defense',
    team2Side: team1Side === 'attack' ? 'defense' : 'attack',
    momentum: {
      team1Streak: 0,
      team2Streak: 0,
      team1Timeouts: 2,
      team2Timeouts: 2,
      lastThrillerWin: null,
      pistolWinner: null,
      halfScore: null,
    },
    economy: {
      team1Credits: team1Econ === 'full' ? 5000 : team1Econ === 'eco' ? 2000 : 3500,
      team2Credits: team2Econ === 'full' ? 5000 : team2Econ === 'eco' ? 2000 : 3500,
      team1BuyType: team1Econ,
      team2BuyType: team2Econ,
      team1LossStreak: team1Econ === 'eco' ? 1 : 0,
      team2LossStreak: team2Econ === 'eco' ? 1 : 0,
    },
    ultimates: {
      team1Ults: [],
      team2Ults: [],
      team1KeyUltsReady: 0,
      team2KeyUltsReady: 0,
    },
  };
  
  console.log();
  console.log(cyan(bold(`  🎮 SIMULATED MATCH SIGNALS`)));
  console.log();
  
  // Match state summary
  console.log(yellow('  MATCH STATE'));
  console.log(`  Map: ${cyan(mapName)}  Score: ${bold(`${team1Score} - ${team2Score}`)}  Round ${currentRound}`);
  console.log(`  Team 1: ${team1Side.toUpperCase()} | ${team1Econ.toUpperCase()} buy`);
  console.log(`  Team 2: ${(team1Side === 'attack' ? 'defense' : 'attack').toUpperCase()} | ${team2Econ.toUpperCase()} buy`);
  console.log();
  
  // Calculate round probability
  const roundProb = calculateRoundWinProbability(state, 0.5);
  const roundBar = '█'.repeat(Math.round(roundProb * 20)) + '░'.repeat(20 - Math.round(roundProb * 20));
  
  console.log(yellow('  ROUND WIN PROBABILITY'));
  console.log(`  Team 1: [${roundBar}] ${roundProb > 0.6 ? green((roundProb * 100).toFixed(0) + '%') : roundProb < 0.4 ? red((roundProb * 100).toFixed(0) + '%') : (roundProb * 100).toFixed(0) + '%'}`);
  console.log();
  
  // Map win probability
  const mapResult = calculateLiveMapWinProbability(state, 0.5);
  const mapBar = '█'.repeat(Math.round(mapResult.probability * 20)) + '░'.repeat(20 - Math.round(mapResult.probability * 20));
  
  console.log(yellow('  MAP WIN PROBABILITY'));
  console.log(`  Team 1: [${mapBar}] ${mapResult.probability > 0.6 ? green((mapResult.probability * 100).toFixed(0) + '%') : mapResult.probability < 0.4 ? red((mapResult.probability * 100).toFixed(0) + '%') : (mapResult.probability * 100).toFixed(0) + '%'}`);
  console.log(`  Expected final: ${mapResult.expectedScore}`);
  console.log();
  
  // Generate signals
  const signals = generateLiveSignals(state);
  
  if (signals.length > 0) {
    console.log(yellow('  📡 BETTING SIGNALS'));
    console.log();
    
    signals.forEach(signal => {
      const actionColor = signal.suggestedAction === 'BET' ? green : 
                          signal.suggestedAction === 'HEDGE' ? yellow : dim;
      const teamStr = signal.team === 'team1' ? 'Team 1' : 'Team 2';
      const edgeStr = signal.expectedEdge >= 0 ? `+${(signal.expectedEdge * 100).toFixed(1)}%` : `${(signal.expectedEdge * 100).toFixed(1)}%`;
      
      console.log(`  ${actionColor(bold(signal.suggestedAction))} ${cyan(signal.type)}`);
      console.log(`    → Favor: ${bold(teamStr)} | Confidence: ${(signal.confidence * 100).toFixed(0)}% | Edge: ${green(edgeStr)}`);
      console.log(`    💡 ${signal.reason}`);
      console.log();
    });
  } else {
    console.log(dim('  No strong signals detected for this state.'));
    console.log(dim('  Try adjusting economy (e.g., "sim Split 8 5 full eco")'));
    console.log();
  }
  
  // Betting recommendation
  console.log(yellow('  💰 TRADE RECOMMENDATION'));
  const bestSignal = signals.find(s => s.suggestedAction === 'BET' && s.confidence >= 0.6);
  
  if (bestSignal) {
    const teamName = bestSignal.team === 'team1' ? 'Team 1' : 'Team 2';
    console.log(green(`  ✅ BET ${teamName}`));
    console.log(`     Edge: ${green((bestSignal.expectedEdge * 100).toFixed(1) + '%')}`);
    console.log(`     Reason: ${bestSignal.reason}`);
    console.log(`     Suggested: 1-2% of bankroll (Kelly fraction)`);
  } else if (signals.some(s => s.suggestedAction === 'HEDGE')) {
    console.log(yellow('  ⚠️ HEDGE OR REDUCE EXPOSURE'));
    console.log(dim('     High variance state detected'));
  } else {
    console.log(dim('  ⏳ NO CLEAR EDGE - WAIT'));
    console.log(dim('     Economy or momentum shift needed'));
  }
  console.log();
}

// ============================================================================
// Valorant Analysis Functions
// ============================================================================

async function listValorantMatches(): Promise<void> {
  console.log(dim('  Fetching upcoming VCT matches...'));
  
  try {
    const allMatches = await vlrScraper.fetchUpcomingMatches();
    
    // Filter for VCT/Challengers (top tiers)
    cachedMatches = allMatches.filter(m => 
      m.tournamentTier === 'S' || 
      m.tournamentTier === 'A' || 
      m.tournamentTier === 'B'
    ).slice(0, 15);
    
    console.log();
    console.log(yellow(bold('  🎮 UPCOMING VALORANT MATCHES')));
    console.log();
    
    if (cachedMatches.length === 0) {
      console.log(dim('  No upcoming matches found'));
      return;
    }
    
    console.log(dim('  #   Match                                    Tournament                    Time'));
    console.log(dim('  ─'.repeat(45)));
    
    cachedMatches.forEach((m, i) => {
      const matchup = `${m.team1.name} vs ${m.team2.name}`;
      const matchupStr = matchup.length > 38 ? matchup.slice(0, 35) + '...' : matchup.padEnd(38);
      const tourneyStr = m.tournament.length > 28 ? m.tournament.slice(0, 25) + '...' : m.tournament.padEnd(28);
      const timeStr = m.scheduledTime.toLocaleString('en-US', { 
        weekday: 'short', hour: 'numeric', minute: '2-digit' 
      });
      const tierColor = m.tournamentTier === 'S' ? yellow : m.tournamentTier === 'A' ? cyan : dim;
      
      console.log(`  ${(i + 1).toString().padStart(2)}  ${tierColor(matchupStr)}  ${tourneyStr}  ${timeStr}`);
    });
    
    console.log();
    console.log(dim(`  Use ${cyan("'analyze <#>'")} for deep analysis, ${cyan("'signal <#>'")} for trade recommendation`));
    
  } catch (e: any) {
    console.log(red(`  Error fetching matches: ${e.message}`));
  }
}

function createPlaceholderTeam(name: string, id: string, slug: string): VLRTeamFull {
  return {
    id,
    name,
    slug,
    region: 'Unknown',
    rating: 1500,
    ranking: 0,
    record: { wins: 0, losses: 0 },
    roster: [],
    mapStats: ACTIVE_MAP_POOL.map(map => ({
      map,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0.5,
      attackRounds: { won: 0, lost: 0 },
      defenseRounds: { won: 0, lost: 0 },
      attackWinRate: 0.5,
      defenseWinRate: 0.5,
      recentForm: [],
    })),
    recentMatches: [],
    lastUpdated: new Date(),
  };
}

async function analyzeValorantMatch(matchIndex: number): Promise<SeriesAnalysis | null> {
  if (cachedMatches.length === 0) {
    console.log(dim('  Loading matches first...'));
    await listValorantMatches();
  }
  
  const match = cachedMatches[matchIndex - 1];
  if (!match) {
    console.log(red(`  Match #${matchIndex} not found. Use 'matches' to see list.`));
    return null;
  }
  
  console.log();
  console.log(bold(`  🔍 ANALYZING: ${match.team1.name} vs ${match.team2.name}`));
  console.log(dim(`  ${match.tournament} | ${match.matchType} | ${match.scheduledTime.toLocaleString()}`));
  console.log();
  
  // Fetch team stats
  let team1Stats: VLRTeamFull;
  let team2Stats: VLRTeamFull;
  
  try {
    console.log(dim(`  Fetching ${match.team1.name} stats...`));
    const cached1 = database.getCachedTeamStats(match.team1.id);
    if (cached1) {
      team1Stats = cached1;
      console.log(dim(`    ↳ Using cached data`));
    } else {
      team1Stats = await vlrScraper.fetchTeamStats(match.team1.id, match.team1.slug);
      database.cacheTeamStats(team1Stats);
    }
    
    console.log(dim(`  Fetching ${match.team2.name} stats...`));
    const cached2 = database.getCachedTeamStats(match.team2.id);
    if (cached2) {
      team2Stats = cached2;
      console.log(dim(`    ↳ Using cached data`));
    } else {
      team2Stats = await vlrScraper.fetchTeamStats(match.team2.id, match.team2.slug);
      database.cacheTeamStats(team2Stats);
    }
  } catch (e: any) {
    console.log(yellow(`  Could not fetch full team stats, using placeholders`));
    team1Stats = createPlaceholderTeam(match.team1.name, match.team1.id, match.team1.slug);
    team2Stats = createPlaceholderTeam(match.team2.name, match.team2.id, match.team2.slug);
  }
  
  // Run analysis
  console.log(dim('  Running map analysis...'));
  const analysis = mapAnalyzer.analyzeMatch(team1Stats, team2Stats, match.matchType);
  lastAnalysis = analysis;
  
  // Display map pool
  console.log();
  console.log(cyan(bold('  📊 MAP POOL ANALYSIS')));
  console.log();
  console.log(dim(`  Map          ${team1Stats.name.slice(0, 12).padEnd(14)} ${team2Stats.name.slice(0, 12).padEnd(14)} H2H Prob   Conf`));
  console.log(dim('  ─'.repeat(35)));
  
  analysis.mapAnalysis.forEach(m => {
    const t1WR = `${(m.team1WinRate * 100).toFixed(0)}%`;
    const t2WR = `${(m.team2WinRate * 100).toFixed(0)}%`;
    const h2h = m.headToHeadProb * 100;
    const h2hStr = h2h >= 55 ? green(`${h2h.toFixed(0)}%`) : h2h <= 45 ? red(`${h2h.toFixed(0)}%`) : `${h2h.toFixed(0)}%`;
    const confStr = `${(m.confidence * 100).toFixed(0)}%`;
    
    console.log(`  ${m.map.padEnd(12)} ${t1WR.padEnd(14)} ${t2WR.padEnd(14)} ${h2hStr.padStart(8)}   ${confStr}`);
  });
  
  // Predicted map sequence
  console.log();
  console.log(cyan(bold('  🗺️  PREDICTED MAP SEQUENCE')));
  console.log();
  console.log(`  ${team1Stats.name} pick: ${cyan(analysis.mapPicks.team1Pick)} (${(analysis.mapPicks.team1PickConfidence * 100).toFixed(0)}% conf)`);
  console.log(`  ${team2Stats.name} pick: ${yellow(analysis.mapPicks.team2Pick)} (${(analysis.mapPicks.team2PickConfidence * 100).toFixed(0)}% conf)`);
  console.log(`  Decider pool: ${analysis.mapPicks.deciderMaps.join(', ')}`);
  
  // Series probability
  console.log();
  console.log(cyan(bold('  🎯 SERIES WIN PROBABILITY')));
  console.log();
  
  const t1Pct = analysis.seriesWinProb.team1 * 100;
  const t2Pct = analysis.seriesWinProb.team2 * 100;
  const barWidth = 30;
  const t1Bar = Math.round((t1Pct / 100) * barWidth);
  const t2Bar = barWidth - t1Bar;
  
  console.log(`  ${team1Stats.name}: ${t1Pct >= 50 ? green(t1Pct.toFixed(1) + '%') : dim(t1Pct.toFixed(1) + '%')}`);
  console.log(`  ${team2Stats.name}: ${t2Pct >= 50 ? green(t2Pct.toFixed(1) + '%') : dim(t2Pct.toFixed(1) + '%')}`);
  console.log(`  [${'█'.repeat(t1Bar)}${'░'.repeat(t2Bar)}]`);
  console.log(dim(`  Confidence: ${(analysis.seriesWinProb.confidence * 100).toFixed(0)}%`));
  
  // Warnings
  if (analysis.warnings.length > 0) {
    console.log();
    console.log(yellow(bold('  ⚠️  WARNINGS')));
    console.log();
    analysis.warnings.forEach(w => {
      const icon = w.severity === 'high' ? '🔴' : w.severity === 'medium' ? '🟡' : '🟢';
      console.log(`  ${icon} ${w.message}`);
    });
  }
  
  console.log();
  console.log(dim(`  Use ${cyan(`'signal ${matchIndex}'`)} to get trade recommendation`));
  
  return analysis;
}

async function getTradeSignal(matchIndex: number): Promise<TradeSignal | null> {
  // First run analysis if needed
  if (!lastAnalysis || cachedMatches[matchIndex - 1]?.team1.name !== lastAnalysis.team1.name) {
    await analyzeValorantMatch(matchIndex);
  }
  
  if (!lastAnalysis) {
    return null;
  }
  
  const match = cachedMatches[matchIndex - 1];
  if (!match) {
    console.log(red(`  Match #${matchIndex} not found`));
    return null;
  }
  
  // Check for Kalshi market
  console.log();
  console.log(cyan(bold('  🔍 CHECKING KALSHI MARKETS')));
  console.log();
  
  try {
    const markets = await client.searchMarkets('valorant');
    const relevantMarket = markets.markets?.find((m: any) =>
      m.title?.toLowerCase().includes(lastAnalysis!.team1.name.toLowerCase()) &&
      m.title?.toLowerCase().includes(lastAnalysis!.team2.name.toLowerCase())
    );
    
    let mockMarket = {
      ticker: 'NO-MARKET',
      title: `${lastAnalysis.team1.name} vs ${lastAnalysis.team2.name}`,
      team1: lastAnalysis.team1.name,
      team2: lastAnalysis.team2.name,
      tournament: match.tournament,
      yesPrice: 50,
      noPrice: 50,
      yesAsk: 52,
      yesBid: 48,
      noAsk: 52,
      noBid: 48,
      volume: 0,
      openInterest: 0,
      expirationTime: match.scheduledTime,
      status: 'active' as const,
    };
    
    if (relevantMarket) {
      console.log(green(`  ✓ Found market: ${relevantMarket.ticker}`));
      mockMarket = {
        ...mockMarket,
        ticker: relevantMarket.ticker,
        yesPrice: relevantMarket.yes_bid || 50,
        yesBid: relevantMarket.yes_bid || 48,
        yesAsk: relevantMarket.yes_ask || 52,
      };
    } else {
      console.log(yellow('  ⚠️  No Kalshi market found for this match'));
      console.log(dim('  Using simulated prices for signal calculation'));
    }
    
    // Generate signal
    const signal = generateTradeSignal(lastAnalysis, mockMarket, DEFAULT_TRADING_CONFIG);
    lastSignal = signal;
    
    // Display signal
    console.log();
    console.log(bold('  💹 TRADE SIGNAL'));
    console.log();
    
    let recColor = yellow;
    let recText = 'NO EDGE - SKIP';
    
    if (signal.recommendation === 'BET_TEAM1') {
      recColor = green;
      recText = `BET ${lastAnalysis.team1.name.toUpperCase()} YES`;
    } else if (signal.recommendation === 'BET_TEAM2') {
      recColor = green;
      recText = `BET ${lastAnalysis.team2.name.toUpperCase()} YES`;
    } else if (signal.recommendation === 'SKIP') {
      recColor = red;
      recText = 'SKIP - INSUFFICIENT EDGE';
    }
    
    console.log(`  Recommendation: ${recColor(bold(recText))}`);
    console.log();
    console.log(`  Model probability:  ${(signal.modelProbability * 100).toFixed(1)}%`);
    console.log(`  Market implied:     ${(signal.impliedProbability * 100).toFixed(1)}%`);
    console.log(`  Edge:               ${signal.edge >= 0.05 ? green((signal.edge * 100).toFixed(1) + '%') : yellow((signal.edge * 100).toFixed(1) + '%')}`);
    console.log(`  Confidence:         ${(signal.confidence * 100).toFixed(1)}%`);
    console.log();
    
    if (signal.suggestedStake > 0) {
      console.log(bold(`  💰 Suggested stake: $${signal.suggestedStake.toFixed(2)}`));
      console.log();
    }
    
    console.log(dim('  Reasoning:'));
    signal.reasoning.forEach(r => console.log(dim(`    • ${r}`)));
    
    if (relevantMarket && signal.recommendation !== 'NO_EDGE' && signal.recommendation !== 'SKIP') {
      console.log();
      console.log(`  To execute: ${yellow(`buy ${relevantMarket.ticker} ${Math.floor(signal.suggestedStake * 100 / mockMarket.yesAsk)} ${mockMarket.yesAsk}`)}`);
    }
    
    return signal;
    
  } catch (e: any) {
    console.log(red(`  Error: ${e.message}`));
    return null;
  }
}

async function handleCommand(input: string) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);
  
  switch (cmd) {
    case 'p':
    case 'positions': {
      console.log(dim('  Fetching positions...'));
      const positions = await fetchEnrichedPositions();
      printPositions(positions);
      break;
    }
    
    case 'o':
    case 'orders': {
      console.log(dim('  Fetching orders...'));
      const orders = await client.getOrders();
      lastOrders = orders;
      printOrders(orders);
      break;
    }
    
    case 'b':
    case 'balance': {
      cachedBalance = await client.getBalance();
      printBalance();
      break;
    }
    
    case 'search': {
      const query = args.join(' ');
      if (!query) {
        console.log(red('  Usage: search <query>'));
        break;
      }
      console.log(dim(`  Searching for "${query}"...`));
      lastSearchResults = await searchMarkets(query);
      printMarkets(lastSearchResults, `RESULTS FOR "${query.toUpperCase()}"`);
      break;
    }
    
    case 'nba': {
      console.log(dim('  Fetching NBA markets...'));
      lastSearchResults = await searchMarkets('NBA winner');
      printMarkets(lastSearchResults, 'NBA GAMES');
      break;
    }
    
    case 'tennis':
    case 'atp': {
      console.log(dim('  Fetching ATP tennis markets...'));
      lastSearchResults = await searchMarkets('ATP tennis');
      printMarkets(lastSearchResults, 'ATP TENNIS');
      break;
    }
    
    // ========== VALORANT COMMANDS ==========
    
    case 'm':
    case 'matches':
    case 'valorant':
    case 'vct': {
      await listValorantMatches();
      break;
    }
    
    case 'a':
    case 'analyze': {
      const idx = parseInt(args[0] || '');
      if (isNaN(idx)) {
        console.log(red('  Usage: analyze <match #>'));
        console.log(dim('  Run "matches" first to see the list'));
        break;
      }
      await analyzeValorantMatch(idx);
      break;
    }
    
    case 's':
    case 'signal': {
      const idx = parseInt(args[0] || '');
      if (isNaN(idx)) {
        console.log(red('  Usage: signal <match #>'));
        console.log(dim('  Run "matches" first to see the list'));
        break;
      }
      await getTradeSignal(idx);
      break;
    }
    
    case 'agents': {
      showAllAgents();
      break;
    }
    
    case 'agent': {
      const name = args.join(' ');
      if (!name) {
        console.log(red('  Usage: agent <name>'));
        console.log(dim('  Example: agent Jett'));
        break;
      }
      showAgentDetails(name);
      break;
    }
    
    case 'map': {
      const name = args.join(' ');
      if (!name) {
        console.log(red('  Usage: map <name>'));
        console.log(dim('  Example: map Ascent'));
        break;
      }
      showMapMeta(name);
      break;
    }
    
    case 'c':
    case 'comp':
    case 'comps': {
      const idx = parseInt(args[0] || '');
      if (isNaN(idx)) {
        console.log(red('  Usage: comps <match #>'));
        console.log(dim('  Run "matches" first to see the list'));
        console.log(dim('  Shows live team compositions from VLR.gg'));
        break;
      }
      await showLiveComps(idx);
      break;
    }
    
    // ========== LIVE BETTING STRATEGY COMMANDS ==========
    
    case 'live': {
      // live <map> <team1score> <team2score>
      const [mapArg, t1Arg, t2Arg] = args;
      if (!mapArg || !t1Arg || !t2Arg) {
        console.log(red('  Usage: live <map> <team1score> <team2score>'));
        console.log(dim('  Example: live Split 8 5'));
        break;
      }
      const mapName = mapArg.charAt(0).toUpperCase() + mapArg.slice(1).toLowerCase();
      const t1Score = parseInt(t1Arg);
      const t2Score = parseInt(t2Arg);
      
      if (isNaN(t1Score) || isNaN(t2Score)) {
        console.log(red('  Invalid scores'));
        break;
      }
      
      showLiveAnalysis(mapName, t1Score, t2Score);
      break;
    }
    
    case 'econ': {
      // econ <team1buy> <team2buy>
      const [buy1, buy2] = args;
      const validBuys = ['full', 'force', 'eco', 'bonus'];
      
      if (!buy1 || !buy2 || !validBuys.includes(buy1) || !validBuys.includes(buy2)) {
        console.log(red('  Usage: econ <buy1> <buy2>'));
        console.log(dim('  Options: full, force, eco, bonus'));
        console.log(dim('  Example: econ full eco'));
        break;
      }
      
      showEconAnalysis(buy1 as any, buy2 as any);
      break;
    }
    
    case 'ults': {
      showUltImpacts();
      break;
    }
    
    case 'sides': {
      showMapSides();
      break;
    }
    
    case 'round': {
      // round <map> <side>
      const [mapArg, sideArg] = args;
      if (!mapArg || !sideArg) {
        console.log(red('  Usage: round <map> <side>'));
        console.log(dim('  Example: round Split attack'));
        break;
      }
      const mapName = mapArg.charAt(0).toUpperCase() + mapArg.slice(1).toLowerCase();
      const side = sideArg.toLowerCase() as 'attack' | 'defense';
      
      if (side !== 'attack' && side !== 'defense') {
        console.log(red('  Side must be "attack" or "defense"'));
        break;
      }
      
      showRoundAnalysis(mapName, side);
      break;
    }
    
    case 'sim':
    case 'simulate': {
      // sim <map> <t1score> <t2score> <t1econ> <t2econ>
      const [mapArg, t1Arg, t2Arg, e1Arg, e2Arg] = args;
      if (!mapArg || !t1Arg || !t2Arg) {
        console.log(red('  Usage: sim <map> <t1> <t2> [t1econ] [t2econ]'));
        console.log(dim('  Example: sim Split 8 5 full eco'));
        console.log(dim('  Economy options: full, force, eco, bonus'));
        break;
      }
      
      const mapName = mapArg.charAt(0).toUpperCase() + mapArg.slice(1).toLowerCase();
      const t1Score = parseInt(t1Arg);
      const t2Score = parseInt(t2Arg);
      const t1Econ = (e1Arg || 'full') as 'full' | 'force' | 'eco' | 'bonus';
      const t2Econ = (e2Arg || 'full') as 'full' | 'force' | 'eco' | 'bonus';
      
      if (isNaN(t1Score) || isNaN(t2Score)) {
        console.log(red('  Invalid scores'));
        break;
      }
      
      showSimulatedSignals(mapName, t1Score, t2Score, t1Econ, t2Econ);
      break;
    }
    
    case 'watch':
    case 'dashboard':
    case 'live': {
      if (args.length === 0) {
        // Launch live dashboard
        console.log();
        console.log(cyan('  Launching live dashboard...'));
        console.log(dim('  This will open in a new process. Press Ctrl+C to return.'));
        console.log();
        
        // Import and run dashboard
        const { spawn } = await import('child_process');
        const dashboard = spawn('bun', ['run', 'src/kalshi/valorant/live-dashboard.ts'], {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
        
        await new Promise<void>((resolve) => {
          dashboard.on('close', () => resolve());
        });
        break;
      }
      // If args provided, handle as live <map> <t1> <t2>
      const [mapArg2, t1Arg, t2Arg] = args;
      if (mapArg2 && t1Arg && t2Arg) {
        const mapName2 = mapArg2.charAt(0).toUpperCase() + mapArg2.slice(1).toLowerCase();
        const t1Score = parseInt(t1Arg);
        const t2Score = parseInt(t2Arg);
        if (!isNaN(t1Score) && !isNaN(t2Score)) {
          showLiveAnalysis(mapName2, t1Score, t2Score);
        }
      }
      break;
    }
    
    // ========== END VALORANT COMMANDS ==========
    
    case 'buy': {
      const [ticker, qtyStr, priceStr] = args;
      if (!ticker || !qtyStr) {
        console.log(red('  Usage: buy <ticker> <qty> [price]'));
        console.log(dim('  Example: buy KXNBAGAME-24JAN19-TOR 10 55'));
        break;
      }
      // Allow using # from last search
      let resolvedTicker = ticker;
      if (ticker.startsWith('#')) {
        const idx = parseInt(ticker.slice(1)) - 1;
        if (lastSearchResults[idx]) {
          resolvedTicker = lastSearchResults[idx].ticker;
        }
      }
      await executeBuy(resolvedTicker, parseInt(qtyStr), priceStr ? parseInt(priceStr) : undefined);
      break;
    }
    
    case 'buyno': {
      const [ticker, qtyStr, priceStr] = args;
      if (!ticker || !qtyStr) {
        console.log(red('  Usage: buyno <ticker> <qty> [price]'));
        break;
      }
      let resolvedTicker = ticker;
      if (ticker.startsWith('#')) {
        const idx = parseInt(ticker.slice(1)) - 1;
        if (lastSearchResults[idx]) {
          resolvedTicker = lastSearchResults[idx].ticker;
        }
      }
      await executeBuy(resolvedTicker, parseInt(qtyStr), priceStr ? parseInt(priceStr) : undefined, 'no');
      break;
    }
    
    case 'close': {
      const idx = parseInt(args[0] || '');
      if (isNaN(idx)) {
        console.log(red('  Usage: close <position #>'));
        break;
      }
      await executeClose(idx);
      break;
    }
    
    case 'cancel': {
      if (args[0] === 'all') {
        console.log(dim('  Cancelling all orders...'));
        await client.cancelAllOrders();
        console.log(green('  ✓ All orders cancelled'));
        break;
      }
      const idx = parseInt(args[0] || '');
      if (isNaN(idx)) {
        console.log(red('  Usage: cancel <order #> or cancel all'));
        break;
      }
      await cancelOrder(idx, lastOrders);
      break;
    }
    
    case 'r':
    case 'refresh': {
      console.log(dim('  Refreshing...'));
      cachedBalance = await client.getBalance();
      const positions = await fetchEnrichedPositions();
      printBalance();
      printPositions(positions);
      break;
    }
    
    case 'c':
    case 'clear': {
      clearScreen();
      printHeader();
      break;
    }
    
    case 'h':
    case 'help':
    case '?': {
      printHelp();
      break;
    }
    
    case 'q':
    case 'quit':
    case 'exit': {
      console.log();
      console.log(dim('  Goodbye! 👋'));
      process.exit(0);
    }
    
    case '': {
      // Empty input, do nothing
      break;
    }
    
    default: {
      console.log(red(`  Unknown command: ${cmd}`));
      console.log(dim(`  Type 'help' for available commands`));
    }
  }
}

async function main() {
  clearScreen();
  printHeader();
  
  // Initial data load
  console.log(dim('  Loading account data...'));
  
  try {
    cachedBalance = await client.getBalance();
    const positions = await fetchEnrichedPositions();
    
    printBalance();
    printPositions(positions);
  } catch (e: any) {
    console.log(red(`  Error loading data: ${e.message}`));
  }
  
  console.log();
  console.log(dim(`  Type ${green("'help'")} for commands, ${green("'quit'")} to exit`));
  console.log();
  
  // Start REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const prompt = () => {
    rl.question(cyan('  kalshi> '), async (input) => {
      try {
        await handleCommand(input);
      } catch (e: any) {
        console.log(red(`  Error: ${e.message}`));
      }
      console.log();
      prompt();
    });
  };
  
  prompt();
}

main();
