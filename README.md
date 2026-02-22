# Marketplace Sync Service

Marketplace Order Sync API / Callback / Worker service built with Node.js, TypeScript, Fastify, PostgreSQL, and Prisma.

## Tech Stack

- **Runtime**: Node.js LTS
- **Language**: TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Testing**: Vitest

## Project Structure

```
src/
├── api/              # API routes and handlers
├── services/         # Business logic services
├── repositories/     # Data access layer (Repository Pattern)
├── workers/          # Background workers
├── infrastructure/   # Infrastructure setup (database, etc.)
└── modules/          # Feature modules
```

## Quick Start

1. Start Docker containers (PostgreSQL and Redis):
```bash
npm run docker:up
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env if needed (defaults should work)
```

3. Run database migrations:
```bash
npm run db:migrate
```

4. Run integration tests to verify setup:
```bash
npm run test:integration
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start Docker containers:
```bash
npm run docker:up
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and set your DATABASE_URL and other variables
```

4. Run Prisma migrations:
```bash
npm run db:migrate
```

5. Generate Prisma client:
```bash
npm run prisma:generate
```

6. Start the server:
```bash
npm run dev
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run prisma:migrate` - Run Prisma migrations
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:export` - Export database schema to schema.sql
- `npm run test` - Run unit tests
- `npm run test:integration` - Run integration tests
- `npm run worker:sync` - Run sync store worker (processes jobs from queue)
- `npm run worker:scheduler` - Run sync scheduler once (enqueues store jobs)
- `npm run dev:worker:sync` - Run sync worker with watch
- `npm run dev:worker:scheduler` - Run sync scheduler with watch
- `npm run worker:callback` - Run callback worker (sends webhooks from outbox)
- `npm run worker:callback:scheduler` - Run callback scheduler once (enqueues outbox jobs); use `-- --loop` for repeated runs
- `npm run dev:worker:callback` - Run callback worker with watch
- `npm run dev:worker:callback:scheduler` - Run callback scheduler with watch (add `-- --loop` for loop mode)
- `npm run tools:mock-webhook` - Start mock webhook server on port 4000
- `npm run dev:all` - macOS helper script; opens separate Terminal windows for API, workers, and schedulers
- `npm run flow:endpoints` - Run a sequential demo flow against core API endpoints

### Automated endpoint flow

Runs these endpoints in order and carries data between steps (`syncToken` from register is used for imports and status):

1. `POST /stores/register`
2. `POST /orders/import` (for multiple receipts)
3. `GET /stores/sync-status`
4. `POST /webhooks/register` (`sync.started`, `sync.completed`, `sync.failed`)
5. `GET /webhooks`

Run:

```bash
npm run flow:endpoints
```

Optional environment variables:

```bash
BASE_URL=http://localhost:3000 \
ORG_ID=org-1 \
MARKETPLACE=etsy \
EXTERNAL_STORE_ID=ext-100 \
STORE_NAME="My Etsy Store" \
ACCESS_TOKEN=token-v2 \
CURRENCY=USD \
WEBHOOK_URL=http://127.0.0.1:4000/webhook \
RECEIPTS=order-101,order-102,order-115 \
npm run flow:endpoints
```

## How to run demo

Use these steps for a clean end-to-end demo:

1. Start infra (PostgreSQL + Redis):
  ```bash
  npm run docker:up
  ```
2. (Optional) Reset DB for a clean start:
  ```bash
  npx prisma migrate reset --force --skip-seed
  ```
3. Start API + workers + schedulers (separate Terminal windows on macOS):
  ```bash
  npm run dev:all
  ```
4. Start mock webhook receiver:
  ```bash
  npm run tools:mock-webhook
  ```
5. Trigger the automated endpoint flow:
  ```bash
  npm run flow:endpoints
  ```

Expected signals:
- `flow:endpoints` prints 200 responses and a `syncToken`.
- `sync-worker` logs `sync_store_batch` and `job_completed`.
- `callback-worker` logs `callback_delivery` and `callback_job_completed`.
- mock webhook server logs `webhook_received`.

## Running tests

### Unit tests

Unit tests do not require a database or Redis. Run them with:

```bash
npm run test
```

