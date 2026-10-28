import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}

describe('browser security boundaries', () => {
  it('keeps local environment examples limited to public Expo configuration', () => {
    const keys = readFileSync(join(root, '.env.example'), 'utf8').split(/\r?\n/).filter(Boolean).map((line) => line.split('=')[0]);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.startsWith('EXPO_PUBLIC_'))).toBe(true);
  });

  it('does not include server-only credential names or raw HTML sinks in browser source', () => {
    const forbidden = /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|service_role|dangerouslySetInnerHTML|\beval\s*\(/;
    const offenders = sourceFiles('app').concat(sourceFiles('src')).filter((path) => forbidden.test(readFileSync(join(root, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('uses only redacted API error logging', () => {
    const api = readFileSync(join(root, 'supabase/functions/api/index.ts'), 'utf8');
    expect(api).toContain('console.error(JSON.stringify({ requestId, type: error instanceof Error ? error.name : \'unknown\' }))');
    expect(api).not.toMatch(/console\.(?:log|error)\([^\n]*(?:request\.body|token|authorization|error\.message)/i);
  });
});
