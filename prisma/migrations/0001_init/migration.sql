-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('etsy', 'shopify', 'amazon');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'success', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "SyncLogStatus" AS ENUM ('pending', 'success', 'failed', 'rate_limited');

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "organizationId" VARCHAR(255) NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "externalStoreId" VARCHAR(255) NOT NULL,
    "storeName" VARCHAR(255) NOT NULL,
    "accessToken" TEXT NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "syncToken" UUID NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMPTZ(6),
    "importedSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "receipt" VARCHAR(255) NOT NULL,
    "status" "SyncLogStatus" NOT NULL DEFAULT 'pending',
    "orderId" VARCHAR(255),
    "amount" DECIMAL(10,2),
    "currency" VARCHAR(10),
    "errorDetails" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMPTZ(6),
    "importedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_syncToken_key" ON "stores"("syncToken");

-- CreateIndex
CREATE UNIQUE INDEX "stores_organizationId_marketplace_externalStoreId_key" ON "stores"("organizationId", "marketplace", "externalStoreId");

-- CreateIndex
CREATE INDEX "stores_syncStatus_idx" ON "stores"("syncStatus");

-- CreateIndex
CREATE INDEX "stores_organizationId_idx" ON "stores"("organizationId");

-- CreateIndex
CREATE INDEX "stores_marketplace_idx" ON "stores"("marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "sync_logs_storeId_receipt_key" ON "sync_logs"("storeId", "receipt");

-- CreateIndex
CREATE INDEX "sync_logs_status_nextRetryAt_idx" ON "sync_logs"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "sync_logs_storeId_status_idx" ON "sync_logs"("storeId", "status");

-- CreateIndex
CREATE INDEX "sync_logs_storeId_createdAt_idx" ON "sync_logs"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
