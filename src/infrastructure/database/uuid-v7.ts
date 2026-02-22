import crypto from 'node:crypto';

/**
 * UUID utility functions
 * 
 * UUID generation is completely application-layer based.
 * No database dependencies or queries are used.
 */

/**
 * Generate UUID in application layer
 * Uses crypto.randomUUID() - no database calls
 * 
 * Note: Function name kept as generateUuidV7 for consistency,
 * but it uses crypto.randomUUID() which generates UUID v4.
 * 
 * @returns UUID string
 */
export function generateUuidV7(): string {
  return crypto.randomUUID();
}
