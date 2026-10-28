import { ApiError } from '../validation.ts';

export type IdempotentResult<T> = { value: T; created: boolean };

export async function requestFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function assertSameRequest(existingHash: string, incomingHash: string): void {
  if (existingHash !== incomingHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request ID was already used with different input. Start a new request.');
}

export async function createOnce<T>(findExisting: () => Promise<T | null>, create: () => Promise<T>): Promise<IdempotentResult<T>> {
  const previous = await findExisting();
  if (previous) return { value: previous, created: false };
  try {
    return { value: await create(), created: true };
  } catch (error) {
    if (!error || typeof error !== 'object' || (error as { code?: string }).code !== '23505') throw error;
    const duplicate = await findExisting();
    if (duplicate) return { value: duplicate, created: false };
    throw error;
  }
}
