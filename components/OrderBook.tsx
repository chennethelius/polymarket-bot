'use client';

import { useState, useEffect } from 'react';

interface OrderBookProps {
  marketId: string;
}

interface BookLevel {
  price: number;
  size: number;
}

// Mock data generator
const generateMockBook = () => {
  const midPrice = 0.55 + (Math.random() - 0.5) * 0.1;
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];
  
  for (let i = 0; i < 10; i++) {
    bids.push({
      price: midPrice - 0.001 * (i + 1) - Math.random() * 0.002,
      size: Math.floor(100 + Math.random() * 500),
    });
    asks.push({
      price: midPrice + 0.001 * (i + 1) + Math.random() * 0.002,
      size: Math.floor(100 + Math.random() * 500),
    });
  }
  
  return { bids, asks, spread: asks[0].price - bids[0].price };
};

export default function OrderBook({ marketId }: OrderBookProps) {
  const [bids, setBids] = useState<BookLevel[]>([]);
  const [asks, setAsks] = useState<BookLevel[]>([]);
  const [spread, setSpread] = useState(0);

  useEffect(() => {
    if (!marketId) return;

    // Generate initial mock data
    const { bids: b, asks: a, spread: s } = generateMockBook();
    setBids(b);
    setAsks(a);
    setSpread(s);

    // Update mock data periodically
    const interval = setInterval(() => {
      const { bids: b, asks: a, spread: s } = generateMockBook();
      setBids(b);
      setAsks(a);
      setSpread(s);
    }, 1000);

    return () => clearInterval(interval);
  }, [marketId]);

  return (
    <div className="bg-gray-900 rounded-lg p-4 flex-1 overflow-hidden">
      <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
        <span>📊 Order Book</span>
        {spread > 0 && (
          <span className="text-sm text-gray-400">
            Spread: ${spread.toFixed(4)}
          </span>
        )}
      </h2>

      {!marketId ? (
        <div className="text-center text-gray-500 py-8">
          Enter a market ID to view order book
        </div>
      ) : (
        <div className="space-y-4 text-sm overflow-y-auto" style={{ maxHeight: 'calc(100% - 50px)' }}>
          {/* Asks (sell orders) */}
          <div>
            <div className="text-xs text-gray-500 mb-1 grid grid-cols-2">
              <span>Price</span>
              <span className="text-right">Size</span>
            </div>
            {asks.slice().reverse().map((ask, i) => (
              <div key={i} className="grid grid-cols-2 text-red-400 py-1">
                <span>${ask.price.toFixed(4)}</span>
                <span className="text-right">{ask.size.toFixed(0)}</span>
              </div>
            ))}
          </div>

          {/* Spread indicator */}
          <div className="border-t border-gray-700 py-2 text-center text-yellow-400 font-bold">
            ${spread.toFixed(4)}
          </div>

          {/* Bids (buy orders) */}
          <div>
            {bids.map((bid, i) => (
              <div key={i} className="grid grid-cols-2 text-green-400 py-1">
                <span>${bid.price.toFixed(4)}</span>
                <span className="text-right">{bid.size.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
