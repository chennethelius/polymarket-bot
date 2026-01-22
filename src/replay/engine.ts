/**
 * Replay Engine
 * 
 * Reconstructs market state at any point in a recorded session.
 * Supports timeline scrubbing, playback controls, and event filtering.
 */

import { EventEmitter } from 'events';
import {
  loadSession,
  loadEvents,
  loadUserTrades,
  loadAnalysis,
  getBookAtTimestamp,
  type SessionMetadata,
  type RecordingEvent,
  type UserTrade,
  type SessionAnalysis,
} from '../recorder/storage';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OrderBook {
  bids: Array<[number, number]>;  // [price, size]
  asks: Array<[number, number]>;
  timestamp: number;
  spread: number;
  midPrice: number;
}

export interface TimelineMarker {
  timestamp: number;
  type: 'trade' | 'user_trade' | 'game_event' | 'price_spike';
  label: string;
  data?: any;
}

export interface PlaybackState {
  isPlaying: boolean;
  speed: number;           // 1 = realtime, 2 = 2x, 0.5 = half speed
  currentTime: number;     // Current playback timestamp
  startTime: number;       // Session start
  endTime: number;         // Session end
  duration: number;        // Total duration in ms
  progress: number;        // 0-1 progress
}

export interface ReplaySnapshot {
  timestamp: number;
  book: OrderBook;
  recentTrades: RecordingEvent[];
  userTrades: UserTrade[];
  gameEvents: RecordingEvent[];
  priceHistory: Array<{ timestamp: number; price: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// REPLAY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class ReplayEngine extends EventEmitter {
  private sessionId: string;
  private metadata: SessionMetadata | null = null;
  private events: RecordingEvent[] = [];
  private userTrades: UserTrade[] = [];
  private analysis: SessionAnalysis | null = null;
  
  // Playback state
  private playbackState: PlaybackState = {
    isPlaying: false,
    speed: 1,
    currentTime: 0,
    startTime: 0,
    endTime: 0,
    duration: 0,
    progress: 0,
  };
  
  private playbackTimer: ReturnType<typeof setInterval> | null = null;
  private lastBookIndex = 0;  // Cache for book reconstruction
  
  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  /**
   * Load session data
   */
  async load(): Promise<boolean> {
    this.metadata = loadSession(this.sessionId);
    if (!this.metadata) {
      this.emit('error', new Error(`Session not found: ${this.sessionId}`));
      return false;
    }

    this.events = loadEvents(this.sessionId);
    this.userTrades = loadUserTrades(this.sessionId);
    this.analysis = loadAnalysis(this.sessionId);

    if (this.events.length === 0) {
      this.emit('error', new Error('No events in session'));
      return false;
    }

    // Initialize playback state
    const startTime = this.events[0].timestamp;
    const endTime = this.events[this.events.length - 1].timestamp;
    
    this.playbackState = {
      isPlaying: false,
      speed: 1,
      currentTime: startTime,
      startTime,
      endTime,
      duration: endTime - startTime,
      progress: 0,
    };

    this.emit('loaded', {
      metadata: this.metadata,
      eventCount: this.events.length,
      duration: this.playbackState.duration,
    });

    return true;
  }

  /**
   * Get session metadata
   */
  getMetadata(): SessionMetadata | null {
    return this.metadata;
  }

  /**
   * Get all events
   */
  getEvents(): RecordingEvent[] {
    return this.events;
  }

  /**
   * Get user trades
   */
  getUserTrades(): UserTrade[] {
    return this.userTrades;
  }

  /**
   * Get timeline markers for visualization
   */
  getTimelineMarkers(): TimelineMarker[] {
    const markers: TimelineMarker[] = [];

    // Add user trades
    for (const trade of this.userTrades) {
      markers.push({
        timestamp: trade.timestamp,
        type: 'user_trade',
        label: `${trade.side} ${trade.size} @ $${trade.price.toFixed(2)}`,
        data: trade,
      });
    }

    // Add game events
    for (const event of this.events) {
      if (event.type === 'game_event') {
        markers.push({
          timestamp: event.timestamp,
          type: 'game_event',
          label: event.data.description || event.data.eventType,
          data: event.data,
        });
      }
    }

    // Detect price spikes (>5% move in 10 seconds)
    const priceEvents = this.events.filter(e => e.type === 'price' || e.type === 'book');
    for (let i = 1; i < priceEvents.length; i++) {
      const prev = this.getBookPrice(priceEvents[i - 1]);
      const curr = this.getBookPrice(priceEvents[i]);
      
      if (prev && curr) {
        const change = Math.abs(curr - prev) / prev;
        if (change > 0.05) {
          markers.push({
            timestamp: priceEvents[i].timestamp,
            type: 'price_spike',
            label: `${change > 0 ? '📈' : '📉'} ${(change * 100).toFixed(1)}% move`,
            data: { from: prev, to: curr, change },
          });
        }
      }
    }

    // Sort by timestamp
    markers.sort((a, b) => a.timestamp - b.timestamp);
    
    return markers;
  }

  /**
   * Get order book at specific timestamp
   */
  getBookAt(timestamp: number): OrderBook | null {
    // Find the most recent book event before or at timestamp
    let lastBook: RecordingEvent | null = null;
    
    for (let i = this.lastBookIndex; i < this.events.length; i++) {
      const event = this.events[i];
      if (event.timestamp > timestamp) break;
      if (event.type === 'book') {
        lastBook = event;
        this.lastBookIndex = i;
      }
    }

    // If we went past, search backwards
    if (!lastBook) {
      for (let i = Math.min(this.lastBookIndex, this.events.length - 1); i >= 0; i--) {
        const event = this.events[i];
        if (event.type === 'book' && event.timestamp <= timestamp) {
          lastBook = event;
          this.lastBookIndex = i;
          break;
        }
      }
    }

    if (!lastBook) return null;

    const bids = lastBook.data.bids || [];
    const asks = lastBook.data.asks || [];
    
    const bestBid = bids.length > 0 ? bids[0][0] : 0;
    const bestAsk = asks.length > 0 ? asks[0][0] : 1;
    
    return {
      bids,
      asks,
      timestamp: lastBook.timestamp,
      spread: bestAsk - bestBid,
      midPrice: (bestBid + bestAsk) / 2,
    };
  }

  /**
   * Get full snapshot at timestamp
   */
  getSnapshotAt(timestamp: number): ReplaySnapshot {
    const book = this.getBookAt(timestamp) || {
      bids: [],
      asks: [],
      timestamp,
      spread: 0,
      midPrice: 0,
    };

    // Get recent trades (last 10 before timestamp)
    const recentTrades = this.events
      .filter(e => e.type === 'trade' && e.timestamp <= timestamp)
      .slice(-10);

    // Get user trades up to this point
    const userTrades = this.userTrades.filter(t => t.timestamp <= timestamp);

    // Get game events up to this point
    const gameEvents = this.events.filter(
      e => e.type === 'game_event' && e.timestamp <= timestamp
    );

    // Build price history
    const priceHistory: Array<{ timestamp: number; price: number }> = [];
    for (const event of this.events) {
      if (event.timestamp > timestamp) break;
      
      const price = this.getBookPrice(event);
      if (price !== null) {
        priceHistory.push({ timestamp: event.timestamp, price });
      }
    }

    return {
      timestamp,
      book,
      recentTrades,
      userTrades,
      gameEvents,
      priceHistory,
    };
  }

  /**
   * Get current playback state
   */
  getPlaybackState(): PlaybackState {
    return { ...this.playbackState };
  }

  /**
   * Seek to specific timestamp
   */
  seek(timestamp: number): void {
    const clampedTime = Math.max(
      this.playbackState.startTime,
      Math.min(this.playbackState.endTime, timestamp)
    );

    this.playbackState.currentTime = clampedTime;
    this.playbackState.progress = 
      (clampedTime - this.playbackState.startTime) / this.playbackState.duration;

    // Reset book cache if seeking backwards
    if (timestamp < this.events[this.lastBookIndex]?.timestamp) {
      this.lastBookIndex = 0;
    }

    this.emit('seek', this.getSnapshotAt(clampedTime));
  }

  /**
   * Seek by progress (0-1)
   */
  seekProgress(progress: number): void {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const timestamp = this.playbackState.startTime + 
      (clampedProgress * this.playbackState.duration);
    this.seek(timestamp);
  }

  /**
   * Start playback
   */
  play(): void {
    if (this.playbackState.isPlaying) return;

    this.playbackState.isPlaying = true;
    
    const tickRate = 100; // Update every 100ms
    let lastTick = Date.now();

    this.playbackTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastTick) * this.playbackState.speed;
      lastTick = now;

      this.playbackState.currentTime += elapsed;

      // Check for end
      if (this.playbackState.currentTime >= this.playbackState.endTime) {
        this.playbackState.currentTime = this.playbackState.endTime;
        this.pause();
        this.emit('ended');
      }

      this.playbackState.progress = 
        (this.playbackState.currentTime - this.playbackState.startTime) / 
        this.playbackState.duration;

      this.emit('tick', this.getSnapshotAt(this.playbackState.currentTime));
    }, tickRate);

    this.emit('play');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.playbackState.isPlaying) return;

    this.playbackState.isPlaying = false;
    
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    this.emit('pause');
  }

  /**
   * Toggle play/pause
   */
  toggle(): void {
    if (this.playbackState.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    this.playbackState.speed = Math.max(0.25, Math.min(16, speed));
    this.emit('speedChange', this.playbackState.speed);
  }

  /**
   * Skip forward/backward
   */
  skip(deltaMs: number): void {
    this.seek(this.playbackState.currentTime + deltaMs);
  }

  /**
   * Jump to next marker
   */
  nextMarker(): void {
    const markers = this.getTimelineMarkers();
    const next = markers.find(m => m.timestamp > this.playbackState.currentTime);
    if (next) {
      this.seek(next.timestamp);
    }
  }

  /**
   * Jump to previous marker
   */
  prevMarker(): void {
    const markers = this.getTimelineMarkers();
    const prev = [...markers]
      .reverse()
      .find(m => m.timestamp < this.playbackState.currentTime - 1000);
    if (prev) {
      this.seek(prev.timestamp);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.pause();
    this.removeAllListeners();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private getBookPrice(event: RecordingEvent): number | null {
    if (event.type === 'price') {
      return event.data.price;
    }
    if (event.type === 'book') {
      const bids = event.data.bids || [];
      const asks = event.data.asks || [];
      if (bids.length > 0 && asks.length > 0) {
        return (bids[0][0] + asks[0][0]) / 2;
      }
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format timestamp relative to session start
 */
export function formatRelativeTime(timestamp: number, startTime: number): string {
  const elapsed = timestamp - startTime;
  const seconds = Math.floor(elapsed / 1000) % 60;
  const minutes = Math.floor(elapsed / 60000) % 60;
  const hours = Math.floor(elapsed / 3600000);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format price as percentage (Polymarket style)
 */
export function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

/**
 * Calculate book imbalance (-1 to 1, negative = more sells)
 */
export function calculateImbalance(book: OrderBook, levels = 5): number {
  const bidVolume = book.bids.slice(0, levels).reduce((sum, [_, size]) => sum + size, 0);
  const askVolume = book.asks.slice(0, levels).reduce((sum, [_, size]) => sum + size, 0);
  const total = bidVolume + askVolume;
  
  if (total === 0) return 0;
  return (bidVolume - askVolume) / total;
}
