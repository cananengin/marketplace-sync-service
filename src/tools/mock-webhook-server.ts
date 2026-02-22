/**
 * Mock webhook server for manual testing of Task 5 callbacks.
 * Run: tsx src/tools/mock-webhook-server.ts --port 4000
 *
 * POST /webhook:
 * - Logs request body.
 * - Returns 500 if header x-fail=true or payload.receipt (or data.receipt) ends with "5".
 * - Otherwise returns 200.
 */

import Fastify from 'fastify';

function parsePort(): number {
  const idx = process.argv.indexOf('--port');
  if (idx === -1 || !process.argv[idx + 1]) return 4000;
  return parseInt(process.argv[idx + 1], 10) || 4000;
}

async function main() {
  const port = parsePort();
  const fastify = Fastify({ logger: true });

  fastify.post<{
    Body: Record<string, unknown> & { receipt?: string; data?: { receipt?: string } };
  }>('/webhook', async (request, reply) => {
    const body = request.body ?? {};
    console.log(JSON.stringify({ event: 'webhook_received', body }));

    const failHeader = (request.headers['x-fail'] ?? request.headers['X-Fail']) === 'true';
    const receipt =
      typeof body.receipt === 'string'
        ? body.receipt
        : typeof body.data === 'object' && body.data && typeof (body.data as { receipt?: string }).receipt === 'string'
          ? (body.data as { receipt: string }).receipt
          : undefined;
    const failReceipt = typeof receipt === 'string' && receipt.endsWith('5');

    if (failHeader || failReceipt) {
      return reply.status(500).send({ error: 'mock_fail', reason: failHeader ? 'header' : 'receipt' });
    }
    return reply.status(200).send({ ok: true });
  });

  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Mock webhook server listening on http://127.0.0.1:${port}/webhook`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
