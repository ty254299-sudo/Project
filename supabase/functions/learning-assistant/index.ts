// Backwards-compatible adapter for clients still calling this function.
// All authorization, validation, idempotency, and writes are handled by api.
import { corsFor } from '../api/cors.ts';

Deno.serve(async (request) => {
  const cors = corsFor(request, ['POST', 'OPTIONS']);
  const requestId = crypto.randomUUID();
  const reply = (body: unknown, status: number) => {
    const headers = new Headers(cors.headers);
    headers.set('Content-Type', 'application/json'); headers.set('X-Request-Id', requestId);
    return new Response(JSON.stringify(body), { status, headers });
  };
  if (!cors.allowed) return reply({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This origin is not allowed.' }, requestId }, 403);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors.headers });
  if (request.method !== 'POST') return reply({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported.' }, requestId }, 405);

  const baseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('authorization');
  if (!baseUrl || !anonKey) return reply({ error: { code: 'BACKEND_NOT_CONFIGURED', message: 'The learning service is not configured.' }, requestId }, 503);
  if (!authorization?.match(/^Bearer\s+\S+$/i)) return reply({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to use this endpoint.' }, requestId }, 401);

  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reply({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON object.' }, requestId }, 400);
    const body = payload as Record<string, unknown>;
    const kind = body.kind;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText.trim() : '';
    if ((kind !== 'question' && kind !== 'quiz') || prompt.length < 1 || prompt.length > 2000 || sourceText.length < 1 || sourceText.length > 12000) {
      return reply({ error: { code: 'INVALID_FIELD', message: 'Provide a supported activity, a prompt, and source text within the allowed limits.' }, requestId }, 400);
    }
    const apiPath = kind === 'question' ? '/assistant' : '/practice_attempts';
    const apiBody = kind === 'question'
      ? { message: prompt, notes: sourceText, contextIds: [], requestId: body.requestId }
      : { question: prompt, answers: [sourceText], requestId: body.requestId };
    const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/functions/v1/api${apiPath}`, {
      method: 'POST',
      headers: { apikey: anonKey, authorization, 'content-type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify(apiBody),
    });
    const headers = new Headers(cors.headers);
    headers.set('Content-Type', 'application/json'); headers.set('X-Request-Id', upstream.headers.get('x-request-id') ?? requestId);
    return new Response(await upstream.text(), { status: upstream.status, headers });
  } catch {
    return reply({ error: { code: 'LEARNING_SERVICE_UNAVAILABLE', message: 'The learning service is temporarily unavailable. Your input is still here; retry shortly.' }, requestId }, 503);
  }
});
