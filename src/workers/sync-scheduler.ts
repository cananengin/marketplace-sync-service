import { getSyncStoreQueue } from '../infrastructure/queues';
import { StoreRepository } from '../repositories/store-repository';

const SCHEDULER_PAGE_SIZE = 100;
const THROTTLE_MINUTES = 1;
const LOOP_INTERVAL_MS = 30 * 1000;

async function runOnce(): Promise<void> {
  const queue = getSyncStoreQueue();
  const storeRepository = new StoreRepository();

  let totalScanned = 0;
  let totalEnqueued = 0;
  let cursor: { createdAt: Date; id: string } | null = null;

  do {
    const { stores, nextCursor } = await storeRepository.findStoresEligibleForSync(
      SCHEDULER_PAGE_SIZE,
      cursor ?? undefined,
      { throttleMinutes: THROTTLE_MINUTES }
    );

    totalScanned += stores.length;

    for (const store of stores) {
      const jobId = `store_${store.id}`;
      try {
        //console.log(`DEBUG: Connecting to Redis at ${JSON.stringify(connection)}`);
        await queue.add(
          'sync-store',
          { storeId: store.id },
          {
            jobId,
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
        totalEnqueued++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          JSON.stringify({
            event: 'enqueue_failed',
            storeId: store.id,
            jobId,
            message,
            name: err instanceof Error ? err.name : undefined,
          })
        );

        // Eğer gerçekten duplicate ise ayrı log bas
        if (message.toLowerCase().includes('already exists')) {
          console.log(
            JSON.stringify({
              event: 'already_enqueued',
              storeId: store.id,
              jobId,
            })
          );
        }
      }
    }

    cursor = nextCursor;
  } while (cursor !== null);

  console.log(
    JSON.stringify({
      event: 'scheduler_run',
      scannedStores: totalScanned,
      enqueuedJobs: totalEnqueued,
    })
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const loop = args.includes('--loop');
  const once = args.includes('--once') || !loop;

  if (once) {
    runOnce()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('Scheduler run failed', err);
        process.exit(1);
      });
    return;
  }

  console.log('Scheduler started (--loop), interval 30s');
  const intervalId = setInterval(() => {
    runOnce().catch((err) => console.error('Scheduler run failed', err));
  }, LOOP_INTERVAL_MS);

  const shutdown = () => {
    clearInterval(intervalId);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
