import { Marketplace } from '@prisma/client';
import { StoreRepository } from '../repositories/store-repository';

export interface RegisterStoreRequest {
  organizationId: string;
  marketplace: Marketplace;
  externalStoreId: string;
  storeName: string;
  accessToken: string;
  currency: string;
}

export interface RegisterStoreResponse {
  storeId: string;
  syncToken: string;
}

export class StoreService {
  private storeRepository: StoreRepository;

  constructor(storeRepository?: StoreRepository) {
    this.storeRepository = storeRepository || new StoreRepository();
  }

  /**
   * Register or update a store (idempotent)
   * If store exists with same (organizationId, marketplace, externalStoreId),
   * update accessToken, storeName, and currency, return existing syncToken
   */
  async registerStore(request: RegisterStoreRequest): Promise<RegisterStoreResponse> {
    const { organizationId, marketplace, externalStoreId, storeName, accessToken, currency } = request;

    // Check if store already exists
    const existingStore = await this.storeRepository.findByUniqueKey(
      organizationId,
      marketplace,
      externalStoreId
    );

    if (existingStore) {
      // Update existing store
      const updated = await this.storeRepository.update(existingStore.id, {
        storeName,
        accessToken,
        currency,
      });

      return {
        storeId: updated.id,
        syncToken: updated.syncToken,
      };
    }

    // Create new store
    const newStore = await this.storeRepository.create({
      organizationId,
      marketplace,
      externalStoreId,
      storeName,
      accessToken,
      currency,
    });

    return {
      storeId: newStore.id,
      syncToken: newStore.syncToken,
    };
  }
}
