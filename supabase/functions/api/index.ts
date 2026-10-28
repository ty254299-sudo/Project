import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireBearerToken } from './auth.ts';
import { corsFor } from './cors.ts';
import { ApiError } from './validation.ts';
import { routeRequest, type ApiContext } from './routes.ts';
import type { Actor } from './services/access.ts';

function json(status: number, body: Record<string, unknown>, requestId: string, corsHeaders: Headers) {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Request-Id', requestId);
  return new Response(JSON.stringify({ ...body, requestId }), {
    status,
    headers,
  });
}

function correlationId(request: Request) {
  const candidate = request.headers.get('x-request-id');
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate : crypto.randomUUID();
}

function routePath(request: Request) {
  const url = new URL(request.url);
  const marker = '/functions/v1/api';
  const markerIndex = url.pathname.indexOf(marker);
  let suffix = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : url.pathname;
  if (!suffix || suffix === '/') suffix = '/api';
  if (!suffix.startsWith('/api/')) suffix = `/api${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  return `${suffix}${url.search}`;
}

Deno.serve(async (request) => {
  const requestId = correlationId(request);
  const cors = corsFor(request, ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']);
  if (!cors.allowed) return new Response('Origin not allowed.', { status: 403, headers: cors.headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors.headers });
  try {
    const token = requireBearerToken(request);

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) throw new ApiError(503, 'BACKEND_NOT_CONFIGURED', 'The learning service is not configured.');

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) throw new ApiError(401, 'AUTH_INVALID', 'Your session expired. Sign in again.');

    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles')
      .select('id,role,organization_id,display_name,version,deleted_at').eq('id', user.id).maybeSingle();
    if (profileError || !profile) throw new ApiError(403, 'PROFILE_UNAVAILABLE', 'Your learning profile is not available.');
    if (profile.deleted_at) throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account is deactivated. Contact your administrator.');
    if (!['student','teacher','administrator'].includes(profile.role)) throw new ApiError(403, 'ROLE_INVALID', 'Your account role is not allowed to use the learning service.');

    const actor: Actor = { id: user.id, role: profile.role, organizationId: profile.organization_id, displayName: profile.display_name, version: profile.version };
    const context: ApiContext = { db, actor, correlationId: requestId, model: Deno.env.get('OPENAI_MODEL') ?? '' };
    const result = await routeRequest(request, context, routePath(request));
    return json(result.status, result.body, requestId, cors.headers);
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, { error: { code: error.code, message: error.message } }, requestId, cors.headers);
    console.error(JSON.stringify({ requestId, type: error instanceof Error ? error.name : 'unknown' }));
    return json(500, { error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed. Retry or contact support.' } }, requestId, cors.headers);
  }
});
