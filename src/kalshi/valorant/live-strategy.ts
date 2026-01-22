/**
 * Live Betting Strategy for Valorant
 * 
 * Factors in momentum swings, economy, ultimate availability,
 * and round-by-round dynamics for in-play betting edge.
 */

// ============================================================================
// Valorant Economy Constants
// ============================================================================

export const ECONOMY = {
  // Starting credits
  PISTOL_ROUND_CREDITS: 800,
  
  // Round rewards
  WIN_REWARD: 3000,
  LOSS_STREAK_BONUS: [1900, 2400, 2900], // 1st, 2nd, 3rd+ loss
  PLANT_BONUS: 300,
  
  // Thresholds
  FULL_BUY_THRESHOLD: 3900, // Can afford rifle + light shield
  FORCE_BUY_THRESHOLD: 2500, // Awkward buy range
  ECO_THRESHOLD: 1500, // Save round
  
  // Weapon costs (approximate)
  RIFLE_COST: 2900, // Vandal/Phantom
  OPERATOR_COST: 4700,
  FULL_ARMOR: 1000,
  LIGHT_ARMOR: 400,
  
  // Typical full buy cost
  FULL_BUY_COST: 3900, // Rifle + Full armor
  OPERATOR_BUY_COST: 5700, // Op + Full armor
};

// ============================================================================
// Ultimate Point System
// ============================================================================

export const ULT_POINTS = {
  // Points to charge ultimate (by agent)
  VIPER: 8,
  OMEN: 7,
  BRIMSTONE: 7,
  ASTRA: 7,
  HARBOR: 7,
  CLOVE: 7,
  
  JETT: 7,
  RAZE: 8,
  REYNA: 6,
  PHOENIX: 6,
  NEON: 7,
  ISO: 7,
  WAYLAY: 7,
  YORU: 7,
  
  SOVA: 8,
  BREACH: 8,
  SKYE: 6,
  KAYO: 7,
  FADE: 7,
  GEKKO: 7,
  TEJO: 7,
  
  SAGE: 8,
  KILLJOY: 8,
  CYPHER: 6,
  CHAMBER: 8,
  DEADLOCK: 8,
  VYSE: 7,
  
  // Points gained per action
  KILL: 1,
  DEATH: 1,
  PLANT: 1,
  DEFUSE: 1,
  ROUND_START: 1, // Free point each round
};

// ============================================================================
// Momentum & Psychology
// ============================================================================

export interface MomentumState {
  team1Streak: number; // Positive = winning, negative = losing
  team2Streak: number;
  team1Timeouts: number; // Remaining timeouts
  team2Timeouts: number;
  lastThrillerWin: 'team1' | 'team2' | null; // Won a close round (1v1, defuse, etc)
  pistolWinner: 'team1' | 'team2' | null;
  halfScore: { team1: number; team2: number } | null;
}

export interface EconomyState {
  team1Credits: number; // Estimated team bank
  team2Credits: number;
  team1BuyType: 'full' | 'force' | 'eco' | 'bonus';
  team2BuyType: 'full' | 'eco' | 'force' | 'bonus';
  team1LossStreak: number;
  team2LossStreak: number;
}

export interface UltimateState {
  team1Ults: { agent: string; ready: boolean; points: number }[];
  team2Ults: { agent: string; ready: boolean; points: number }[];
  team1KeyUltsReady: number; // High-impact ults (Sage res, KJ lockdown, etc)
  team2KeyUltsReady: number;
}

export interface LiveMatchState {
  map: string;
  team1Score: number;
  team2Score: number;
  currentRound: number;
  side: 'first' | 'second'; // First or second half
  team1Side: 'attack' | 'defense';
  team2Side: 'attack' | 'defense';
  momentum: MomentumState;
  economy: EconomyState;
  ultimates: UltimateState;
}

// ============================================================================
// Key Ultimate Impact Ratings
// ============================================================================