To run once and exit (e.g. in CI):

```bash
npm run test -- --run
```

These tests use the default Vitest config (`vitest.config.ts`) and include e.g. API route tests and mock marketplace service tests. Integration tests are excluded so they are not run in parallel against a shared DB.

### Integration tests

Integration tests use the real PostgreSQL database and Redis. They require:

1. **Docker** – PostgreSQL and Redis must be running:
   ```bash
   npm run docker:up
   ```

2. **Migrations** – Database schema must be up to date:
   ```bash
   npm run db:migrate
   ```

3. **Environment** – `DATABASE_URL` and Redis connection (e.g. in `.env`) must point at the Docker services.

Run integration tests with:

```bash
npm run test:integration
```

They use `vitest.integration.config.ts`: test files run **one at a time** (`fileParallelism: false`) to avoid conflicts on the shared database. Tests live under `tests/integration/` and are named `*.integration.test.ts`.

## Database Schema

The database schema includes:

- **stores**: Store information with unique constraint on (organizationId, marketplace, externalStoreId)
- **sync_logs**: Sync operation logs with unique constraint on (storeId, receipt) for idempotency

See `prisma/schema.prisma` for full schema definition.

## Mock Marketplace API

The service includes a mock marketplace API for testing purposes. The API is available at `/mock/:marketplace/validate`.

### Environment Variables

Set the following environment variables for Basic Auth credentials:

```bash
MOCK_ETSY_USER=etsy_user
MOCK_ETSY_PASS=etsy_pass
MOCK_SHOPIFY_USER=shopify_user
MOCK_SHOPIFY_PASS=shopify_pass
MOCK_AMAZON_USER=amazon_user
MOCK_AMAZON_PASS=amazon_pass
```

### API Endpoint

**POST** `/mock/:marketplace/validate`

- `marketplace`: `etsy` | `shopify` | `amazon`
- Body: `{ receipt: string, currency?: string }`
- Authentication: Basic Auth (required)

### Response Rules

- **Rate Limit (429)**: If the sum of the last 2 digits of the receipt is divisible by 6
- **Success (200)**: If the last character is an odd digit
  - Returns: `{ status: true, orderId, amount, currency, importedAtUTC }`
- **Failure (200)**: Otherwise
  - Returns: `{ status: false }`

### Example: Validate Receipt

```bash
# Success case (last char is odd digit)
curl -X POST http://localhost:3000/mock/etsy/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'etsy_user:etsy_pass' | base64)" \
  -d '{"receipt": "test1", "currency": "EUR"}'

# Response:
# {
#   "status": true,
#   "orderId": "...",
#   "amount": 123.45,
#   "currency": "EUR",
#   "importedAtUTC": "2024-01-01T12:00:00.000Z"
# }

# Failure case (last char is even digit)
curl -X POST http://localhost:3000/mock/etsy/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'etsy_user:etsy_pass' | base64)" \
  -d '{"receipt": "test2"}'

# Response:
# {
#   "status": false
# }

# Rate limit case (last 2 digits sum divisible by 6)
curl -X POST http://localhost:3000/mock/etsy/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'etsy_user:etsy_pass' | base64)" \
  -d '{"receipt": "test24"}'

# Response (429):
# {
#   "error": "rate_limited"
# }
```

## API Endpoints

### POST /stores/register

Register or update a store (idempotent).

**Request:**
```bash
curl -X POST http://localhost:3000/stores/register \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org-123",
    "marketplace": "etsy",
    "externalStoreId": "store-456",
    "storeName": "My Store",
    "accessToken": "token-abc",
    "currency": "USD"
  }'
```

**Response:**
```json
{
  "storeId": "uuid",
  "syncToken": "uuid"
}
```

**Notes:**
- If a store with the same `(organizationId, marketplace, externalStoreId)` exists, it will be updated and the same `syncToken` will be returned.
- The `syncToken` is used for subsequent operations.

### POST /orders/import

Import an order (idempotent).

**Request:**
```bash
curl -X POST http://localhost:3000/orders/import \
  -H "Content-Type: application/json" \
  -d '{
    "syncToken": "your-sync-token",
    "receipt": "receipt-123"
  }'
```

