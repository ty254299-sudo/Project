export function isSessionExpiry(status: number, code: string): boolean {
  return status === 401 && (code === 'AUTH_INVALID' || code === 'AUTH_REQUIRED');
}
