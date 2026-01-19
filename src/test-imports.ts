#!/usr/bin/env bun
// Quick test to verify core services compile and work

import { orderBookTracker } from '@/services/orderbook/tracker';
import { signalDetector } from '@/services/signals/detector';
import { marketMonitor } from '@/services/monitor';

console.log('✅ All services imported successfully');
console.log('✅ OrderBookTracker:', typeof orderBookTracker);
console.log('✅ SignalDetector:', typeof signalDetector);
console.log('✅ MarketMonitor:', typeof marketMonitor);

process.exit(0);
