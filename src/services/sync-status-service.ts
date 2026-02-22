import { SyncStatus, SyncLogStatus } from '@prisma/client';
import { StoreRepository } from '../repositories/store-repository';
import { SyncLogRepository } from '../repositories/sync-log-repository';

export interface SyncStatusResponse {
  lastSyncAt: string | null;
  importedOrders: number;
  syncStatus: SyncStatus;
  rateLimitedCount?: number;
}

const DEFAULT_LAST_N = 20;

export class SyncStatusService {
  private storeRepository: StoreRepository;
  private syncLogRepository: SyncLogRepository;

  constructor(storeRepository?: StoreRepository, syncLogRepository?: SyncLogRepository) {
    this.storeRepository = storeRepository || new StoreRepository();
    this.syncLogRepository = syncLogRepository || new SyncLogRepository();
  }

  /**
   * Calculate sync status for a store
   * This method implements the sync status calculation logic
   */
  async calculateSyncStatus(storeId: string): Promise<SyncStatusResponse> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    // Get sync stats
    const stats = await this.syncLogRepository.getSyncStatsByStore(storeId);

    return {
      lastSyncAt: store.lastSyncAt?.toISOString() || null,
      importedOrders: store.importedSuccessCount,
      syncStatus: store.syncStatus,
      rateLimitedCount: stats.rate_limited,
    };
  }

  /**
   * Recalculate store sync status from recent logs and persist to DB.
   * Used by worker after processing a batch.
   * Rules: pending (no logs), success (last N all success), partial (mixed), failed (last failed, no success in N).
   */
  async recalculateAndPersistSyncStatus(
    storeId: string,
    lastN: number = DEFAULT_LAST_N
  ): Promise<void> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      return;
    }

    const recentLogs = await this.syncLogRepository.getRecentLogs(storeId, lastN);

    if (recentLogs.length === 0) {
      await this.storeRepository.updateSyncStatus(storeId, SyncStatus.pending, new Date());
      return;
    }

    const sortedLogs = recentLogs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const lastLog = sortedLogs[0];
    const hasFailedOrRateLimited = sortedLogs.some(
      (log) =>
        log.status === SyncLogStatus.failed || log.status === SyncLogStatus.rate_limited
    );
    const hasSuccess = sortedLogs.some((log) => log.status === SyncLogStatus.success);

    let newStatus: SyncStatus;
    if (lastLog.status === SyncLogStatus.success && !hasFailedOrRateLimited) {
      newStatus = SyncStatus.success;
    } else if (hasSuccess && hasFailedOrRateLimited) {
      newStatus = SyncStatus.partial;
    } else if (lastLog.status === SyncLogStatus.failed && !hasSuccess) {
      newStatus = SyncStatus.failed;
    } else {
      newStatus = SyncStatus.partial;
    }

    await this.storeRepository.updateSyncStatus(storeId, newStatus, new Date());
  }

  /**
   * Get sync status by syncToken
   */
  async getSyncStatusByToken(syncToken: string): Promise<SyncStatusResponse> {
    const store = await this.storeRepository.findBySyncToken(syncToken);
    if (!store) {
      throw new Error('Store not found');
    }

    return this.calculateSyncStatus(store.id);
  }
}
