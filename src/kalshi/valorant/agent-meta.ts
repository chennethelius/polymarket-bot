/**
 * Valorant Agent Meta Data
 * 
 * Agent pick rates, win rates, and map preferences for pro play.
 * Data informs analysis by understanding team compositions and playstyles.
 * 
 * Updated: January 2026
 * Sources: VLR.gg stats, pro play analysis
 */

import { ValorantMap } from './types';

// ============================================================================
// Agent Types & Roles
// ============================================================================

export type AgentRole = 'Duelist' | 'Initiator' | 'Controller' | 'Sentinel';

export interface AgentMeta {
  name: string;
  role: AgentRole;
  
  // Overall pro pick rate (0-1)
  pickRate: number;
  
  // Overall win rate when picked (0-1)
  winRate: number;
  
  // Map-specific pick rates (high = must-pick on this map)
  mapPickRates: Partial<Record<ValorantMap, number>>;
  
  // Map-specific win rates
  mapWinRates: Partial<Record<ValorantMap, number>>;
  
  // Playstyle indicators
  playstyle: {
    aggression: number;      // 0-1: passive to aggressive
    utility: number;         // 0-1: fragging to utility focus
    execHeavy: boolean;      // Good for structured executes
    retakeStrong: boolean;   // Strong in retake scenarios
    lurk: boolean;           // Good for lurk plays
    entry: boolean;          // Good for entry fragging
    anchor: boolean;         // Site anchor capability
  };
  
  // Common team comp roles
  compRole: string[];
  
  // Synergies (agents that work well with)
  synergies: string[];
  
  // Counter picks (agents weak against)
  counters: string[];
}

// ============================================================================
// Current Meta Agents (VCT 2026 Season)
// ============================================================================