export const ULT_IMPACT: Record<string, { impact: number; type: 'fight' | 'utility' | 'save' }> = {
  // Highest impact ults (can swing rounds)
  SAGE: { impact: 10, type: 'save' },       // Resurrection is game-changing
  KILLJOY: { impact: 9, type: 'utility' },  // Lockdown forces rotation/fight
  BRIMSTONE: { impact: 8, type: 'fight' },  // Post-plant is devastating
  VIPER: { impact: 8, type: 'utility' },    // Pit controls site
  RAZE: { impact: 8, type: 'fight' },       // Can get multi-kills
  SOVA: { impact: 7, type: 'fight' },       // Wall-bang potential
  
  // High impact
  BREACH: { impact: 7, type: 'utility' },   // Rolling Thunder entry
  OMEN: { impact: 6, type: 'utility' },     // Information + paranoia
  FADE: { impact: 6, type: 'utility' },     // Nightfall is strong entry
  GEKKO: { impact: 6, type: 'utility' },    // Thrash is good entry
  
  // Medium impact
  JETT: { impact: 6, type: 'fight' },       // Knives are strong
  CHAMBER: { impact: 6, type: 'fight' },    // Tour de Force
  REYNA: { impact: 5, type: 'fight' },      // Empress for aggression
  PHOENIX: { impact: 5, type: 'fight' },    // Run it Back for entry
  KAYO: { impact: 6, type: 'utility' },     // Null/CMD is strong
  SKYE: { impact: 5, type: 'utility' },     // Seekers for info
  
  // Lower impact (still useful)
  CYPHER: { impact: 4, type: 'utility' },   // Info but no kills
  NEON: { impact: 5, type: 'fight' },
  YORU: { impact: 5, type: 'utility' },
  ISO: { impact: 5, type: 'fight' },
  ASTRA: { impact: 6, type: 'utility' },
  HARBOR: { impact: 5, type: 'utility' },
  CLOVE: { impact: 5, type: 'utility' },
  DEADLOCK: { impact: 5, type: 'utility' },
  VYSE: { impact: 5, type: 'utility' },
  WAYLAY: { impact: 6, type: 'fight' },
  TEJO: { impact: 6, type: 'utility' },
  VETO: { impact: 5, type: 'utility' },
};

// ============================================================================
// Map-Side Win Rates (Attack vs Defense advantage)
// ============================================================================

export const MAP_SIDE_ADVANTAGE: Record<string, { attackWR: number; defenseWR: number }> = {
  // Defense-sided maps
  'Split': { attackWR: 0.44, defenseWR: 0.56 },
  'Ascent': { attackWR: 0.47, defenseWR: 0.53 },
  'Bind': { attackWR: 0.48, defenseWR: 0.52 },
  
  // Balanced maps
  'Haven': { attackWR: 0.50, defenseWR: 0.50 },
  'Icebox': { attackWR: 0.49, defenseWR: 0.51 },
  'Lotus': { attackWR: 0.50, defenseWR: 0.50 },
  'Sunset': { attackWR: 0.50, defenseWR: 0.50 },
  'Abyss': { attackWR: 0.49, defenseWR: 0.51 },
  
  // Attack-sided maps
  'Pearl': { attackWR: 0.52, defenseWR: 0.48 },
  'Breeze': { attackWR: 0.51, defenseWR: 0.49 },
  'Fracture': { attackWR: 0.53, defenseWR: 0.47 },
  'Corrode': { attackWR: 0.51, defenseWR: 0.49 },
};

// ============================================================================
// Round Win Probability Calculators
// ============================================================================

/**
 * Calculate base round win probability based on economy
 */
export function calculateEconomyAdvantage(
  teamBuyType: 'full' | 'force' | 'eco' | 'bonus',
  opponentBuyType: 'full' | 'force' | 'eco' | 'bonus'
): number {
  const buyStrength: Record<string, number> = {
    full: 1.0,
    bonus: 0.85, // Saved guns but less utility
    force: 0.6,  // Weaker guns
    eco: 0.25,   // Pistols/SMGs only
  };
  
  const teamStr = buyStrength[teamBuyType];
  const oppStr = buyStrength[opponentBuyType];
  
  // Convert to probability using logistic function
  const diff = teamStr - oppStr;
  return 1 / (1 + Math.exp(-3 * diff)); // Steeper curve for bigger econ diff
}

/**
 * Calculate momentum modifier
 * Winning streaks increase confidence, losing streaks hurt
 */
