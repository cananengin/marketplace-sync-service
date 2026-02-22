#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const organizationId = process.env.ORG_ID || 'org-1';
const marketplace = process.env.MARKETPLACE || 'etsy';
const externalStoreId = process.env.EXTERNAL_STORE_ID || `ext-${Date.now()}`;
const storeName = process.env.STORE_NAME || 'My Etsy Store';
const accessToken = process.env.ACCESS_TOKEN || 'token-v2';
const currency = process.env.CURRENCY || 'USD';
const webhookUrl = process.env.WEBHOOK_URL || 'http://127.0.0.1:4000/webhook';
const receipts = (process.env.RECEIPTS || 'order-101,order-102,order-115')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

async function requestJson(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function printStep(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`status: ${result.status}`);
  console.log(JSON.stringify(result.data, null, 2));
}

async function run() {
  console.log(`Starting endpoint flow on ${baseUrl}`);

  const registerStoreResult = await requestJson('POST', '/stores/register', {
    organizationId,
    marketplace,
    externalStoreId,
    storeName,
    accessToken,
    currency,
  });
  printStep('POST /stores/register', registerStoreResult);

  if (!registerStoreResult.ok || !registerStoreResult.data?.syncToken) {
    throw new Error('Could not get syncToken from /stores/register');
  }

  const syncToken = registerStoreResult.data.syncToken;

  for (const receipt of receipts) {
    const importResult = await requestJson('POST', '/orders/import', {
      syncToken,
      receipt,
    });
    printStep(`POST /orders/import (receipt=${receipt})`, importResult);
  }

  const syncStatusResult = await requestJson('GET', `/stores/sync-status?syncToken=${encodeURIComponent(syncToken)}`);
  printStep('GET /stores/sync-status', syncStatusResult);

  for (const event of ['sync.started', 'sync.completed', 'sync.failed']) {
    const webhookRegisterResult = await requestJson('POST', '/webhooks/register', {
      organizationId,
      event,
      targetUrl: webhookUrl,
    });
    printStep(`POST /webhooks/register (${event})`, webhookRegisterResult);
  }

  const listWebhooksResult = await requestJson('GET', `/webhooks?organizationId=${encodeURIComponent(organizationId)}`);
  printStep('GET /webhooks', listWebhooksResult);

  console.log('\nFlow completed.');
}

run().catch((error) => {
  console.error('\nFlow failed:', error.message);
  process.exit(1);
});