#!/usr/bin/env bun
/**
 * Valorant Trading Bot CLI
 * 
 * Interactive command-line interface for:
 * - Viewing upcoming matches
 * - Analyzing matchups
 * - Generating trade signals
 * - Executing trades (manual or auto)
 * - Viewing performance stats
 */

import { vlrScraper } from './vlr-scraper';
import { mapAnalyzer } from './map-analyzer';
import { generateTradeSignal, TradeExecutor } from './trade-executor';
import { createPublicClient } from './kalshi-client';
import { database } from './database';
import { 
  VLRMatch, 
  VLRTeamFull, 
  TradingConfig, 
  DEFAULT_TRADING_CONFIG,
  SeriesAnalysis,
  TradeSignal,
  ACTIVE_MAP_POOL
} from './types';

// ============================================================================
// CLI Formatting Utilities
// ============================================================================

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
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function c(text: string, ...colors: string[]): string {
  return colors.join('') + text + COLORS.reset;
}

function printHeader(title: string): void {
  const line = '═'.repeat(60);
  console.log(c(line, COLORS.dim));
  console.log(c(` ${title}`, COLORS.bold, COLORS.cyan));
  console.log(c(line, COLORS.dim));
}

function printSubHeader(title: string): void {
  console.log();
  console.log(c(`▸ ${title}`, COLORS.bold));
  console.log(c('─'.repeat(40), COLORS.dim));
}

function printTable(headers: string[], rows: string[][], colWidths?: number[]): void {
  const widths = colWidths || headers.map((h, i) => 
    Math.max(h.length, ...rows.map(r => (r[i] || '').length)) + 2
  );
  
  // Header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join('');
  console.log(c(headerRow, COLORS.dim));
  console.log(c('─'.repeat(widths.reduce((a, b) => a + b, 0)), COLORS.dim));
  
  // Rows
  rows.forEach(row => {
    const formattedRow = row.map((cell, i) => (cell || '').padEnd(widths[i])).join('');
    console.log(formattedRow);
  });
}

function formatPercent(value: number, colorize: boolean = false): string {
  const pct = (value * 100).toFixed(1) + '%';
  if (!colorize) return pct;
  if (value >= 0.6) return c(pct, COLORS.green);
  if (value <= 0.4) return c(pct, COLORS.red);
  return c(pct, COLORS.yellow);
}

function formatPrice(cents: number): string {
  return `${cents}¢`;
}

// ============================================================================
// Commands
// ============================================================================

async function listMatches(): Promise<void> {
  printHeader('UPCOMING VALORANT MATCHES');
  
  try {
    const matches = await vlrScraper.fetchUpcomingMatches();
    
    // Filter for tradeable matches (VCT + Challengers + all tiers for now)
    // Kalshi may have markets for various tournament tiers
    const tradableMatches = matches.filter(m => 
      m.tournamentTier === 'S' || 
      m.tournamentTier === 'A' || 
      m.tournamentTier === 'B' ||
      m.tournamentTier === 'C' // Include all for discovery
    ).slice(0, 20);
    
    if (tradableMatches.length === 0) {
      console.log(c('No upcoming matches found', COLORS.yellow));
      return;
    }
    
    // Group by date
    const matchesByDate = new Map<string, typeof tradableMatches>();
    for (const m of tradableMatches) {
      const dateKey = m.scheduledTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!matchesByDate.has(dateKey)) {
        matchesByDate.set(dateKey, []);
      }
      matchesByDate.get(dateKey)!.push(m);
    }
    
    let globalIndex = 0;
    for (const [date, dateMatches] of matchesByDate) {
      console.log();
      console.log(c(`  📅 ${date}`, COLORS.bold, COLORS.cyan));
      
      const rows = dateMatches.map((m) => {
        globalIndex++;
        const tierColor = m.tournamentTier === 'S' ? COLORS.yellow : 
                          m.tournamentTier === 'A' ? COLORS.cyan :
                          m.tournamentTier === 'B' ? COLORS.green : COLORS.dim;
        const tierStr = c(`[${m.tournamentTier}]`, tierColor);
        
        return [
          globalIndex.toString(),
          `${m.team1.name} vs ${m.team2.name}`,
          m.tournament.substring(0, 30),
          tierStr,
          m.scheduledTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        ];
      });
      
      printTable(['#', 'Match', 'Tournament', 'Tier', 'Time'], rows, [4, 40, 32, 8, 12]);
    }
    
    console.log();
    console.log(c('Use: bun run valorant analyze <match#>', COLORS.dim));
    console.log(c('Tier legend: [S]=VCT Masters/Champions, [A]=VCT Kickoff, [B]=Challengers, [C]=Other', COLORS.dim));
    
    // Store matches for later reference
    (globalThis as any).__vlrMatches = tradableMatches;
    
  } catch (error) {
    console.error(c('Error fetching matches:', COLORS.red), error);
  }
}

