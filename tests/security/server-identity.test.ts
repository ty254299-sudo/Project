import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Edge Function identity source', () => {
  it('verifies bearer tokens with Supabase Auth and derives the actor from the verified user', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/functions/api/index.ts'), 'utf8');
    expect(source).toContain('authClient.auth.getUser(token)');
    expect(source).toContain(".eq('id', user.id)");
    expect(source).toContain('const actor: Actor = { id: user.id, role: profile.role');
    expect(source).not.toMatch(/actor\s*:\s*Actor\s*=\s*\{[^}]*request\.body/s);
  });
});
