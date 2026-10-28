import { describe, expect, it } from 'vitest';
import { requireBearerToken } from '../../supabase/functions/api/auth.ts';
import { allowKeys, ApiError } from '../../supabase/functions/api/validation.ts';

describe('API identity requirement', () => {
  it('requires a bearer token and accepts a signed-in request token', () => {
    expect(() => requireBearerToken(new Request('https://example.test/api'))).toThrow(ApiError);
    expect(requireBearerToken(new Request('https://example.test/api', { headers: { authorization: 'Bearer test-token' } }))).toBe('test-token');
  });

  it('rejects client-supplied identity and owner fields', () => {
    expect(() => allowKeys({ message: 'question', userId: 'forged' }, ['message'])).toThrow(ApiError);
    expect(() => allowKeys({ message: 'question', ownerId: 'forged' }, ['message'])).toThrow(ApiError);
  });
});
