import { SyncLogStatus, SyncStatus } from '@prisma/client';
import { StoreRepository } from '../repositories/store-repository';
import { SyncLogRepository } from '../repositories/sync-log-repository';
import { MockMarketplaceService, ValidateReceiptSuccessResponse, ValidateReceiptFailureResponse } from './mock-marketplace-service';
import { RateLimitError, AuthError, MarketplaceError } from '../infrastructure/errors';

export interface ImportOrderRequest {
  syncToken: string;
  receipt: string;
}

export interface ImportOrderResponse {
  success: boolean;
  orderId?: string;
  amount?: number;
  currency?: string;
  importedAt?: string;
  error?: string;
}

export class OrderService {
  private storeRepository: StoreRepository;
  private syncLogRepository: SyncLogRepository;
  private marketplaceService: MockMarketplaceService;

  constructor(
    storeRepository?: StoreRepository,
    syncLogRepository?: SyncLogRepository,
    marketplaceService?: MockMarketplaceService
  ) {
    this.storeRepository = storeRepository || new StoreRepository();
    this.syncLogRepository = syncLogRepository || new SyncLogRepository();
    this.marketplaceService = marketplaceService || new MockMarketplaceService();
  }

  /**
   * Import an order (idempotent)
   * If receipt was already processed, return existing result without calling marketplace API
   */
  async importOrder(request: ImportOrderRequest): Promise<ImportOrderResponse> {
    const { syncToken, receipt } = request;

    // Resolve store by syncToken
    const store = await this.storeRepository.findBySyncToken(syncToken);
    if (!store) {
      throw new Error('Store not found');
    }

    // Check idempotency: if receipt was already processed
    const existingLog = await this.syncLogRepository.findByStoreAndReceipt(store.id, receipt);
    if (existingLog) {
      // Return existing result
      if (existingLog.status === SyncLogStatus.success) {
        return {
          success: true,
          orderId: existingLog.orderId || undefined,
          amount: existingLog.amount ? Number(existingLog.amount) : undefined,
          currency: existingLog.currency || undefined,
          importedAt: existingLog.importedAt?.toISOString(),
        };
      } else {
        return {
          success: false,
          error: existingLog.errorDetails || 'Import failed',
        };
      }
    }

    // First time processing - call marketplace API
    let validationResult: ValidateReceiptSuccessResponse | ValidateReceiptFailureResponse;

    try {
      validationResult = await this.marketplaceService.validateReceipt({
        marketplace: store.marketplace,
        receipt,
        currency: store.currency,
      });
    } catch (err) {
      // Handle different error types
      if (err instanceof RateLimitError) {
        // Create rate_limited log
        await this.syncLogRepository.create({
          storeId: store.id,
          receipt,
          status: SyncLogStatus.rate_limited,
          errorDetails: 'rate_limited',
          attempt: 1,
          nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        });

        // Update store lastSyncAt
        await this.storeRepository.updateSyncStatus(store.id, store.syncStatus, new Date());

        return {
          success: false,
          error: 'rate_limited',
        };
      } else if (err instanceof AuthError || err instanceof MarketplaceError) {
        // Create failed log
        await this.syncLogRepository.create({
          storeId: store.id,
          receipt,
          status: SyncLogStatus.failed,
          errorDetails: `${err.name}: ${err.message}`,
        });

        // Update store lastSyncAt
        await this.storeRepository.updateSyncStatus(store.id, store.syncStatus, new Date());

        return {
          success: false,
          error: err.message,
        };
      } else {
        throw err;
      }
    }

    // Process validation result
    if (validationResult.status === true) {
      // Success case
      const importedAt = new Date(validationResult.importedAtUTC);

      await this.syncLogRepository.create({
        storeId: store.id,
        receipt,
        status: SyncLogStatus.success,
        orderId: validationResult.orderId,
        amount: validationResult.amount,
        currency: validationResult.currency,
        importedAt,
      });

      // Atomically increment importedSuccessCount
      await this.storeRepository.incrementImportedSuccessCount(store.id, 1);

      // Update lastSyncAt and recalculate syncStatus
      await this.updateStoreSyncStatus(store.id);

      return {
        success: true,
        orderId: validationResult.orderId,
        amount: validationResult.amount,
        currency: validationResult.currency,
        importedAt: importedAt.toISOString(),
      };
    } else {
      // Failure case
      await this.syncLogRepository.create({
        storeId: store.id,
        receipt,
        status: SyncLogStatus.failed,
        errorDetails: 'invalid_receipt',
      });

      // Update lastSyncAt and recalculate syncStatus
      await this.updateStoreSyncStatus(store.id);

      return {
        success: false,
        error: 'invalid_receipt',
      };
    }
  }

  /**
   * Update store sync status based on recent logs
   * Rules:
   * - pending: no logs
   * - success: last N(20) logs have no failed/rate_limited AND last operation is success
   * - partial: success and failed/rate_limited mixed
   * - failed: last operation is failed AND no success in last N
   */
  private async updateStoreSyncStatus(storeId: string): Promise<void> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      return;
    }

    const recentLogs = await this.syncLogRepository.getRecentLogs(storeId, 20);

    if (recentLogs.length === 0) {
      // No logs - pending
      await this.storeRepository.updateSyncStatus(storeId, SyncStatus.pending, new Date());
      return;
    }

    // Sort by createdAt desc to get most recent first
    const sortedLogs = recentLogs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const lastLog = sortedLogs[0];

    // Check if there are any failed/rate_limited in recent logs
    const hasFailedOrRateLimited = sortedLogs.some(
      log => log.status === SyncLogStatus.failed || log.status === SyncLogStatus.rate_limited
    );
    const hasSuccess = sortedLogs.some(log => log.status === SyncLogStatus.success);

    let newStatus: SyncStatus;

    if (lastLog.status === SyncLogStatus.success && !hasFailedOrRateLimited) {
      // Last operation is success and no failures in recent logs
      newStatus = SyncStatus.success;
    } else if (hasSuccess && hasFailedOrRateLimited) {
      // Mixed results
      newStatus = SyncStatus.partial;
    } else if (lastLog.status === SyncLogStatus.failed && !hasSuccess) {
      // Last operation is failed and no success in recent logs
      newStatus = SyncStatus.failed;
    } else {
      // Default to partial if unclear
      newStatus = SyncStatus.partial;
    }

    await this.storeRepository.updateSyncStatus(storeId, newStatus, new Date());
  }
}
