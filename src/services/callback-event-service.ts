import { StoreRepository } from '../repositories/store-repository';
import { CallbackOutboxRepository } from '../repositories/callback-outbox-repository';
import { getCallbackQueue } from '../infrastructure/queues';

export interface CallbackPayloadWrapper {
  eventId: string;
  event: string;
  timestamp: string;
  organizationId: string;
  storeId: string;
  data: Record<string, unknown>;
}

export type CallbackEventType = 'sync.started' | 'sync.completed' | 'sync.failed';

function isDuplicateJobError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes('already exists') || message.includes('already waiting');
}

/**
 * Emit a store-scoped event: write to callback_outbox and enqueue job.
 * No HTTP calls in this service.
 */
export class CallbackEventService {
  constructor(
    private storeRepository?: StoreRepository,
    private outboxRepository?: CallbackOutboxRepository
  ) {}

  private get storeRepo() {
    return this.storeRepository ?? new StoreRepository();
  }

  private get outboxRepo() {
    return this.outboxRepository ?? new CallbackOutboxRepository();
  }

  async emitStoreEvent(params: {
    storeId: string;
    event: CallbackEventType;
    data: Record<string, unknown>;
  }): Promise<void> {
    const store = await this.storeRepo.findById(params.storeId);
    if (!store) return;

    const outbox = await this.outboxRepo.createOutboxEvent({
      organizationId: store.organizationId,
      storeId: params.storeId,
      event: params.event,
      data: params.data,
    });

    const queue = getCallbackQueue();
    const jobId = `outbox_${outbox.id}`;
    try {
      await queue.add(
        'callback',
        { outboxId: outbox.id },
        {
          jobId,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    } catch (err) {
      if (isDuplicateJobError(err)) {
        console.log(
          JSON.stringify({
            event: 'callback_already_enqueued',
            outboxId: outbox.id,
            jobId,
          })
        );
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: 'callback_enqueue_failed',
          outboxId: outbox.id,
          jobId,
          message,
        })
      );
      throw err;
    }
  }
}
