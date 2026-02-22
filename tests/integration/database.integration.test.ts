import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/infrastructure/database';
import { StoreRepository } from '../../src/repositories/store-repository';
import { SyncLogRepository } from '../../src/repositories/sync-log-repository';
import { Marketplace, SyncStatus, SyncLogStatus } from '@prisma/client';

describe.sequential('Database Integration Tests', () => {
  const prisma = getPrismaClient();
  const storeRepository = new StoreRepository();
  const syncLogRepository = new SyncLogRepository();

  beforeAll(async () => {
    // Verify database connection
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Clean up test data before each test (FK: callback_outbox -> store, sync_logs -> store)
    await prisma.callbackOutbox.deleteMany({});
    await prisma.syncLog.deleteMany({});
    await prisma.webhookEndpoint.deleteMany({});
    await prisma.store.deleteMany({});
  });

  afterAll(async () => {
    await prisma.callbackOutbox.deleteMany({});
    await prisma.syncLog.deleteMany({});
    await prisma.webhookEndpoint.deleteMany({});
    await prisma.store.deleteMany({});
    await disconnectPrisma();
  });

  it('should connect to database successfully', async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  });

  it('should create and find a store', async () => {
    const storeData = {
      organizationId: 'test-org-1',
      marketplace: Marketplace.etsy,
      externalStoreId: 'test-store-1',
      storeName: 'Test Store',
      accessToken: 'test-token',
      currency: 'USD',
    };

    const store = await storeRepository.create(storeData);

    expect(store).toBeDefined();
    expect(store.id).toBeDefined();
    expect(store.syncToken).toBeDefined();
    expect(store.organizationId).toBe(storeData.organizationId);
    expect(store.marketplace).toBe(storeData.marketplace);
    expect(store.externalStoreId).toBe(storeData.externalStoreId);
    expect(store.syncStatus).toBe(SyncStatus.pending);

    const found = await storeRepository.findById(store.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(store.id);
  });

  it('should find store by unique key (organizationId, marketplace, externalStoreId)', async () => {
    const storeData = {
      organizationId: 'test-org-2',
      marketplace: Marketplace.shopify,
      externalStoreId: 'test-store-2',
      storeName: 'Test Store 2',
      accessToken: 'test-token-2',
      currency: 'EUR',
    };

    const store = await storeRepository.create(storeData);
    const found = await storeRepository.findByUniqueKey(
      storeData.organizationId,
      storeData.marketplace,
      storeData.externalStoreId
    );

    expect(found).toBeDefined();
    expect(found?.id).toBe(store.id);
  });

  it('should create and find a sync log', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-3',
      marketplace: Marketplace.amazon,
      externalStoreId: 'test-store-3',
      storeName: 'Test Store 3',
      accessToken: 'test-token-3',
      currency: 'USD',
    });

    const syncLogData = {
      storeId: store.id,
      receipt: 'test-receipt-1',
      status: SyncLogStatus.pending,
      orderId: 'order-123',
      amount: 99.99,
      currency: 'USD',
    };

    const syncLog = await syncLogRepository.create(syncLogData);

    expect(syncLog).toBeDefined();
    expect(syncLog.id).toBeDefined();
    expect(syncLog.storeId).toBe(store.id);
    expect(syncLog.receipt).toBe(syncLogData.receipt);
    expect(syncLog.status).toBe(SyncLogStatus.pending);

    const found = await syncLogRepository.findByStoreAndReceipt(store.id, syncLogData.receipt);
    expect(found).toBeDefined();
    expect(found?.id).toBe(syncLog.id);
  });

  it('should enforce unique constraint on (storeId, receipt)', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-4',
      marketplace: Marketplace.etsy,
      externalStoreId: 'test-store-4',
      storeName: 'Test Store 4',
      accessToken: 'test-token-4',
      currency: 'USD',
    });

    const receipt = 'unique-receipt';

    await syncLogRepository.create({
      storeId: store.id,
      receipt,
    });

    // Try to create duplicate
    await expect(
      syncLogRepository.create({
        storeId: store.id,
        receipt,
      })
    ).rejects.toThrow();
  });

  it('should update store sync status', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-5',
      marketplace: Marketplace.shopify,
      externalStoreId: 'test-store-5',
      storeName: 'Test Store 5',
      accessToken: 'test-token-5',
      currency: 'EUR',
    });

    const updated = await storeRepository.updateSyncStatus(
      store.id,
      SyncStatus.success,
      new Date(),
      10
    );

    expect(updated.syncStatus).toBe(SyncStatus.success);
    expect(updated.lastSyncAt).toBeDefined();
    expect(updated.importedSuccessCount).toBe(10);
  });

  it('should find stores with failed or pending sync', async () => {
    const store1 = await storeRepository.create({
      organizationId: 'test-org-6',
      marketplace: Marketplace.etsy,
      externalStoreId: 'test-store-6',
      storeName: 'Test Store 6',
      accessToken: 'test-token-6',
      currency: 'USD',
    });

    await storeRepository.updateSyncStatus(store1.id, SyncStatus.failed);

    const store2 = await storeRepository.create({
      organizationId: 'test-org-7',
      marketplace: Marketplace.shopify,
      externalStoreId: 'test-store-7',
      storeName: 'Test Store 7',
      accessToken: 'test-token-7',
      currency: 'EUR',
    });
    // store2 remains pending

    const stores = await storeRepository.findStoresWithFailedOrPendingSync();
    expect(stores.length).toBeGreaterThanOrEqual(2);
    expect(stores.some(s => s.id === store1.id)).toBe(true);
    expect(stores.some(s => s.id === store2.id)).toBe(true);
  });

  it('should support rate_limited status in sync logs', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-8',
      marketplace: Marketplace.etsy,
      externalStoreId: 'test-store-8',
      storeName: 'Test Store 8',
      accessToken: 'test-token-8',
      currency: 'USD',
    });

    const syncLog = await syncLogRepository.create({
      storeId: store.id,
      receipt: 'test-receipt-rate-limited',
      status: SyncLogStatus.rate_limited,
    });

    expect(syncLog.status).toBe(SyncLogStatus.rate_limited);

    const found = await syncLogRepository.findById(syncLog.id);
    expect(found?.status).toBe(SyncLogStatus.rate_limited);
  });

  it('should atomically increment importedSuccessCount', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-9',
      marketplace: Marketplace.shopify,
      externalStoreId: 'test-store-9',
      storeName: 'Test Store 9',
      accessToken: 'test-token-9',
      currency: 'EUR',
    });

    expect(store.importedSuccessCount).toBe(0);

    // Increment by 1
    const updated1 = await storeRepository.incrementImportedSuccessCount(store.id, 1);
    expect(updated1.importedSuccessCount).toBe(1);

    // Increment by 3 more
    const updated2 = await storeRepository.incrementImportedSuccessCount(store.id, 3);
    expect(updated2.importedSuccessCount).toBe(4);

    // Verify final state
    const final = await storeRepository.findById(store.id);
    expect(final?.importedSuccessCount).toBe(4);
  });

  it('should atomically update sync status and increment count in transaction', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-10',
      marketplace: Marketplace.amazon,
      externalStoreId: 'test-store-10',
      storeName: 'Test Store 10',
      accessToken: 'test-token-10',
      currency: 'USD',
    });

    expect(store.importedSuccessCount).toBe(0);
    expect(store.syncStatus).toBe(SyncStatus.pending);

    const lastSyncAt = new Date();
    const updated = await storeRepository.updateSyncStatusAndIncrementCount(
      store.id,
      SyncStatus.success,
      lastSyncAt,
      5
    );

    expect(updated.syncStatus).toBe(SyncStatus.success);
    expect(updated.importedSuccessCount).toBe(5);
    expect(updated.lastSyncAt).toBeDefined();
  });

  it('should count successful sync logs by store ID', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-11',
      marketplace: Marketplace.etsy,
      externalStoreId: 'test-store-11',
      storeName: 'Test Store 11',
      accessToken: 'test-token-11',
      currency: 'USD',
    });

    // Create multiple sync logs with different statuses
    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-1',
      status: SyncLogStatus.success,
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-2',
      status: SyncLogStatus.success,
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-3',
      status: SyncLogStatus.failed,
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-4',
      status: SyncLogStatus.pending,
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-5',
      status: SyncLogStatus.success,
    });

    const successCount = await syncLogRepository.countSuccessByStoreId(store.id);
    expect(successCount).toBe(3);
  });

  it('should verify importedSuccessCount matches actual success count', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-12',
      marketplace: Marketplace.shopify,
      externalStoreId: 'test-store-12',
      storeName: 'Test Store 12',
      accessToken: 'test-token-12',
      currency: 'EUR',
    });

    // Create 5 successful sync logs directly via repository
    // Note: importedSuccessCount is NOT automatically updated when creating logs directly
    // It only updates when using OrderService (service layer)
    for (let i = 1; i <= 5; i++) {
      await syncLogRepository.create({
        storeId: store.id,
        receipt: `receipt-success-${i}`,
        status: SyncLogStatus.success,
      });
    }

    // Verify source-of-truth: count from sync_logs table
    const actualSuccessCount = await syncLogRepository.countSuccessByStoreId(store.id);
    expect(actualSuccessCount).toBe(5);

    // importedSuccessCount should still be 0 (not updated by direct repository insert)
    const storeAfterLogs = await storeRepository.findById(store.id);
    expect(storeAfterLogs?.importedSuccessCount).toBe(0);

    // Manually increment to test atomic increment
    await storeRepository.incrementImportedSuccessCount(store.id, 5);
    const updatedStore = await storeRepository.findById(store.id);
    expect(updatedStore?.importedSuccessCount).toBe(5);
  });

  it('should include rate_limited logs in findPendingOrFailedLogs', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-13',
      marketplace: Marketplace.amazon,
      externalStoreId: 'test-store-13',
      storeName: 'Test Store 13',
      accessToken: 'test-token-13',
      currency: 'USD',
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-pending',
      status: SyncLogStatus.pending,
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-failed',
      status: SyncLogStatus.failed,
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-rate-limited',
      status: SyncLogStatus.rate_limited,
    });

    await syncLogRepository.create({
      storeId: store.id,
      receipt: 'receipt-success',
      status: SyncLogStatus.success,
    });

    const logs = await syncLogRepository.findPendingOrFailedLogs();
    const storeLogs = logs.filter(log => log.storeId === store.id);

    expect(storeLogs.length).toBe(3);
    expect(storeLogs.some(log => log.status === SyncLogStatus.pending)).toBe(true);
    expect(storeLogs.some(log => log.status === SyncLogStatus.failed)).toBe(true);
    expect(storeLogs.some(log => log.status === SyncLogStatus.rate_limited)).toBe(true);
    expect(storeLogs.some(log => log.status === SyncLogStatus.success)).toBe(false);
  });

  it('should update updatedAt on store update', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-14',
      marketplace: Marketplace.etsy,
      externalStoreId: 'test-store-14',
      storeName: 'Test Store 14',
      accessToken: 'test-token-14',
      currency: 'USD',
    });

    const initialUpdatedAt = store.updatedAt;
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const updated = await storeRepository.update(store.id, {
      storeName: 'Updated Store Name',
    });

    expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    expect(updated.storeName).toBe('Updated Store Name');
  });

  it('should update updatedAt on store sync status update', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-15',
      marketplace: Marketplace.shopify,
      externalStoreId: 'test-store-15',
      storeName: 'Test Store 15',
      accessToken: 'test-token-15',
      currency: 'EUR',
    });

    const initialUpdatedAt = store.updatedAt;
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const updated = await storeRepository.updateSyncStatus(
      store.id,
      SyncStatus.success,
      new Date()
    );

    expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    expect(updated.syncStatus).toBe(SyncStatus.success);
  });

  it('should update updatedAt on store increment', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-16',
      marketplace: Marketplace.amazon,
      externalStoreId: 'test-store-16',
      storeName: 'Test Store 16',
      accessToken: 'test-token-16',
      currency: 'USD',
    });

    const initialUpdatedAt = store.updatedAt;
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const updated = await storeRepository.incrementImportedSuccessCount(store.id, 1);

    expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    expect(updated.importedSuccessCount).toBe(1);
  });

  it('should update updatedAt on sync log update', async () => {
    const store = await storeRepository.create({
      organizationId: 'test-org-17',
      marketplace: Marketplace.etsy,
      externalStoreId: 'test-store-17',
      storeName: 'Test Store 17',
      accessToken: 'test-token-17',
      currency: 'USD',
    });

    const syncLog = await syncLogRepository.create({
      storeId: store.id,
      receipt: 'test-receipt-update',
      status: SyncLogStatus.pending,
    });

    const initialUpdatedAt = syncLog.updatedAt;
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const updated = await syncLogRepository.update(syncLog.id, {
      status: SyncLogStatus.success,
      orderId: 'order-456',
      importedAt: new Date(),
    });

    expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    expect(updated.status).toBe(SyncLogStatus.success);
    expect(updated.orderId).toBe('order-456');
  });

  describe('ID Generation Guards', () => {
    it('should generate id automatically when creating a store', async () => {
      const store = await storeRepository.create({
        organizationId: 'test-org-id-guard-1',
        marketplace: Marketplace.etsy,
        externalStoreId: 'test-store-id-guard-1',
        storeName: 'Test Store ID Guard',
        accessToken: 'test-token',
        currency: 'USD',
      });

      expect(store.id).toBeDefined();
      // UUID validation regex (works for both v4 and v7)
      expect(store.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(store.syncToken).toBeDefined();
      expect(store.syncToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should throw error if id is provided when creating a store (runtime guard)', async () => {
      // TypeScript compile-time guard prevents this, but we test runtime guard
      const dataWithId = {
        organizationId: 'test-org-id-guard-2',
        marketplace: Marketplace.shopify,
        externalStoreId: 'test-store-id-guard-2',
        storeName: 'Test Store ID Guard 2',
        accessToken: 'test-token',
        currency: 'EUR',
        id: 'should-not-be-allowed',
      } as any; // Using 'as any' to bypass TypeScript compile-time check for testing runtime guard

      await expect(
        storeRepository.create(dataWithId)
      ).rejects.toThrow('Store id must be generated by the repository');
    });

    it('should throw error if syncToken is provided when creating a store (runtime guard)', async () => {
      const dataWithSyncToken = {
        organizationId: 'test-org-id-guard-3',
        marketplace: Marketplace.amazon,
        externalStoreId: 'test-store-id-guard-3',
        storeName: 'Test Store ID Guard 3',
        accessToken: 'test-token',
        currency: 'USD',
        syncToken: 'should-not-be-allowed',
      } as any; // Using 'as any' to bypass TypeScript compile-time check for testing runtime guard

      await expect(
        storeRepository.create(dataWithSyncToken)
      ).rejects.toThrow('Store syncToken must be generated by the repository');
    });

    it('should generate id automatically when creating a sync log', async () => {
      const store = await storeRepository.create({
        organizationId: 'test-org-id-guard-4',
        marketplace: Marketplace.etsy,
        externalStoreId: 'test-store-id-guard-4',
        storeName: 'Test Store ID Guard 4',
        accessToken: 'test-token',
        currency: 'USD',
      });

      const syncLog = await syncLogRepository.create({
        storeId: store.id,
        receipt: 'test-receipt-id-guard',
        status: SyncLogStatus.pending,
      });

      expect(syncLog.id).toBeDefined();
      // UUID validation regex (works for both v4 and v7)
      expect(syncLog.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should throw error if id is provided when creating a sync log (runtime guard)', async () => {
      const store = await storeRepository.create({
        organizationId: 'test-org-id-guard-5',
        marketplace: Marketplace.shopify,
        externalStoreId: 'test-store-id-guard-5',
        storeName: 'Test Store ID Guard 5',
        accessToken: 'test-token',
        currency: 'EUR',
      });

      const dataWithId = {
        storeId: store.id,
        receipt: 'test-receipt-id-guard-2',
        status: SyncLogStatus.pending,
        id: 'should-not-be-allowed',
      } as any; // Using 'as any' to bypass TypeScript compile-time check for testing runtime guard

      await expect(
        syncLogRepository.create(dataWithId)
      ).rejects.toThrow('SyncLog id must be generated by the repository');
    });

    it('should generate unique ids for multiple stores', async () => {
      const store1 = await storeRepository.create({
        organizationId: 'test-org-id-guard-6',
        marketplace: Marketplace.etsy,
        externalStoreId: 'test-store-id-guard-6a',
        storeName: 'Test Store 6A',
        accessToken: 'test-token',
        currency: 'USD',
      });

      const store2 = await storeRepository.create({
        organizationId: 'test-org-id-guard-6',
        marketplace: Marketplace.etsy,
        externalStoreId: 'test-store-id-guard-6b',
        storeName: 'Test Store 6B',
        accessToken: 'test-token',
        currency: 'USD',
      });

      expect(store1.id).not.toBe(store2.id);
      expect(store1.syncToken).not.toBe(store2.syncToken);
    });

    it('should generate unique ids for multiple sync logs', async () => {
      const store = await storeRepository.create({
        organizationId: 'test-org-id-guard-7',
        marketplace: Marketplace.amazon,
        externalStoreId: 'test-store-id-guard-7',
        storeName: 'Test Store ID Guard 7',
        accessToken: 'test-token',
        currency: 'USD',
      });

      const syncLog1 = await syncLogRepository.create({
        storeId: store.id,
        receipt: 'receipt-1',
        status: SyncLogStatus.pending,
      });

      const syncLog2 = await syncLogRepository.create({
        storeId: store.id,
        receipt: 'receipt-2',
        status: SyncLogStatus.pending,
      });

      expect(syncLog1.id).not.toBe(syncLog2.id);
    });
  });
});