export function calculateMomentumModifier(streak: number): number {
  if (streak >= 4) return 0.08;  // Hot streak
  if (streak >= 3) return 0.05;
  if (streak >= 2) return 0.03;
  if (streak === 1) return 0.01;
  if (streak === 0) return 0;
  if (streak <= -1) return -0.01;
  if (streak <= -2) return -0.03;
  if (streak <= -3) return -0.05;
  return -0.07; // Long losing streak
}

/**
 * Calculate ultimate economy advantage
 */
export function calculateUltAdvantage(state: LiveMatchState): number {
  const team1UltScore = state.ultimates.team1Ults
    .filter(u => u.ready)
    .reduce((sum, u) => {
      const impact = ULT_IMPACT[u.agent.toUpperCase()]?.impact || 5;
      return sum + impact;
    }, 0);
  
  const team2UltScore = state.ultimates.team2Ults
    .filter(u => u.ready)
    .reduce((sum, u) => {
      const impact = ULT_IMPACT[u.agent.toUpperCase()]?.impact || 5;
      return sum + impact;
    }, 0);
  
  const diff = team1UltScore - team2UltScore;
  
  // Cap the advantage from ults
  if (diff >= 15) return 0.06;
  if (diff >= 10) return 0.04;
  if (diff >= 5) return 0.02;
  if (diff <= -15) return -0.06;
  if (diff <= -10) return -0.04;
  if (diff <= -5) return -0.02;
  return 0;
}

/**
 * Calculate side advantage for current round
 */
export function calculateSideAdvantage(map: string, side: 'attack' | 'defense'): number {
  const mapData = MAP_SIDE_ADVANTAGE[map];
  if (!mapData) return 0;
  
  const advantage = side === 'attack' ? mapData.attackWR : mapData.defenseWR;
  return advantage - 0.5; // Convert to modifier (-0.06 to +0.06)
}

// ============================================================================
// Live Round Win Probability
// ============================================================================

/**
 * Calculate probability of team1 winning the current round
 * Combines economy, momentum, ultimates, and side advantage
 */
export function calculateRoundWinProbability(
  state: LiveMatchState,
  baseTeamStrength: number = 0.5 // From pre-match analysis
): number {
  let probability = baseTeamStrength;
  
  // 1. Economy advantage (biggest factor)
  const econProb = calculateEconomyAdvantage(
    state.economy.team1BuyType,
    state.economy.team2BuyType
  );
  // Weight economy heavily - it's ~40% of round outcome
  probability = probability * 0.6 + econProb * 0.4;
  
  // 2. Momentum modifier
  const momentumMod = calculateMomentumModifier(state.momentum.team1Streak) -
                      calculateMomentumModifier(state.momentum.team2Streak);
  probability += momentumMod;
  
  // 3. Ultimate advantage
  const ultMod = calculateUltAdvantage(state);
  probability += ultMod;
  
  // 4. Side advantage
  const sideMod = calculateSideAdvantage(state.map, state.team1Side);
  probability += sideMod;
  
  // 5. Special round modifiers
  
  // Pistol rounds are more volatile
  if (state.currentRound === 1 || state.currentRound === 13) {
    // Pistol round - economy doesn't matter, more 50/50
    probability = probability * 0.3 + baseTeamStrength * 0.7;
  }
  
  // Second round after pistol win is heavily favored
  if (state.currentRound === 2 || state.currentRound === 14) {
    if (state.momentum.pistolWinner === 'team1') {
      probability += 0.20; // Huge advantage with SMGs vs pistols
    } else if (state.momentum.pistolWinner === 'team2') {
      probability -= 0.20;
    }
  }
  
  // Third round (bonus round) - loser usually forces
  if (state.currentRound === 3 || state.currentRound === 15) {
    // If pistol winner, they're on bonus round
    if (state.momentum.pistolWinner === 'team1') {
      probability += 0.08; // Still favored but closer
    } else if (state.momentum.pistolWinner === 'team2') {
      probability -= 0.08;
    }
  }
  
  // Clamp probability
  return Math.max(0.05, Math.min(0.95, probability));
}

// ============================================================================
// Map Win Probability (Live)
// ============================================================================

