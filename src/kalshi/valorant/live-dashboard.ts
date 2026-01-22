#!/usr/bin/env bun
/**
 * Valorant Live Match Dashboard
 * 
 * Real-time monitoring of live VCT matches with:
 * - Live score scraping from VLR.gg
 * - Economy and momentum tracking
 * - Auto-generated trade signals
 * - Betting opportunity alerts
 */

import { vlrScraper } from './vlr-scraper';
import { getKalshiClient } from './kalshi-client';
import {
  liveStrategy,
  LiveMatchState,
  LiveBettingSignal,
  generateLiveSignals,
  calculateRoundWinProbability,
  calculateLiveMapWinProbability,
  MAP_SIDE_ADVANTAGE,
} from './live-strategy';

// ============================================================================
// Configuration
// ============================================================================

const REFRESH_INTERVAL_MS = 5000; // 5 seconds
const VLR_BASE_URL = 'https://www.vlr.gg';

// ============================================================================
// Series Win Probability Calculator
// ============================================================================

/**
 * Calculate probability of winning a series given current map score and current map win prob
 * Uses recursive probability calculation
 */
function calculateSeriesWinProbability(
  team1MapsWon: number,
  team2MapsWon: number,
  currentMapWinProb: number,
  mapsToWin: number // 2 for Bo3, 3 for Bo5, 1 for Bo1
): number {
  // If someone already won the series
  if (team1MapsWon >= mapsToWin) return 1.0;
  if (team2MapsWon >= mapsToWin) return 0.0;
  
  // Bo1 - just the current map probability
  if (mapsToWin === 1) return currentMapWinProb;
  
  // Calculate remaining maps needed
  const t1Needs = mapsToWin - team1MapsWon;
  const t2Needs = mapsToWin - team2MapsWon;
  const mapsRemaining = t1Needs + t2Needs - 1; // Max maps that could be played
  
  // Assume 50% win rate for future maps after current
  const futureMapWinProb = 0.5;
  
  // Calculate probability using recursive expectation
  // P(win series) = P(win current map) * P(win series | won current) + P(lose current map) * P(win series | lost current)
  
  // If team1 wins current map
  const probAfterWin = calculateSeriesWinProbabilityRecursive(team1MapsWon + 1, team2MapsWon, futureMapWinProb, mapsToWin);
  // If team1 loses current map
  const probAfterLoss = calculateSeriesWinProbabilityRecursive(team1MapsWon, team2MapsWon + 1, futureMapWinProb, mapsToWin);
  
  return currentMapWinProb * probAfterWin + (1 - currentMapWinProb) * probAfterLoss;
}

function calculateSeriesWinProbabilityRecursive(
  team1MapsWon: number,
  team2MapsWon: number,
  mapWinProb: number,
  mapsToWin: number
): number {
  // Base cases
  if (team1MapsWon >= mapsToWin) return 1.0;
  if (team2MapsWon >= mapsToWin) return 0.0;
  
  // Recursive calculation
  const probAfterWin = calculateSeriesWinProbabilityRecursive(team1MapsWon + 1, team2MapsWon, mapWinProb, mapsToWin);
  const probAfterLoss = calculateSeriesWinProbabilityRecursive(team1MapsWon, team2MapsWon + 1, mapWinProb, mapsToWin);
  
  return mapWinProb * probAfterWin + (1 - mapWinProb) * probAfterLoss;
}

// ============================================================================
// Colors & Formatting
// ============================================================================

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  blink: '\x1b[5m',
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

const green = (s: string) => C.green + s + C.reset;
const red = (s: string) => C.red + s + C.reset;
const yellow = (s: string) => C.yellow + s + C.reset;
const cyan = (s: string) => C.cyan + s + C.reset;
const magenta = (s: string) => C.magenta + s + C.reset;
const dim = (s: string) => C.dim + s + C.reset;
const bold = (s: string) => C.bold + s + C.reset;

function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

