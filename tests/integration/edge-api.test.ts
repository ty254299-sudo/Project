import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const apiUrl = process.env.SUPABASE_TEST_API_URL;
const required = [supabaseUrl, anonKey, serviceKey, apiUrl];
if (required.some((value) => !value)) {
  throw new Error('Set SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY, and SUPABASE_TEST_API_URL for local Edge API integration tests.');
}
const projectUrl = new URL(supabaseUrl!);
if (!['localhost', '127.0.0.1', '::1'].includes(projectUrl.hostname)) {
  throw new Error('Integration fixtures are allowed only against a local Supabase URL (localhost or 127.0.0.1).');
}

type FixtureUser = { id: string; email: string; password: string; client: SupabaseClient };
const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
let users: FixtureUser[] = [];
let organizationId: string | undefined;
let sessionId: string | undefined;
const fixtureTag = crypto.randomUUID();
const createdAt = new Date().toISOString();

async function callApi(user: FixtureUser | null, path: string, method = 'GET', body?: unknown) {
  const token = user ? (await user.client.auth.getSession()).data.session?.access_token : undefined;
  return fetch(`${apiUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('local Supabase Edge API with isolated fixtures', () => {
  beforeAll(async () => {
    for (const suffix of ['a', 'b']) {
      const email = `edge-integration-${fixtureTag}-${suffix}@example.test`;
      const password = `Local-only-${crypto.randomUUID()}!`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error('Could not create local Auth fixture.');
      const client = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      users.push({ id: data.user.id, email, password, client });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    }

    const { data: organization, error: organizationError } = await admin.from('organizations').insert({ name: `Edge integration ${fixtureTag}` }).select('id').single();
    if (organizationError || !organization) throw organizationError ?? new Error('Could not create local organization fixture.');
    organizationId = organization.id;
    const { error: profilesError } = await admin.from('profiles').update({ organization_id: organizationId }).in('id', users.map((user) => user.id));
    if (profilesError) throw profilesError;

    const { data: session, error: sessionError } = await admin.from('study_sessions').insert({
      actor_id: users[0].id, organization_id: organizationId, request_id: crypto.randomUUID(), request_hash: 'e'.repeat(64),
      question: 'Integration fixture question', answer: 'Integration fixture answer', citations: [], status: 'active',
    }).select('id').single();
    if (sessionError || !session) throw sessionError ?? new Error('Could not create local study session fixture.');
    sessionId = session.id;
  }, 30_000);

  afterAll(async () => {
    if (sessionId) {
      const { error } = await admin.from('study_sessions').delete().eq('id', sessionId);
      if (error) throw error;
    }
    if (users.length) {
      for (const table of ['learning_progress', 'practice_attempts', 'study_sessions']) {
        const { error } = await admin.from(table).delete().in('actor_id', users.map((user) => user.id));
        if (error) throw error;
      }
      for (const user of users) {
        const { error } = await admin.auth.admin.deleteUser(user.id);
        if (error) throw error;
      }
    }
    if (organizationId) {
      const { error } = await admin.from('organizations').delete().eq('id', organizationId);
      if (error) throw error;
    }
  });

  it('requires a verified identity for private reads', async () => {
    const response = await callApi(null, '/api/study_sessions?limit=50');
    expect(response.status).toBe(401);
  });

  it('returns only the signed-in owner’s data and denies a cross-owner update', async () => {
    const ownerList = await callApi(users[0], '/api/study_sessions?limit=50');
    expect(ownerList.status).toBe(200);
    const ownerPayload = await ownerList.json();
    expect(ownerPayload.data.some((row: { id: string }) => row.id === sessionId)).toBe(true);

    const otherList = await callApi(users[1], '/api/study_sessions?limit=50');
    expect(otherList.status).toBe(200);
    const otherPayload = await otherList.json();
    expect(otherPayload.data.some((row: { id: string }) => row.id === sessionId)).toBe(false);

    const forgedUpdate = await callApi(users[1], `/api/study_sessions/${sessionId}`, 'PATCH', { expectedVersion: 1, changes: { status: 'completed' } });
    expect(forgedUpdate.status).toBe(403);
  });
});
