import { Worker, Job } from 'bullmq';
import crypto from 'node:crypto';
import { getRedisConnectionOptions } from '../infrastructure/redis';
import { CALLBACK_QUEUE_NAME } from '../infrastructure/queues';
import type { CallbackJobData } from '../infrastructure/queues/types';
import { CallbackOutboxRepository } from '../repositories/callback-outbox-repository';
import { WebhookEndpointRepository } from '../repositories/webhook-endpoint-repository';
import { CallbackOutboxStatus } from '@prisma/client';

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 5000;

function backoffMinutes(attempt: number): number {
  if (attempt <= 1) return 1;
  if (attempt === 2) return 5;
  return 15;
}

function computeSignature(secret: string, body: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('hex');
}

async function postWebhook(
  targetUrl: string,
  payload: object,
  eventId: string,
  secret?: string
): Promise<{ status: number; ok: boolean; error?: string }> {
  const bodyString = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Event-Id': eventId,
  };
  if (secret) {
    headers['X-Webhook-Signature'] = `sha256=${computeSignature(secret, bodyString)}`;
    headers['X-Webhook-Timestamp'] = new Date().toISOString();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: bodyString,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const ok = res.status === 200 || res.status === 201;
    return {
      status: res.status,
      ok,
      error: ok ? undefined : `${res.status} ${res.statusText}`,
    };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    return { status: 0, ok: false, error: message };
  }
}

async function processJob(job: Job<CallbackJobData>): Promise<void> {
  const { outboxId } = job.data;
  const outboxRepo = new CallbackOutboxRepository();
  const endpointRepo = new WebhookEndpointRepository();

  const outbox = await outboxRepo.findById(outboxId);
  if (!outbox) {
    console.log(JSON.stringify({ event: 'callback_skipped', outboxId, reason: 'not_found' }));
    return;
  }

  if (outbox.status === CallbackOutboxStatus.success || outbox.status === CallbackOutboxStatus.failed) {
    console.log(JSON.stringify({ event: 'callback_skipped', outboxId, reason: outbox.status }));
    return;
  }

  const endpoints = await endpointRepo.listActiveByOrgAndEvent(outbox.organizationId, outbox.event);
  if (endpoints.length === 0) {
    await outboxRepo.markSuccess(outboxId);
    console.log(JSON.stringify({ event: 'callback_no_endpoints', outboxId }));
    return;
  }

  const secret = process.env.WEBHOOK_SECRET;
  const payload = outbox.payload as object;

  const results = await Promise.allSettled(
    endpoints.map((ep) =>
      postWebhook(ep.targetUrl, payload, outboxId, secret)
    )
  );

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      if (r.value.ok) successCount++;
      else {
        failCount++;
        if (r.value.error) errors.push(r.value.error);
      }
    } else {
      failCount++;
      errors.push(r.reason?.message ?? String(r.reason));
    }
  }

  const allSuccess = failCount === 0;

  if (allSuccess) {
    await outboxRepo.markSuccess(outboxId);
  } else {
    const nextAttempt = outbox.attempt + 1;
    const lastError = errors.slice(0, 3).join('; ') || 'unknown';
    if (nextAttempt >= MAX_ATTEMPTS) {
      await outboxRepo.markFailed(outboxId, lastError);
    } else {
      const backoffMin = backoffMinutes(nextAttempt);
      const nextRetryAt = new Date(Date.now() + backoffMin * 60 * 1000);
      await outboxRepo.markRetry(outboxId, nextAttempt, nextRetryAt, lastError);
      // Callback scheduler will re-enqueue when nextRetryAt is due
    }
  }

  const nextRetryAt = allSuccess
    ? null
    : outbox.attempt + 1 >= MAX_ATTEMPTS
      ? null
      : new Date(
          Date.now() + backoffMinutes(outbox.attempt + 1) * 60 * 1000
        ).toISOString();

  console.log(
    JSON.stringify({
      event: 'callback_delivery',
      outboxId,
      organizationId: outbox.organizationId,
      storeId: outbox.storeId,
      outboxEvent: outbox.event,
      attempt: outbox.attempt,
      endpointCount: endpoints.length,
      successCount,
      failCount,
      nextRetryAt,
    })
  );
}

function main(): void {
  const connection = getRedisConnectionOptions();

  const worker = new Worker<CallbackJobData>(
    CALLBACK_QUEUE_NAME,
    async (job) => processJob(job),
    { connection, concurrency: 10 }
  );

  worker.on('completed', (job: Job<CallbackJobData>) => {
    console.log(JSON.stringify({ event: 'callback_job_completed', jobId: job.id }));
  });

  worker.on('failed', (job: Job<CallbackJobData> | undefined, err: Error) => {
    console.error(JSON.stringify({ event: 'callback_job_failed', jobId: job?.id, error: String(err) }));
  });

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('Callback worker started');
}

main();