// ============================================================================
// Live Score Scraping
// ============================================================================

export interface LiveScore {
  matchId: string;
  team1Name: string;
  team2Name: string;
  team1MapScore: number;
  team2MapScore: number;
  currentMap: string;
  team1RoundScore: number;
  team2RoundScore: number;
  status: 'live' | 'completed' | 'upcoming';
  currentRound: number;
  team1Side: 'attack' | 'defense';
  lastUpdate: Date;
  seriesFormat: 'Bo1' | 'Bo3' | 'Bo5';
  totalMaps: number;
}

async function fetchLiveScore(matchId: string): Promise<LiveScore | null> {
  try {
    const response = await fetch(`${VLR_BASE_URL}/${matchId}`, {
      headers: {
        'User-Agent': 'ValorantTradingBot/1.0 (Educational Research)',
        'Accept': 'text/html',
      },
    });
    
    if (!response.ok) return null;
    const html = await response.text();
    
    // Extract team names from wf-title-med elements (inside match-header-link-name)
    const teamPattern = /<div class="wf-title-med[^"]*">\s*([^<]+)\s*<\/div>/gi;
    const teamMatches = [...html.matchAll(teamPattern)];
    const team1Name = teamMatches[0]?.[1]?.trim() || 'Team 1';
    const team2Name = teamMatches[1]?.[1]?.trim() || 'Team 2';
    
    // Check if match is live
    const isLive = html.includes('mod-live') || html.includes('LIVE');
    const isCompleted = html.includes('final') || html.includes('FINAL');
    
    // Find which game is currently active/live
    const activeGamePattern = /data-game-id="(\d+)"[^>]*mod-live/i;
    const activeGameMatch = html.match(activeGamePattern);
    const activeGameId = activeGameMatch?.[1];
    
    // Extract map scores from series score display (e.g., "1 - 0" for maps)
    // Look for match-header-vs-score section
    const seriesScorePattern = /<div class="match-header-vs-score"[\s\S]*?<span[^>]*>\s*(\d+)\s*<\/span>[\s\S]*?<span[^>]*>\s*:\s*<\/span>[\s\S]*?<span[^>]*>\s*(\d+)\s*<\/span>/i;
    const seriesMatch = html.match(seriesScorePattern);
    let team1MapScore = 0;
    let team2MapScore = 0;
    
    // Count completed maps from game headers (look for mod-win class)
    const mapWinPattern = /<div class="score mod-win"[^>]*>\s*(\d+)\s*<\/div>/gi;
    const mapWins = [...html.matchAll(mapWinPattern)];
    // Count wins for each team based on which side has mod-win
    const gameHeaders = html.matchAll(/<div class="vm-stats-game-header">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi);
    for (const match of gameHeaders) {
      const headerHtml = match[1];
      if (headerHtml.includes('mod-win')) {
        // First team in header has the win
        if (headerHtml.indexOf('mod-win') < headerHtml.length / 2) {
          team1MapScore++;
        } else {
          team2MapScore++;
        }
      }
    }
    
    // Find the active game section and extract its scores
    let team1RoundScore = 0;
    let team2RoundScore = 0;
    let currentMap = 'Unknown';
    
    if (activeGameId) {
      // Find the specific game section
      const gameSection = new RegExp(`data-game-id="${activeGameId}"[\\s\\S]*?<div class="vm-stats-game-header">([\\s\\S]*?)</div>\\s*</div>\\s*</div>`, 'i');
      const gameSectionMatch = html.match(gameSection);
      
      if (gameSectionMatch) {
        const gameHtml = gameSectionMatch[1];
        
        // Extract round scores from this game section
        const scorePattern = /<div class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/gi;
        const scores = [...gameHtml.matchAll(scorePattern)];
        team1RoundScore = parseInt(scores[0]?.[1] || '0');
        team2RoundScore = parseInt(scores[1]?.[1] || '0');
      }
    }
    
    // If we didn't get scores from active game, fall back to first non-completed game
    if (team1RoundScore === 0 && team2RoundScore === 0) {
      // Extract all score pairs from game headers
      const gameHeaderPattern = /<div class="vm-stats-game-header">[\s\S]*?<div class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>[\s\S]*?<div class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/gi;
      const gameHeaders2 = [...html.matchAll(gameHeaderPattern)];
      
      for (const gh of gameHeaders2) {
        const s1 = parseInt(gh[1] || '0');
        const s2 = parseInt(gh[2] || '0');
        // Skip completed maps (13+ rounds or 0-0 not started)
        if (s1 < 13 && s2 < 13 && (s1 > 0 || s2 > 0)) {
          team1RoundScore = s1;
          team2RoundScore = s2;
          break;
        }
        // If first game is 0-0, could be between maps
        if (s1 === 0 && s2 === 0 && gameHeaders2.length > 1) {
          continue;
        }
      }
    }
    
    // Extract current map number from active+live nav item
    const activeMapPattern = /mod-active[^"]*mod-live[^"]*"[^>]*data-href="[^?]+\?map=(\d+)"/i;
    const activeMapMatch = html.match(activeMapPattern);
    let activeMapNum = parseInt(activeMapMatch?.[1] || '1');
    
    // Get map names from the game headers (Split, Haven, etc.)
    const mapNamePattern = /<span style="position: relative;">\s*(Split|Haven|Bind|Ascent|Pearl|Lotus|Fracture|Sunset|Icebox|Breeze|Abyss)\s/gi;
    const mapNameMatches = [...html.matchAll(mapNamePattern)];
    
    // If the round score shows a completed map (13+), find the next incomplete map
    // This handles the case where VLR hasn't updated the active map yet
    if (team1RoundScore >= 13 || team2RoundScore >= 13 || (team1RoundScore === 0 && team2RoundScore === 0 && team1MapScore + team2MapScore > 0)) {
      // Find the next map that's not completed
      const allScoresPattern = /<div class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/gi;
      const allScores = [...html.matchAll(allScoresPattern)];
      
      // Scores come in pairs (team1, team2) for each map
      for (let i = 0; i < allScores.length; i += 2) {
        const s1 = parseInt(allScores[i]?.[1] || '0');
        const s2 = parseInt(allScores[i + 1]?.[1] || '0');
        const mapIdx = Math.floor(i / 2) + 1;
        
        // Found the current map (in progress or next to play)
        if (s1 < 13 && s2 < 13) {
          activeMapNum = mapIdx;
          team1RoundScore = s1;
          team2RoundScore = s2;
          break;
        }
      }
    }
    
    // Use currentMap variable from above if already set, otherwise determine from active map
    if (currentMap === 'Unknown' && mapNameMatches.length > 0) {
      if (activeMapNum <= mapNameMatches.length) {
        currentMap = mapNameMatches[activeMapNum - 1]?.[1] || 'Unknown';
      } else {
        currentMap = mapNameMatches[0]?.[1] || 'Unknown';
      }
    }
    
    // Detect which side team1 started on from the half scores
    // Pattern: <span class="mod-ct">7</span> / <span class="mod-t">5</span>
    // First team's half score tells us what side they started on
    const team1HalfPattern = /<div class="team-name">\s*[\s\S]*?<\/div>\s*<span class="mod-(ct|t)">(\d+)<\/span>/i;
    const team1HalfMatch = html.match(team1HalfPattern);
    
    // Default: if we see mod-ct first for team1, they started defense
    const team1StartedDefense = team1HalfMatch?.[1] === 'ct';
    
    const currentRound = team1RoundScore + team2RoundScore + 1;
    const isSecondHalf = currentRound > 12;
    
    // If team1 started defense (CT), they're attack (T) in second half, and vice versa
    let team1Side: 'attack' | 'defense';
    if (team1StartedDefense) {
      team1Side = isSecondHalf ? 'attack' : 'defense';
    } else {
      team1Side = isSecondHalf ? 'defense' : 'attack';
    }
    
    // Detect series format (Bo1, Bo3, Bo5) from number of maps in veto
    // Count total map slots available (look for game nav items)
    const gameNavPattern = /vm-stats-gamesnav-item/gi;
    const gameNavMatches = html.match(gameNavPattern);
    const totalMaps = mapNameMatches.length || 3; // Default to Bo3
    
    let seriesFormat: 'Bo1' | 'Bo3' | 'Bo5' = 'Bo3';
    if (totalMaps >= 5 || html.includes('Grand Final') || html.includes('grand-final')) {
      seriesFormat = 'Bo5';
    } else if (totalMaps === 1) {
      seriesFormat = 'Bo1';
    } else {
      seriesFormat = 'Bo3';
    }
    
    return {
      matchId,
      team1Name,
      team2Name,
      team1MapScore,
      team2MapScore,
      currentMap,
      team1RoundScore,
      team2RoundScore,
      status: isLive ? 'live' : isCompleted ? 'completed' : 'upcoming',
      currentRound,
      team1Side,
      lastUpdate: new Date(),
      seriesFormat,
      totalMaps,
    };
  } catch (e) {
    console.error('Error fetching live score:', e);
    return null;
  }
}