**Response (Success):**
```json
{
  "success": true,
  "orderId": "order-123",
  "amount": 99.99,
  "currency": "USD",
  "importedAt": "2024-01-01T12:00:00.000Z"
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "invalid_receipt"
}
```

**Notes:**
- If the same `receipt` was already processed, the existing result is returned without calling the marketplace API again.
- Rate limit errors are handled and stored for retry.

### GET /stores/sync-status

Get sync status for a store.

**Request:**
```bash
curl "http://localhost:3000/stores/sync-status?syncToken=your-sync-token"
```

**Response:**
```json
{
  "lastSyncAt": "2024-01-01T12:00:00.000Z",
  "importedOrders": 10,
  "syncStatus": "success",
  "rateLimitedCount": 2
}
```

**Sync Status Rules:**
- `pending`: No logs exist
- `success`: Last 20 logs have no failed/rate_limited AND last operation is success
- `partial`: Success and failed/rate_limited mixed
- `failed`: Last operation is failed AND no success in last 20 logs

## Sync Worker & Scheduler (Task 4)

Store-based sync engine: retries `rate_limited` / `failed` / `pending` sync_logs per store.

- **Queue**: `sync-store-queue`
- **Job data**: `{ storeId: string }`
- **Job ID**: `store:${storeId}` (idempotent enqueue; same store never duplicated)
- **Lock**: Redis `lock:sync-store:{storeId}` (TTL 15 min). TTL is refreshed at the start of each batch. If lock not acquired, job exits successfully (already running).
- **Worker**: Fetches processable logs (status in pending/failed/rate_limited, nextRetryAt due), re-validates via MockMarketplaceService, updates log and store; backoff for rate_limited: `min(5min * 2^attempt, 60min)`.
- **Scheduler**: Finds stores with `syncStatus` in (pending, failed, partial) and optional `lastSyncAt` older than 1 minute; cursor pagination by (createdAt, id); enqueues one job per store with `jobId = store:${storeId}`.
- **Scheduler CLI**: `--once` (default): run one pass and exit. `--loop`: run every 30s.
- **Logging**: Worker logs `storeId`, `processedCount`, `successCount`, `failedCount`, `rateLimitedCount` per batch; scheduler logs `scannedStores`, `enqueuedJobs`.

### Manual Task 4 Test

1. **Register a store**
   ```bash
   curl -X POST http://localhost:3000/stores/register \
     -H "Content-Type: application/json" \
     -d '{"organizationId":"org1","marketplace":"etsy","externalStoreId":"ext1","storeName":"Store","accessToken":"tok","currency":"USD"}'
   ```
   Save `syncToken` from the response.

2. **Create a rate_limited log (receipt RL15)**  
   Call order import with a receipt whose last two digits sum to a multiple of 6 (e.g. `RL15` → 1+5=6):
   ```bash
   curl -X POST http://localhost:3000/orders/import \
     -H "Content-Type: application/json" \
     -d '{"syncToken":"YOUR_SYNC_TOKEN","receipt":"RL15"}'
   ```
   Expect `success: false`, `error: "rate_limited"`.

3. **Set nextRetryAt in the past (so worker will pick it up)**  
   In DB:
   ```sql
   UPDATE sync_logs SET "nextRetryAt" = NOW() - INTERVAL '1 minute' WHERE receipt = 'RL15';
   ```

4. **Run scheduler** (enqueue jobs for eligible stores)
   ```bash
   npm run worker:scheduler
   ```
   Or: `node dist/workers/sync-scheduler.js --once`  
   Check logs for `scannedStores`, `enqueuedJobs`.

5. **Run worker** (process the store job)
   ```bash
   npm run worker:sync
   ```
   Worker acquires lock, processes the log: either success/failed/rate_limited with updated `nextRetryAt` and backoff. Check logs for `processedCount`, `successCount`, `failedCount`, `rateLimitedCount`.

6. **Verify via sync-status**  
   ```bash
   curl "http://localhost:3000/stores/sync-status?syncToken=YOUR_SYNC_TOKEN"
   ```
   Confirm `rateLimitedCount` and `importedOrders` (and `lastSyncAt`) reflect the worker run (e.g. rateLimitedCount may decrease if a log moved to success/failed; importedOrders increases if any log became success).