/**
 * Calculate probability of team1 winning the map from current score
 * Uses Monte Carlo simulation with round probabilities
 */
export function calculateLiveMapWinProbability(
  state: LiveMatchState,
  baseRoundWinProb: number = 0.5,
  simulations: number = 10000
): { probability: number; expectedScore: string } {
  const roundsToWin = 13;
  let team1Wins = 0;
  const scoreDistribution: Map<string, number> = new Map();
  
  for (let sim = 0; sim < simulations; sim++) {
    let t1Score = state.team1Score;
    let t2Score = state.team2Score;
    let currentRound = state.currentRound;
    let t1Side = state.team1Side;
    
    while (t1Score < roundsToWin && t2Score < roundsToWin) {
      // Adjust for side switch at round 13
      if (currentRound === 13) {
        t1Side = t1Side === 'attack' ? 'defense' : 'attack';
      }
      
      // Calculate round probability with side advantage
      const sideAdv = calculateSideAdvantage(state.map, t1Side);
      const roundProb = baseRoundWinProb + sideAdv;
      
      if (Math.random() < roundProb) {
        t1Score++;
      } else {
        t2Score++;
      }
      currentRound++;
    }
    
    if (t1Score === roundsToWin) team1Wins++;
    
    const finalScore = `${t1Score}-${t2Score}`;
    scoreDistribution.set(finalScore, (scoreDistribution.get(finalScore) || 0) + 1);
  }
  
  // Get most likely final score
  let maxCount = 0;
  let expectedScore = '';
  scoreDistribution.forEach((count, score) => {
    if (count > maxCount) {
      maxCount = count;
      expectedScore = score;
    }
  });
  
  return {
    probability: team1Wins / simulations,
    expectedScore,
  };
}

// ============================================================================
// Live Betting Signals
// ============================================================================

export type LiveSignalType = 
  | 'ECONOMY_MISMATCH'    // Huge econ advantage
  | 'MOMENTUM_SHIFT'      // Team on streak
  | 'ULT_STACK'           // Multiple high-impact ults ready
  | 'SIDE_SWITCH_VALUE'   // Good buy-in before half
  | 'ANTI_ECO_TRAP'       // Eco round might upset
  | 'COMEBACK_POTENTIAL'  // Loss streak bonus building
  | 'CLOSE_OUT_DANGER';   // Team might choke lead

export interface LiveBettingSignal {
  type: LiveSignalType;
  team: 'team1' | 'team2';
  confidence: number; // 0-1
  expectedEdge: number; // Percentage
  reason: string;
  suggestedAction: 'BET' | 'HEDGE' | 'WAIT';
}

/**
 * Analyze live match state and generate betting signals
 */
