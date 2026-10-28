import { describe, expect, it } from 'vitest';
import { ApiError } from '../../supabase/functions/api/validation.ts';
import { assertSameRequest, createOnce, requestFingerprint } from '../../supabase/functions/api/services/idempotency.ts';

describe('idempotent writes', () => {
  it('returns the saved result on a retry without creating a duplicate', async () => {
    let saved: { value: number; request_hash: string } | undefined;
    let writes = 0;
    const fingerprint = await requestFingerprint({ value: 42 });
    const run = () => createOnce(
      async () => saved,
      async () => { writes += 1; saved = { value: 42, request_hash: fingerprint }; return saved; },
    );
    expect((await run()).created).toBe(true);
    expect((await run()).created).toBe(false);
    expect(writes).toBe(1);
  });

  it('rejects reuse of an idempotency key with a different request', async () => {
    const original = await requestFingerprint({ value: 1 });
    const changed = await requestFingerprint({ value: 2 });
    expect(() => assertSameRequest(original, changed)).toThrow(ApiError);
  });
});