async function analyzeMatch(matchIndex: number | string): Promise<SeriesAnalysis | null> {
  // Try to get match from stored list
  let matches = (globalThis as any).__vlrMatches as VLRMatch[] | undefined;
  
  if (!matches) {
    console.log(c('Fetching matches...', COLORS.dim));
    const allMatches = await vlrScraper.fetchUpcomingMatches();
    matches = allMatches.slice(0, 20); // Same filter as list command
  }
  
  const index = typeof matchIndex === 'string' ? parseInt(matchIndex) - 1 : matchIndex - 1;
  const match = matches[index];
  
  if (!match) {
    console.error(c(`Match #${index + 1} not found. Run 'list' first.`, COLORS.red));
    return null;
  }
  
  printHeader(`${match.team1.name.toUpperCase()} vs ${match.team2.name.toUpperCase()}`);
  console.log(c(`${match.tournament} | ${match.matchType} | ${match.scheduledTime.toLocaleString()}`, COLORS.dim));
  
  // Fetch match details to get team IDs
  console.log();
  console.log(c('Fetching match details...', COLORS.dim));
  
  let team1Id = match.team1.id;
  let team2Id = match.team2.id;
  let team1Slug = match.team1.slug;
  let team2Slug = match.team2.slug;
  
  try {
    const details = await vlrScraper.fetchMatchDetails(match.id);
    team1Id = details.team1Id || team1Id;
    team2Id = details.team2Id || team2Id;
    team1Slug = details.team1Slug || team1Slug;
    team2Slug = details.team2Slug || team2Slug;
  } catch (e) {
    console.log(c('Could not fetch match details, using basic info', COLORS.yellow));
  }
  
  // Fetch team stats
  console.log(c(`Fetching ${match.team1.name} stats...`, COLORS.dim));
  let team1Stats: VLRTeamFull;
  let team2Stats: VLRTeamFull;
  
  try {
    // Check cache first
    const cachedTeam1 = database.getCachedTeamStats(team1Id);
    const cachedTeam2 = database.getCachedTeamStats(team2Id);
    
    if (cachedTeam1) {
      team1Stats = cachedTeam1;
      console.log(c(`  ↳ Using cached data for ${match.team1.name}`, COLORS.dim));
    } else {
      team1Stats = await vlrScraper.fetchTeamStats(team1Id, team1Slug);
      database.cacheTeamStats(team1Stats);
    }
    
    console.log(c(`Fetching ${match.team2.name} stats...`, COLORS.dim));
    
    if (cachedTeam2) {
      team2Stats = cachedTeam2;
      console.log(c(`  ↳ Using cached data for ${match.team2.name}`, COLORS.dim));
    } else {
      team2Stats = await vlrScraper.fetchTeamStats(team2Id, team2Slug);
      database.cacheTeamStats(team2Stats);
    }
  } catch (error) {
    console.error(c('Error fetching team stats:', COLORS.red), error);
    console.log(c('Creating placeholder team data...', COLORS.yellow));
    
    // Create placeholder teams
    team1Stats = createPlaceholderTeam(match.team1.name, team1Id, team1Slug);
    team2Stats = createPlaceholderTeam(match.team2.name, team2Id, team2Slug);
  }
  
  // Run analysis
  console.log();
  console.log(c('Running analysis...', COLORS.dim));
  const analysis = mapAnalyzer.analyzeMatch(team1Stats, team2Stats, match.matchType);
  
  // Display results
  displayAnalysis(analysis);
  
  return analysis;
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

function displayAnalysis(analysis: SeriesAnalysis): void {
  const { team1, team2, mapPicks, mapAnalysis, seriesWinProb, edgeFactors, warnings } = analysis;
  
  // Map Pool Analysis
  printSubHeader('MAP POOL ANALYSIS');
  
  const mapRows = mapAnalysis.map(m => {
    const t1Stats = team1.mapStats.find(s => s.map === m.map);
    const t2Stats = team2.mapStats.find(s => s.map === m.map);
    
    return [
      m.map,
      `${formatPercent(m.team1WinRate)} (${t1Stats?.gamesPlayed || 0})`,
      `${formatPercent(m.team2WinRate)} (${t2Stats?.gamesPlayed || 0})`,
      formatPercent(m.headToHeadProb, true),
      `${(m.confidence * 100).toFixed(0)}%`,
    ];
  });
  
  printTable(
    ['Map', `${team1.name.substring(0, 12)}`, `${team2.name.substring(0, 12)}`, 'H2H', 'Conf'],
    mapRows,
    [12, 16, 16, 10, 8]
  );
  
  // Predicted Map Picks
  printSubHeader('PREDICTED MAP SEQUENCE');
  console.log(`  ${team1.name} pick: ${c(mapPicks.team1Pick, COLORS.cyan)} (${(mapPicks.team1PickConfidence * 100).toFixed(0)}% conf)`);
  console.log(`  ${team2.name} pick: ${c(mapPicks.team2Pick, COLORS.magenta)} (${(mapPicks.team2PickConfidence * 100).toFixed(0)}% conf)`);
  console.log(`  Potential deciders: ${mapPicks.deciderMaps.join(', ')}`);
  
  // Series Probability
  printSubHeader('SERIES PROBABILITY');
  const t1Pct = seriesWinProb.team1 * 100;
  const t2Pct = seriesWinProb.team2 * 100;
  
  const barWidth = 40;
  const t1Bar = Math.round((t1Pct / 100) * barWidth);
  const t2Bar = barWidth - t1Bar;
  
  console.log(`  ${team1.name}: ${c(t1Pct.toFixed(1) + '%', t1Pct > 50 ? COLORS.green : COLORS.dim)}`);
  console.log(`  ${team2.name}: ${c(t2Pct.toFixed(1) + '%', t2Pct > 50 ? COLORS.green : COLORS.dim)}`);
  console.log();
  console.log(`  [${c('█'.repeat(t1Bar), COLORS.cyan)}${c('█'.repeat(t2Bar), COLORS.magenta)}]`);
  console.log(`  ${c(`Confidence: ${(seriesWinProb.confidence * 100).toFixed(0)}%`, COLORS.dim)}`);
  
  // Edge Factors
  if (edgeFactors.length > 0) {
    printSubHeader('EDGE FACTORS');
    edgeFactors.forEach(f => {
      const sign = f.impact > 0 ? '+' : '';
      const color = f.impact > 0 ? COLORS.green : COLORS.red;
      console.log(`  ${c(`${sign}${(f.impact * 100).toFixed(1)}%`, color)} ${f.description}`);
    });
  }
  
  // Warnings
  if (warnings.length > 0) {
    printSubHeader('WARNINGS');
    warnings.forEach(w => {
      const icon = w.severity === 'high' ? '🔴' : w.severity === 'medium' ? '🟡' : '🟢';
      console.log(`  ${icon} ${w.message}`);
      console.log(c(`     → ${w.recommendation}`, COLORS.dim));
    });
  }
  
  console.log();
}

async function generateSignal(matchIndex: number): Promise<TradeSignal | null> {
  const analysis = await analyzeMatch(matchIndex);
  if (!analysis) return null;
  
  printSubHeader('KALSHI MARKET CHECK');
  
  // Try to find corresponding Kalshi market
  const kalshiClient = createPublicClient(true); // Use demo for now
  
  try {
    const markets = await kalshiClient.searchMarkets('valorant');
    
    // Try to match by team names
    const relevantMarket = markets.find(m => 
      (m.title.toLowerCase().includes(analysis.team1.name.toLowerCase()) &&
       m.title.toLowerCase().includes(analysis.team2.name.toLowerCase()))
    );
    
    if (!relevantMarket) {
      console.log(c('No matching Kalshi market found for this match', COLORS.yellow));
      console.log(c('Available markets:', COLORS.dim));
      markets.slice(0, 5).forEach(m => console.log(`  - ${m.ticker}: ${m.title}`));
      
      // Create mock market for demonstration
      const mockMarket = {
        ticker: 'DEMO-VAL-001',
        title: `${analysis.team1.name} vs ${analysis.team2.name}`,
        team1: analysis.team1.name,
        team2: analysis.team2.name,
        tournament: 'VCT EMEA',
        yesPrice: 52,
        noPrice: 48,
        yesAsk: 53,
        yesBid: 51,
        noAsk: 49,
        noBid: 47,
        volume: 0,
        openInterest: 0,
        expirationTime: new Date(),
        status: 'active' as const,
      };
      
      console.log();
      console.log(c('Using mock market for demonstration:', COLORS.yellow));
      console.log(`  YES (${analysis.team1.name}): ${mockMarket.yesPrice}¢`);
      console.log(`  NO (${analysis.team2.name}): ${mockMarket.noPrice}¢`);
      
      const signal = generateTradeSignal(analysis, mockMarket, DEFAULT_TRADING_CONFIG);
      displaySignal(signal);
      return signal;
    }
    
    console.log(c(`Found market: ${relevantMarket.ticker}`, COLORS.green));
    console.log(`  YES: ${relevantMarket.yesPrice}¢ / NO: ${relevantMarket.noPrice}¢`);
    
    const signal = generateTradeSignal(analysis, relevantMarket, DEFAULT_TRADING_CONFIG);
    displaySignal(signal);
    return signal;
    
  } catch (error) {
    console.error(c('Error fetching Kalshi markets:', COLORS.red), error);
    return null;
  }
}

function displaySignal(signal: TradeSignal): void {
  printSubHeader('TRADE SIGNAL');
  
  const { recommendation, edge, impliedProbability, modelProbability, confidence, suggestedStake, reasoning } = signal;
  
  // Recommendation
  let recColor = COLORS.yellow;
  let recText = 'NO EDGE';
  
  if (recommendation === 'BET_TEAM1') {
    recColor = COLORS.green;
    recText = `BET ${signal.analysis.team1.name.toUpperCase()}`;
  } else if (recommendation === 'BET_TEAM2') {
    recColor = COLORS.green;
    recText = `BET ${signal.analysis.team2.name.toUpperCase()}`;
  } else if (recommendation === 'SKIP') {
    recColor = COLORS.red;
    recText = 'SKIP (HIGH RISK)';
  }
  
  console.log(`  Recommendation: ${c(recText, recColor, COLORS.bold)}`);
  console.log();
  console.log(`  Model probability:  ${formatPercent(modelProbability)}`);
  console.log(`  Market implied:     ${formatPercent(impliedProbability)}`);
  console.log(`  Edge:               ${c(formatPercent(edge), edge >= 0.05 ? COLORS.green : COLORS.yellow)}`);
  console.log(`  Confidence:         ${formatPercent(confidence)}`);
  console.log();
  
  if (suggestedStake > 0) {
    console.log(`  ${c('Suggested stake:', COLORS.bold)} $${suggestedStake.toFixed(2)}`);
  }
  
  console.log();
  console.log(c('Reasoning:', COLORS.dim));
  reasoning.forEach(r => console.log(`  • ${r}`));
  
  console.log();
}

async function showStats(): Promise<void> {
  printHeader('PERFORMANCE STATISTICS');
  
  const stats = database.getPerformanceStats();
  
  console.log(`  Total trades:     ${stats.totalTrades}`);
  console.log(`  Win rate:         ${formatPercent(stats.winRate, true)}`);
  console.log(`  Total P&L:        ${c(stats.totalPnL >= 0 ? '+' : '', stats.totalPnL >= 0 ? COLORS.green : COLORS.red)}$${stats.totalPnL.toFixed(2)}`);
  console.log(`  Avg P&L/trade:    $${stats.avgPnL.toFixed(2)}`);
  console.log();
  console.log(`  Last 7 days:      ${c(stats.last7DaysPnL >= 0 ? '+' : '', stats.last7DaysPnL >= 0 ? COLORS.green : COLORS.red)}$${stats.last7DaysPnL.toFixed(2)}`);
  
  if (stats.bestDay.date) {
    console.log(`  Best day:         ${stats.bestDay.date} (+$${stats.bestDay.pnl.toFixed(2)})`);
  }
  if (stats.worstDay.date) {
    console.log(`  Worst day:        ${stats.worstDay.date} ($${stats.worstDay.pnl.toFixed(2)})`);
  }
  
  // Recent trades
  printSubHeader('RECENT TRADES');
  const trades = database.getRecentTrades(10);
  
  if (trades.length === 0) {
    console.log(c('  No trades yet', COLORS.dim));
  } else {
    const rows = trades.map(t => [
      t.ticker.substring(0, 15),
      t.side.toUpperCase(),
      formatPrice(t.price),
      t.quantity.toString(),
      t.status,
      t.executedAt.toLocaleDateString(),
    ]);
    
    printTable(['Ticker', 'Side', 'Price', 'Qty', 'Status', 'Date'], rows);
  }
  
  console.log();
}

// ============================================================================
// Main CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  console.log();
  
  switch (command) {
    case 'list':
    case 'l':
      await listMatches();
      break;
      
    case 'analyze':
    case 'a':
      if (!args[1]) {
        console.error(c('Usage: bun run valorant analyze <match#>', COLORS.red));
        break;
      }
      await analyzeMatch(parseInt(args[1]));
      break;
      
    case 'signal':
    case 's':
      if (!args[1]) {
        console.error(c('Usage: bun run valorant signal <match#>', COLORS.red));
        break;
      }
      await generateSignal(parseInt(args[1]));
      break;
      
    case 'stats':
      await showStats();
      break;
      
    case 'help':
    default:
      printHeader('VALORANT TRADING BOT');
      console.log();
      console.log('Commands:');
      console.log('  list, l              List upcoming VCT matches');
      console.log('  analyze, a <#>       Analyze a specific match');
      console.log('  signal, s <#>        Generate trade signal for match');
      console.log('  stats                Show trading performance');
      console.log();
      console.log('Examples:');
      console.log(c('  bun run src/kalshi/valorant/cli.ts list', COLORS.dim));
      console.log(c('  bun run src/kalshi/valorant/cli.ts analyze 1', COLORS.dim));
      console.log(c('  bun run src/kalshi/valorant/cli.ts signal 1', COLORS.dim));
      console.log();
      break;
  }
  
  console.log();
}

// Run CLI
main().catch(console.error);
