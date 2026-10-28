import type { Href } from 'expo-router';

export const privateRoutes = ['/dashboard', '/learn', '/practice', '/progress', '/assistant'] as const;
const authQueryKeys = new Set(['access_token', 'refresh_token', 'token', 'provider_token', 'code', 'error', 'error_description']);

export function isPrivateRoute(pathname: string): boolean {
  return (privateRoutes as readonly string[]).includes(pathname);
}

export function buildRequestedRoute(pathname: string, params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'returnTo' || authQueryKeys.has(key.toLowerCase()) || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.set(key, value);
  }
  const query = search.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}

export function safeRequestedRoute(value: unknown): Href {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) return '/dashboard';
  try {
    const parsed = new URL(candidate, 'https://study-sprout.invalid');
    if (parsed.origin !== 'https://study-sprout.invalid' || !isPrivateRoute(parsed.pathname) || parsed.hash) return '/dashboard';
    for (const key of authQueryKeys) parsed.searchParams.delete(key);
    return `${parsed.pathname}${parsed.search}` as Href;
  } catch {
    return '/dashboard';
  }
}
