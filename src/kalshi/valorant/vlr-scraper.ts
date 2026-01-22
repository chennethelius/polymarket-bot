/**
 * VLR.gg Scraper
 * 
 * Fetches match schedules, team statistics, and roster information from VLR.gg
 * Implements rate limiting and caching to be a good citizen
 */

import { 
  VLRMatch, 
  VLRTeamBasic, 
  VLRTeamFull, 
  VLRMapStats, 
  VLRPlayer,
  VLRRecentMatch,
  ValorantMap,
  ACTIVE_MAP_POOL 
} from './types';

// ============================================================================
// Configuration
// ============================================================================

const VLR_BASE_URL = 'https://www.vlr.gg';
const REQUEST_DELAY_MS = 1500; // Be nice to VLR.gg
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expires: number }>();

// ============================================================================
// Rate Limiting
// ============================================================================

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<string> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ValorantTradingBot/1.0 (Educational Research)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  
  if (!response.ok) {
    throw new Error(`VLR.gg request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.text();
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

// ============================================================================
// HTML Parsing Utilities (No Cheerio - using regex for Bun compatibility)
// ============================================================================

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

function extractAllMatches(html: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match;
  const globalPattern = new RegExp(pattern.source, 'g');
  while ((match = globalPattern.exec(html)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Match Scraping
// ============================================================================

/**
 * Parse a date header like "Tue, January 20, 2026" 
 */
function parseDateHeader(text: string): Date {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Match "Day, Month DD, YYYY" format
  const match = text.match(/\w+,\s*(\w+)\s+(\d+),\s*(\d{4})/);
  if (match) {
    const month = monthNames.indexOf(match[1]);
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (month >= 0) {
      return new Date(year, month, day);
    }
  }
  
  // Match "Today" or "Tomorrow"
  const now = new Date();
  if (text.toLowerCase().includes('today')) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (text.toLowerCase().includes('tomorrow')) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }
  
  return now;
}

/**
 * Extract team name from nested HTML structure:
 * <div class="match-item-vs-team-name">
 *   <div class="text-of">
 *     <span class="flag mod-eu"></span>
 *     Team Name
 *   </div>
 * </div>
 */
function extractTeamNames(content: string): string[] {
  const teams: string[] = [];
  
  // Pattern matches the text-of div content and extracts text after the flag span
  const teamBlockPattern = /<div[^>]*class="[^"]*match-item-vs-team-name[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  
  let match;
  while ((match = teamBlockPattern.exec(content)) !== null) {
    const block = match[1];
    // Extract the text content, removing nested tags
    const textOfMatch = block.match(/<div[^>]*class="[^"]*text-of[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (textOfMatch) {
      // Remove all HTML tags and clean up
      const cleaned = textOfMatch[1]
        .replace(/<span[^>]*>[^<]*<\/span>/g, '') // Remove flag span
        .replace(/<[^>]*>/g, '') // Remove any other tags
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned) {
        teams.push(cleaned);
      }
    }
  }
  
  // Fallback: try simpler pattern if nested structure fails
  if (teams.length < 2) {
    const simplePattern = /class="[^"]*text-of[^"]*"[^>]*>\s*(?:<span[^>]*>[^<]*<\/span>)?\s*([^<]+)/g;
    let simpleMatch;
    while ((simpleMatch = simplePattern.exec(content)) !== null) {
      const name = simpleMatch[1].trim();
      if (name && !teams.includes(name)) {
        teams.push(name);
      }
    }
  }
  
  return teams;
}

/**
 * Extract tournament name from match event div:
 * <div class="match-item-event text-of">
 *   <div class="match-item-event-series text-of">Swiss Stage–Round 1</div>
 *   VCT 2026: EMEA Kickoff
 * </div>
 * 
 * We want "VCT 2026: EMEA Kickoff", not the series name.
 */
function extractTournament(content: string): string {
  // The tournament name is text directly inside match-item-event, after the series div
  // Pattern: look for match-item-event div, capture everything, then extract text after series div closes
  
  // Step 1: Find the full match-item-event block
  const eventBlockPattern = /<div[^>]*class="[^"]*match-item-event[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*match-item-icon/;
  const blockMatch = content.match(eventBlockPattern);
  
  if (blockMatch) {
    let eventContent = blockMatch[1];
    
    // Step 2: Remove the series div (including its content and closing tag)
    eventContent = eventContent.replace(/<div[^>]*class="[^"]*match-item-event-series[^"]*"[^>]*>[\s\S]*?<\/div>/, '');
    
    // Step 3: Clean remaining content to get tournament name
    const tournament = eventContent
      .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
      .replace(/&ndash;/g, '-')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (tournament) return tournament;
  }
  
  // Fallback: try simpler pattern - text after </div> in event block
  const simpleTournamentPattern = /match-item-event-series[^>]*>[\s\S]*?<\/div>\s*([^<]+)/;
  const simpleMatch = content.match(simpleTournamentPattern);
  if (simpleMatch) {
    const tournament = simpleMatch[1]
      .replace(/&ndash;/g, '-')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (tournament) return tournament;
  }
  
  // Last fallback: extract series name at least
  const seriesPattern = /<div[^>]*class="[^"]*match-item-event-series[^"]*"[^>]*>([^<]+)<\/div>/;
  const seriesMatch = content.match(seriesPattern);
  if (seriesMatch) {
    return seriesMatch[1].replace(/&ndash;/g, '-').trim();
  }
  
  return 'Unknown';
}

/**
 * Detect region from flag class
 */
function extractRegion(content: string): string {
  const flagMatch = content.match(/class="[^"]*flag\s+mod-([a-z]{2})[^"]*"/);
  if (flagMatch) {
    const code = flagMatch[1].toUpperCase();
    const regionMap: Record<string, string> = {
      'US': 'NA', 'CA': 'NA', 'BR': 'SA', 'EU': 'EMEA', 'UK': 'EMEA', 
      'DE': 'EMEA', 'FR': 'EMEA', 'ES': 'EMEA', 'TR': 'EMEA', 'RU': 'EMEA',
      'KR': 'KR', 'JP': 'JP', 'CN': 'CN', 'VN': 'APAC', 'TH': 'APAC',
      'PH': 'APAC', 'ID': 'APAC', 'SG': 'APAC', 'AU': 'APAC',
    };
    return regionMap[code] || code;
  }
  return 'Unknown';
}

export async function fetchUpcomingMatches(): Promise<VLRMatch[]> {
  const cacheKey = 'upcoming_matches';
  const cached = getCached<VLRMatch[]>(cacheKey);
  if (cached) return cached;
  
  console.log('📡 Fetching upcoming matches from VLR.gg...');
  const html = await rateLimitedFetch(`${VLR_BASE_URL}/matches`);
  
  const matches: VLRMatch[] = [];
  
  // Split HTML by date sections - each section starts with a date header
  // Format: <div class="wf-label mod-large">Tue, January 20, 2026</div>
  const dateSectionPattern = /<div[^>]*class="[^"]*wf-label[^"]*mod-large[^"]*"[^>]*>([^<]+)<\/div>([\s\S]*?)(?=<div[^>]*class="[^"]*wf-label[^"]*mod-large|$)/g;
  
  let dateSection;
  while ((dateSection = dateSectionPattern.exec(html)) !== null) {
    const dateText = dateSection[1].trim();
    const sectionHtml = dateSection[2];
    const matchDate = parseDateHeader(dateText);
    
    // Find all matches in this date section
    // Match pattern: <a href="/594740/..." class="wf-module-item match-item ...">...</a>
    const matchPattern = /<a[^>]*href="(\/\d+\/[^"]+)"[^>]*class="[^"]*match-item[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    
    let matchBlock;
    while ((matchBlock = matchPattern.exec(sectionHtml)) !== null) {
      const url = matchBlock[1];
      const content = matchBlock[2];
      
      // Skip live or completed matches (they have scores, not dashes)
      if (content.includes('mod-live') || content.includes('mod-completed')) {
        // Still include live matches but mark them
        const isLive = content.includes('mod-live');
        if (!isLive) continue; // Skip completed matches
      }
      
      // Extract match ID from URL
      const idMatch = url.match(/^\/(\d+)\//);
      if (!idMatch) continue;
      
      // Extract teams using the new nested-aware function
      const teams = extractTeamNames(content);
      if (teams.length < 2) continue;
      
      // Extract tournament
      const tournament = extractTournament(content);
      
      // Extract time
      const timeMatch = content.match(/match-item-time[^>]*>([^<]+)/);
      const timeText = timeMatch ? timeMatch[1].trim() : '';
      
      // Combine date and time
      const scheduledTime = combineDateTime(matchDate, timeText);
      
      // Determine tournament tier
      let tier: 'S' | 'A' | 'B' | 'C' = 'C';
      const lowerTournament = tournament.toLowerCase();
      if (lowerTournament.includes('vct') && (lowerTournament.includes('masters') || lowerTournament.includes('champions'))) {
        tier = 'S';
      } else if (lowerTournament.includes('vct') && (lowerTournament.includes('kickoff') || lowerTournament.includes('stage'))) {
        tier = 'A';
      } else if (lowerTournament.includes('challengers')) {
        tier = 'B';
      }
      
      // Extract region from flags
      const region = extractRegion(content);
      
      // Determine match status
      const isLive = content.includes('mod-live');
      const status: 'upcoming' | 'live' | 'completed' = isLive ? 'live' : 'upcoming';
      
      matches.push({
        id: idMatch[1],
        url: `${VLR_BASE_URL}${url}`,
        team1: {
          id: `vlr_${teams[0].toLowerCase().replace(/\s+/g, '_')}`,
          name: teams[0],
          slug: teams[0].toLowerCase().replace(/\s+/g, '-'),
          region,
        },
        team2: {
          id: `vlr_${teams[1].toLowerCase().replace(/\s+/g, '_')}`,
          name: teams[1],
          slug: teams[1].toLowerCase().replace(/\s+/g, '-'),
          region,
        },
        tournament,
        tournamentTier: tier,
        matchType: 'Bo3', // Default, will be updated from match page
        scheduledTime,
        status,
      });
    }
  }
  
  // Sort by scheduled time
  matches.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  
  console.log(`📋 Found ${matches.length} upcoming matches`);
  setCache(cacheKey, matches);
  return matches;
}

/**
 * Combine a date and time string into a Date object
 */
function combineDateTime(date: Date, timeText: string): Date {
  const result = new Date(date);
  
  // Parse time like "10:00 AM" or "5:00 PM"
  const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3]?.toUpperCase();
    
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    result.setHours(hours, minutes, 0, 0);
  }
  
  return result;
}

// ============================================================================
// Team Stats Scraping
// ============================================================================

export async function fetchTeamStats(teamId: string, teamSlug: string): Promise<VLRTeamFull> {
  const cacheKey = `team_stats_${teamId}`;
  const cached = getCached<VLRTeamFull>(cacheKey);
  if (cached) return cached;
  
  console.log(`📊 Fetching stats for team ${teamSlug}...`);
  
  // Fetch team overview and stats pages
  const [overviewHtml, statsHtml] = await Promise.all([
    rateLimitedFetch(`${VLR_BASE_URL}/team/${teamId}/${teamSlug}`),
    rateLimitedFetch(`${VLR_BASE_URL}/team/stats/${teamId}/${teamSlug}/?timespan=60d`),
  ]);
  
  // Parse team info from overview
  const teamName = extractText(overviewHtml, /<h1[^>]*class="[^"]*wf-title[^"]*"[^>]*>([^<]+)<\/h1>/) || teamSlug;
  const region = extractText(overviewHtml, /<div[^>]*class="[^"]*team-header-country[^"]*"[^>]*>([^<]+)<\/div>/) || 'Unknown';
  
  // Parse rating
  const ratingMatch = overviewHtml.match(/RATING\s*(\d+)/);
  const rating = ratingMatch ? parseInt(ratingMatch[1]) : 1500;
  
  // Parse record
  const recordMatch = overviewHtml.match(/RECORD\s*(\d+)W\s*(\d+)L/);
  const wins = recordMatch ? parseInt(recordMatch[1]) : 0;
  const losses = recordMatch ? parseInt(recordMatch[2]) : 0;
  
  // Parse map stats from stats page
  const mapStats = parseMapStats(statsHtml);
  
  // Parse roster
  const roster = parseRoster(overviewHtml);
  
  // Parse recent matches
  const recentMatches = parseRecentMatches(overviewHtml);
  
  const team: VLRTeamFull = {
    id: teamId,
    name: teamName,
    slug: teamSlug,
    region,
    rating,
    ranking: 0,
    record: { wins, losses },
    roster,
    mapStats,
    recentMatches,
    lastUpdated: new Date(),
  };
  
  setCache(cacheKey, team);
  return team;
}

function parseMapStats(html: string): VLRMapStats[] {
  const mapStats: VLRMapStats[] = [];
  
  // VLR.gg uses a table with mod-supercell divs. Each map row structure:
  // <tr>
  //   <td class="mod-supercell">...<div>MapName (N)</div>...</td>
  //   <td>expand button</td>
  //   <td class="mod-supercell">...<div>73%</div>...</td>  <!-- WIN% -->
  //   <td class="mod-supercell">...<div>58</div>...</td>   <!-- W -->
  //   <td class="mod-supercell">...<div>22</div>...</td>   <!-- L -->
  //   <td class="mod-supercell">...<div>49</div>...</td>   <!-- ATK 1st -->
  //   <td class="mod-supercell">...<div>31</div>...</td>   <!-- DEF 1st -->
  //   <td class="mod-atk">...<div>ATK RWin%</div>...</td>
  //   <td class="mod-atk">...<div>RW</div>...</td>
  //   <td class="mod-atk">...<div>RL</div>...</td>
  //   ...
  // </tr>
  
  // For each map in the active pool, find its row and extract stats
  for (const mapName of ACTIVE_MAP_POOL) {
    // Look for the map name pattern like "Bind (80)"
    const mapRowPattern = new RegExp(
      `${mapName}\\s*\\((\\d+)\\)[\\s\\S]*?` + // Map name and games played
      `mod-supercell[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)%[\\s\\S]*?` + // Win %
      `mod-supercell[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)[\\s\\S]*?` + // Wins
      `mod-supercell[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)`, // Losses
      'i'
    );
    
    const mapMatch = html.match(mapRowPattern);
    if (mapMatch) {
      const gamesPlayed = parseInt(mapMatch[1]);
      const winRate = parseInt(mapMatch[2]) / 100;
      const wins = parseInt(mapMatch[3]);
      const losses = parseInt(mapMatch[4]);
      
      // Try to extract attack/defense round stats
      // These appear in mod-atk and mod-def columns
      let atkWinRate = 0.5;
      let defWinRate = 0.5;
      let atkWon = 0, atkLost = 0, defWon = 0, defLost = 0;
      
      // Look for attack round win rate after the map row
      const atkPattern = new RegExp(
        `${mapName}[\\s\\S]*?mod-atk[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)%[\\s\\S]*?` +
        `mod-atk[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)[\\s\\S]*?` +
        `mod-atk[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)`,
        'i'
      );
      const atkMatch = html.match(atkPattern);
      if (atkMatch) {
        atkWinRate = parseInt(atkMatch[1]) / 100;
        atkWon = parseInt(atkMatch[2]);
        atkLost = parseInt(atkMatch[3]);
      }
      
      // Look for defense round win rate
      const defPattern = new RegExp(
        `${mapName}[\\s\\S]*?mod-def[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)%[\\s\\S]*?` +
        `mod-def[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)[\\s\\S]*?` +
        `mod-def[^>]*>[\\s\\S]*?<div[^>]*>\\s*(\\d+)`,
        'i'
      );
      const defMatch = html.match(defPattern);
      if (defMatch) {
        defWinRate = parseInt(defMatch[1]) / 100;
        defWon = parseInt(defMatch[2]);
        defLost = parseInt(defMatch[3]);
      }
      
      mapStats.push({
        map: mapName,
        gamesPlayed,
        wins,
        losses,
        winRate,
        attackRounds: { won: atkWon, lost: atkLost },
        defenseRounds: { won: defWon, lost: defLost },
        attackWinRate: atkWinRate,
        defenseWinRate: defWinRate,
        recentForm: [],
      });
    }
  }
  
  // Sort by games played (descending) to show most-played maps first
  mapStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  
  return mapStats;
}

function parseRoster(html: string): VLRPlayer[] {
  const roster: VLRPlayer[] = [];
  
  // Look for player entries in the roster section
  const playerPattern = /<a[^>]*href="\/player\/(\d+)\/([^"]+)"[^>]*>[\s\S]*?<div[^>]*class="[^"]*wf-title[^"]*"[^>]*>([^<]+)<\/div>[\s\S]*?<div[^>]*>([^<]*)<\/div>/g;
  
  let match;
  while ((match = playerPattern.exec(html)) !== null) {
    const playerId = match[1];
    const playerSlug = match[2];
    const playerName = match[3].trim();
    const realName = match[4].trim();
    
    roster.push({
      id: playerId,
      name: playerName,
      realName: realName || playerName,
      role: 'flex', // Would need more parsing to determine
      joinedDate: undefined,
      isNewToTeam: false, // Would need transaction history
    });
  }
  
  return roster;
}

function parseRecentMatches(html: string): VLRRecentMatch[] {
  const recentMatches: VLRRecentMatch[] = [];
  
  // Look for recent results section
  const resultPattern = /<a[^>]*href="(\/\d+\/[^"]+)"[^>]*class="[^"]*wf-module-item[^"]*"[^>]*>[\s\S]*?(\d+)\s*:\s*(\d+)[\s\S]*?<\/a>/g;
  
  let match;
  let count = 0;
  while ((match = resultPattern.exec(html)) !== null && count < 10) {
    const url = match[1];
    const score1 = parseInt(match[2]);
    const score2 = parseInt(match[3]);
    
    const idMatch = url.match(/^\/(\d+)\//);
    if (!idMatch) continue;
    
    recentMatches.push({
      id: idMatch[1],
      opponent: 'Unknown', // Would need more parsing
      result: score1 > score2 ? 'win' : 'loss',
      score: `${score1}:${score2}`,
      maps: [],
      date: new Date(), // Would need more parsing
      tournament: 'Unknown',
    });
    
    count++;
  }
  
  return recentMatches;
}

// ============================================================================
// Match Details
// ============================================================================

export async function fetchMatchDetails(matchId: string): Promise<{
  matchType: 'Bo1' | 'Bo3' | 'Bo5';
  team1Id: string;
  team2Id: string;
  team1Slug: string;
  team2Slug: string;
}> {
  console.log(`📋 Fetching match details for ${matchId}...`);
  const html = await rateLimitedFetch(`${VLR_BASE_URL}/${matchId}`);
  
  // Determine match type
  let matchType: 'Bo1' | 'Bo3' | 'Bo5' = 'Bo3';
  if (html.includes('Best of 5') || html.includes('Bo5')) {
    matchType = 'Bo5';
  } else if (html.includes('Best of 1') || html.includes('Bo1')) {
    matchType = 'Bo1';
  }
  
  // Extract team IDs
  const teamLinks = html.match(/team\/(\d+)\/([a-z0-9-]+)/g) || [];
  const uniqueTeams = [...new Set(teamLinks)];
  
  let team1Id = '';
  let team1Slug = '';
  let team2Id = '';
  let team2Slug = '';
  
  if (uniqueTeams.length >= 2) {
    const team1Match = uniqueTeams[0].match(/team\/(\d+)\/([a-z0-9-]+)/);
    const team2Match = uniqueTeams[1].match(/team\/(\d+)\/([a-z0-9-]+)/);
    
    if (team1Match) {
      team1Id = team1Match[1];
      team1Slug = team1Match[2];
    }
    if (team2Match) {
      team2Id = team2Match[1];
      team2Slug = team2Match[2];
    }
  }
  
  return { matchType, team1Id, team2Id, team1Slug, team2Slug };
}

// ============================================================================
// Search Functions
// ============================================================================

export async function searchTeam(query: string): Promise<VLRTeamBasic[]> {
  console.log(`🔍 Searching for team: ${query}...`);
  
  // VLR doesn't have a search API, so we fetch the rankings and filter
  const html = await rateLimitedFetch(`${VLR_BASE_URL}/rankings`);
  
  const teams: VLRTeamBasic[] = [];
  const teamPattern = /<a[^>]*href="\/team\/(\d+)\/([^"]+)"[^>]*>[\s\S]*?<div[^>]*class="[^"]*rank-item-team-name[^"]*"[^>]*>([^<]+)<\/div>/g;
  
  let match;
  while ((match = teamPattern.exec(html)) !== null) {
    const name = match[3].trim();
    if (name.toLowerCase().includes(query.toLowerCase())) {
      teams.push({
        id: match[1],
        name,
        slug: match[2],
        region: 'Unknown',
      });
    }
  }
  
  return teams;
}

// ============================================================================
// Live Match Composition Scraping
// ============================================================================

export interface MatchComposition {
  matchId: string;
  status: 'upcoming' | 'live' | 'completed';
  maps: Array<{
    mapName: ValorantMap | string;
    mapNumber: number;
    team1Agents: string[];
    team2Agents: string[];
    team1Score?: number;
    team2Score?: number;
  }>;
  team1Players: Array<{
    name: string;
    agentsPlayed: string[];
  }>;
  team2Players: Array<{
    name: string;
    agentsPlayed: string[];
  }>;
}

/**
 * Fetch live/completed match compositions from a VLR match page.
 * Returns agent picks per player and per map.
 */
export async function fetchMatchCompositions(matchId: string): Promise<MatchComposition> {
  console.log(`🎮 Fetching match compositions for ${matchId}...`);
  const html = await rateLimitedFetch(`${VLR_BASE_URL}/${matchId}`);
  
  // Determine match status
  let status: 'upcoming' | 'live' | 'completed' = 'upcoming';
  if (html.includes('FINAL') || html.includes('final')) {
    status = 'completed';
  } else if (html.includes('LIVE') || html.includes('live')) {
    status = 'live';
  }
  
  // Extract player names from player links
  // Pattern: <a href="/player/XXX/playername">
  const playerPattern = /<a href="\/player\/\d+\/([a-z0-9_-]+)">/gi;
  const playerNames: string[] = [];
  let match;
  const seenPlayers = new Set<string>();
  
  while ((match = playerPattern.exec(html)) !== null) {
    const name = match[1].trim().toLowerCase();
    if (!seenPlayers.has(name) && name.length > 1) {
      seenPlayers.add(name);
      playerNames.push(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }
  
  // Extract all agents from image alt tags
  // Pattern: <img src="/img/vlr/game/agents/agentname.png" alt="agentname">
  const agentPattern = /<img\s+src="\/img\/vlr\/game\/agents\/([a-z]+)\.png"/gi;
  const allAgents: string[] = [];
  
  while ((match = agentPattern.exec(html)) !== null) {
    allAgents.push(match[1].charAt(0).toUpperCase() + match[1].slice(1));
  }
  
  // First 5 unique players are team 1, next 5 are team 2
  const team1PlayerNames = playerNames.slice(0, 5);
  const team2PlayerNames = playerNames.slice(5, 10);
  
  // Agents are typically listed in batches for each player
  // For now, aggregate all unique agents found
  const uniqueAgents = [...new Set(allAgents)];
  
  // Create player objects - we'll assign agents proportionally
  const agentsPerPlayer = Math.ceil(allAgents.length / (playerNames.length || 1));
  
  const team1Players: MatchComposition['team1Players'] = team1PlayerNames.map((name, i) => ({
    name,
    agentsPlayed: allAgents.slice(i * agentsPerPlayer, (i + 1) * agentsPerPlayer).filter((v, idx, a) => a.indexOf(v) === idx),
  }));
  
  const team2Players: MatchComposition['team2Players'] = team2PlayerNames.map((name, i) => ({
    name,
    agentsPlayed: allAgents.slice((i + 5) * agentsPerPlayer, (i + 6) * agentsPerPlayer).filter((v, idx, a) => a.indexOf(v) === idx),
  }));
  
  // Simplify: Get unique team agents
  const team1Agents = allAgents.slice(0, Math.floor(allAgents.length / 2)).filter((v, i, a) => a.indexOf(v) === i);
  const team2Agents = allAgents.slice(Math.floor(allAgents.length / 2)).filter((v, i, a) => a.indexOf(v) === i);
  
  // Extract map information
  // Look for map names and scores
  const maps: MatchComposition['maps'] = [];
  const knownMaps = ['Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze', 'Fracture', 'Pearl', 'Lotus', 'Sunset', 'Abyss', 'Corrode'];
  
  // Pattern for map pick/ban info: "EGA pick Corrode; NBG pick Abyss"
  const mapPickPattern = /pick\s+(\w+)/gi;
  let mapNumber = 1;
  while ((match = mapPickPattern.exec(html)) !== null) {
    const mapName = match[1];
    if (knownMaps.some(m => m.toLowerCase() === mapName.toLowerCase())) {
      maps.push({
        mapName: knownMaps.find(m => m.toLowerCase() === mapName.toLowerCase()) || mapName,
        mapNumber: mapNumber++,
        team1Agents: [],
        team2Agents: [],
      });
    }
  }
  
  // Also check for "remains" pattern for decider
  const remainsPattern = /(\w+)\s+remains/gi;
  while ((match = remainsPattern.exec(html)) !== null) {
    const mapName = match[1];
    if (knownMaps.some(m => m.toLowerCase() === mapName.toLowerCase())) {
      maps.push({
        mapName: knownMaps.find(m => m.toLowerCase() === mapName.toLowerCase()) || mapName,
        mapNumber: mapNumber++,
        team1Agents: [],
        team2Agents: [],
      });
    }
  }
  
  // For completed matches, try to extract agents per map
  // This requires parsing the map-specific tabs which is complex
  // For now, we use overall agents played
  if (maps.length > 0) {
    // Distribute agents across maps (approximation - real implementation would parse map tabs)
    maps.forEach((map, idx) => {
      map.team1Agents = team1Players.slice(0, 5).map(p => p.agentsPlayed[idx] || p.agentsPlayed[0] || 'Unknown');
      map.team2Agents = team2Players.slice(0, 5).map(p => p.agentsPlayed[idx] || p.agentsPlayed[0] || 'Unknown');
    });
  }
  
  return {
    matchId,
    status,
    maps,
    team1Players,
    team2Players,
  };
}

/**
 * Get the most likely current/next map composition for a live match
 */
export function analyzeMatchComposition(comp: MatchComposition): {
  currentMap?: string;
  team1Comp: string[];
  team2Comp: string[];
  insights: string[];
} {
  const insights: string[] = [];
  
  // Get the last map with agents (most recent)
  const lastMapWithData = comp.maps.filter(m => m.team1Agents.length > 0).pop();
  
  // Aggregate all agents played by each team
  const team1AllAgents = comp.team1Players.flatMap(p => p.agentsPlayed);
  const team2AllAgents = comp.team2Players.flatMap(p => p.agentsPlayed);
  
  // Count agent picks
  const countAgents = (agents: string[]) => {
    const counts: Record<string, number> = {};
    agents.forEach(a => { counts[a] = (counts[a] || 0) + 1; });
    return counts;
  };
  
  const team1Counts = countAgents(team1AllAgents);
  const team2Counts = countAgents(team2AllAgents);
  
  // Find signature agents (played in all maps)
  const team1Signature = Object.entries(team1Counts)
    .filter(([_, count]) => count >= comp.maps.length)
    .map(([agent]) => agent);
  const team2Signature = Object.entries(team2Counts)
    .filter(([_, count]) => count >= comp.maps.length)
    .map(([agent]) => agent);
  
  if (team1Signature.length > 0) {
    insights.push(`Team 1 locks: ${team1Signature.join(', ')}`);
  }
  if (team2Signature.length > 0) {
    insights.push(`Team 2 locks: ${team2Signature.join(', ')}`);
  }
  
  // Get most common comp per team (for next map prediction)
  const team1Comp = [...new Set(team1AllAgents)].slice(0, 5);
  const team2Comp = [...new Set(team2AllAgents)].slice(0, 5);
  
  return {
    currentMap: lastMapWithData?.mapName,
    team1Comp,
    team2Comp,
    insights,
  };
}

// ============================================================================
// Exports
// ============================================================================

export const vlrScraper = {
  fetchUpcomingMatches,
  fetchTeamStats,
  fetchMatchDetails,
  fetchMatchCompositions,
  analyzeMatchComposition,
  searchTeam,
  clearCache: () => cache.clear(),
};
