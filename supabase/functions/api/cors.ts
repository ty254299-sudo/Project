const developmentOrigins = ['http://localhost:8081', 'http://localhost:8082', 'http://localhost:4174'];
declare const Deno: { env: { get(name: string): string | undefined } };

export function trustedOrigins(): Set<string> {
  const configured = Deno.env.get('TRUSTED_WEB_ORIGINS')
    ?.split(',').map((origin) => origin.trim()).filter(Boolean);
  return new Set(configured?.length ? configured : developmentOrigins);
}

export function corsFor(request: Request, methods: string[], allowedOrigins = trustedOrigins()) {
  const origin = request.headers.get('origin');
  const allowed = !origin || allowedOrigins.has(origin);
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
    'Access-Control-Allow-Methods': methods.join(', '),
    'Access-Control-Expose-Headers': 'X-Request-Id',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  });
  if (origin && allowed) headers.set('Access-Control-Allow-Origin', origin);
  return { allowed, headers };
}
