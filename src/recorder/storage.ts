/**
 * Session Storage Utilities
 * 
 * File-based storage for recording sessions.
 * Uses JSONL (one JSON per line) for fast append-only event logging.
 */

import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Base data directory
const DATA_DIR = join(process.cwd(), 'data', 'sessions');

// Types
export interface SessionMetadata {
  id: string;
  marketId: string;
  marketTitle: string;
  tokenId: string;
  startTime: number;
  endTime?: number;
  status: 'RECORDING' | 'STOPPED' | 'ANALYZED';
  stats: {
    totalEvents: number;
    bookSnapshots: number;
    trades: number;
    userTrades: number;
  };
}

export interface RecordingEvent {
  ts: number;      // Unix ms timestamp
  seq: number;     // Sequence number
  type: 'book' | 'trade' | 'price' | 'user_order' | 'game_event';
  data: unknown;   // Event-specific payload
}

export interface UserTrade {
  ts: number;
  direction: 'BUY' | 'SELL';
  price: number;
  size: number;
  total: number;
  orderId?: string;
  pnl?: number;
  pattern?: string;
  notes?: string;
}

export interface SessionAnalysis {
  generatedAt: number;
  summary: string;
  metrics: {
    winRate: number;
    totalTrades: number;
    profitableTrades: number;
    avgProfit: number;
  };
  patterns: Array<{
    name: string;
    count: number;
    trades: number[];
  }>;
  insights: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique session ID
 */
export function generateSessionId(marketTitle: string): string {
  const date = new Date().toISOString().split('T')[0];
  const slug = marketTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${date}-${slug}-${rand}`;
}

/**
 * Get the directory path for a session
 */
export function getSessionDir(sessionId: string): string {
  return join(DATA_DIR, sessionId);
}

/**
 * Create a new recording session
 */
export function createSession(
  marketId: string,
  marketTitle: string,
  tokenId: string
): SessionMetadata {
  const id = generateSessionId(marketTitle);
  const dir = getSessionDir(id);
  
  // Create directory
  mkdirSync(dir, { recursive: true });
  
  // Initialize metadata
  const metadata: SessionMetadata = {
    id,
    marketId,
    marketTitle,
    tokenId,
    startTime: Date.now(),
    status: 'RECORDING',
    stats: {
      totalEvents: 0,
      bookSnapshots: 0,
      trades: 0,
      userTrades: 0,
    },
  };
  
  // Write metadata file
  writeFileSync(
    join(dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  // Create empty events file
  writeFileSync(join(dir, 'events.jsonl'), '');
  
  // Create empty trades file
  writeFileSync(join(dir, 'trades.json'), '[]');
  
  return metadata;
}

/**
 * Load session metadata
 */
export function loadSession(sessionId: string): SessionMetadata | null {
  const metaPath = join(getSessionDir(sessionId), 'metadata.json');
  if (!existsSync(metaPath)) return null;
  
  return JSON.parse(readFileSync(metaPath, 'utf-8'));
}

/**
 * Update session metadata
 */
export function updateSession(sessionId: string, updates: Partial<SessionMetadata>): void {
  const current = loadSession(sessionId);
  if (!current) throw new Error(`Session not found: ${sessionId}`);
  
  const updated = { ...current, ...updates };
  writeFileSync(
    join(getSessionDir(sessionId), 'metadata.json'),
    JSON.stringify(updated, null, 2)
  );
}

/**
 * Stop a recording session
 */
export function stopSession(sessionId: string): void {
  updateSession(sessionId, {
    endTime: Date.now(),
    status: 'STOPPED',
  });
}

/**
 * List all sessions (with accurate event counts)
 */
export function listSessions(): SessionMetadata[] {
  if (!existsSync(DATA_DIR)) return [];
  
  const dirs = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  return dirs
    .map(id => {
      const session = loadSession(id);
      if (!session) return null;
      
      // Get actual event count from file
      const eventsPath = join(getSessionDir(id), 'events.jsonl');
      if (existsSync(eventsPath)) {
        try {
          const content = readFileSync(eventsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l.trim());
          session.stats.totalEvents = lines.length;
        } catch (e) {
          // Keep existing count
        }
      }
      
      return session;
    })
    .filter((s): s is SessionMetadata => s !== null)
    .sort((a, b) => b.startTime - a.startTime);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT RECORDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Append an event to the session log
 */
export function appendEvent(sessionId: string, event: RecordingEvent): void {
  const eventsPath = join(getSessionDir(sessionId), 'events.jsonl');
  appendFileSync(eventsPath, JSON.stringify(event) + '\n');
  
  // Update stats
  const meta = loadSession(sessionId);
  if (meta) {
    meta.stats.totalEvents++;
    if (event.type === 'book') meta.stats.bookSnapshots++;
    if (event.type === 'trade') meta.stats.trades++;
    if (event.type === 'user_order') meta.stats.userTrades++;
    
    // Only update metadata every 100 events to reduce writes
    if (meta.stats.totalEvents % 100 === 0) {
      updateSession(sessionId, { stats: meta.stats });
    }
  }
}

/**
 * Load all events for a session
 */
export function loadEvents(sessionId: string): RecordingEvent[] {
  const eventsPath = join(getSessionDir(sessionId), 'events.jsonl');
  if (!existsSync(eventsPath)) return [];
  
  const content = readFileSync(eventsPath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

/**
 * Load events in a time range
 */
export function loadEventsInRange(
  sessionId: string,
  startTs: number,
  endTs: number
): RecordingEvent[] {
  return loadEvents(sessionId).filter(e => e.ts >= startTs && e.ts <= endTs);
}

// ═══════════════════════════════════════════════════════════════════════════
// USER TRADES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a user trade to the session
 */
export function addUserTrade(sessionId: string, trade: UserTrade): void {
  const tradesPath = join(getSessionDir(sessionId), 'trades.json');
  const trades = loadUserTrades(sessionId);
  trades.push(trade);
  writeFileSync(tradesPath, JSON.stringify(trades, null, 2));
}

/**
 * Load all user trades for a session
 */
export function loadUserTrades(sessionId: string): UserTrade[] {
  const tradesPath = join(getSessionDir(sessionId), 'trades.json');
  if (!existsSync(tradesPath)) return [];
  return JSON.parse(readFileSync(tradesPath, 'utf-8'));
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save session analysis
 */
export function saveAnalysis(sessionId: string, analysis: SessionAnalysis): void {
  const analysisPath = join(getSessionDir(sessionId), 'analysis.json');
  writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  updateSession(sessionId, { status: 'ANALYZED' });
}

/**
 * Load session analysis
 */
export function loadAnalysis(sessionId: string): SessionAnalysis | null {
  const analysisPath = join(getSessionDir(sessionId), 'analysis.json');
  if (!existsSync(analysisPath)) return null;
  return JSON.parse(readFileSync(analysisPath, 'utf-8'));
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get order book state at a specific timestamp
 */
export function getBookAtTimestamp(sessionId: string, targetTs: number): RecordingEvent | null {
  const events = loadEvents(sessionId);
  
  // Find the last book event before or at targetTs
  let lastBook: RecordingEvent | null = null;
  for (const event of events) {
    if (event.ts > targetTs) break;
    if (event.type === 'book') lastBook = event;
  }
  
  return lastBook;
}

/**
 * Calculate session duration in milliseconds
 */
export function getSessionDuration(sessionId: string): number {
  const meta = loadSession(sessionId);
  if (!meta) return 0;
  const end = meta.endTime || Date.now();
  return end - meta.startTime;
}

/**
 * Format duration as HH:MM:SS
 */
export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  return `${hrs.toString().padStart(2, '0')}:${(mins % 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
}
