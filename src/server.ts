import { marketMonitor } from '@/services/monitor';

// WebSocket connections
const clients = new Set<any>();

// Broadcast to all connected clients
function broadcast(data: any) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    try {
      client.send(message);
    } catch (err) {
      clients.delete(client);
    }
  });
}

// Listen to market monitor events
marketMonitor.on('orderbook', (data) => {
  broadcast({
    type: 'orderbook',
    market: data.market,
    bids: data.bids,
    asks: data.asks,
    spread: data.spread,
    midPrice: data.midPrice,
    bidDepth: data.bidDepth,
    askDepth: data.askDepth,
  });
});

marketMonitor.on('signal', (signal) => {
  broadcast({
    type: 'signal',
    market: signal.marketId,
    id: signal.id,
    signalType: signal.type,
    confidence: signal.confidence,
    description: signal.description,
    tradeSide: signal.tradeSide,
  });
});

marketMonitor.on('trade', (data) => {
  broadcast({
    type: 'trade',
    market: data.market,
    side: data.side,
    price: data.price,
    size: data.size,
  });
});

// HTTP handlers
const server = Bun.serve({
  port: 3001,
  async fetch(req, server) {
    const url = new URL(req.url);
    
    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const success = server.upgrade(req);
      return success ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
    }
    
    // REST API
    if (url.pathname === '/api/markets' && req.method === 'GET') {
      const status = marketMonitor.getStatus();
      return Response.json({
        connected: status.connected,
        markets: status.monitoredMarkets,
      });
    }
    
    if (url.pathname.startsWith('/api/markets/') && url.pathname.endsWith('/subscribe') && req.method === 'POST') {
      const marketId = url.pathname.split('/')[3];
      await marketMonitor.addMarket(marketId);
      return Response.json({ success: true, marketId });
    }
    
    if (url.pathname.startsWith('/api/markets/') && url.pathname.endsWith('/unsubscribe') && req.method === 'POST') {
      const marketId = url.pathname.split('/')[3];
      marketMonitor.removeMarket(marketId);
      return Response.json({ success: true, marketId });
    }
    
    return new Response('Not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log('📡 Client connected. Total:', clients.size);
    },
    message(ws, message) {
      // Handle client messages if needed
      console.log('📨 Received:', message);
    },
    close(ws) {
      clients.delete(ws);
      console.log('📡 Client disconnected. Total:', clients.size);
    },
  },
});

console.log('🚀 WebSocket server running on port 3001');

// Start market monitor
await marketMonitor.start();
console.log('✅ Market monitor started');

export default server;
