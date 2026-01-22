'use client';

import { useState, useEffect } from 'react';

interface GameEventsProps {
  marketId: string;
}

interface GameEvent {
  id: string;
  timestamp: Date;
  type: string;
  description: string;
  priceImpact?: number;
}

const mockEvents = [
  { type: 'ROUND_WIN', desc: 'Team A wins pistol round', impact: 0.03 },
  { type: 'ACE', desc: 'Player clutches 1v4', impact: 0.05 },
  { type: 'TIMEOUT', desc: 'Technical pause called', impact: -0.01 },
  { type: 'ECO_ROUND', desc: 'Team B on eco round', impact: -0.02 },
  { type: 'MAP_PICK', desc: 'Haven selected', impact: 0.01 },
  { type: 'PLAYER_SWAP', desc: 'Roster substitution', impact: -0.03 },
];

export default function GameEvents({ marketId }: GameEventsProps) {
  const [events, setEvents] = useState<GameEvent[]>([]);

  useEffect(() => {
    if (!marketId) return;

    // Add mock events periodically
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        const eventTemplate = mockEvents[Math.floor(Math.random() * mockEvents.length)];
        const newEvent: GameEvent = {
          id: `evt-${Date.now()}`,
          timestamp: new Date(),
          type: eventTemplate.type,
          description: eventTemplate.desc,
          priceImpact: eventTemplate.impact * (0.5 + Math.random()),
        };
        setEvents((prev) => [newEvent, ...prev.slice(0, 19)]);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [marketId]);

  return (
    <div className="bg-gray-900 rounded-lg p-4 flex-1 overflow-hidden">
      <h2 className="text-xl font-bold mb-4">⚡ Game Events</h2>

      {!marketId ? (
        <div className="text-center text-gray-500 py-8">
          Enter a market ID to track game events
        </div>
      ) : events.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p className="mb-2">No events yet</p>
          <p className="text-xs">
            (Manually log events or connect to game API)
          </p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100% - 50px)' }}>
          {events.map((event) => (
            <div key={event.id} className="bg-gray-800 p-3 rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-blue-400">
                  {event.type}
                </span>
                <span className="text-xs text-gray-500">
                  {event.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-gray-300">{event.description}</p>
              {event.priceImpact !== undefined && (
                <div
                  className={`text-xs mt-2 ${
                    event.priceImpact > 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  Price impact: {event.priceImpact > 0 ? '+' : ''}
                  {(event.priceImpact * 100).toFixed(2)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
