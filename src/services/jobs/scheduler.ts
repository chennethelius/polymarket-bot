import { CronJob } from 'cron';
import { marketSync } from '@/services/ingestion/market-sync';
import { traderSync } from '@/services/ingestion/trader-sync';
import { prisma } from '@/lib/prisma';

interface JobConfig {
  name: string;
  cronTime: string;
  handler: () => Promise<void>;
  enabled: boolean;
}

export class JobScheduler {
  private jobs: CronJob[] = [];
  private isRunning = false;

  private readonly jobConfigs: JobConfig[] = [
    {
      name: 'Market Sync (Active)',
      cronTime: '0 */5 * * * *', // Every 5 minutes
      handler: async () => {
        await marketSync.syncActiveMarkets();
      },
      enabled: true,
    },
    {
      name: 'Price Snapshot',
      cronTime: '30 */5 * * * *', // Every 5 minutes, offset by 30s
      handler: async () => {
        await marketSync.snapshotPrices();
      },
      enabled: true,
    },
    {
      name: 'Full Market Sync',
      cronTime: '0 0 */6 * * *', // Every 6 hours
      handler: async () => {
        await marketSync.syncAllMarkets();
      },
      enabled: true,
    },
    {
      name: 'Resolution Check',
      cronTime: '0 0 * * * *', // Every hour
      handler: async () => {
        await marketSync.syncResolutions();
      },
      enabled: true,
    },
    {
      name: 'Top Trader Sync',
      cronTime: '0 0 */2 * * *', // Every 2 hours
      handler: async () => {
        const topTraders = await prisma.trader.findMany({
          where: { isActive: true, totalTrades: { gte: 10 } },
          orderBy: { totalTrades: 'desc' },
          take: 50,
          select: { address: true },
        });

        for (const trader of topTraders) {
          await traderSync.syncTraderHistory(trader.address);
        }
      },
      enabled: true,
    },
    {
      name: 'Trader Stats Update',
      cronTime: '0 30 */4 * * *', // Every 4 hours at :30
      handler: async () => {
        await traderSync.updateAllTraderStats();
      },
      enabled: true,
    },
  ];

  /**
   * Start all scheduled jobs
   */
  start(): void {
    if (this.isRunning) {
      console.warn('⚠️ Scheduler already running');
      return;
    }

    console.log('🚀 Starting job scheduler...');

    for (const config of this.jobConfigs) {
      if (!config.enabled) {
        console.log(`  ⏭️ ${config.name} (disabled)`);
        continue;
      }

      const job = new CronJob(config.cronTime, async () => {
        console.log(`⏰ Running job: ${config.name}`);
        const start = Date.now();

        try {
          await config.handler();
          console.log(`✅ ${config.name} completed in ${Date.now() - start}ms`);
        } catch (err) {
          console.error(`❌ ${config.name} failed:`, err);
        }
      });

      job.start();
      this.jobs.push(job);
      console.log(`  ✅ ${config.name} (${config.cronTime})`);
    }

    this.isRunning = true;
    console.log(`\n📅 Scheduled ${this.jobs.length} jobs`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    console.log('🛑 Stopping job scheduler...');
    this.jobs.forEach((job) => job.stop());
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Run a specific job immediately
   */
  async runJob(name: string): Promise<void> {
    const config = this.jobConfigs.find((c) => c.name === name);
    if (!config) {
      throw new Error(`Job not found: ${name}`);
    }

    console.log(`🔧 Manually running: ${name}`);
    await config.handler();
  }

  /**
   * List all configured jobs
   */
  listJobs(): Array<{ name: string; cronTime: string; enabled: boolean }> {
    return this.jobConfigs.map((c) => ({
      name: c.name,
      cronTime: c.cronTime,
      enabled: c.enabled,
    }));
  }
}

export const scheduler = new JobScheduler();
