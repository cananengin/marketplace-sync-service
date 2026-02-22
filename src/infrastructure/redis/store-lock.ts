import { getRedisClient } from './client';

const LOCK_PREFIX = 'lock:sync-store:';
const LOCK_TTL_SECONDS = 900; // 15 minutes

/**
 * Try to acquire a store-level lock. Returns true if acquired.
 */
export async function acquireStoreLock(storeId: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `${LOCK_PREFIX}${storeId}`;
  const result = await redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

/**
 * Refresh lock TTL (optional, call at start of each batch to avoid expiry during long runs).
 */
export async function refreshStoreLock(storeId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `${LOCK_PREFIX}${storeId}`;
  await redis.expire(key, LOCK_TTL_SECONDS);
}

/**
 * Release store lock (delete key).
 */
export async function releaseStoreLock(storeId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `${LOCK_PREFIX}${storeId}`;
  await redis.del(key);
}
