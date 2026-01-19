import { Decimal } from 'decimal.js';

/**
 * Format a number as currency
 */
export function formatCurrency(value: number | Decimal, decimals = 0): string {
  const num = value instanceof Decimal ? value.toNumber() : value;

  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`;
  }
  return `$${num.toFixed(decimals)}`;
}

/**
 * Format a decimal as percentage
 */
export function formatPercent(value: number | Decimal, decimals = 1): string {
  const num = value instanceof Decimal ? value.toNumber() : value;
  return `${(num * 100).toFixed(decimals)}%`;
}

/**
 * Format price in cents (0-100)
 */
export function formatPriceCents(value: number | Decimal): string {
  const num = value instanceof Decimal ? value.toNumber() : value;
  return `${(num * 100).toFixed(1)}¢`;
}

/**
 * Truncate wallet address for display
 */
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Calculate standard deviation
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b) / values.length);
}

/**
 * Calculate mean
 */
export function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b) / values.length : 0;
}

/**
 * Calculate median
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; maxDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) break;

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
