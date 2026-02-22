import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/infrastructure/database';
import { StoreRepository } from '../../src/repositories/store-repository';
import { SyncLogRepository } from '../../src/repositories/sync-log-repository';
import { Marketplace, SyncLogStatus } from '@prisma/client';

describe.sequential('Database Integration Tests', () => {
  const prisma = getPrismaClient();
  const storeRepository = new StoreRepository();
  const syncLogRepository = new SyncLogRepository();

  beforeAll(async () => {
    await prisma.callbackOutbox.deleteMany({});
    await prisma.syncLog.deleteMany({});
    await prisma.store.deleteMany({});
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await prisma.callbackOutbox.deleteMany({});
    await prisma.syncLog.deleteMany({});
    await prisma.store.deleteMany({});
  });

  // --- STORE REPOSITORY TESTS ---

  it('should update updatedAt on store success count increment', async () => {
    const store = await storeRepository.create({
      organizationId: 'org-update',
      marketplace: Marketplace.shopify,
      externalStoreId: 'ext-update',
      storeName: 'Update Test',
      accessToken: 'token-1',
      currency: 'EUR',
    });

    const initialUpdatedAt = store.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const updated = await storeRepository.incrementImportedSuccessCount(store.id, 1);

    expect(updated.importedSuccessCount).toBe(1);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
  });

  // --- SYNC LOG REPOSITORY TESTS ---

  it('should create and update a sync log', async () => {
    const store = await storeRepository.create({
      organizationId: 'org-sync',
      marketplace: Marketplace.amazon,
      externalStoreId: 'ext-sync',
      storeName: 'Sync Test',
      accessToken: 'token-sync',
      currency: 'USD',
    });

    const syncLog = await syncLogRepository.create({
      storeId: store.id,
      receipt: 'r-101',
      status: SyncLogStatus.pending,
      attempt: 0,
    });

    const initialUpdatedAt = syncLog.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const updated = await syncLogRepository.update(syncLog.id, {
      status: SyncLogStatus.success,
      orderId: 'order-123',
      amount: 45.50,
      currency: 'USD',
      attempt: 1,
      nextRetryAt: null,
      importedAt: new Date(),
    });

    expect(updated.status).toBe(SyncLogStatus.success);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
  });

  it('should find pending or failed logs for a store', async () => {
    const store = await storeRepository.create({
      organizationId: 'org-pending',
      marketplace: Marketplace.etsy,
      externalStoreId: 'ext-pending',
      storeName: 'Pending Test',
      accessToken: 'token-pending',
      currency: 'USD',
    });

    await syncLogRepository.create({ storeId: store.id, receipt: 'rec-1', status: SyncLogStatus.pending, attempt: 0 });
    await syncLogRepository.create({ storeId: store.id, receipt: 'rec-2', status: SyncLogStatus.failed, attempt: 1 });
    await syncLogRepository.create({ storeId: store.id, receipt: 'rec-3', status: SyncLogStatus.success, attempt: 1 });

    const pendingOrFailed = await syncLogRepository.findPendingOrFailedLogs(store.id);
    
    expect(pendingOrFailed.length).toBe(2);
    const statuses = pendingOrFailed.map(l => l.status);
    expect(statuses).toContain(SyncLogStatus.pending);
    expect(statuses).toContain(SyncLogStatus.failed);
  });
});