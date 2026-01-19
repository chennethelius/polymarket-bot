import Redis from 'ioredis';
import { env } from './config';

// Create Redis client (optional - fallback to in-memory if not configured)
const createRedisClient = () => {
  if (!env.REDIS_URL) {
    console.warn('⚠️ REDIS_URL not configured. Using in-memory cache fallback.');
    return null;
  }

  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    },
  });
};

export const redis = createRedisClient();

// In-memory fallback cache
const memoryCache = new Map<string, { value: string; expiry?: number }>();

// Redis-compatible wrapper with fallback
export const redisClient = {
  async get(key: string): Promise<string | null> {
    if (redis) {
      return redis.get(key);
    }

    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      memoryCache.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<void> {
    if (redis) {
      if (mode === 'EX' && ttl) {
        await redis.setex(key, ttl, value);
      } else {
        await redis.set(key, value);
      }
      return;
    }

    memoryCache.set(key, {
      value,
      expiry: mode === 'EX' && ttl ? Date.now() + ttl * 1000 : undefined,
    });
  },

  async del(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
      return;
    }
    memoryCache.delete(key);
  },

  async lpush(key: string, value: string): Promise<void> {
    if (redis) {
      await redis.lpush(key, value);
      return;
    }

    // Memory fallback: store as JSON array
    const existing = memoryCache.get(key);
    const list = existing ? JSON.parse(existing.value) : [];
    list.unshift(value);
    memoryCache.set(key, { value: JSON.stringify(list) });
  },

  async ltrim(key: string, start: number, end: number): Promise<void> {
    if (redis) {
      await redis.ltrim(key, start, end);
      return;
    }

    // Memory fallback
    const existing = memoryCache.get(key);
    if (!existing) return;
    const list = JSON.parse(existing.value);
    const trimmed = list.slice(start, end + 1);
    memoryCache.set(key, { value: JSON.stringify(trimmed), expiry: existing.expiry });
  },

  async expire(key: string, seconds: number): Promise<void> {
    if (redis) {
      await redis.expire(key, seconds);
      return;
    }

    // Memory fallback
    const existing = memoryCache.get(key);
    if (!existing) return;
    memoryCache.set(key, {
      value: existing.value,
      expiry: Date.now() + seconds * 1000,
    });
  },
};

// Cache utilities with fallback
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (redis) {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    }

    // Memory fallback
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      memoryCache.delete(key);
      return null;
    }
    return JSON.parse(entry.value);
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (redis) {
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }
      return;
    }

    // Memory fallback
    memoryCache.set(key, {
      value: serialized,
      expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  },

  async invalidate(pattern: string): Promise<void> {
    if (redis) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return;
    }

    // Memory fallback - simple pattern matching
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of memoryCache.keys()) {
      if (regex.test(key)) {
        memoryCache.delete(key);
      }
    }
  },

  async del(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
      return;
    }
    memoryCache.delete(key);
  },
};