## Webhook Callbacks & Manual Task 5 Test

The service sends webhook events (`sync.started`, `sync.completed`, `sync.failed`) to registered endpoints using an outbox pattern and BullMQ `callback-queue`. Delivery is at-least-once; use `eventId` (and header `X-Event-Id`) for idempotency.

### Manual Task 5 Test

1. **Start infrastructure**
   ```bash
   npm run docker:up
   ```
   Ensure PostgreSQL and Redis are up.

2. **Run the API**
   ```bash
   npm run dev
   ```
   (Or `npm run build` then `npm run start`.)

3. **Run the callback worker**
   In a second terminal:
   ```bash
   npm run dev:worker:callback
   ```
   (Or `npm run worker:callback` after build.)

4. **Run the callback scheduler** (enqueues pending/retry outbox rows)
   In a third terminal:
   ```bash
   npm run dev:worker:callback:scheduler -- --loop
   ```
   (Or one-off: `npm run worker:callback:scheduler`.)

5. **Run the mock webhook server** (port 4000)
   In a fourth terminal:
   ```bash
   npm run tools:mock-webhook
   ```
   Or: `tsx src/tools/mock-webhook-server.ts --port 4000`  
   The mock returns 200 unless `x-fail: true` header or payload `receipt` ends with `"5"` (then 500).

6. **Register a webhook**
   ```bash
   curl -X POST http://localhost:3000/webhooks/register \
     -H "Content-Type: application/json" \
     -d '{"organizationId":"org-manual","event":"sync.completed","targetUrl":"http://127.0.0.1:4000/webhook"}'
   ```

7. **Trigger a sync**
   - Register a store and import orders (or use sync scheduler + sync worker) so that a store completes a sync. The sync worker will emit `sync.started` / `sync.completed` or `sync.failed`.

8. **Verify**
   - **callback_outbox**: A row should exist for the event (`status` pending → success or retry).
   - **Callback worker logs**: Should show HTTP POST to `http://127.0.0.1:4000/webhook`, plus `event`, `outboxId`, `organizationId`, `storeId`, `attempt`, `endpointCount`, `successCount`, `failCount`, `nextRetryAt`.
   - **Mock webhook server**: Should log the received body (standard payload: `eventId`, `event`, `timestamp`, `organizationId`, `storeId`, `data`).
   - **500 case**: Send with header `x-fail: true` or use a receipt ending in `5` so the mock returns 500. Then confirm in DB: `attempt` increased, `nextRetryAt` set, and after 3 failures `status` becomes `failed`.

### Webhook API

- **POST /webhooks/register**  
  Body: `{ organizationId, event, targetUrl }`. `event`: `sync.started` | `sync.completed` | `sync.failed`. `targetUrl` must be valid `http`/`https`. Response: `{ id, organizationId, event, targetUrl, isActive }`.

- **GET /webhooks?organizationId=...**  
  Returns list of webhook endpoints for the organization.

## Notes

- **UUID Generation**: `id` and `syncToken` values are generated in the application layer using UUID v7. There is no database dependency for UUID generation.
- UUID v7 is used for primary keys (configured in migrations)
- All Prisma database access goes through Repository classes
- Indexes are optimized for high-volume operations (10M+ records)
- Both `/stores/register` and `/orders/import` are idempotent operations

## What was implemented

- End-to-end API + worker + scheduler architecture with BullMQ + Redis.
- Idempotent store registration and order import (`storeId+receipt` uniqueness).
- Rate-limit handling with retry/backoff (`pending/failed/rate_limited` lifecycle).
- Store-level distributed lock to prevent concurrent processing for the same store.
- Callback outbox pattern with webhook delivery worker and retry support.
- Developer automation scripts: `dev:all` and `flow:endpoints`.

## What could be improved

- Add production-grade observability (metrics, dashboards, alerting, tracing).
- Strengthen lock safety with token-based lock ownership checks.
- Add load/performance benchmarks for 10M+ data scenarios.
- Improve callback scheduler visibility and dead-letter handling.
- Add one-command smoke test script for CI validation.