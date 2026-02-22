import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../redis';

const QUEUE_NAME = 'sync-store-queue';

let syncStoreQueue: Queue | null = null;

/**
 * Get the sync-store queue (singleton).
 * Job data: { storeId: string }
 * Use jobId = `store:${storeId}` for idempotent enqueue.
 */
export function getSyncStoreQueue(): Queue {
  if (!syncStoreQueue) {
    const connection = getRedisConnectionOptions();
    syncStoreQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }
  return syncStoreQueue;
}

export async function closeSyncStoreQueue(): Promise<void> {
  if (syncStoreQueue) {
    await syncStoreQueue.close();
    syncStoreQueue = null;
  }
}

export { QUEUE_NAME as SYNC_STORE_QUEUE_NAME };