async function fetchLiveMatches(): Promise<LiveScore[]> {
  try {
    // Fetch matches page to find live matches
    const response = await fetch(`${VLR_BASE_URL}/matches`, {
      headers: {
        'User-Agent': 'ValorantTradingBot/1.0',
        'Accept': 'text/html',
      },
    });
    
    if (!response.ok) return [];
    const html = await response.text();
    
    // Find live matches
    const livePattern = /<a href="\/(\d+\/[^"]+)"[^>]*class="[^"]*wf-module-item[^"]*match-item[^"]*mod-live[^"]*"/gi;
    const liveMatches = [...html.matchAll(livePattern)];
    
    const scores: LiveScore[] = [];
    for (const match of liveMatches.slice(0, 5)) { // Limit to 5 live matches
      const matchId = match[1];
      const score = await fetchLiveScore(matchId);
      if (score) scores.push(score);
      
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }
    
    return scores;
  } catch (e) {
    console.error('Error fetching live matches:', e);
    return [];
  }
}

// ============================================================================
// Trade Signal Generation
// ============================================================================

interface TradeOpportunity {
  matchId: string;
  team1: string;
  team2: string;
  signal: LiveBettingSignal;
  currentScore: string;
  map: string;
  suggestedBet: {
    side: 'team1' | 'team2';
    confidence: number;
    reason: string;
  };
}

