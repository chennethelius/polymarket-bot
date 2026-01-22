'use client';

import { useState, useEffect } from 'react';

interface SignalPanelProps {
  marketId: string;
}

interface Signal {
  id: string;
  type: string;
  confidence: number;
  description: string;
  timestamp: Date;
  tradeSide?: 'BUY' | 'SELL';
}

const signalTypes = [
  { type: 'PANIC_SELL', desc: 'Large sell pressure detected', side: 'BUY' as const },
  { type: 'FOMO_BUY', desc: 'Aggressive buying momentum', side: 'SELL' as const },
  { type: 'LIQUIDITY_VACUUM', desc: 'Thin order book detected', side: 'BUY' as const },
  { type: 'BID_PULL', desc: 'Bids being pulled', side: 'SELL' as const },
  { type: 'ASK_PULL', desc: 'Asks being pulled', side: 'BUY' as const },
];

export default function SignalPanel({ marketId }: SignalPanelProps) {
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    if (!marketId) return;

    // Add mock signals periodically
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const signalTemplate = signalTypes[Math.floor(Math.random() * signalTypes.length)];
        const newSignal: Signal = {
          id: `sig-${Date.now()}`,
          type: signalTemplate.type,
          confidence: 0.6 + Math.random() * 0.35,
          description: signalTemplate.desc,
          timestamp: new Date(),
          tradeSide: signalTemplate.side,
        };
        setSignals((prev) => [newSignal, ...prev.slice(0, 9)]);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [marketId]);

  const getSignalColor = (type: string) => {
    switch (type) {
      case 'PANIC_SELL':
        return 'bg-red-900 border-red-500';
      case 'FOMO_BUY':
        return 'bg-blue-900 border-blue-500';
      case 'LIQUIDITY_VACUUM':
        return 'bg-yellow-900 border-yellow-500';
      case 'BID_PULL':
      case 'ASK_PULL':
        return 'bg-purple-900 border-purple-500';
      default:
        return 'bg-gray-900 border-gray-500';
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4 overflow-hidden" style={{ maxHeight: '40vh' }}>
      <h2 className="text-xl font-bold mb-4">🚨 Signals</h2>

      {!marketId ? (
        <div className="text-center text-gray-500 py-8">
          Enter a market ID to view signals
        </div>
      ) : signals.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          Waiting for signals...
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100% - 50px)' }}>
          {signals.map((signal) => (
            <div
              key={signal.id}
              className={`p-3 rounded border ${getSignalColor(signal.type)}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">{signal.type}</span>
                <span className="text-xs bg-white/10 px-2 py-1 rounded">
                  {signal.confidence}%
                </span>
              </div>
              <p className="text-xs text-gray-300 mb-2">{signal.description}</p>
              {signal.tradeSide && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">💡</span>
                  <span
                    className={`text-xs font-bold ${
                      signal.tradeSide === 'BUY' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {signal.tradeSide}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
