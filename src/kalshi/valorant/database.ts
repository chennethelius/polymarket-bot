/**
 * SQLite Database for Trade Tracking
 * 
 * Persists team stats cache, trade history, and P&L tracking
 */

import { Database } from 'bun:sqlite';
import { VLRTeamFull, TradeExecution, TradeResult, TradingConfig } from './types';

// ============================================================================
// Database Setup
// ============================================================================

const DB_PATH = './data/valorant-trading.db';

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    // Ensure data directory exists
    const fs = require('fs');
    const dir = './data';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    initializeSchema();
  }
  return db;
}

function initializeSchema(): void {
  const database = getDb();
  
  // Team stats cache
  database.run(`
    CREATE TABLE IF NOT EXISTS team_cache (
      team_id TEXT PRIMARY KEY,
      team_slug TEXT NOT NULL,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    )
  `);
  
  // Trade executions
  database.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id TEXT NOT NULL,
      order_id TEXT UNIQUE NOT NULL,
      ticker TEXT NOT NULL,
      side TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      executed_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      fill_price INTEGER,
      fill_quantity INTEGER
    )
  `);
  
  // Trade results (after settlement)
  database.run(`
    CREATE TABLE IF NOT EXISTS trade_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id TEXT NOT NULL,
      match_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price INTEGER NOT NULL,
      exit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      pnl REAL NOT NULL,
      pnl_percent REAL NOT NULL,
      actual_outcome TEXT NOT NULL,
      model_correct INTEGER NOT NULL,
      settled_at INTEGER NOT NULL
    )
  `);
  
  // Daily P&L tracking
  database.run(`
    CREATE TABLE IF NOT EXISTS daily_pnl (
      date TEXT PRIMARY KEY,
      total_pnl REAL NOT NULL,
      trades_won INTEGER NOT NULL,
      trades_lost INTEGER NOT NULL,
      total_volume REAL NOT NULL
    )
  `);
  
  // Model performance by team/map
  database.run(`
    CREATE TABLE IF NOT EXISTS model_accuracy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      map_name TEXT,
      predictions INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL
    )
  `);
  
  console.log('📁 Database initialized');
}

// ============================================================================
// Team Cache Operations
// ============================================================================

export function cacheTeamStats(team: VLRTeamFull): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO team_cache (team_id, team_slug, data, cached_at)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(team.id, team.slug, JSON.stringify(team), Date.now());
}

export function getCachedTeamStats(teamId: string, maxAgeMs: number = 30 * 60 * 1000): VLRTeamFull | null {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT data, cached_at FROM team_cache WHERE team_id = ?
  `);
  
  const row = stmt.get(teamId) as { data: string; cached_at: number } | undefined;
  
  if (!row) return null;
  if (Date.now() - row.cached_at > maxAgeMs) return null;
  
  try {
    const parsed = JSON.parse(row.data);
    parsed.lastUpdated = new Date(parsed.lastUpdated);
    return parsed as VLRTeamFull;
  } catch {
    return null;
  }
}

// ============================================================================
// Trade Operations
// ============================================================================

export function saveTrade(trade: TradeExecution): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO trades (signal_id, order_id, ticker, side, price, quantity, executed_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    trade.signalId,
    trade.orderId,
    trade.ticker,
    trade.side,
    trade.price,
    trade.quantity,
    trade.executedAt.getTime(),
    trade.status
  );
}

export function updateTradeStatus(orderId: string, status: string, fillPrice?: number, fillQuantity?: number): void {
  const database = getDb();
  const stmt = database.prepare(`
    UPDATE trades SET status = ?, fill_price = ?, fill_quantity = ?
    WHERE order_id = ?
  `);
  
  stmt.run(status, fillPrice || null, fillQuantity || null, orderId);
}

export function getRecentTrades(limit: number = 20): TradeExecution[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM trades ORDER BY executed_at DESC LIMIT ?
  `);
  
  const rows = stmt.all(limit) as Array<{
    signal_id: string;
    order_id: string;
    ticker: string;
    side: string;
    price: number;
    quantity: number;
    executed_at: number;
    status: string;
    fill_price: number | null;
    fill_quantity: number | null;
  }>;
  
  return rows.map(row => ({
    signalId: row.signal_id,
    orderId: row.order_id,
    ticker: row.ticker,
    side: row.side as 'yes' | 'no',
    price: row.price,
    quantity: row.quantity,
    executedAt: new Date(row.executed_at),
    status: row.status as 'pending' | 'filled' | 'partial' | 'failed',
    fillPrice: row.fill_price || undefined,
    fillQuantity: row.fill_quantity || undefined,
  }));
}

// ============================================================================
// Trade Results Operations
// ============================================================================

export function saveTradeResult(result: TradeResult): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO trade_results (
      execution_id, match_id, ticker, side, entry_price, exit_price,
      quantity, pnl, pnl_percent, actual_outcome, model_correct, settled_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    result.executionId,
    result.matchId,
    result.ticker,
    result.side,
    Math.round(result.entryPrice * 100),
    Math.round(result.exitPrice * 100),
    result.quantity,
    result.pnl,
    result.pnlPercent,
    result.actualOutcome,
    result.modelCorrect ? 1 : 0,
    result.settledAt.getTime()
  );
  
  // Update daily P&L
  updateDailyPnL(result);
  
  // Update model accuracy
  updateModelAccuracy(result);
}

function updateDailyPnL(result: TradeResult): void {
  const database = getDb();
  const dateStr = result.settledAt.toISOString().split('T')[0];
  
  const existing = database.prepare(`
    SELECT * FROM daily_pnl WHERE date = ?
  `).get(dateStr) as { total_pnl: number; trades_won: number; trades_lost: number; total_volume: number } | undefined;
  
  if (existing) {
    database.prepare(`
      UPDATE daily_pnl SET
        total_pnl = total_pnl + ?,
        trades_won = trades_won + ?,
        trades_lost = trades_lost + ?,
        total_volume = total_volume + ?
      WHERE date = ?
    `).run(
      result.pnl,
      result.modelCorrect ? 1 : 0,
      result.modelCorrect ? 0 : 1,
      result.quantity * result.entryPrice,
      dateStr
    );
  } else {
    database.prepare(`
      INSERT INTO daily_pnl (date, total_pnl, trades_won, trades_lost, total_volume)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      dateStr,
      result.pnl,
      result.modelCorrect ? 1 : 0,
      result.modelCorrect ? 0 : 1,
      result.quantity * result.entryPrice
    );
  }
}