export const AGENT_META: Record<string, AgentMeta> = {
  // ===================== DUELISTS =====================
  
  Jett: {
    name: 'Jett',
    role: 'Duelist',
    pickRate: 0.45,
    winRate: 0.51,
    mapPickRates: {
      'Ascent': 0.75,
      'Icebox': 0.85,
      'Breeze': 0.80,
      'Haven': 0.55,
      'Split': 0.40,
      'Bind': 0.35,
      'Lotus': 0.50,
      'Sunset': 0.45,
      'Abyss': 0.60,
    },
    mapWinRates: {
      'Ascent': 0.52,
      'Icebox': 0.54,
      'Breeze': 0.53,
      'Haven': 0.50,
      'Split': 0.48,
      'Bind': 0.47,
      'Lotus': 0.50,
      'Sunset': 0.49,
      'Abyss': 0.51,
    },
    playstyle: {
      aggression: 0.9,
      utility: 0.3,
      execHeavy: false,
      retakeStrong: true,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Primary Duelist', 'Op Player'],
    synergies: ['Omen', 'Sova', 'Killjoy'],
    counters: ['Chamber', 'Cypher'],
  },
  
  Raze: {
    name: 'Raze',
    role: 'Duelist',
    pickRate: 0.38,
    winRate: 0.52,
    mapPickRates: {
      'Bind': 0.90,
      'Split': 0.85,
      'Fracture': 0.80,
      'Haven': 0.45,
      'Lotus': 0.55,
      'Sunset': 0.70,
      'Ascent': 0.30,
      'Icebox': 0.25,
      'Breeze': 0.15,
      'Abyss': 0.50,
    },
    mapWinRates: {
      'Bind': 0.55,
      'Split': 0.54,
      'Fracture': 0.52,
      'Haven': 0.50,
      'Lotus': 0.51,
      'Sunset': 0.53,
      'Ascent': 0.48,
      'Icebox': 0.47,
      'Breeze': 0.45,
      'Abyss': 0.51,
    },
    playstyle: {
      aggression: 0.85,
      utility: 0.5,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Primary Duelist', 'Entry Fragger'],
    synergies: ['Breach', 'Skye', 'Brimstone'],
    counters: ['Killjoy', 'Cypher'],
  },
  
  Reyna: {
    name: 'Reyna',
    role: 'Duelist',
    pickRate: 0.12,
    winRate: 0.48,
    mapPickRates: {
      'Ascent': 0.15,
      'Split': 0.20,
      'Bind': 0.10,
      'Haven': 0.12,
      'Icebox': 0.08,
      'Breeze': 0.05,
      'Lotus': 0.10,
      'Sunset': 0.15,
      'Abyss': 0.12,
    },
    mapWinRates: {
      'Ascent': 0.49,
      'Split': 0.50,
      'Bind': 0.47,
      'Haven': 0.48,
      'Icebox': 0.46,
      'Breeze': 0.45,
      'Lotus': 0.47,
      'Sunset': 0.49,
      'Abyss': 0.48,
    },
    playstyle: {
      aggression: 0.95,
      utility: 0.15,
      execHeavy: false,
      retakeStrong: false,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Flex Duelist', 'Ego Pick'],
    synergies: ['Omen', 'Sage'],
    counters: ['Fade', 'Sova'],
  },
  
  Yoru: {
    name: 'Yoru',
    role: 'Duelist',
    pickRate: 0.08,
    winRate: 0.47,
    mapPickRates: {
      'Bind': 0.15,
      'Split': 0.10,
      'Icebox': 0.12,
      'Haven': 0.08,
      'Lotus': 0.10,
      'Ascent': 0.05,
      'Breeze': 0.03,
      'Sunset': 0.08,
      'Abyss': 0.10,
    },
    mapWinRates: {
      'Bind': 0.49,
      'Split': 0.48,
      'Icebox': 0.47,
      'Haven': 0.46,
      'Lotus': 0.47,
      'Ascent': 0.45,
      'Breeze': 0.44,
      'Sunset': 0.47,
      'Abyss': 0.48,
    },
    playstyle: {
      aggression: 0.7,
      utility: 0.4,
      execHeavy: false,
      retakeStrong: false,
      lurk: true,
      entry: false,
      anchor: false,
    },
    compRole: ['Lurker', 'Flex Duelist'],
    synergies: ['Omen', 'Brimstone'],
    counters: ['Fade', 'Killjoy'],
  },
  
  Neon: {
    name: 'Neon',
    role: 'Duelist',
    pickRate: 0.15,
    winRate: 0.49,
    mapPickRates: {
      'Fracture': 0.35,
      'Split': 0.25,
      'Haven': 0.20,
      'Bind': 0.15,
      'Lotus': 0.18,
      'Ascent': 0.10,
      'Icebox': 0.08,
      'Breeze': 0.05,
      'Sunset': 0.22,
      'Abyss': 0.20,
    },
    mapWinRates: {
      'Fracture': 0.51,
      'Split': 0.50,
      'Haven': 0.49,
      'Bind': 0.48,
      'Lotus': 0.49,
      'Ascent': 0.47,
      'Icebox': 0.46,
      'Breeze': 0.45,
      'Sunset': 0.50,
      'Abyss': 0.49,
    },
    playstyle: {
      aggression: 0.95,
      utility: 0.2,
      execHeavy: true,
      retakeStrong: false,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Rush Entry', 'Speed Duelist'],
    synergies: ['Breach', 'Gekko', 'Astra'],
    counters: ['Cypher', 'Killjoy', 'Chamber'],
  },
  
  Phoenix: {
    name: 'Phoenix',
    role: 'Duelist',
    pickRate: 0.05,
    winRate: 0.46,
    mapPickRates: {
      'Ascent': 0.08,
      'Haven': 0.06,
      'Bind': 0.05,
      'Split': 0.07,
      'Icebox': 0.03,
      'Breeze': 0.02,
      'Lotus': 0.04,
      'Sunset': 0.06,
      'Abyss': 0.05,
    },
    mapWinRates: {
      'Ascent': 0.47,
      'Haven': 0.46,
      'Bind': 0.45,
      'Split': 0.46,
      'Icebox': 0.44,
      'Breeze': 0.43,
      'Lotus': 0.45,
      'Sunset': 0.46,
      'Abyss': 0.45,
    },
    playstyle: {
      aggression: 0.8,
      utility: 0.4,
      execHeavy: true,
      retakeStrong: false,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Self-Sufficient Entry', 'Flash Duelist'],
    synergies: ['Omen', 'Cypher'],
    counters: ['Fade', 'Sova'],
  },
  
  Iso: {
    name: 'Iso',
    role: 'Duelist',
    pickRate: 0.18,
    winRate: 0.50,
    mapPickRates: {
      'Ascent': 0.30,
      'Icebox': 0.25,
      'Haven': 0.28,
      'Lotus': 0.22,
      'Split': 0.20,
      'Bind': 0.15,
      'Breeze': 0.12,
      'Sunset': 0.25,
      'Abyss': 0.22,
    },
    mapWinRates: {
      'Ascent': 0.52,
      'Icebox': 0.50,
      'Haven': 0.51,
      'Lotus': 0.50,
      'Split': 0.49,
      'Bind': 0.48,
      'Breeze': 0.47,
      'Sunset': 0.50,
      'Abyss': 0.50,
    },
    playstyle: {
      aggression: 0.75,
      utility: 0.35,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Double Duelist', 'Shield Entry'],
    synergies: ['Fade', 'Omen', 'Sova'],
    counters: ['Cypher', 'Killjoy'],
  },
  
  // ===================== INITIATORS =====================
  
  Sova: {
    name: 'Sova',
    role: 'Initiator',
    pickRate: 0.42,
    winRate: 0.52,
    mapPickRates: {
      'Ascent': 0.85,
      'Breeze': 0.90,
      'Icebox': 0.75,
      'Haven': 0.60,
      'Bind': 0.40,
      'Split': 0.25,
      'Lotus': 0.35,
      'Sunset': 0.30,
      'Abyss': 0.55,
    },
    mapWinRates: {
      'Ascent': 0.54,
      'Breeze': 0.55,
      'Icebox': 0.53,
      'Haven': 0.52,
      'Bind': 0.50,
      'Split': 0.48,
      'Lotus': 0.49,
      'Sunset': 0.49,
      'Abyss': 0.52,
    },
    playstyle: {
      aggression: 0.4,
      utility: 0.9,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: false,
    },
    compRole: ['Info Gatherer', 'Post-Plant Specialist'],
    synergies: ['Jett', 'Killjoy', 'Omen'],
    counters: ['Cypher'],
  },
  
  Fade: {
    name: 'Fade',
    role: 'Initiator',
    pickRate: 0.55,
    winRate: 0.51,
    mapPickRates: {
      'Split': 0.85,
      'Bind': 0.80,
      'Haven': 0.70,
      'Icebox': 0.65,
      'Lotus': 0.75,
      'Ascent': 0.50,
      'Breeze': 0.30,
      'Sunset': 0.72,
      'Abyss': 0.68,
    },
    mapWinRates: {
      'Split': 0.53,
      'Bind': 0.52,
      'Haven': 0.52,
      'Icebox': 0.51,
      'Lotus': 0.52,
      'Ascent': 0.50,
      'Breeze': 0.48,
      'Sunset': 0.52,
      'Abyss': 0.51,
    },
    playstyle: {
      aggression: 0.5,
      utility: 0.85,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: false,
    },
    compRole: ['Info Initiator', 'Debuff Specialist'],
    synergies: ['Raze', 'Brimstone', 'Cypher'],
    counters: ['Sage'],
  },
  
  Skye: {
    name: 'Skye',
    role: 'Initiator',
    pickRate: 0.35,
    winRate: 0.50,
    mapPickRates: {
      'Haven': 0.60,
      'Bind': 0.55,
      'Fracture': 0.70,
      'Lotus': 0.50,
      'Split': 0.45,
      'Ascent': 0.30,
      'Icebox': 0.25,
      'Breeze': 0.20,
      'Sunset': 0.55,
      'Abyss': 0.45,
    },
    mapWinRates: {
      'Haven': 0.52,
      'Bind': 0.51,
      'Fracture': 0.53,
      'Lotus': 0.50,
      'Split': 0.50,
      'Ascent': 0.49,
      'Icebox': 0.48,
      'Breeze': 0.47,
      'Sunset': 0.51,
      'Abyss': 0.50,
    },
    playstyle: {
      aggression: 0.55,
      utility: 0.8,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: false,
    },
    compRole: ['Flash Initiator', 'Healer'],
    synergies: ['Raze', 'Jett', 'Viper'],
    counters: ['Killjoy'],
  },
  
  Breach: {
    name: 'Breach',
    role: 'Initiator',
    pickRate: 0.25,
    winRate: 0.51,
    mapPickRates: {
      'Fracture': 0.75,
      'Split': 0.50,
      'Bind': 0.35,
      'Lotus': 0.40,
      'Haven': 0.30,
      'Ascent': 0.20,
      'Icebox': 0.15,
      'Breeze': 0.10,
      'Sunset': 0.45,
      'Abyss': 0.35,
    },
    mapWinRates: {
      'Fracture': 0.54,
      'Split': 0.52,
      'Bind': 0.50,
      'Lotus': 0.51,
      'Haven': 0.50,
      'Ascent': 0.49,
      'Icebox': 0.48,
      'Breeze': 0.46,
      'Sunset': 0.51,
      'Abyss': 0.50,
    },
    playstyle: {
      aggression: 0.65,
      utility: 0.75,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: false,
    },
    compRole: ['Stun Initiator', 'Exec Enabler'],
    synergies: ['Raze', 'Neon', 'Viper'],
    counters: ['Jett'],
  },
  
  KAY_O: {
    name: 'KAY/O',
    role: 'Initiator',
    pickRate: 0.30,
    winRate: 0.50,
    mapPickRates: {
      'Ascent': 0.55,
      'Bind': 0.40,
      'Split': 0.35,
      'Lotus': 0.45,
      'Haven': 0.40,
      'Icebox': 0.30,
      'Breeze': 0.25,
      'Sunset': 0.40,
      'Abyss': 0.38,
    },
    mapWinRates: {
      'Ascent': 0.52,
      'Bind': 0.50,
      'Split': 0.50,
      'Lotus': 0.51,
      'Haven': 0.50,
      'Icebox': 0.49,
      'Breeze': 0.48,
      'Sunset': 0.50,
      'Abyss': 0.50,
    },
    playstyle: {
      aggression: 0.6,
      utility: 0.7,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Suppress Initiator', 'Flash Support'],
    synergies: ['Jett', 'Killjoy', 'Omen'],
    counters: ['Sage', 'Chamber'],
  },
  
  Gekko: {
    name: 'Gekko',
    role: 'Initiator',
    pickRate: 0.38,
    winRate: 0.51,
    mapPickRates: {
      'Lotus': 0.75,
      'Split': 0.60,
      'Bind': 0.55,
      'Haven': 0.50,
      'Sunset': 0.65,
      'Ascent': 0.35,
      'Icebox': 0.30,
      'Breeze': 0.25,
      'Abyss': 0.55,
    },
    mapWinRates: {
      'Lotus': 0.53,
      'Split': 0.52,
      'Bind': 0.51,
      'Haven': 0.51,
      'Sunset': 0.52,
      'Ascent': 0.49,
      'Icebox': 0.49,
      'Breeze': 0.48,
      'Abyss': 0.51,
    },
    playstyle: {
      aggression: 0.55,
      utility: 0.85,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: false,
    },
    compRole: ['Plant/Defuse Specialist', 'Utility Recycler'],
    synergies: ['Omen', 'Viper', 'Neon'],
    counters: ['Killjoy'],
  },
  
  // ===================== CONTROLLERS =====================
  
  Omen: {
    name: 'Omen',
    role: 'Controller',
    pickRate: 0.48,
    winRate: 0.51,
    mapPickRates: {
      'Ascent': 0.70,
      'Icebox': 0.65,
      'Haven': 0.55,
      'Split': 0.50,
      'Bind': 0.45,
      'Lotus': 0.40,
      'Breeze': 0.35,
      'Sunset': 0.50,
      'Abyss': 0.55,
    },
    mapWinRates: {
      'Ascent': 0.52,
      'Icebox': 0.52,
      'Haven': 0.51,
      'Split': 0.51,
      'Bind': 0.50,
      'Lotus': 0.50,
      'Breeze': 0.49,
      'Sunset': 0.51,
      'Abyss': 0.51,
    },
    playstyle: {
      aggression: 0.5,
      utility: 0.7,
      execHeavy: true,
      retakeStrong: true,
      lurk: true,
      entry: false,
      anchor: false,
    },
    compRole: ['Primary Smoker', 'Lurk Controller'],
    synergies: ['Jett', 'Sova', 'Killjoy'],
    counters: ['Fade'],
  },
  
  Astra: {
    name: 'Astra',
    role: 'Controller',
    pickRate: 0.20,
    winRate: 0.49,
    mapPickRates: {
      'Breeze': 0.40,
      'Haven': 0.35,
      'Ascent': 0.25,
      'Bind': 0.30,
      'Lotus': 0.35,
      'Split': 0.20,
      'Icebox': 0.15,
      'Sunset': 0.25,
      'Abyss': 0.30,
    },
    mapWinRates: {
      'Breeze': 0.51,
      'Haven': 0.50,
      'Ascent': 0.49,
      'Bind': 0.50,
      'Lotus': 0.50,
      'Split': 0.48,
      'Icebox': 0.47,
      'Sunset': 0.49,
      'Abyss': 0.49,
    },
    playstyle: {
      aggression: 0.3,
      utility: 0.95,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Global Controller', 'Stall Specialist'],
    synergies: ['Neon', 'Jett', 'Sova'],
    counters: ['Fade', 'Breach'],
  },
  
  Brimstone: {
    name: 'Brimstone',
    role: 'Controller',
    pickRate: 0.28,
    winRate: 0.51,
    mapPickRates: {
      'Bind': 0.65,
      'Fracture': 0.60,
      'Split': 0.45,
      'Lotus': 0.50,
      'Haven': 0.35,
      'Ascent': 0.25,
      'Icebox': 0.20,
      'Breeze': 0.15,
      'Sunset': 0.55,
      'Abyss': 0.45,
    },
    mapWinRates: {
      'Bind': 0.53,
      'Fracture': 0.52,
      'Split': 0.51,
      'Lotus': 0.51,
      'Haven': 0.50,
      'Ascent': 0.49,
      'Icebox': 0.48,
      'Breeze': 0.47,
      'Sunset': 0.52,
      'Abyss': 0.50,
    },
    playstyle: {
      aggression: 0.45,
      utility: 0.75,
      execHeavy: true,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Post-Plant Controller', 'Molly Specialist'],
    synergies: ['Raze', 'Fade', 'Gekko'],
    counters: ['Jett', 'Omen'],
  },
  
  Viper: {
    name: 'Viper',
    role: 'Controller',
    pickRate: 0.55,
    winRate: 0.52,
    mapPickRates: {
      'Breeze': 0.95,
      'Icebox': 0.90,
      'Lotus': 0.70,
      'Split': 0.55,
      'Haven': 0.45,
      'Bind': 0.40,
      'Ascent': 0.30,
      'Sunset': 0.50,
      'Abyss': 0.65,
    },
    mapWinRates: {
      'Breeze': 0.55,
      'Icebox': 0.54,
      'Lotus': 0.52,
      'Split': 0.51,
      'Haven': 0.50,
      'Bind': 0.50,
      'Ascent': 0.49,
      'Sunset': 0.51,
      'Abyss': 0.52,
    },
    playstyle: {
      aggression: 0.35,
      utility: 0.9,
      execHeavy: true,
      retakeStrong: false,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Wall Controller', 'Area Denial'],
    synergies: ['Jett', 'Sova', 'Killjoy'],
    counters: ['Breach', 'Fade'],
  },
  
  Harbor: {
    name: 'Harbor',
    role: 'Controller',
    pickRate: 0.12,
    winRate: 0.48,
    mapPickRates: {
      'Lotus': 0.30,
      'Breeze': 0.25,
      'Haven': 0.20,
      'Split': 0.15,
      'Bind': 0.12,
      'Ascent': 0.10,
      'Icebox': 0.08,
      'Sunset': 0.18,
      'Abyss': 0.20,
    },
    mapWinRates: {
      'Lotus': 0.50,
      'Breeze': 0.49,
      'Haven': 0.48,
      'Split': 0.47,
      'Bind': 0.47,
      'Ascent': 0.46,
      'Icebox': 0.45,
      'Sunset': 0.48,
      'Abyss': 0.48,
    },
    playstyle: {
      aggression: 0.5,
      utility: 0.75,
      execHeavy: true,
      retakeStrong: false,
      lurk: false,
      entry: false,
      anchor: false,
    },
    compRole: ['Secondary Controller', 'Double Smoke'],
    synergies: ['Viper', 'Raze', 'Breach'],
    counters: ['Sova', 'Fade'],
  },
  
  Clove: {
    name: 'Clove',
    role: 'Controller',
    pickRate: 0.22,
    winRate: 0.49,
    mapPickRates: {
      'Sunset': 0.45,
      'Split': 0.40,
      'Haven': 0.35,
      'Bind': 0.30,
      'Lotus': 0.35,
      'Ascent': 0.28,
      'Icebox': 0.25,
      'Breeze': 0.20,
      'Abyss': 0.35,
    },
    mapWinRates: {
      'Sunset': 0.51,
      'Split': 0.50,
      'Haven': 0.49,
      'Bind': 0.49,
      'Lotus': 0.49,
      'Ascent': 0.48,
      'Icebox': 0.48,
      'Breeze': 0.47,
      'Abyss': 0.49,
    },
    playstyle: {
      aggression: 0.65,
      utility: 0.6,
      execHeavy: true,
      retakeStrong: false,
      lurk: false,
      entry: true,
      anchor: false,
    },
    compRole: ['Aggro Controller', 'Self-Res Specialist'],
    synergies: ['Jett', 'Fade', 'Killjoy'],
    counters: ['Cypher', 'Killjoy'],
  },
  
  // ===================== SENTINELS =====================
  
  Killjoy: {
    name: 'Killjoy',
    role: 'Sentinel',
    pickRate: 0.60,
    winRate: 0.52,
    mapPickRates: {
      'Ascent': 0.85,
      'Haven': 0.70,
      'Icebox': 0.75,
      'Split': 0.65,
      'Bind': 0.60,
      'Lotus': 0.55,
      'Breeze': 0.50,
      'Sunset': 0.70,
      'Abyss': 0.65,
    },
    mapWinRates: {
      'Ascent': 0.54,
      'Haven': 0.52,
      'Icebox': 0.53,
      'Split': 0.52,
      'Bind': 0.51,
      'Lotus': 0.51,
      'Breeze': 0.50,
      'Sunset': 0.52,
      'Abyss': 0.52,
    },
    playstyle: {
      aggression: 0.3,
      utility: 0.9,
      execHeavy: false,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Site Anchor', 'Lockdown Specialist'],
    synergies: ['Jett', 'Omen', 'Sova'],
    counters: ['Raze', 'Breach'],
  },
  
  Cypher: {
    name: 'Cypher',
    role: 'Sentinel',
    pickRate: 0.35,
    winRate: 0.51,
    mapPickRates: {
      'Bind': 0.65,
      'Split': 0.55,
      'Breeze': 0.60,
      'Haven': 0.45,
      'Ascent': 0.40,
      'Icebox': 0.35,
      'Lotus': 0.50,
      'Sunset': 0.45,
      'Abyss': 0.50,
    },
    mapWinRates: {
      'Bind': 0.53,
      'Split': 0.52,
      'Breeze': 0.52,
      'Haven': 0.51,
      'Ascent': 0.50,
      'Icebox': 0.49,
      'Lotus': 0.51,
      'Sunset': 0.51,
      'Abyss': 0.51,
    },
    playstyle: {
      aggression: 0.25,
      utility: 0.95,
      execHeavy: false,
      retakeStrong: false,
      lurk: true,
      entry: false,
      anchor: true,
    },
    compRole: ['Info Sentinel', 'Lurk Anchor'],
    synergies: ['Fade', 'Omen', 'Brimstone'],
    counters: ['Raze', 'Skye'],
  },
  
  Chamber: {
    name: 'Chamber',
    role: 'Sentinel',
    pickRate: 0.25,
    winRate: 0.50,
    mapPickRates: {
      'Breeze': 0.55,
      'Icebox': 0.45,
      'Ascent': 0.40,
      'Haven': 0.35,
      'Split': 0.25,
      'Bind': 0.20,
      'Lotus': 0.30,
      'Sunset': 0.30,
      'Abyss': 0.40,
    },
    mapWinRates: {
      'Breeze': 0.52,
      'Icebox': 0.51,
      'Ascent': 0.50,
      'Haven': 0.50,
      'Split': 0.49,
      'Bind': 0.48,
      'Lotus': 0.49,
      'Sunset': 0.49,
      'Abyss': 0.50,
    },
    playstyle: {
      aggression: 0.6,
      utility: 0.4,
      execHeavy: false,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Op Sentinel', 'Aggro Anchor'],
    synergies: ['Fade', 'Omen', 'Viper'],
    counters: ['Raze', 'Fade'],
  },
  
  Sage: {
    name: 'Sage',
    role: 'Sentinel',
    pickRate: 0.28,
    winRate: 0.50,
    mapPickRates: {
      'Split': 0.65,
      'Icebox': 0.50,
      'Bind': 0.40,
      'Lotus': 0.45,
      'Haven': 0.35,
      'Ascent': 0.30,
      'Breeze': 0.25,
      'Sunset': 0.40,
      'Abyss': 0.45,
    },
    mapWinRates: {
      'Split': 0.52,
      'Icebox': 0.51,
      'Bind': 0.50,
      'Lotus': 0.50,
      'Haven': 0.49,
      'Ascent': 0.49,
      'Breeze': 0.48,
      'Sunset': 0.50,
      'Abyss': 0.50,
    },
    playstyle: {
      aggression: 0.3,
      utility: 0.85,
      execHeavy: false,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Healer', 'Wall Control'],
    synergies: ['Jett', 'Raze', 'Omen'],
    counters: ['Raze', 'Sova'],
  },
  
  Deadlock: {
    name: 'Deadlock',
    role: 'Sentinel',
    pickRate: 0.08,
    winRate: 0.47,
    mapPickRates: {
      'Split': 0.15,
      'Lotus': 0.12,
      'Bind': 0.10,
      'Haven': 0.08,
      'Ascent': 0.06,
      'Icebox': 0.05,
      'Breeze': 0.04,
      'Sunset': 0.12,
      'Abyss': 0.10,
    },
    mapWinRates: {
      'Split': 0.48,
      'Lotus': 0.47,
      'Bind': 0.47,
      'Haven': 0.46,
      'Ascent': 0.46,
      'Icebox': 0.45,
      'Breeze': 0.44,
      'Sunset': 0.47,
      'Abyss': 0.46,
    },
    playstyle: {
      aggression: 0.35,
      utility: 0.75,
      execHeavy: false,
      retakeStrong: false,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Trap Sentinel', 'Choke Control'],
    synergies: ['Omen', 'Fade', 'Breach'],
    counters: ['Skye', 'Sova'],
  },
  
  Vyse: {
    name: 'Vyse',
    role: 'Sentinel',
    pickRate: 0.15,
    winRate: 0.49,
    mapPickRates: {
      'Ascent': 0.25,
      'Split': 0.22,
      'Haven': 0.20,
      'Bind': 0.18,
      'Lotus': 0.22,
      'Icebox': 0.15,
      'Breeze': 0.12,
      'Sunset': 0.20,
      'Abyss': 0.22,
    },
    mapWinRates: {
      'Ascent': 0.50,
      'Split': 0.50,
      'Haven': 0.49,
      'Bind': 0.49,
      'Lotus': 0.49,
      'Icebox': 0.48,
      'Breeze': 0.47,
      'Sunset': 0.49,
      'Abyss': 0.49,
    },
    playstyle: {
      aggression: 0.4,
      utility: 0.8,
      execHeavy: false,
      retakeStrong: true,
      lurk: false,
      entry: false,
      anchor: true,
    },
    compRole: ['Tech Sentinel', 'Weapon Denial'],
    synergies: ['Omen', 'Fade', 'Raze'],
    counters: ['Sova', 'Skye'],
  },
};

// ============================================================================
// Map Meta Analysis
// ============================================================================

export interface MapMeta {
  map: ValorantMap;
  
  // Standard meta composition
  metaComp: {
    agents: string[];
    winRate: number;
    pickRate: number;
  };
  
  // Alternative compositions seen in pro play
  altComps: Array<{
    agents: string[];
    winRate: number;
    context: string; // When this is picked
  }>;
  
  // Key map characteristics
  characteristics: {
    openness: number;        // 0-1: tight to open sightlines
    verticalPlay: number;    // 0-1: flat to vertical
    rotationSpeed: number;   // 0-1: slow to fast rotations
    postPlantOptions: number; // 0-1: few to many
    opViability: number;     // 0-1: bad to good for ops
  };
  
  // Which team style favors this map
  favoredStyle: 'aggressive' | 'structured' | 'default' | 'mixed';
}

export const MAP_META: Record<ValorantMap, MapMeta> = {
  'Ascent': {
    map: 'Ascent',
    metaComp: {
      agents: ['Jett', 'Sova', 'Omen', 'Killjoy', 'KAY/O'],
      winRate: 0.52,
      pickRate: 0.75,
    },
    altComps: [
      { agents: ['Jett', 'Fade', 'Omen', 'Killjoy', 'Iso'], winRate: 0.51, context: 'Double duelist aggressive' },
      { agents: ['Jett', 'Sova', 'Astra', 'Killjoy', 'Skye'], winRate: 0.50, context: 'Double initiator control' },
    ],
    characteristics: {
      openness: 0.6,
      verticalPlay: 0.3,
      rotationSpeed: 0.5,
      postPlantOptions: 0.7,
      opViability: 0.8,
    },
    favoredStyle: 'structured',
  },
  
  'Bind': {
    map: 'Bind',
    metaComp: {
      agents: ['Raze', 'Fade', 'Brimstone', 'Cypher', 'Skye'],
      winRate: 0.52,
      pickRate: 0.70,
    },
    altComps: [
      { agents: ['Raze', 'Fade', 'Viper', 'Killjoy', 'Gekko'], winRate: 0.51, context: 'Double controller' },
      { agents: ['Jett', 'Fade', 'Brimstone', 'Cypher', 'Breach'], winRate: 0.50, context: 'Op focused' },
    ],
    characteristics: {
      openness: 0.4,
      verticalPlay: 0.2,
      rotationSpeed: 0.9, // Teleporters
      postPlantOptions: 0.8,
      opViability: 0.5,
    },
    favoredStyle: 'aggressive',
  },
  
  'Haven': {
    map: 'Haven',
    metaComp: {
      agents: ['Jett', 'Fade', 'Omen', 'Killjoy', 'Breach'],
      winRate: 0.51,
      pickRate: 0.65,
    },
    altComps: [
      { agents: ['Jett', 'Sova', 'Astra', 'Killjoy', 'Skye'], winRate: 0.51, context: 'Info heavy' },
      { agents: ['Raze', 'Fade', 'Omen', 'Cypher', 'Gekko'], winRate: 0.50, context: 'Map control' },
    ],
    characteristics: {
      openness: 0.5,
      verticalPlay: 0.4,
      rotationSpeed: 0.4, // 3 sites
      postPlantOptions: 0.6,
      opViability: 0.7,
    },
    favoredStyle: 'mixed',
  },
  
  'Split': {
    map: 'Split',
    metaComp: {
      agents: ['Raze', 'Fade', 'Omen', 'Cypher', 'Sage'],
      winRate: 0.52,
      pickRate: 0.70,
    },
    altComps: [
      { agents: ['Neon', 'Breach', 'Astra', 'Killjoy', 'Gekko'], winRate: 0.51, context: 'Speed execute' },
      { agents: ['Jett', 'Fade', 'Omen', 'Killjoy', 'Skye'], winRate: 0.50, context: 'Flex duelist' },
    ],
    characteristics: {
      openness: 0.3,
      verticalPlay: 0.8, // Ropes, heaven
      rotationSpeed: 0.3,
      postPlantOptions: 0.5,
      opViability: 0.4,
    },
    favoredStyle: 'aggressive',
  },
  
  'Icebox': {
    map: 'Icebox',
    metaComp: {
      agents: ['Jett', 'Sova', 'Viper', 'Killjoy', 'Fade'],
      winRate: 0.53,
      pickRate: 0.75,
    },
    altComps: [
      { agents: ['Chamber', 'Sova', 'Viper', 'Killjoy', 'Fade'], winRate: 0.51, context: 'Double sentinel Op' },
      { agents: ['Jett', 'Sova', 'Viper', 'Sage', 'Fade'], winRate: 0.51, context: 'Double healer' },
    ],
    characteristics: {
      openness: 0.7,
      verticalPlay: 0.7,
      rotationSpeed: 0.5,
      postPlantOptions: 0.6,
      opViability: 0.9,
    },
    favoredStyle: 'structured',
  },
  
  'Breeze': {
    map: 'Breeze',
    metaComp: {
      agents: ['Jett', 'Sova', 'Viper', 'Cypher', 'Chamber'],
      winRate: 0.53,
      pickRate: 0.70,
    },
    altComps: [
      { agents: ['Jett', 'Sova', 'Viper', 'Killjoy', 'Skye'], winRate: 0.52, context: 'Standard KJ' },
      { agents: ['Jett', 'Sova', 'Viper', 'Cypher', 'KAY/O'], winRate: 0.51, context: 'Suppress focused' },
    ],
    characteristics: {
      openness: 0.9,
      verticalPlay: 0.3,
      rotationSpeed: 0.6,
      postPlantOptions: 0.7,
      opViability: 0.95,
    },
    favoredStyle: 'structured',
  },
  
  'Lotus': {
    map: 'Lotus',
    metaComp: {
      agents: ['Raze', 'Fade', 'Viper', 'Killjoy', 'Gekko'],
      winRate: 0.52,
      pickRate: 0.68,
    },
    altComps: [
      { agents: ['Jett', 'Fade', 'Omen', 'Cypher', 'Gekko'], winRate: 0.51, context: 'Jett pick' },
      { agents: ['Raze', 'Breach', 'Viper', 'Killjoy', 'Skye'], winRate: 0.50, context: 'Stun heavy' },
    ],
    characteristics: {
      openness: 0.5,
      verticalPlay: 0.4,
      rotationSpeed: 0.8, // Doors
      postPlantOptions: 0.7,
      opViability: 0.5,
    },
    favoredStyle: 'mixed',
  },
  
  'Sunset': {
    map: 'Sunset',
    metaComp: {
      agents: ['Raze', 'Fade', 'Omen', 'Killjoy', 'Gekko'],
      winRate: 0.51,
      pickRate: 0.65,
    },
    altComps: [
      { agents: ['Neon', 'Breach', 'Omen', 'Killjoy', 'Clove'], winRate: 0.50, context: 'Speed comp' },
      { agents: ['Jett', 'Fade', 'Brimstone', 'Cypher', 'Skye'], winRate: 0.50, context: 'Standard' },
    ],
    characteristics: {
      openness: 0.4,
      verticalPlay: 0.3,
      rotationSpeed: 0.6,
      postPlantOptions: 0.8,
      opViability: 0.5,
    },
    favoredStyle: 'aggressive',
  },
  
  'Abyss': {
    map: 'Abyss',
    metaComp: {
      agents: ['Jett', 'Fade', 'Omen', 'Killjoy', 'Sova'],
      winRate: 0.51,
      pickRate: 0.60,
    },
    altComps: [
      { agents: ['Raze', 'Fade', 'Viper', 'Cypher', 'Gekko'], winRate: 0.50, context: 'Raze pick' },
      { agents: ['Jett', 'Sova', 'Astra', 'Killjoy', 'KAY/O'], winRate: 0.50, context: 'Control focused' },
    ],
    characteristics: {
      openness: 0.6,
      verticalPlay: 0.5,
      rotationSpeed: 0.5,
      postPlantOptions: 0.6,
      opViability: 0.7,
    },
    favoredStyle: 'mixed',
  },
  
  // Legacy maps (may not be in current pool)
  'Fracture': {
    map: 'Fracture',
    metaComp: {
      agents: ['Raze', 'Breach', 'Brimstone', 'Cypher', 'Neon'],
      winRate: 0.52,
      pickRate: 0.70,
    },
    altComps: [
      { agents: ['Raze', 'Breach', 'Viper', 'Killjoy', 'Fade'], winRate: 0.51, context: 'Double controller' },
    ],
    characteristics: {
      openness: 0.4,
      verticalPlay: 0.6,
      rotationSpeed: 0.9, // Both spawns near sites
      postPlantOptions: 0.8,
      opViability: 0.4,
    },
    favoredStyle: 'aggressive',
  },
  
  'Pearl': {
    map: 'Pearl',
    metaComp: {
      agents: ['Jett', 'Fade', 'Astra', 'Killjoy', 'KAY/O'],
      winRate: 0.51,
      pickRate: 0.65,
    },
    altComps: [],
    characteristics: {
      openness: 0.5,
      verticalPlay: 0.3,
      rotationSpeed: 0.4,
      postPlantOptions: 0.6,
      opViability: 0.6,
    },
    favoredStyle: 'structured',
  },
};

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Get agents that are strong on a specific map
 */
export function getStrongAgentsForMap(map: ValorantMap, minPickRate: number = 0.3): AgentMeta[] {
  return Object.values(AGENT_META)
    .filter(agent => (agent.mapPickRates[map] || 0) >= minPickRate)
    .sort((a, b) => (b.mapWinRates[map] || 0) - (a.mapWinRates[map] || 0));
}

/**
 * Analyze team composition strength on a map
 */
export function analyzeCompOnMap(agents: string[], map: ValorantMap): {
  avgWinRate: number;
  avgPickRate: number;
  synergies: string[];
  weaknesses: string[];
  roleBalance: Record<AgentRole, number>;
} {
  const agentData = agents.map(name => AGENT_META[name]).filter((a): a is AgentMeta => a !== undefined);
  
  const avgWinRate = agentData.length > 0 
    ? agentData.reduce((sum, a) => sum + (a.mapWinRates[map] || 0.5), 0) / agentData.length 
    : 0.5;
  const avgPickRate = agentData.length > 0 
    ? agentData.reduce((sum, a) => sum + (a.mapPickRates[map] || 0.1), 0) / agentData.length 
    : 0.1;
  
  // Find synergies
  const synergies: string[] = [];
  for (const agent of agentData) {
    for (const synergy of agent.synergies) {
      if (agents.includes(synergy) && !synergies.includes(`${agent.name}+${synergy}`)) {
        synergies.push(`${agent.name}+${synergy}`);
      }
    }
  }
  
  // Find weaknesses (counters present)
  const weaknesses: string[] = [];
  const mapMeta = MAP_META[map];
  if (mapMeta) {
    // Check if comp lacks key roles for this map
    if (mapMeta.characteristics.opViability > 0.7 && !agentData.some(a => a.compRole.includes('Op Player'))) {
      weaknesses.push('No Op player on Op-heavy map');
    }
    if (mapMeta.characteristics.openness > 0.7 && !agentData.some(a => a.name === 'Sova' || a.name === 'Fade')) {
      weaknesses.push('Lacks long-range info gathering');
    }
  }
  
  // Role balance
  const roleBalance: Record<AgentRole, number> = {
    Duelist: 0,
    Initiator: 0,
    Controller: 0,
    Sentinel: 0,
  };
  for (const agent of agentData) {
    roleBalance[agent.role]++;
  }
  
  return { avgWinRate, avgPickRate, synergies, weaknesses, roleBalance };
}

/**
 * Compare team playstyles
 */
export function analyzePlaystyleMatch(
  team1Agents: string[],
  team2Agents: string[],
  map: ValorantMap
): {
  team1Style: { aggression: number; utility: number };
  team2Style: { aggression: number; utility: number };
  mapFavors: 'team1' | 'team2' | 'neutral';
  insight: string;
} {
  const getTeamStyle = (agents: string[]) => {
    const data = agents.map(name => AGENT_META[name]).filter((a): a is AgentMeta => a !== undefined);
    if (data.length === 0) return { aggression: 0.5, utility: 0.5 };
    return {
      aggression: data.reduce((sum, a) => sum + a.playstyle.aggression, 0) / data.length,
      utility: data.reduce((sum, a) => sum + a.playstyle.utility, 0) / data.length,
    };
  };
  
  const team1Style = getTeamStyle(team1Agents);
  const team2Style = getTeamStyle(team2Agents);
  
  const mapMeta = MAP_META[map];
  let mapFavors: 'team1' | 'team2' | 'neutral' = 'neutral';
  let insight = '';
  
  if (mapMeta) {
    if (mapMeta.favoredStyle === 'aggressive') {
      mapFavors = team1Style.aggression > team2Style.aggression ? 'team1' : 
                  team2Style.aggression > team1Style.aggression ? 'team2' : 'neutral';
      insight = `${map} favors aggressive play. ${mapFavors === 'team1' ? 'Team 1' : mapFavors === 'team2' ? 'Team 2' : 'Neither'} has more aggression.`;
    } else if (mapMeta.favoredStyle === 'structured') {
      mapFavors = team1Style.utility > team2Style.utility ? 'team1' : 
                  team2Style.utility > team1Style.utility ? 'team2' : 'neutral';
      insight = `${map} favors structured play. ${mapFavors === 'team1' ? 'Team 1' : mapFavors === 'team2' ? 'Team 2' : 'Neither'} has more utility focus.`;
    } else {
      insight = `${map} is neutral - both styles can work.`;
    }
  }
  
  return { team1Style, team2Style, mapFavors, insight };
}

/**
 * Get meta insights for a specific map
 */
export function getMapMetaInsights(map: ValorantMap): string[] {
  const insights: string[] = [];
  const mapMeta = MAP_META[map];
  
  if (!mapMeta) return ['No meta data available for this map'];
  
  insights.push(`Standard comp: ${mapMeta.metaComp.agents.join(', ')} (${(mapMeta.metaComp.winRate * 100).toFixed(0)}% WR)`);
  
  if (mapMeta.characteristics.opViability > 0.7) {
    insights.push('🎯 Op-friendly map - Jett/Chamber valuable');
  }
  if (mapMeta.characteristics.verticalPlay > 0.6) {
    insights.push('⬆️ High vertical play - Raze/Jett mobility advantageous');
  }
  if (mapMeta.characteristics.rotationSpeed > 0.7) {
    insights.push('🏃 Fast rotations - lurks and flanks are effective');
  }
  if (mapMeta.characteristics.postPlantOptions > 0.7) {
    insights.push('💣 Strong post-plant options - Brimstone/Viper valuable');
  }
  
  const strongAgents = getStrongAgentsForMap(map, 0.5);
  if (strongAgents.length > 0) {
    insights.push(`Top agents: ${strongAgents.slice(0, 3).map(a => a.name).join(', ')}`);
  }
  
  return insights;
}

export default {
  AGENT_META,
  MAP_META,
  getStrongAgentsForMap,
  analyzeCompOnMap,
  analyzePlaystyleMatch,
  getMapMetaInsights,
};
