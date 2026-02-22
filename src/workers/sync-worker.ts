import { Worker, Job } from 'bullmq';
import { Prisma, SyncLogStatus } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import { getRedisConnectionOptions } from '../infrastructure/redis';
import { acquireStoreLock, refreshStoreLock, releaseStoreLock } from '../infrastructure/redis/store-lock';
import { SYNC_STORE_QUEUE_NAME } from '../infrastructure/queues';
import type { SyncStoreJobData } from '../infrastructure/queues/types';
import { StoreRepository } from '../repositories/store-repository';
import { SyncLogRepository } from '../repositories/sync-log-repository';
import { MockMarketplaceService } from '../services/mock-marketplace-service';
import { SyncStatusService } from '../services/sync-status-service';
import { CallbackEventService } from '../services/callback-event-service';
import { RateLimitError, AuthError, MarketplaceError } from '../infrastructure/errors';
import { SyncStatus } from '@prisma/client';

const CHUNK_SIZE = parseInt(process.env.SYNC_CHUNK_SIZE || '100', 10);
const MAX_ITERATIONS = 10;

/** Backoff: 5m, 10m, 20m, 40m, 60m (capped) */
function backoffMinutes(attempt: number): number {
  const minutes = 5 * Math.pow(2, attempt - 1);
  return Math.min(minutes, 60);
}

async function processJob(job: Job<SyncStoreJobData>): Promise<void> {
  const { storeId } = job.data;

  const acquired = await acquireStoreLock(storeId);
  try {
    if (!acquired) {
      console.log(JSON.stringify({ event: 'sync_store_skipped', storeId, reason: 'already_running' }));
      return;
    }

    const storeRepository = new StoreRepository();
    const syncLogRepository = new SyncLogRepository();
    const marketplaceService = new MockMarketplaceService();
    const syncStatusService = new SyncStatusService();

    const store = await storeRepository.findById(storeId);
    if (!store) {
      console.log(JSON.stringify({ event: 'sync_store_skipped', storeId, reason: 'store_not_found' }));
      return;
    }

    const callbackEventService = new CallbackEventService();
    await callbackEventService.emitStoreEvent({
      storeId,
      event: 'sync.started',
      data: { storeId },
    });

    let iteration = 0;
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalRateLimited = 0;

    while (iteration < MAX_ITERATIONS) {
      await refreshStoreLock(storeId);

      const logs = await syncLogRepository.getProcessableLogsForStore(storeId, CHUNK_SIZE);
      if (logs.length === 0) break;

      let batchSuccess = 0;
      let batchFailed = 0;
      let batchRateLimited = 0;

      for (const log of logs) {
        try {
          const result = await marketplaceService.validateReceipt({
            marketplace: store.marketplace,
            receipt: log.receipt,
            currency: store.currency,
          });

          if (result.status === true) {
            const wasAlreadySuccess = log.status === SyncLogStatus.success;
            const prisma = getPrismaClient();
            const importedAt = new Date(result.importedAtUTC);
            const now = new Date();

            await prisma.$transaction(async (tx) => {
              await tx.syncLog.update({
                where: { id: log.id },
                data: {
                  status: SyncLogStatus.success,
                  orderId: result.orderId,
                  amount: new Prisma.Decimal(result.amount),
                  currency: result.currency,
                  importedAt,
                  errorDetails: null,
                  nextRetryAt: null,
                  updatedAt: now,
                },
              });
              if (!wasAlreadySuccess) {
                await tx.store.update({
                  where: { id: storeId },
                  data: {
                    importedSuccessCount: { increment: 1 },
                    updatedAt: now,
                  },
                });
              }
            });
            batchSuccess++;
          } else {
            await syncLogRepository.update(log.id, {
              status: SyncLogStatus.failed,
              errorDetails: 'invalid_receipt',
              nextRetryAt: null,
            });
            batchFailed++;
          }
        } catch (err) {
          if (err instanceof RateLimitError) {
            const attempt = log.attempt + 1;
            const backoffMin = backoffMinutes(attempt);
            const nextRetryAt = new Date(Date.now() + backoffMin * 60 * 1000);
            await syncLogRepository.update(log.id, {
              status: SyncLogStatus.rate_limited,
              attempt,
              nextRetryAt,
              errorDetails: 'rate_limited',
            });
            batchRateLimited++;
          } else if (err instanceof AuthError || err instanceof MarketplaceError) {
            await syncLogRepository.update(log.id, {
              status: SyncLogStatus.failed,
              errorDetails: `${err.name}: ${err.message}`,
              nextRetryAt: null,
            });
            batchFailed++;
          } else {
            throw err;
          }
        }
      }

      totalProcessed += logs.length;
      totalSuccess += batchSuccess;
      totalFailed += batchFailed;
      totalRateLimited += batchRateLimited;

      await syncStatusService.recalculateAndPersistSyncStatus(storeId);

      if (logs.length < CHUNK_SIZE) break;
      iteration++;
    }

    await syncStatusService.recalculateAndPersistSyncStatus(storeId);

    const storeAfter = await storeRepository.findById(storeId);
    const finalStatus = storeAfter?.syncStatus ?? store.syncStatus;
    if (finalStatus !== SyncStatus.failed) {
      await callbackEventService.emitStoreEvent({
        storeId,
        event: 'sync.completed',
        data: {
          storeId,
          processedCount: totalProcessed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          rateLimitedCount: totalRateLimited,
        },
      });
    } else {
      await callbackEventService.emitStoreEvent({
        storeId,
        event: 'sync.failed',
        data: {
          storeId,
          processedCount: totalProcessed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          rateLimitedCount: totalRateLimited,
        },
      });
    }

    console.log(
      JSON.stringify({
        event: 'sync_store_batch',
        storeId,
        processedCount: totalProcessed,
        successCount: totalSuccess,
        failedCount: totalFailed,
        rateLimitedCount: totalRateLimited,
      })
    );

    if (iteration >= MAX_ITERATIONS) {
      console.log(
        JSON.stringify({
          event: 'remaining_backlog',
          storeId,
          iterations: MAX_ITERATIONS,
          lastBatchProcessed: totalProcessed,
        })
      );
    }
  } finally {
    await releaseStoreLock(storeId);
  }
}

function main(): void {
  const connection = getRedisConnectionOptions();

  const worker = new Worker<SyncStoreJobData>(
    SYNC_STORE_QUEUE_NAME,
    async (job) => {
      await processJob(job);
    },
    {
      connection,
      concurrency: 10,
    }
  );

  worker.on('completed', (job: Job<SyncStoreJobData>) => {
    console.log(JSON.stringify({ event: 'job_completed', jobId: job.id }));
  });

  worker.on('failed', (job: Job<SyncStoreJobData> | undefined, err: Error) => {
    console.error(JSON.stringify({ event: 'job_failed', jobId: job?.id, error: String(err) }));
  });

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('Sync store worker started');
}

main();
