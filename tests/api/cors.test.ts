import { describe, expect, it } from 'vitest';
import { corsFor } from '../../supabase/functions/api/cors.ts';

describe('trusted browser origins', () => {
  const allowed = new Set(['http://localhost:8081', 'https://study.example.edu']);
  it('reflects only an exact configured origin', () => {
    const accepted = corsFor(new Request('https://api.example.test', { headers: { origin: 'https://study.example.edu' } }), ['GET'], allowed);
    expect(accepted.allowed).toBe(true);
    expect(accepted.headers.get('access-control-allow-origin')).toBe('https://study.example.edu');
  });
  it('rejects wildcard and lookalike origins while allowing native requests without an origin header', () => {
    expect(corsFor(new Request('https://api.example.test', { headers: { origin: 'https://study.example.edu.attacker.test' } }), ['GET'], allowed).allowed).toBe(false);
    expect(corsFor(new Request('https://api.example.test', { headers: { origin: '*' } }), ['GET'], allowed).allowed).toBe(false);
    expect(corsFor(new Request('https://api.example.test'), ['GET'], allowed).allowed).toBe(true);
  });
});
