import { prisma } from '@/lib/prisma';
import { polymarket, type PolymarketTrade } from '@/services/polymarket/client';
import { Decimal } from 'decimal.js';
import { stdDev } from '@/lib/utils';

export class TraderSyncService {
  /**
   * Sync trade history for a specific trader
   */
  async syncTraderHistory(address: string): Promise<{ trades: number; errors: string[] }> {
    const errors: string[] = [];
    console.log(`🔄 Syncing trades for ${address.slice(0, 10)}...`);

    // Ensure trader exists
    const trader = await prisma.trader.upsert({
      where: { address: address.toLowerCase() },
      create: { address: address.toLowerCase() },
      update: {},
    });

    // Get all markets to fetch trades from
    const markets = await prisma.market.findMany({
      where: { yesTokenId: { not: null } },
      select: { id: true, yesTokenId: true, noTokenId: true },
    });

    let totalTrades = 0;

    for (const market of markets) {
      if (!market.yesTokenId) continue;

      try {
        // Get trades for YES token
        const yesTrades = await polymarket.getTradesForMarket(market.yesTokenId, { limit: 100 });

        // Filter trades by this trader
        const traderTrades = yesTrades.filter(
          (t) =>
            t.owner?.toLowerCase() === address.toLowerCase() ||
            t.maker_address?.toLowerCase() === address.toLowerCase()
        );

        for (const trade of traderTrades) {
          try {
            await this.upsertTrade(trader.id, market.id, trade, 'YES');
            totalTrades++;
          } catch (err) {
            errors.push(`Trade ${trade.id}: ${err}`);
          }
        }

        // Get trades for NO token
        if (market.noTokenId) {
          const noTrades = await polymarket.getTradesForMarket(market.noTokenId, { limit: 100 });

          const traderNoTrades = noTrades.filter(
            (t) =>
              t.owner?.toLowerCase() === address.toLowerCase() ||
              t.maker_address?.toLowerCase() === address.toLowerCase()
          );

          for (const trade of traderNoTrades) {
            try {
              await this.upsertTrade(trader.id, market.id, trade, 'NO');
              totalTrades++;
            } catch (err) {
              errors.push(`Trade ${trade.id}: ${err}`);
            }
          }
        }
      } catch (err) {
        // Skip market on error
      }
    }

    // Update trader stats
    await this.updateTraderStats(trader.id);

    console.log(`✅ Synced ${totalTrades} trades for ${address.slice(0, 10)}`);
    return { trades: totalTrades, errors };
  }

  /**
   * Sync trades for a specific market
   */
  async syncMarketTrades(marketId: string): Promise<{ trades: number; traders: number }> {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      select: { id: true, yesTokenId: true, noTokenId: true },
    });

    if (!market?.yesTokenId) {
      throw new Error('Market not found or missing token IDs');
    }

    console.log(`🔄 Syncing trades for market ${marketId.slice(0, 8)}...`);

    const tradersSeen = new Set<string>();
    let totalTrades = 0;

    // Get YES trades
    const yesTrades = await polymarket.getTradesForMarket(market.yesTokenId, { limit: 500 });

    for (const trade of yesTrades) {
      const traderAddress = trade.owner || trade.maker_address;
      if (!traderAddress) continue;

      // Ensure trader exists
      const trader = await prisma.trader.upsert({
        where: { address: traderAddress.toLowerCase() },
        create: { address: traderAddress.toLowerCase() },
        update: {},
      });

      tradersSeen.add(trader.id);
      await this.upsertTrade(trader.id, market.id, trade, 'YES');
      totalTrades++;
    }

    // Get NO trades
    if (market.noTokenId) {
      const noTrades = await polymarket.getTradesForMarket(market.noTokenId, { limit: 500 });

      for (const trade of noTrades) {
        const traderAddress = trade.owner || trade.maker_address;
        if (!traderAddress) continue;

        const trader = await prisma.trader.upsert({
          where: { address: traderAddress.toLowerCase() },
          create: { address: traderAddress.toLowerCase() },
          update: {},
        });

        tradersSeen.add(trader.id);
        await this.upsertTrade(trader.id, market.id, trade, 'NO');
        totalTrades++;
      }
    }

    console.log(`✅ Synced ${totalTrades} trades from ${tradersSeen.size} traders`);
    return { trades: totalTrades, traders: tradersSeen.size };
  }

  /**
   * Upsert a single trade
   */
  private async upsertTrade(
    traderId: string,
    marketId: string,
    trade: PolymarketTrade,
    side: 'YES' | 'NO'
  ): Promise<void> {
    const externalId = trade.transaction_hash || trade.id || `${traderId}-${trade.match_time}`;

    const price = new Decimal(trade.price);
    const size = new Decimal(trade.size);
    const value = price.times(size);

    await prisma.trade.upsert({
      where: { externalId },
      create: {
        externalId,
        traderId,
        marketId,
        side,
        action: trade.side,
        price,
        size,
        value,
        entryTime: trade.match_time ? new Date(parseInt(trade.match_time) * 1000) : new Date(),
      },
      update: {
        // Don't update existing trades
      },
    });
  }

  /**
   * Update aggregated trader statistics
   */
  async updateTraderStats(traderId: string): Promise<void> {
    const trades = await prisma.trade.findMany({
      where: { traderId },
      orderBy: { entryTime: 'asc' },
    });

    if (trades.length === 0) return;

    // Calculate basic stats
    const wins = trades.filter((t) => t.outcome === 'WIN').length;
    const completed = trades.filter((t) => t.outcome !== null && t.outcome !== 'PENDING').length;
    const winRate = completed > 0 ? wins / completed : null;

    const pnls = trades.filter((t) => t.pnl !== null).map((t) => t.pnl!.toNumber());

    const totalPnl = pnls.reduce((sum, p) => sum + p, 0);

    // Calculate Sharpe (simplified)
    const avgPnl = pnls.length > 0 ? totalPnl / pnls.length : 0;
    const pnlStdDev = stdDev(pnls);
    const sharpeRatio = pnlStdDev > 0 ? avgPnl / pnlStdDev : null;

    // Calculate profit factor
    const grossWins = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
    const grossLosses = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 10 : 1;

    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;

    for (const pnl of pnls) {
      cumulative += pnl;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak > 0 ? (peak - cumulative) / peak : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Determine if whale (>$10k volume)
    const totalVolume = trades.reduce((sum, t) => sum + t.value.toNumber(), 0);
    const isWhale = totalVolume > 10000;

    await prisma.trader.update({
      where: { id: traderId },
      data: {
        totalTrades: trades.length,
        winRate: winRate !== null ? new Decimal(winRate) : null,
        sharpeRatio: sharpeRatio !== null ? new Decimal(sharpeRatio) : null,
        profitFactor: new Decimal(Math.min(profitFactor, 10)),
        totalPnl: new Decimal(totalPnl),
        maxDrawdown: new Decimal(maxDrawdown),
        firstTradeAt: trades[0].entryTime,
        lastTradeAt: trades[trades.length - 1].entryTime,
        isWhale,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Update stats for all traders with recent activity
   */
  async updateAllTraderStats(): Promise<number> {
    const traders = await prisma.trader.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    console.log(`📊 Updating stats for ${traders.length} traders...`);

    let updated = 0;
    for (const trader of traders) {
      try {
        await this.updateTraderStats(trader.id);
        updated++;
      } catch {
        // Skip
      }
    }

    console.log(`✅ Updated ${updated} trader stats`);
    return updated;
  }
}

export const traderSync = new TraderSyncService();