function generateTradeOpportunity(score: LiveScore, state: LiveMatchState): TradeOpportunity | null {
  const signals = generateLiveSignals(state);
  
  // Find the best actionable signal
  const actionableSignal = signals.find(s => s.suggestedAction === 'BET' && s.confidence >= 0.6);
  
  if (!actionableSignal) return null;
  
  return {
    matchId: score.matchId,
    team1: score.team1Name,
    team2: score.team2Name,
    signal: actionableSignal,
    currentScore: `${score.team1RoundScore}-${score.team2RoundScore}`,
    map: score.currentMap,
    suggestedBet: {
      side: actionableSignal.team,
      confidence: actionableSignal.confidence,
      reason: actionableSignal.reason,
    },
  };
}

// ============================================================================
// Dashboard Display
// ============================================================================

interface DashboardState {
  liveMatches: LiveScore[];
  opportunities: TradeOpportunity[];
  lastRefresh: Date;
  refreshCount: number;
  balance: number;
}

function printHeader(state: DashboardState): void {
  const now = new Date();
  const uptime = Math.floor((now.getTime() - state.lastRefresh.getTime()) / 1000);
  
  console.log();
  console.log(cyan(bold('╔═══════════════════════════════════════════════════════════════════════════╗')));
  console.log(cyan(bold('║')) + '          ⚡ VALORANT LIVE BETTING DASHBOARD ⚡                        ' + cyan(bold('║')));
  console.log(cyan(bold('╠═══════════════════════════════════════════════════════════════════════════╣')));
  console.log(cyan(bold('║')) + `  🔴 LIVE TRACKING  │  Balance: ${green('$' + state.balance.toFixed(2))}  │  Refresh: ${state.refreshCount}  ` + cyan(bold('║')));
  console.log(cyan(bold('║')) + `  Last Update: ${now.toLocaleTimeString()}  │  Next in: ${Math.max(0, 15 - uptime)}s               ` + cyan(bold('║')));
  console.log(cyan(bold('╚═══════════════════════════════════════════════════════════════════════════╝')));
  console.log();
}

