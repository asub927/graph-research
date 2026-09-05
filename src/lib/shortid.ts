import { randomUUID } from 'node:crypto';

/**
 * Public identifiers.
 *
 * Every item has a full UUID and an 8-hex-character short id derived from its
 * prefix. The short id is what appears in permalinks, theme URLs, and API
 * responses; the UUID is what foreign keys use. Both are accepted wherever an
 * identifier is taken (R20).
 */

const SHORT_ID_PATTERN = /^[0-9a-f]{8}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isShortId(value: string): boolean {
  return SHORT_ID_PATTERN.test(value);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function shortIdFromUuid(uuid: string): string {
  return uuid.slice(0, 8).toLowerCase();
}

/**
 * Mint a fresh identifier pair.
 *
 * Truncating a UUID to 8 hex characters leaves 2^32 possibilities, so
 * collisions become plausible in the tens of thousands of items — well within
 * the life of a site that publishes daily. The caller retries on a unique
 * violation; this just produces candidates.
 */
export function newIdentifier(): { id: string; shortId: string } {
  const id = randomUUID();
  return { id, shortId: shortIdFromUuid(id) };
}
