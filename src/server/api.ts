#!/usr/bin/env bun
/**
 * Polymarket Replay API Server
 * 
 * Provides REST endpoints for:
 * - Recording management (start/stop/list)
 * - Session replay (load events, timeline)
 * - Real-time WebSocket for live recording updates
 * 
 * Run: bun run src/server/api.ts
 */

import { serve } from 'bun';
import { 
  listSessions, 
  loadSession, 
  loadEvents, 
  loadUserTrades,
  loadAnalysis,
  addUserTrade,
  formatDuration,
  type SessionMetadata,
} from '../recorder/storage';
import { Recorder, createRecorderFromUrl } from '../recorder/recorder';
import { ReplayEngine } from '../replay/engine';

const PORT = 3001;

// Active recorder instance
let activeRecorder: Recorder | null = null;

// SSE clients for live updates
const liveClients: Set<ReadableStreamDefaultController> = new Set();

function broadcastToClients(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  liveClients.forEach(controller => {
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch (e) {
      // Client disconnected
      liveClients.delete(controller);
    }
  });
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * API Routes
 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // SESSIONS
    // ═══════════════════════════════════════════════════════════════════════

    // List all sessions
    if (path === '/api/sessions' && method === 'GET') {
      const sessions = listSessions();
      return json(sessions);
    }

    // Get session details with events
    const sessionMatch = path.match(/^\/api\/sessions\/([^\/]+)$/);
    if (sessionMatch && method === 'GET') {
      const sessionId = sessionMatch[1];
      const metadata = loadSession(sessionId);
      
      if (!metadata) {
        return json({ error: 'Session not found' }, 404);
      }

      const events = loadEvents(sessionId);
      const userTrades = loadUserTrades(sessionId);
      const analysis = loadAnalysis(sessionId);

      // Build timeline markers
      const engine = new ReplayEngine(sessionId);
      await engine.load();
      const markers = engine.getTimelineMarkers();
      engine.destroy();

      const startTime = events.length > 0 ? events[0].timestamp : metadata.startTime;
      const endTime = events.length > 0 ? events[events.length - 1].timestamp : metadata.endTime || Date.now();

      return json({
        ...metadata,
        startTime,
        endTime,
        duration: endTime - startTime,
        events,
        userTrades,
        analysis,
        markers,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RECORDING
    // ═══════════════════════════════════════════════════════════════════════

    // Get recording status
    if (path === '/api/recording/status' && method === 'GET') {
      if (!activeRecorder || !activeRecorder.isRecording()) {
        return json({ isRecording: false, active: false });
      }

      const stats = activeRecorder.getStats();
      return json({
        isRecording: true,
        active: true,
        sessionId: stats.sessionId,
        eventCount: stats.eventCount,
        duration: stats.duration,
        startTime: stats.startTime.toISOString(),
      });
    }

    // SSE endpoint for live updates during recording
    if (path === '/api/recording/live' && method === 'GET') {
      const stream = new ReadableStream({
        start(controller) {
          liveClients.add(controller);
          console.log(`[SSE] Client connected. Total: ${liveClients.size}`);
          
          // Send initial connection message
          const msg = `event: connected\ndata: ${JSON.stringify({ clients: liveClients.size })}\n\n`;
          controller.enqueue(new TextEncoder().encode(msg));
        },
        cancel() {
          // Will be cleaned up on next broadcast
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders,
        },
      });
    }

    // Start recording
    if (path === '/api/recording/start' && method === 'POST') {
      if (activeRecorder?.isRecording()) {
        return json({ error: 'Already recording' }, 400);
      }

      const body = await req.json();
      const { marketUrl, tokenId, marketTitle } = body;

      if (!marketUrl && !tokenId) {
        return json({ error: 'marketUrl or tokenId required' }, 400);
      }

      try {
        if (marketUrl) {
          activeRecorder = await createRecorderFromUrl(marketUrl);
        } else {
          activeRecorder = new Recorder({
            marketId: tokenId,
            tokenIds: [tokenId],
            marketTitle: marketTitle || 'Custom Recording',
          });
        }

        // Wire up live event broadcasting
        activeRecorder.on('event', (event: any) => {
          console.log(`[SSE] Broadcasting event: ${event.type}`);
          broadcastToClients('event', event);
        });
        
        activeRecorder.on('connected', () => {
          console.log('[SSE] WebSocket connected, broadcasting...');
          broadcastToClients('status', { type: 'connected' });
        });

        activeRecorder.on('disconnected', (info: any) => {
          console.log('[SSE] WebSocket disconnected, broadcasting...');
          broadcastToClients('status', { type: 'disconnected', ...info });
        });

        const sessionId = await activeRecorder.start();
        
        // Broadcast recording started
        broadcastToClients('status', { 
          type: 'started', 
          sessionId,
          marketTitle: activeRecorder.getMarketTitle?.() || marketTitle || 'Recording',
        });
        
        return json({
          success: true,
          sessionId,
          message: 'Recording started',
        });
      } catch (error: any) {
        return json({ error: error.message }, 400);
      }
    }

    // Stop recording
    if (path === '/api/recording/stop' && method === 'POST') {
      if (!activeRecorder?.isRecording()) {
        return json({ error: 'Not recording' }, 400);
      }

      const metadata = activeRecorder.stop();
      activeRecorder = null;

      return json({
        success: true,
        session: metadata,
      });
    }

    // Log a user trade during recording
    if (path === '/api/recording/trade' && method === 'POST') {
      if (!activeRecorder?.isRecording()) {
        return json({ error: 'Not recording' }, 400);
      }

      const body = await req.json();
      const { side, price, size, notes } = body;

      if (!side || !price || !size) {
        return json({ error: 'side, price, and size required' }, 400);
      }

      const sessionId = activeRecorder.getSessionId()!;
      const trade = activeRecorder.recordUserTrade({
        side,
        price: parseFloat(price),
        size: parseFloat(size),
        tokenId: '', // Will be filled by recorder
        outcome: side === 'BUY' ? 'YES' : 'NO',
        notes,
      });

      return json({ success: true, trade });
    }

    // Log a game event during recording
    if (path === '/api/recording/event' && method === 'POST') {
      if (!activeRecorder?.isRecording()) {
        return json({ error: 'Not recording' }, 400);
      }

      const body = await req.json();
      const { eventType, description, details } = body;

      if (!eventType || !description) {
        return json({ error: 'eventType and description required' }, 400);
      }

      activeRecorder.recordGameEvent(eventType, description, details);
      return json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STATIC FILES (fallback)
    // ═══════════════════════════════════════════════════════════════════════

    // Serve static files from public/
    if (path === '/' || path === '/index.html') {
      return serveFile('public/replay.html');
    }

    if (path.startsWith('/')) {
      const filePath = `public${path}`;
      return serveFile(filePath);
    }

    return json({ error: 'Not found' }, 404);

  } catch (error: any) {
    console.error('API Error:', error);
    return json({ error: error.message || 'Internal server error' }, 500);
  }
}

/**
 * JSON response helper
 */
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

/**
 * Serve static file
 */
async function serveFile(path: string): Promise<Response> {
  try {
    const file = Bun.file(path);
    
    if (!(await file.exists())) {
      return json({ error: 'File not found' }, 404);
    }

    const contentType = getContentType(path);
    return new Response(file, {
      headers: {
        'Content-Type': contentType,
        ...corsHeaders,
      },
    });
  } catch {
    return json({ error: 'File not found' }, 404);
  }
}

/**
 * Get content type from file extension
 */
function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
  };
  return types[ext || ''] || 'text/plain';
}

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

console.log(`
╔════════════════════════════════════════════════════════════╗
║  🎬 Polymarket Replay API Server                           ║
╠════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                               ║
║  Dashboard: http://localhost:${PORT}/                        ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /api/sessions         - List sessions              ║
║    GET  /api/sessions/:id     - Get session details        ║
║    GET  /api/recording/status - Get recording status       ║
║    GET  /api/recording/live   - SSE live event stream      ║
║    POST /api/recording/start  - Start recording            ║
║    POST /api/recording/stop   - Stop recording             ║
║    POST /api/recording/trade  - Log user trade             ║
║    POST /api/recording/event  - Log game event             ║
╚════════════════════════════════════════════════════════════╝
`);

serve({
  port: PORT,
  fetch: handleRequest,
});