function updateModelAccuracy(result: TradeResult): void {
  const database = getDb();
  
  // Extract team ID from match_id (format: teamId1_vs_teamId2)
  const parts = result.matchId.split('_vs_');
  if (parts.length !== 2) return;
  
  // Update for both teams
  for (const teamId of parts) {
    const existing = database.prepare(`
      SELECT * FROM model_accuracy WHERE team_id = ? AND map_name IS NULL
    `).get(teamId) as { predictions: number; correct: number } | undefined;
    
    if (existing) {
      database.prepare(`
        UPDATE model_accuracy SET
          predictions = predictions + 1,
          correct = correct + ?,
          last_updated = ?
        WHERE team_id = ? AND map_name IS NULL
      `).run(result.modelCorrect ? 1 : 0, Date.now(), teamId);
    } else {
      database.prepare(`
        INSERT INTO model_accuracy (team_id, map_name, predictions, correct, last_updated)
        VALUES (?, NULL, 1, ?, ?)
      `).run(teamId, result.modelCorrect ? 1 : 0, Date.now());
    }
  }
}

// ============================================================================
// Analytics
// ============================================================================

export function getPerformanceStats(): {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  bestDay: { date: string; pnl: number };
  worstDay: { date: string; pnl: number };
  last7DaysPnL: number;
} {
  const database = getDb();
  
  // Total trades and results
  const totals = database.prepare(`
    SELECT COUNT(*) as total, SUM(model_correct) as wins, SUM(pnl) as pnl
    FROM trade_results
  `).get() as { total: number; wins: number; pnl: number };
  
  // Best/worst days
  const bestDay = database.prepare(`
    SELECT date, total_pnl FROM daily_pnl ORDER BY total_pnl DESC LIMIT 1
  `).get() as { date: string; total_pnl: number } | undefined;
  
  const worstDay = database.prepare(`
    SELECT date, total_pnl FROM daily_pnl ORDER BY total_pnl ASC LIMIT 1
  `).get() as { date: string; total_pnl: number } | undefined;
  
  // Last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split('T')[0];
  
  const last7Days = database.prepare(`
    SELECT SUM(total_pnl) as pnl FROM daily_pnl WHERE date >= ?
  `).get(dateStr) as { pnl: number | null };
  
  return {
    totalTrades: totals.total || 0,
    winRate: totals.total > 0 ? (totals.wins || 0) / totals.total : 0,
    totalPnL: totals.pnl || 0,
    avgPnL: totals.total > 0 ? (totals.pnl || 0) / totals.total : 0,
    bestDay: bestDay ? { date: bestDay.date, pnl: bestDay.total_pnl } : { date: '', pnl: 0 },
    worstDay: worstDay ? { date: worstDay.date, pnl: worstDay.total_pnl } : { date: '', pnl: 0 },
    last7DaysPnL: last7Days.pnl || 0,
  };
}

export function getTeamAccuracy(teamId: string): { predictions: number; correct: number; accuracy: number } {
  const database = getDb();
  
  const row = database.prepare(`
    SELECT predictions, correct FROM model_accuracy WHERE team_id = ? AND map_name IS NULL
  `).get(teamId) as { predictions: number; correct: number } | undefined;
  
  if (!row) {
    return { predictions: 0, correct: 0, accuracy: 0 };
  }
  
  return {
    predictions: row.predictions,
    correct: row.correct,
    accuracy: row.predictions > 0 ? row.correct / row.predictions : 0,
  };
}

// ============================================================================
// Exports
// ============================================================================

export const database = {
  cacheTeamStats,
  getCachedTeamStats,
  saveTrade,
  updateTradeStatus,
  getRecentTrades,
  saveTradeResult,
  getPerformanceStats,
  getTeamAccuracy,
  close: () => {
    if (db) {
      db.close();
      db = null;
    }
  },
};
