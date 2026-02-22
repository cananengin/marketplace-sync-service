import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../redis';

const QUEUE_NAME = 'callback-queue';

let callbackQueue: Queue | null = null;

/**
 * Get the callback queue (singleton).
 * Job data: { outboxId: string }
 * Use jobId = `outbox_${outboxId}` for idempotent enqueue.
 */
export function getCallbackQueue(): Queue {
  if (!callbackQueue) {
    const connection = getRedisConnectionOptions();
    callbackQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }
  return callbackQueue;
}

export async function closeCallbackQueue(): Promise<void> {
  if (callbackQueue) {
    await callbackQueue.close();
    callbackQueue = null;
  }
}

export { QUEUE_NAME as CALLBACK_QUEUE_NAME };
