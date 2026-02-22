import { getCallbackQueue } from '../infrastructure/queues';
import { CallbackOutboxRepository } from '../repositories/callback-outbox-repository';
import { CallbackOutboxStatus } from '@prisma/client';

const BATCH_SIZE = 100;
const LOOP_INTERVAL_MS = 60 * 1000; // 1 minute

function isDuplicateJobError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes('already exists') || message.includes('already waiting');
}

async function runOnce(): Promise<void> {
  const queue = getCallbackQueue();
  const outboxRepo = new CallbackOutboxRepository();

  const rows = await outboxRepo.getProcessableOutboxBatch(BATCH_SIZE);
  let enqueued = 0;

  for (const row of rows) {
    if (row.status !== CallbackOutboxStatus.pending) continue;
    const jobId = `outbox_${row.id}`;
    try {
      await queue.add(
        'callback',
        { outboxId: row.id },
        {
          jobId,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
      enqueued++;
    } catch (err) {
      if (isDuplicateJobError(err)) {
        console.log(
          JSON.stringify({
            event: 'callback_already_enqueued',
            outboxId: row.id,
            jobId,
          })
        );
      } else {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            event: 'callback_scheduler_enqueue_failed',
            outboxId: row.id,
            jobId,
            message,
          })
        );
      }
    }
  }

  console.log(
    JSON.stringify({
      event: 'callback_scheduler_run',
      scanned: rows.length,
      enqueuedJobs: enqueued,
    })
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const loop = args.includes('--loop');

  if (!loop) {
    runOnce()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('Callback scheduler failed', err);
        process.exit(1);
      });
    return;
  }

  console.log('Callback scheduler started (--loop), interval 60s');
  runOnce().catch((err) => console.error('Callback scheduler run failed', err));
  const intervalId = setInterval(() => {
    runOnce().catch((err) => console.error('Callback scheduler run failed', err));
  }, LOOP_INTERVAL_MS);

  const shutdown = () => {
    clearInterval(intervalId);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
