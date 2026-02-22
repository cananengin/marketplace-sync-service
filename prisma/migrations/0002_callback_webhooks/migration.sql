-- CreateEnum
CREATE TYPE "CallbackOutboxStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "organizationId" VARCHAR(255) NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callback_outbox" (
    "id" UUID NOT NULL,
    "organizationId" VARCHAR(255) NOT NULL,
    "storeId" UUID NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "CallbackOutboxStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callback_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_organizationId_event_targetUrl_key" ON "webhook_endpoints"("organizationId", "event", "targetUrl");

-- CreateIndex
CREATE INDEX "webhook_endpoints_organizationId_idx" ON "webhook_endpoints"("organizationId");

-- CreateIndex
CREATE INDEX "webhook_endpoints_event_idx" ON "webhook_endpoints"("event");

-- CreateIndex
CREATE INDEX "callback_outbox_status_nextRetryAt_idx" ON "callback_outbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "callback_outbox_organizationId_createdAt_idx" ON "callback_outbox"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "callback_outbox_storeId_createdAt_idx" ON "callback_outbox"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "callback_outbox" ADD CONSTRAINT "callback_outbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