function printLiveMatch(score: LiveScore, index: number): void {
  const statusIcon = score.status === 'live' ? red('🔴 LIVE') : 
                     score.status === 'completed' ? green('✅ FINAL') : 
                     dim('⏳ SOON');
  
  console.log(yellow(`  ─────────────────────────────────────────────────────────`));
  console.log(`  ${bold(`#${index}`)} ${statusIcon}  ${bold(score.team1Name)} vs ${bold(score.team2Name)}`);
  console.log();
  
  // Map score with series format
  const t1Leading = score.team1MapScore > score.team2MapScore;
  const t2Leading = score.team2MapScore > score.team1MapScore;
  const t1MapStr = t1Leading ? green(String(score.team1MapScore)) : t2Leading ? red(String(score.team1MapScore)) : String(score.team1MapScore);
  const t2MapStr = t2Leading ? green(String(score.team2MapScore)) : t1Leading ? red(String(score.team2MapScore)) : String(score.team2MapScore);
  console.log(`  Maps: ${t1MapStr} - ${t2MapStr}  ${dim('(' + score.seriesFormat + ')')}`);
  
  // Series win probability
  const mapData = MAP_SIDE_ADVANTAGE[score.currentMap];
  const currentMapWinProb = mapData ? calculateLiveMapWinProbability({
    map: score.currentMap,
    team1Score: score.team1RoundScore,
    team2Score: score.team2RoundScore,
    currentRound: score.currentRound,
    side: score.currentRound > 12 ? 'second' : 'first',
    team1Side: score.team1Side,
    team2Side: score.team1Side === 'attack' ? 'defense' : 'attack',
    momentum: { team1Streak: 0, team2Streak: 0, team1Timeouts: 2, team2Timeouts: 2, lastThrillerWin: null, pistolWinner: null, halfScore: null },
    economy: { team1Credits: 4000, team2Credits: 4000, team1BuyType: 'full', team2BuyType: 'full', team1LossStreak: 0, team2LossStreak: 0 },
    ultimates: { team1Ults: [], team2Ults: [], team1KeyUltsReady: 0, team2KeyUltsReady: 0 },
  }, 0.5).probability : 0.5;
  
  const seriesWinProb = calculateSeriesWinProbability(
    score.team1MapScore,
    score.team2MapScore,
    currentMapWinProb,
    score.seriesFormat === 'Bo5' ? 3 : score.seriesFormat === 'Bo3' ? 2 : 1
  );
  const seriesBar = '█'.repeat(Math.round(seriesWinProb * 10)) + '░'.repeat(10 - Math.round(seriesWinProb * 10));
  const seriesProbStr = (seriesWinProb * 100).toFixed(0) + '%';
  const seriesProbColor = seriesWinProb > 0.6 ? green : seriesWinProb < 0.4 ? red : (s: string) => s;
  console.log(`  Series Win: ${score.team1Name} [${seriesBar}] ${seriesProbColor(seriesProbStr)}`);
  
  // Current map and round score
  if (score.status === 'live') {
    const roundStr = `${score.team1RoundScore} - ${score.team2RoundScore}`;
    console.log(`  ${cyan(score.currentMap)}: ${bold(roundStr)}  (Round ${score.currentRound})`);
    console.log(`  ${dim(score.team1Name + ' on ' + score.team1Side.toUpperCase())}`);
    
    // Side advantage indicator
    const mapData = MAP_SIDE_ADVANTAGE[score.currentMap];
    if (mapData) {
      const sideWR = score.team1Side === 'attack' ? mapData.attackWR : mapData.defenseWR;
      const advantage = ((sideWR - 0.5) * 100).toFixed(1);
      const advColor = sideWR > 0.52 ? green : sideWR < 0.48 ? red : dim;
      console.log(`  Side advantage: ${advColor(advantage + '%')}`);
    }
    
    // Win probability
    if (mapData) {
      const mapResult = calculateLiveMapWinProbability({
        map: score.currentMap,
        team1Score: score.team1RoundScore,
        team2Score: score.team2RoundScore,
        currentRound: score.currentRound,
        side: score.currentRound > 12 ? 'second' : 'first',
        team1Side: score.team1Side,
        team2Side: score.team1Side === 'attack' ? 'defense' : 'attack',
        momentum: { team1Streak: 0, team2Streak: 0, team1Timeouts: 2, team2Timeouts: 2, lastThrillerWin: null, pistolWinner: null, halfScore: null },
        economy: { team1Credits: 4000, team2Credits: 4000, team1BuyType: 'full', team2BuyType: 'full', team1LossStreak: 0, team2LossStreak: 0 },
        ultimates: { team1Ults: [], team2Ults: [], team1KeyUltsReady: 0, team2KeyUltsReady: 0 },
      }, 0.5);
      
      const prob = mapResult.probability;
      const probBar = '█'.repeat(Math.round(prob * 10)) + '░'.repeat(10 - Math.round(prob * 10));
      console.log(`  Map Win: ${score.team1Name} [${probBar}] ${(prob * 100).toFixed(0)}%`);
    }
  }
  console.log();
}

function printOpportunity(opp: TradeOpportunity): void {
  const teamName = opp.suggestedBet.side === 'team1' ? opp.team1 : opp.team2;
  const confidenceBar = '█'.repeat(Math.round(opp.suggestedBet.confidence * 10)) + '░'.repeat(10 - Math.round(opp.suggestedBet.confidence * 10));
  
  console.log(C.bgGreen + C.bold + ' 💰 BETTING OPPORTUNITY ' + C.reset);
  console.log(`  ${opp.team1} vs ${opp.team2} on ${cyan(opp.map)}`);
  console.log(`  Current: ${bold(opp.currentScore)}`);
  console.log();
  console.log(`  📈 Signal: ${yellow(opp.signal.type)}`);
  console.log(`  🎯 Bet: ${green(bold(teamName))}`);
  console.log(`  📊 Confidence: [${confidenceBar}] ${(opp.suggestedBet.confidence * 100).toFixed(0)}%`);
  console.log(`  💡 ${opp.suggestedBet.reason}`);
  console.log(`  ⚡ Edge: ${green('+' + (opp.signal.expectedEdge * 100).toFixed(1) + '%')}`);
  console.log();
}

function printNoLiveMatches(): void {
  console.log(dim('  ─────────────────────────────────────────────────────────'));
  console.log(dim('  No live VCT matches found.'));
  console.log(dim('  Watching for matches to go live...'));
  console.log();
  console.log(dim('  Tip: Run during VCT broadcast times for live action!'));
  console.log(dim('       Americas: ~4pm-9pm ET'));
  console.log(dim('       EMEA: ~10am-4pm ET'));
  console.log(dim('       Pacific: ~1am-8am ET'));
  console.log();
}

function printFooter(): void {
  console.log(dim('  ─────────────────────────────────────────────────────────'));
  console.log(dim('  Commands: Ctrl+C to exit'));
  console.log(dim('  Auto-refreshing every 15 seconds...'));
  console.log();
}

// ============================================================================
// Main Dashboard Loop
// ============================================================================

async function refreshDashboard(state: DashboardState, specificMatchId?: string | null): Promise<DashboardState> {
  // Fetch live matches (or specific match)
  let liveMatches: LiveScore[];
  
  if (specificMatchId) {
    const match = await fetchLiveScore(specificMatchId);
    liveMatches = match ? [match] : [];
  } else {
    liveMatches = await fetchLiveMatches();
  }
  
  // Generate trading opportunities
  const opportunities: TradeOpportunity[] = [];
  
  for (const score of liveMatches) {
    if (score.status !== 'live') continue;
    
    const mapData = MAP_SIDE_ADVANTAGE[score.currentMap];
    if (!mapData) continue;
    
    const matchState: LiveMatchState = {
      map: score.currentMap,
      team1Score: score.team1RoundScore,
      team2Score: score.team2RoundScore,
      currentRound: score.currentRound,
      side: score.currentRound > 12 ? 'second' : 'first',
      team1Side: score.team1Side,
      team2Side: score.team1Side === 'attack' ? 'defense' : 'attack',
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
        team1Credits: 4000,
        team2Credits: 4000,
        team1BuyType: 'full',
        team2BuyType: 'full',
        team1LossStreak: 0,
        team2LossStreak: 0,
      },
      ultimates: {
        team1Ults: [],
        team2Ults: [],
        team1KeyUltsReady: 0,
        team2KeyUltsReady: 0,
      },
    };
    
    const opp = generateTradeOpportunity(score, matchState);
    if (opp) opportunities.push(opp);
  }
  
  return {
    liveMatches,
    opportunities,
    lastRefresh: new Date(),
    refreshCount: state.refreshCount + 1,
    balance: state.balance,
  };
}

