import { describe, expect, it } from 'vitest';
import { ApiError, readJson, readListOptions, requireRequestId, requireVersion } from '../../supabase/functions/api/validation.ts';

describe('API input validation', () => {
  it('rejects malformed request IDs and versions', () => {
    expect(() => requireRequestId('not-a-uuid')).toThrow(ApiError);
    expect(() => requireVersion(0)).toThrow(ApiError);
    expect(() => requireVersion(1.5)).toThrow(ApiError);
  });

  it('bounds list page size and rejects unknown or repeated query fields', () => {
    expect(readListOptions(new URL('https://example.test/api?limit=50')).limit).toBe(50);
    for (const query of ['?limit=51', '?offset=1', '?limit=10&limit=20']) {
      expect(() => readListOptions(new URL(`https://example.test/api${query}`))).toThrow(ApiError);
    }
  });

  it('accepts a valid JSON object and rejects malformed or oversized bodies', async () => {
    await expect(readJson(new Request('https://example.test/api', { method: 'POST', body: '{"ok":true}' }))).resolves.toEqual({ ok: true });
    await expect(readJson(new Request('https://example.test/api', { method: 'POST', body: '[]' }))).rejects.toBeInstanceOf(ApiError);
    await expect(readJson(new Request('https://example.test/api', { method: 'POST', body: 'x'.repeat(32_001) }))).rejects.toMatchObject({ status: 413 });
  });
});
