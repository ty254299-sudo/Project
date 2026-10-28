import { ApiError } from './validation.ts';

export function requireBearerToken(request: Request): string {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to use this endpoint.');
  return token;
}
