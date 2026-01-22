/**
 * Valorant Trading Bot - Type Definitions
 * 
 * Core types for VLR.gg scraping, map analysis, and Kalshi trading
 */

// ============================================================================
// VLR.gg Data Types
// ============================================================================

export interface VLRMatch {
  id: string;
  url: string;
  team1: VLRTeamBasic;
  team2: VLRTeamBasic;
  tournament: string;
  tournamentTier: 'S' | 'A' | 'B' | 'C'; // S = VCT International, A = VCT Regional, B = Challengers, C = Other
  matchType: 'Bo1' | 'Bo3' | 'Bo5';
  scheduledTime: Date;
  status: 'upcoming' | 'live' | 'completed';
}

export interface VLRTeamBasic {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  region: string;
}

export interface VLRTeamFull extends VLRTeamBasic {
  rating: number;
  ranking: number;
  record: { wins: number; losses: number };
  roster: VLRPlayer[];
  mapStats: VLRMapStats[];
  recentMatches: VLRRecentMatch[];
  lastUpdated: Date;
}

export interface VLRPlayer {
  id: string;
  name: string;
  realName: string;
  role: 'duelist' | 'initiator' | 'controller' | 'sentinel' | 'flex';
  joinedDate?: Date;
  isNewToTeam: boolean; // Joined in last 14 days
}

export interface VLRMapStats {
  map: ValorantMap;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  attackRounds: { won: number; lost: number };
  defenseRounds: { won: number; lost: number };
  attackWinRate: number;
  defenseWinRate: number;
  recentForm: number[]; // Last 5 games on this map: 1 = win, 0 = loss
}

export interface VLRRecentMatch {
  id: string;
  opponent: string;
  result: 'win' | 'loss';
  score: string;
  maps: { map: ValorantMap; score: string; won: boolean }[];
  date: Date;
  tournament: string;
}

// ============================================================================
// Valorant Game Types
// ============================================================================

export type ValorantMap = 
  | 'Ascent'
  | 'Bind'
  | 'Haven'
  | 'Split'
  | 'Icebox'
  | 'Breeze'
  | 'Fracture'
  | 'Pearl'
  | 'Lotus'
  | 'Sunset'
  | 'Abyss';

// Current competitive map pool (as of 2026)
export const ACTIVE_MAP_POOL: ValorantMap[] = [
  'Ascent',
  'Bind',
  'Haven',
  'Split',
  'Icebox',
  'Lotus',
  'Sunset',
  'Abyss',
];

// Maps removed from rotation
export const INACTIVE_MAPS: ValorantMap[] = [
  'Breeze',
  'Fracture',
  'Pearl',
];

// ============================================================================
// Analysis Types
// ============================================================================

export interface MapPickPrediction {
  team1Pick: ValorantMap;
  team1PickConfidence: number;
  team2Pick: ValorantMap;
  team2PickConfidence: number;
  deciderMaps: ValorantMap[]; // Possible decider maps after bans
  predictedBans: {
    team1Bans: ValorantMap[];
    team2Bans: ValorantMap[];
  };
}

export interface HeadToHeadAnalysis {
  map: ValorantMap;
  team1WinRate: number;
  team2WinRate: number;
  headToHeadProb: number; // Team 1's probability using log5
  confidence: number; // Based on sample size
  sampleSize: { team1: number; team2: number };
}

export interface SeriesAnalysis {
  team1: VLRTeamFull;
  team2: VLRTeamFull;
  matchType: 'Bo1' | 'Bo3' | 'Bo5';
  mapPicks: MapPickPrediction;
  mapAnalysis: HeadToHeadAnalysis[];
  seriesWinProb: {
    team1: number;
    team2: number;
    confidence: number;
  };
  edgeFactors: EdgeFactor[];
  warnings: AnalysisWarning[];
}

export interface EdgeFactor {
  factor: string;
  impact: number; // -0.1 to +0.1 adjustment to probability
  description: string;
}

export interface AnalysisWarning {
  severity: 'low' | 'medium' | 'high';
  message: string;
  recommendation: string;
}

// ============================================================================
// Kalshi Types
// ============================================================================

export interface KalshiMarket {
  ticker: string;
  title: string;
  team1: string;
  team2: string;
  tournament: string;
  yesPrice: number;
  noPrice: number;
  yesAsk: number;
  yesBid: number;
  noAsk: number;
  noBid: number;
  volume: number;
  openInterest: number;
  expirationTime: Date;
  status: 'active' | 'closed' | 'settled';
}

export interface KalshiOrder {
  orderId: string;
  ticker: string;
  side: 'yes' | 'no';
  type: 'limit' | 'market';
  price: number; // In cents (1-99)
  quantity: number;
  filledQuantity: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  createdAt: Date;
}

export interface KalshiPosition {
  ticker: string;
  yesContracts: number;
  noContracts: number;
  avgYesPrice: number;
  avgNoPrice: number;
  unrealizedPnl: number;
}

// ============================================================================
// Trading Types
// ============================================================================

export interface TradeSignal {
  matchId: string;
  market: KalshiMarket;
  analysis: SeriesAnalysis;
  recommendation: 'BET_TEAM1' | 'BET_TEAM2' | 'NO_EDGE' | 'SKIP';
  edge: number; // Percentage edge (e.g., 0.06 = 6%)
  impliedProbability: number; // What Kalshi thinks
  modelProbability: number; // What our model thinks
  confidence: number; // 0-1
  suggestedStake: number; // In dollars
  reasoning: string[];
}

export interface TradeExecution {
  signalId: string;
  orderId: string;
  ticker: string;
  side: 'yes' | 'no';
  price: number;
  quantity: number;
  executedAt: Date;
  status: 'pending' | 'filled' | 'partial' | 'failed';
  fillPrice?: number;
  fillQuantity?: number;
}

export interface TradeResult {
  executionId: string;
  matchId: string;
  ticker: string;
  side: 'yes' | 'no';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  actualOutcome: 'team1_won' | 'team2_won';
  modelCorrect: boolean;
  settledAt: Date;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface TradingConfig {
  // Bankroll management
  bankroll: number;
  maxBetPercent: number; // Max % of bankroll per bet (e.g., 0.03 = 3%)
  kellyFraction: number; // Fraction of Kelly to use (e.g., 0.25 = quarter Kelly)
  
  // Edge thresholds
  minEdge: number; // Minimum edge to consider (e.g., 0.05 = 5%)
  minConfidence: number; // Minimum confidence to bet (e.g., 0.6)
  
  // Risk limits
  maxDailyLoss: number; // Stop trading if down this much
  maxOpenPositions: number;
  maxExposurePerMatch: number;
  
  // Execution
  useDemo: boolean;
  autoExecute: boolean;
  slippageTolerance: number; // Max slippage in cents
  
  // Filters
  minTournamentTier: 'S' | 'A' | 'B' | 'C';
  minMapSampleSize: number; // Minimum games on a map to trust data
  excludeNewRosters: boolean; // Skip teams with players <14 days
}

export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  bankroll: 100,
  maxBetPercent: 0.03,
  kellyFraction: 0.25,
  minEdge: 0.05,
  minConfidence: 0.55,
  maxDailyLoss: 20,
  maxOpenPositions: 3,
  maxExposurePerMatch: 10,
  useDemo: true,
  autoExecute: false,
  slippageTolerance: 2,
  minTournamentTier: 'A',
  minMapSampleSize: 5,
  excludeNewRosters: true,
};
