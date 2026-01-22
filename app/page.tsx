'use client';

import { useState } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import OrderBook from '../components/OrderBook';
import PriceChart from '../components/PriceChart';
import SignalPanel from '../components/SignalPanel';
import GameEvents from '../components/GameEvents';

export default function Dashboard() {
  const [videoUrl, setVideoUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [marketId, setMarketId] = useState('demo-market');
  const [isWatching, setIsWatching] = useState(true);

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-3xl font-bold mb-2">🎯 Live Trading Analysis</h1>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Video URL (YouTube/Twitch)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Market ID (e.g. 0x1234...)"
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => setIsWatching(!isWatching)}
            className={`px-6 py-2 rounded font-semibold transition-colors ${
              isWatching ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isWatching ? '● Live' : 'Start'}
          </button>
        </div>
        <div className="text-sm text-gray-400">
          Demo mode: Mock data is being generated. Enter any market ID to see live updates.
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-160px)]">
        {/* Left: Video + Game Events */}
        <div className="col-span-6 flex flex-col gap-4">
          <VideoPlayer url={videoUrl} />
          <GameEvents marketId={isWatching ? marketId : ''} />
        </div>

        {/* Middle: Price Chart */}
        <div className="col-span-4">
          <PriceChart marketId={isWatching ? marketId : ''} />
        </div>

        {/* Right: Order Book + Signals */}
        <div className="col-span-2 flex flex-col gap-4">
          <SignalPanel marketId={isWatching ? marketId : ''} />
          <OrderBook marketId={isWatching ? marketId : ''} />
        </div>
      </div>
    </div>
  );
}
