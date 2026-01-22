/**
 * Map Analysis Engine
 * 
 * Calculates head-to-head probabilities, predicts map picks/bans,
 * and simulates series outcomes using Monte Carlo methods.
 */

import {
  VLRTeamFull,
  VLRMapStats,
  ValorantMap,
  ACTIVE_MAP_POOL,
  MapPickPrediction,
  HeadToHeadAnalysis,
  SeriesAnalysis,
  EdgeFactor,
  AnalysisWarning,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const MONTE_CARLO_SIMULATIONS = 10000;
const MIN_GAMES_FOR_CONFIDENCE = 5;
const VERY_HIGH_CONFIDENCE_THRESHOLD = 15;
const DEFAULT_WIN_RATE = 0.5;

// ============================================================================
// Log5 Formula
// ============================================================================

/**
 * Log5 formula for head-to-head probability
 * Given team A has win rate pA against average opposition,
 * and team B has win rate pB against average opposition,
 * calculates probability of A beating B
 */
function log5(pA: number, pB: number): number {
  // Clamp values to avoid division issues
  pA = Math.max(0.01, Math.min(0.99, pA));
  pB = Math.max(0.01, Math.min(0.99, pB));
  
  const numerator = pA * (1 - pB);
  const denominator = pA * (1 - pB) + pB * (1 - pA);
  
  return numerator / denominator;
}

/**
 * Calculate confidence based on sample size
 * More games = higher confidence in the win rate
 */
function calculateConfidence(games1: number, games2: number): number {
  const minGames = Math.min(games1, games2);
  const maxGames = Math.max(games1, games2);
  
  if (minGames < MIN_GAMES_FOR_CONFIDENCE) {
    return 0.3 + (minGames / MIN_GAMES_FOR_CONFIDENCE) * 0.2;
  }
  
  if (minGames >= VERY_HIGH_CONFIDENCE_THRESHOLD) {
    return 0.9;
  }
  
  // Linear interpolation between 0.5 and 0.9
  const ratio = (minGames - MIN_GAMES_FOR_CONFIDENCE) / 
                (VERY_HIGH_CONFIDENCE_THRESHOLD - MIN_GAMES_FOR_CONFIDENCE);
  return 0.5 + ratio * 0.4;
}

// ============================================================================
// Map Pick/Ban Prediction
// ============================================================================

/**
 * Predict map picks and bans based on team win rates
 * 
 * Standard Bo3 veto process:
 * 1. Team A bans
 * 2. Team B bans  
 * 3. Team A picks
 * 4. Team B picks
 * 5. Team A bans
 * 6. Team B bans
 * 7. Remaining map is decider
 */
export function predictMapPicks(
  team1: VLRTeamFull,
  team2: VLRTeamFull,
  matchType: 'Bo1' | 'Bo3' | 'Bo5'
): MapPickPrediction {
  // Get map stats for both teams, defaulting to 50% if no data
  const getMapWinRate = (team: VLRTeamFull, map: ValorantMap): number => {
    const stats = team.mapStats.find(s => s.map === map);
    return stats ? stats.winRate : DEFAULT_WIN_RATE;
  };
  
  const getMapGames = (team: VLRTeamFull, map: ValorantMap): number => {
    const stats = team.mapStats.find(s => s.map === map);
    return stats ? stats.gamesPlayed : 0;
  };
  
  // Score each map for each team (higher = better for that team)
  const team1MapScores = ACTIVE_MAP_POOL.map(map => ({
    map,
    score: getMapWinRate(team1, map) - getMapWinRate(team2, map),
    team1WinRate: getMapWinRate(team1, map),
    team2WinRate: getMapWinRate(team2, map),
    team1Games: getMapGames(team1, map),
    team2Games: getMapGames(team2, map),
  }));
  
  // Sort by advantage for each team
  const team1Preferred = [...team1MapScores].sort((a, b) => b.score - a.score);
  const team2Preferred = [...team1MapScores].sort((a, b) => a.score - b.score);
  
  // Predict bans (worst maps for each team that aren't the other's best)
  const team1Bans: ValorantMap[] = [];
  const team2Bans: ValorantMap[] = [];
  
  // Team 1 bans their worst maps (favoring opponent)
  for (const mapData of team2Preferred) {
    if (team1Bans.length >= 2) break;
    if (!team2Bans.includes(mapData.map)) {
      team1Bans.push(mapData.map);
    }
  }
  
  // Team 2 bans their worst maps (favoring opponent)
  for (const mapData of team1Preferred) {
    if (team2Bans.length >= 2) break;
    if (!team1Bans.includes(mapData.map)) {
      team2Bans.push(mapData.map);
    }
  }
  
  // Picks: Each team picks their best remaining map
  const banned = new Set([...team1Bans, ...team2Bans]);
  const remaining = ACTIVE_MAP_POOL.filter(m => !banned.has(m));
  
  const team1PickCandidates = team1Preferred.filter(m => remaining.includes(m.map));
  const team2PickCandidates = team2Preferred.filter(m => remaining.includes(m.map));
  
  const team1Pick = team1PickCandidates[0]?.map || remaining[0];
  const team2Pick = team2PickCandidates[0]?.map || remaining[1];
  
  // Decider is whatever is left after picks
  const picked = new Set([team1Pick, team2Pick]);
  const deciderMaps = remaining.filter(m => !picked.has(m));
  
  return {
    team1Pick,
    team1PickConfidence: calculateConfidence(
      getMapGames(team1, team1Pick),
      getMapGames(team2, team1Pick)
    ),
    team2Pick,
    team2PickConfidence: calculateConfidence(
      getMapGames(team1, team2Pick),
      getMapGames(team2, team2Pick)
    ),
    deciderMaps,
    predictedBans: {
      team1Bans,
      team2Bans,
    },
  };
}

// ============================================================================
// Head-to-Head Analysis
// ============================================================================

export function analyzeHeadToHead(
  team1: VLRTeamFull,
  team2: VLRTeamFull,
  maps: ValorantMap[]
): HeadToHeadAnalysis[] {
  return maps.map(map => {
    const team1Stats = team1.mapStats.find(s => s.map === map);
    const team2Stats = team2.mapStats.find(s => s.map === map);
    
    const team1WinRate = team1Stats?.winRate ?? DEFAULT_WIN_RATE;
    const team2WinRate = team2Stats?.winRate ?? DEFAULT_WIN_RATE;
    const team1Games = team1Stats?.gamesPlayed ?? 0;
    const team2Games = team2Stats?.gamesPlayed ?? 0;
    
    const h2hProb = log5(team1WinRate, team2WinRate);
    const confidence = calculateConfidence(team1Games, team2Games);
    
    return {
      map,
      team1WinRate,
      team2WinRate,
      headToHeadProb: h2hProb,
      confidence,
      sampleSize: { team1: team1Games, team2: team2Games },
    };
  });
}

// ============================================================================
// Monte Carlo Series Simulation
// ============================================================================

/**
 * Simulate a Bo3/Bo5 series using Monte Carlo method
 * Returns probability of team1 winning the series
 */
export function simulateSeries(
  mapProbs: number[], // Probability of team1 winning each map
  matchType: 'Bo1' | 'Bo3' | 'Bo5'
): { team1WinProb: number; mapBreakdown: number[][] } {
  const mapsToWin = matchType === 'Bo1' ? 1 : matchType === 'Bo3' ? 2 : 3;
  const maxMaps = matchType === 'Bo1' ? 1 : matchType === 'Bo3' ? 3 : 5;
  
  let team1Wins = 0;
  const scoreBreakdown: Map<string, number> = new Map();
  
  for (let sim = 0; sim < MONTE_CARLO_SIMULATIONS; sim++) {
    let team1Score = 0;
    let team2Score = 0;
    let mapIndex = 0;
    
    while (team1Score < mapsToWin && team2Score < mapsToWin && mapIndex < maxMaps) {
      const prob = mapProbs[mapIndex] ?? 0.5;
      if (Math.random() < prob) {
        team1Score++;
      } else {
        team2Score++;
      }
      mapIndex++;
    }
    
    if (team1Score === mapsToWin) {
      team1Wins++;
    }
    
    const scoreKey = `${team1Score}-${team2Score}`;
    scoreBreakdown.set(scoreKey, (scoreBreakdown.get(scoreKey) || 0) + 1);
  }
  
  // Convert breakdown to array
  const mapBreakdown = Array.from(scoreBreakdown.entries()).map(([score, count]) => {
    const [t1, t2] = score.split('-').map(Number);
    return [t1, t2, count / MONTE_CARLO_SIMULATIONS];
  });
  
  return {
    team1WinProb: team1Wins / MONTE_CARLO_SIMULATIONS,
    mapBreakdown,
  };
}

// ============================================================================
// Edge Factor Detection
// ============================================================================

function detectEdgeFactors(
  team1: VLRTeamFull,
  team2: VLRTeamFull,
  mapPicks: MapPickPrediction
): EdgeFactor[] {
  const factors: EdgeFactor[] = [];
  
  // Check for new roster members
  const team1NewPlayers = team1.roster.filter(p => p.isNewToTeam).length;
  const team2NewPlayers = team2.roster.filter(p => p.isNewToTeam).length;
  
  if (team1NewPlayers > 0) {
    factors.push({
      factor: 'New Roster',
      impact: -0.03 * team1NewPlayers,
      description: `${team1.name} has ${team1NewPlayers} new player(s) - may lack team synergy`,
    });
  }
  
  if (team2NewPlayers > 0) {
    factors.push({
      factor: 'New Roster',
      impact: 0.03 * team2NewPlayers,
      description: `${team2.name} has ${team2NewPlayers} new player(s) - may lack team synergy`,
    });
  }
  
  // Check for rating differential
  const ratingDiff = team1.rating - team2.rating;
  if (Math.abs(ratingDiff) > 100) {
    factors.push({
      factor: 'Rating Gap',
      impact: ratingDiff > 0 ? 0.05 : -0.05,
      description: `${ratingDiff > 0 ? team1.name : team2.name} is significantly higher rated (${Math.abs(ratingDiff)} pts)`,
    });
  }
  
  // Check for home map advantage
  const team1PickStats = team1.mapStats.find(s => s.map === mapPicks.team1Pick);
  const team2PickStats = team2.mapStats.find(s => s.map === mapPicks.team2Pick);
  
  if (team1PickStats && team1PickStats.winRate > 0.7) {
    factors.push({
      factor: 'Strong Map Pick',
      impact: 0.03,
      description: `${team1.name} has ${(team1PickStats.winRate * 100).toFixed(0)}% win rate on their pick (${mapPicks.team1Pick})`,
    });
  }
  
  if (team2PickStats && team2PickStats.winRate > 0.7) {
    factors.push({
      factor: 'Strong Map Pick',
      impact: -0.03,
      description: `${team2.name} has ${(team2PickStats.winRate * 100).toFixed(0)}% win rate on their pick (${mapPicks.team2Pick})`,
    });
  }
  
  // Check recent form
  const team1RecentWins = team1.recentMatches.slice(0, 5).filter(m => m.result === 'win').length;
  const team2RecentWins = team2.recentMatches.slice(0, 5).filter(m => m.result === 'win').length;
  
  if (team1RecentWins >= 4) {
    factors.push({
      factor: 'Hot Streak',
      impact: 0.02,
      description: `${team1.name} won ${team1RecentWins}/5 recent matches`,
    });
  } else if (team1RecentWins <= 1) {
    factors.push({
      factor: 'Cold Streak',
      impact: -0.02,
      description: `${team1.name} only won ${team1RecentWins}/5 recent matches`,
    });
  }
  
  if (team2RecentWins >= 4) {
    factors.push({
      factor: 'Hot Streak',
      impact: -0.02,
      description: `${team2.name} won ${team2RecentWins}/5 recent matches`,
    });
  } else if (team2RecentWins <= 1) {
    factors.push({
      factor: 'Cold Streak',
      impact: 0.02,
      description: `${team2.name} only won ${team2RecentWins}/5 recent matches`,
    });
  }
  
  return factors;
}

// ============================================================================
// Warning Detection
// ============================================================================

function detectWarnings(
  team1: VLRTeamFull,
  team2: VLRTeamFull,
  mapAnalysis: HeadToHeadAnalysis[]
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];
  
  // Check for low sample sizes
  const lowSampleMaps = mapAnalysis.filter(
    m => m.sampleSize.team1 < MIN_GAMES_FOR_CONFIDENCE || 
         m.sampleSize.team2 < MIN_GAMES_FOR_CONFIDENCE
  );
  
  if (lowSampleMaps.length > 0) {
    warnings.push({
      severity: 'medium',
      message: `Low sample size on ${lowSampleMaps.length} map(s): ${lowSampleMaps.map(m => m.map).join(', ')}`,
      recommendation: 'Reduce bet size or skip this match',
    });
  }
  
  // Check for stale data
  const daysSinceUpdate1 = (Date.now() - team1.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceUpdate2 = (Date.now() - team2.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceUpdate1 > 7 || daysSinceUpdate2 > 7) {
    warnings.push({
      severity: 'low',
      message: 'Team data may be stale (>7 days old)',
      recommendation: 'Refresh team stats before betting',
    });
  }
  
  // Check for new roster
  const hasNewPlayers = 
    team1.roster.some(p => p.isNewToTeam) || 
    team2.roster.some(p => p.isNewToTeam);
  
  if (hasNewPlayers) {
    warnings.push({
      severity: 'high',
      message: 'One or more teams have new roster members',
      recommendation: 'Historical map stats may not be representative',
    });
  }
  
  // Check for extreme volatility (very close match)
  const avgConfidence = mapAnalysis.reduce((sum, m) => sum + m.confidence, 0) / mapAnalysis.length;
  if (avgConfidence < 0.5) {
    warnings.push({
      severity: 'medium',
      message: 'Low overall confidence in predictions',
      recommendation: 'This is a high-variance match, consider smaller bet size',
    });
  }
  
  return warnings;
}

// ============================================================================
// Full Series Analysis
// ============================================================================

export function analyzeMatch(
  team1: VLRTeamFull,
  team2: VLRTeamFull,
  matchType: 'Bo1' | 'Bo3' | 'Bo5'
): SeriesAnalysis {
  // Predict map picks
  const mapPicks = predictMapPicks(team1, team2, matchType);
  
  // Determine maps that will be played
  let mapsToAnalyze: ValorantMap[];
  if (matchType === 'Bo1') {
    mapsToAnalyze = [mapPicks.deciderMaps[0] || ACTIVE_MAP_POOL[0]];
  } else if (matchType === 'Bo3') {
    mapsToAnalyze = [
      mapPicks.team1Pick,
      mapPicks.team2Pick,
      mapPicks.deciderMaps[0] || ACTIVE_MAP_POOL[0],
    ];
  } else {
    mapsToAnalyze = [
      mapPicks.team1Pick,
      mapPicks.team2Pick,
      ...mapPicks.deciderMaps.slice(0, 3),
    ];
  }
  
  // Analyze each map
  const mapAnalysis = analyzeHeadToHead(team1, team2, mapsToAnalyze);
  
  // Get probabilities for simulation
  const mapProbs = mapAnalysis.map(m => m.headToHeadProb);
  
  // Simulate series
  const { team1WinProb } = simulateSeries(mapProbs, matchType);
  
  // Detect edge factors
  const edgeFactors = detectEdgeFactors(team1, team2, mapPicks);
  
  // Calculate adjusted probability
  const edgeAdjustment = edgeFactors.reduce((sum, f) => sum + f.impact, 0);
  const adjustedProb = Math.max(0.01, Math.min(0.99, team1WinProb + edgeAdjustment));
  
  // Detect warnings
  const warnings = detectWarnings(team1, team2, mapAnalysis);
  
  // Calculate overall confidence
  const avgMapConfidence = mapAnalysis.reduce((sum, m) => sum + m.confidence, 0) / mapAnalysis.length;
  const warningPenalty = warnings.filter(w => w.severity === 'high').length * 0.1 +
                         warnings.filter(w => w.severity === 'medium').length * 0.05;
  const overallConfidence = Math.max(0.3, avgMapConfidence - warningPenalty);
  
  return {
    team1,
    team2,
    matchType,
    mapPicks,
    mapAnalysis,
    seriesWinProb: {
      team1: adjustedProb,
      team2: 1 - adjustedProb,
      confidence: overallConfidence,
    },
    edgeFactors,
    warnings,
  };
}

// ============================================================================
// Exports
// ============================================================================

export const mapAnalyzer = {
  log5,
  calculateConfidence,
  predictMapPicks,
  analyzeHeadToHead,
  simulateSeries,
  analyzeMatch,
};
