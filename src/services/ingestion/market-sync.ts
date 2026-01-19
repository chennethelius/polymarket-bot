import { prisma } from '@/lib/prisma';
import { polymarket, type GammaMarket, type PolymarketMarket } from '@/services/polymarket/client';
import { categorizeMarket } from '@/utils/categorization';
import { chunk } from '@/lib/utils';

export class MarketSyncService {
  /**
   * Sync all markets from Polymarket
   */
  async syncAllMarkets(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    console.log('🔄 Starting market sync...');

    try {
      // Use Gamma API for better market metadata
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const markets = await polymarket.getGammaMarkets({
          limit,
          offset,
          active: true,
        });

        if (markets.length === 0) {
          hasMore = false;
          break;
        }

        // Process in batches
        for (const batch of chunk(markets, 10)) {
          const results = await Promise.allSettled(
            batch.map((market) => this.upsertGammaMarket(market))
          );

          for (const result of results) {
            if (result.status === 'fulfilled') {
              synced++;
            } else {
              errors.push(result.reason?.message || 'Unknown error');
            }
          }
        }

        offset += limit;
        console.log(`  Processed ${offset} markets...`);

        // Break if we got fewer than expected (last page)
        if (markets.length < limit) {
          hasMore = false;
        }
      }
    } catch (err) {
      errors.push(`Sync error: ${err}`);
    }

    console.log(`✅ Synced ${synced} markets, ${errors.length} errors`);
    return { synced, errors };
  }

  /**
   * Sync recently active markets only (faster)
   */
  async syncActiveMarkets(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    console.log('🔄 Syncing active markets...');

    try {
      const markets = await polymarket.getGammaMarkets({
        limit: 200,
        active: true,
        closed: false,
      });

      for (const market of markets) {
        try {
          await this.upsertGammaMarket(market);
          synced++;
        } catch (err) {
          errors.push(`Market ${market.id}: ${err}`);
        }
      }
    } catch (err) {
      errors.push(`Sync error: ${err}`);
    }

    console.log(`✅ Synced ${synced} active markets, ${errors.length} errors`);
    return { synced, errors };
  }

  /**
   * Upsert a market from Gamma API data
   */
  private async upsertGammaMarket(market: GammaMarket): Promise<void> {
    // Parse prices from JSON string
    let yesPrice = 0.5;
    let noPrice = 0.5;

    if (market.outcomePrices) {
      try {
        const prices = JSON.parse(market.outcomePrices);
        if (Array.isArray(prices) && prices.length >= 2) {
          yesPrice = parseFloat(prices[0]) || 0.5;
          noPrice = parseFloat(prices[1]) || 0.5;
        }
      } catch {
        // Use defaults
      }
    }

    // Parse token IDs
    let yesTokenId: string | undefined;
    let noTokenId: string | undefined;

    if (market.clobTokenIds) {
      try {
        const tokenIds = JSON.parse(market.clobTokenIds);
        if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
          yesTokenId = tokenIds[0];
          noTokenId = tokenIds[1];
        }
      } catch {
        // Skip
      }
    }

    const spread = Math.abs(yesPrice + noPrice - 1);
    const category = categorizeMarket(market.question, market.slug);

    // Determine status
    let status: 'ACTIVE' | 'CLOSED' | 'RESOLVED' = 'ACTIVE';
    if (market.closed) status = 'CLOSED';
    if (market.archived) status = 'RESOLVED';

    await prisma.market.upsert({
      where: { externalId: market.conditionId || market.id },
      create: {
        externalId: market.conditionId || market.id,
        platform: 'POLYMARKET',
        question: market.question,
        description: market.description,
        category,
        slug: market.slug,
        status,
        startDate: new Date(),
        endDate: market.endDate ? new Date(market.endDate) : null,
        yesTokenId,
        noTokenId,
        yesPrice,
        noPrice,
        volume24h: market.volume24hr || 0,
        totalVolume: market.volume || 0,
        liquidity: market.liquidity || 0,
        spread,
      },
      update: {
        question: market.question,
        description: market.description,
        status,
        endDate: market.endDate ? new Date(market.endDate) : null,
        yesTokenId,
        noTokenId,
        yesPrice,
        noPrice,
        volume24h: market.volume24hr || 0,
        totalVolume: market.volume || 0,
        liquidity: market.liquidity || 0,
        spread,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Take price snapshots for active markets
   */
  async snapshotPrices(): Promise<{ snapshots: number; errors: number }> {
    const activeMarkets = await prisma.market.findMany({
      where: { status: 'ACTIVE', yesTokenId: { not: null } },
      select: { id: true, yesTokenId: true },
    });

    console.log(`📸 Snapshotting ${activeMarkets.length} markets...`);

    let snapshots = 0;
    let errors = 0;

    for (const market of activeMarkets) {
      if (!market.yesTokenId) continue;

      try {
        const orderBook = await polymarket.getOrderBook(market.yesTokenId);

        const yesBid = parseFloat(orderBook.bids[0]?.price ?? '0');
        const yesAsk = parseFloat(orderBook.asks[0]?.price ?? '1');

        const snapshot = {
          marketId: market.id,
          timestamp: new Date(),
          yesBid,
          yesAsk,
          noBid: 1 - yesAsk,
          noAsk: 1 - yesBid,
          yesBidSize: orderBook.bids.slice(0, 5).reduce((sum, b) => sum + parseFloat(b.size), 0),
          yesAskSize: orderBook.asks.slice(0, 5).reduce((sum, a) => sum + parseFloat(a.size), 0),
          volume: 0, // Would need to track delta
        };

        await prisma.priceSnapshot.create({ data: snapshot });
        snapshots++;
      } catch (err) {
        errors++;
        // Don't log every error, too noisy
      }
    }

    console.log(`✅ Created ${snapshots} snapshots, ${errors} errors`);
    return { snapshots, errors };
  }

  /**
   * Update market resolutions
   */
  async syncResolutions(): Promise<number> {
    const closedMarkets = await prisma.market.findMany({
      where: {
        status: 'CLOSED',
        resolution: null,
      },
      select: { id: true, externalId: true },
    });

    console.log(`🔍 Checking ${closedMarkets.length} closed markets for resolution...`);

    let resolved = 0;

    for (const market of closedMarkets) {
      try {
        const fullMarket = await polymarket.getMarket(market.externalId);
        if (!fullMarket) continue;

        const yesToken = fullMarket.tokens.find((t) => t.outcome === 'Yes');
        const noToken = fullMarket.tokens.find((t) => t.outcome === 'No');

        let resolution: 'YES' | 'NO' | null = null;
        if (yesToken?.winner) resolution = 'YES';
        else if (noToken?.winner) resolution = 'NO';

        if (resolution) {
          await prisma.market.update({
            where: { id: market.id },
            data: {
              status: 'RESOLVED',
              resolution,
              resolutionDate: new Date(),
            },
          });
          resolved++;
        }
      } catch {
        // Skip
      }
    }

    console.log(`✅ Resolved ${resolved} markets`);
    return resolved;
  }
}

export const marketSync = new MarketSyncService();
