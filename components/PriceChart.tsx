'use client';

import { useState, useEffect } from 'react';

interface PriceChartProps {
  marketId: string;
}

interface PricePoint {
  time: number;
  price: number;
  signal?: 'PANIC_SELL' | 'FOMO_BUY' | 'LIQUIDITY_VACUUM';
}

const signals = ['PANIC_SELL', 'FOMO_BUY', 'LIQUIDITY_VACUUM'] as const;

export default function PriceChart({ marketId }: PriceChartProps) {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);

  useEffect(() => {
    if (!marketId) return;

    // Generate initial history
    let basePrice = 0.55;
    const initialHistory: PricePoint[] = [];
    for (let i = 50; i >= 0; i--) {
      basePrice += (Math.random() - 0.5) * 0.02;
      basePrice = Math.max(0.1, Math.min(0.9, basePrice));
      initialHistory.push({
        time: Date.now() - i * 1000,
        price: basePrice,
        signal: Math.random() > 0.95 ? signals[Math.floor(Math.random() * 3)] : undefined,
      });
    }
    setPriceHistory(initialHistory);
    setCurrentPrice(basePrice);

    // Update price periodically
    const interval = setInterval(() => {
      setPriceHistory((prev) => {
        const lastPrice = prev.length > 0 ? prev[prev.length - 1].price : 0.55;
        let newPrice = lastPrice + (Math.random() - 0.5) * 0.015;
        newPrice = Math.max(0.1, Math.min(0.9, newPrice));
        setCurrentPrice(newPrice);
        
        const newPoint: PricePoint = {
          time: Date.now(),
          price: newPrice,
          signal: Math.random() > 0.97 ? signals[Math.floor(Math.random() * 3)] : undefined,
        };
        return [...prev.slice(-100), newPoint];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [marketId]);

  const maxPrice = Math.max(...priceHistory.map((p) => p.price), 1);
  const minPrice = Math.min(...priceHistory.map((p) => p.price), 0);
  const range = maxPrice - minPrice || 0.1;

  return (
    <div className="bg-gray-900 rounded-lg p-4 h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-xl font-bold">📈 Price Chart</h2>
        {currentPrice > 0 && (
          <div className="text-3xl font-mono mt-2">
            ${currentPrice.toFixed(4)}
          </div>
        )}
      </div>

      {!marketId ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Enter a market ID to view price chart
        </div>
      ) : priceHistory.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Waiting for price data...
        </div>
      ) : (
        <div className="flex-1 relative">
          <svg className="w-full h-full">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                y1={`${ratio * 100}%`}
                x2="100%"
                y2={`${ratio * 100}%`}
                stroke="#374151"
                strokeWidth="1"
                strokeDasharray="4"
              />
            ))}

            {/* Price line */}
            <polyline
              points={priceHistory
                .map((point, i) => {
                  const x = (i / (priceHistory.length - 1)) * 100;
                  const y = ((maxPrice - point.price) / range) * 100;
                  return `${x},${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
            />

            {/* Signal markers */}
            {priceHistory.map((point, i) => {
              if (!point.signal) return null;
              
              const x = (i / (priceHistory.length - 1)) * 100;
              const y = ((maxPrice - point.price) / range) * 100;
              
              const color =
                point.signal === 'PANIC_SELL'
                  ? '#ef4444'
                  : point.signal === 'FOMO_BUY'
                  ? '#3b82f6'
                  : '#f59e0b';

              return (
                <circle
                  key={i}
                  cx={`${x}%`}
                  cy={`${y}%`}
                  r="4"
                  fill={color}
                  stroke="white"
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* Price labels */}
          <div className="absolute top-0 right-0 text-xs text-gray-500">
            ${maxPrice.toFixed(4)}
          </div>
          <div className="absolute bottom-0 right-0 text-xs text-gray-500">
            ${minPrice.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}