export function generateLiveSignals(state: LiveMatchState): LiveBettingSignal[] {
  const signals: LiveBettingSignal[] = [];
  
  // 1. Economy Mismatch Signal
  if (state.economy.team1BuyType === 'full' && state.economy.team2BuyType === 'eco') {
    signals.push({
      type: 'ECONOMY_MISMATCH',
      team: 'team1',
      confidence: 0.85,
      expectedEdge: 0.25, // 75% vs 50% expected
      reason: `Full buy vs eco - ${calculateEconomyAdvantage('full', 'eco').toFixed(0)}% round win expected`,
      suggestedAction: 'BET',
    });
  } else if (state.economy.team2BuyType === 'full' && state.economy.team1BuyType === 'eco') {
    signals.push({
      type: 'ECONOMY_MISMATCH',
      team: 'team2',
      confidence: 0.85,
      expectedEdge: 0.25,
      reason: `Full buy vs eco - strong round favorite`,
      suggestedAction: 'BET',
    });
  }
  
  // 2. Anti-Eco Trap Warning
  if (state.economy.team1BuyType === 'eco' && state.momentum.team1Streak <= -2) {
    // Team on losing streak with eco - might thrifty
    signals.push({
      type: 'ANTI_ECO_TRAP',
      team: 'team2',
      confidence: 0.4,
      expectedEdge: -0.05, // Negative edge - danger
      reason: 'Desperate eco after losses - watch for thrifty upset',
      suggestedAction: 'WAIT',
    });
  }
  
  // 3. Momentum Shift
  if (state.momentum.team1Streak >= 4) {
    signals.push({
      type: 'MOMENTUM_SHIFT',
      team: 'team1',
      confidence: 0.7,
      expectedEdge: 0.08,
      reason: `${state.momentum.team1Streak} round win streak - riding hot`,
      suggestedAction: 'BET',
    });
  } else if (state.momentum.team2Streak >= 4) {
    signals.push({
      type: 'MOMENTUM_SHIFT',
      team: 'team2',
      confidence: 0.7,
      expectedEdge: 0.08,
      reason: `${state.momentum.team2Streak} round win streak - opponent tilting`,
      suggestedAction: 'BET',
    });
  }
  
  // 4. Ultimate Stack
  if (state.ultimates.team1KeyUltsReady >= 3) {
    signals.push({
      type: 'ULT_STACK',
      team: 'team1',
      confidence: 0.65,
      expectedEdge: 0.06,
      reason: `${state.ultimates.team1KeyUltsReady} high-impact ultimates ready`,
      suggestedAction: 'BET',
    });
  }
  
  // 5. Side Switch Value
  if (state.currentRound === 12 && state.team1Score >= 9) {
    // Team ahead going into side switch
    signals.push({
      type: 'SIDE_SWITCH_VALUE',
      team: 'team1',
      confidence: 0.7,
      expectedEdge: 0.10,
      reason: `${state.team1Score}-${state.team2Score} lead with side switch coming`,
      suggestedAction: 'BET',
    });
  }
  
  // 6. Comeback Potential
  if (state.economy.team1LossStreak >= 3 && state.team1Score <= state.team2Score - 3) {
    // Max loss bonus, might stabilize
    signals.push({
      type: 'COMEBACK_POTENTIAL',
      team: 'team1',
      confidence: 0.55,
      expectedEdge: 0.05,
      reason: 'Max loss bonus reached - full buy incoming, good live odds',
      suggestedAction: 'BET',
    });
  }
  
  // 7. Close Out Danger
  if (state.team1Score >= 11 && state.team2Score >= 8) {
    // Leading team might choke
    signals.push({
      type: 'CLOSE_OUT_DANGER',
      team: 'team1',
      confidence: 0.5,
      expectedEdge: -0.03,
      reason: `${state.team1Score}-${state.team2Score} close game - variance high`,
      suggestedAction: 'HEDGE',
    });
  }
  
  return signals;
}

// ============================================================================
// Economy Prediction
// ============================================================================

/**
 * Predict next round economy based on current state
 */
export function predictNextRoundEconomy(
  currentCredits: number,
  wonLastRound: boolean,
  lossStreak: number,
  plantedBomb: boolean = false
): { credits: number; buyType: 'full' | 'force' | 'eco' | 'bonus' } {
  let credits = currentCredits;
  
  if (wonLastRound) {
    credits += ECONOMY.WIN_REWARD;
  } else {
    const lossBonus = ECONOMY.LOSS_STREAK_BONUS[Math.min(lossStreak, 2)];
    credits += lossBonus;
    if (plantedBomb) credits += ECONOMY.PLANT_BONUS;
  }
  
  // Determine buy type
  let buyType: 'full' | 'force' | 'eco' | 'bonus';
  
  if (wonLastRound && credits >= ECONOMY.FULL_BUY_THRESHOLD) {
    buyType = 'bonus'; // Saved guns + can buy utility
  } else if (credits >= ECONOMY.FULL_BUY_THRESHOLD) {
    buyType = 'full';
  } else if (credits >= ECONOMY.FORCE_BUY_THRESHOLD) {
    buyType = 'force';
  } else {
    buyType = 'eco';
  }
  
  return { credits, buyType };
}

// ============================================================================
// Exports
// ============================================================================

export const liveStrategy = {
  calculateRoundWinProbability,
  calculateLiveMapWinProbability,
  calculateEconomyAdvantage,
  calculateMomentumModifier,
  calculateUltAdvantage,
  calculateSideAdvantage,
  generateLiveSignals,
  predictNextRoundEconomy,
  ECONOMY,
  ULT_POINTS,
  ULT_IMPACT,
  MAP_SIDE_ADVANTAGE,
};