function renderDashboard(state: DashboardState): void {
  clearScreen();
  printHeader(state);
  
  // Trading opportunities first (most important)
  if (state.opportunities.length > 0) {
    console.log(yellow(bold('  🚨 ACTIVE SIGNALS')));
    console.log();
    state.opportunities.forEach(opp => printOpportunity(opp));
  }
  
  // Live matches
  console.log(yellow(bold('  📺 LIVE MATCHES')));
  if (state.liveMatches.length === 0) {
    printNoLiveMatches();
  } else {
    state.liveMatches.forEach((match, i) => printLiveMatch(match, i + 1));
  }
  
  printFooter();
}

async function main(): Promise<void> {
  const client = getKalshiClient();
  
  // Check for specific match ID argument
  const args = process.argv.slice(2);
  const specificMatchId = args[0] || null;
  
  if (specificMatchId) {
    console.log(cyan(`\n  🎯 Monitoring specific match: ${specificMatchId}\n`));
  }
  
  // Get initial balance
  let balance = 0;
  try {
    const balanceData = await client.getBalance();
    balance = balanceData.available / 100;
  } catch (e) {
    console.log(dim('Could not fetch balance'));
  }
  
  let state: DashboardState = {
    liveMatches: [],
    opportunities: [],
    lastRefresh: new Date(),
    refreshCount: 0,
    balance,
  };
  
  console.log(dim('Starting live dashboard...'));
  console.log(dim('Fetching live matches...'));
  
  // Initial fetch
  state = await refreshDashboard(state, specificMatchId);
  renderDashboard(state);
  
  // Refresh loop
  setInterval(async () => {
    try {
      state = await refreshDashboard(state, specificMatchId);
      renderDashboard(state);
    } catch (e: any) {
      console.error('Refresh error:', e.message);
    }
  }, REFRESH_INTERVAL_MS);
  
  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n' + dim('Dashboard stopped. Goodbye! 👋'));
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.main) {
  main();
}

export {
  fetchLiveScore,
  fetchLiveMatches,
  generateTradeOpportunity,
  LiveScore,
  TradeOpportunity,
};
