export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type JsonObject = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function fail(status: number, code: string, message: string): never { throw new ApiError(status, code, message); }
export function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
export function requireUuid(value: unknown, field: string): string {
  if (!isUuid(value)) fail(400, 'INVALID_FIELD', `${field} must be a UUID.`);
  return value;
}
export function requireObject(value: unknown, label = 'body'): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_JSON', `The ${label} must be a JSON object.`);
  return value as JsonObject;
}
export async function readJson(request: Request): Promise<JsonObject> {
  const rawLength = Number(request.headers.get('content-length') ?? 0);
  if (rawLength > 32_000) fail(413, 'BODY_TOO_LARGE', 'The request is too large.');
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 32_000) fail(413, 'BODY_TOO_LARGE', 'The request is too large.');
    return requireObject(JSON.parse(raw));
  }
  catch (error) {
    if (error instanceof ApiError) throw error;
    fail(400, 'INVALID_JSON', 'Send a valid JSON object.');
  }
}
export function allowKeys(value: JsonObject, allowed: readonly string[]): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) fail(400, 'UNKNOWN_FIELD', `Unsupported field: ${extras[0]}.`);
}
export function requireString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') fail(400, 'INVALID_FIELD', `${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) fail(400, 'INVALID_FIELD', `${field} must be between ${min} and ${max} characters.`);
  return trimmed;
}
export function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length > max) fail(400, 'INVALID_FIELD', `${field} must be text up to ${max} characters.`);
  return value.trim();
}
export function requireRequestId(value: unknown): string { return requireUuid(value, 'requestId'); }
export function requireVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) fail(400, 'INVALID_VERSION', 'expectedVersion must be a positive integer.');
  return value as number;
}
export function requireOneOf<T extends string>(value: unknown, field: string, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) fail(400, 'INVALID_FIELD', `${field} is not supported.`);
  return value as T;
}
export function requireStringArray(value: unknown, field: string, minItems: number, maxItems: number, itemMax: number): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) fail(400, 'INVALID_FIELD', `${field} must contain ${minItems} to ${maxItems} items.`);
  return value.map((item, index) => requireString(item, `${field}[${index}]`, 1, itemMax));
}

export type Cursor = { createdAt: string; id: string };
export function readListOptions(url: URL): { limit: number; cursor?: Cursor } {
  for (const key of url.searchParams.keys()) {
    if (key !== 'limit' && key !== 'cursor') fail(400, 'INVALID_QUERY', `Unsupported query parameter: ${key}.`);
    if (url.searchParams.getAll(key).length !== 1) fail(400, 'INVALID_QUERY', `${key} must be provided once.`);
  }
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam === null ? 20 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail(400, 'INVALID_QUERY', 'limit must be an integer between 1 and 50.');
  const rawCursor = url.searchParams.get('cursor');
  if (rawCursor === null) return { limit };
  if (rawCursor.length > 512) fail(400, 'INVALID_QUERY', 'cursor is invalid.');
  try {
    const decoded = JSON.parse(atob(rawCursor.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    if (typeof decoded.createdAt !== 'string' || Number.isNaN(Date.parse(decoded.createdAt)) || !isUuid(decoded.id)) throw new Error('invalid cursor');
    return { limit, cursor: { createdAt: decoded.createdAt, id: decoded.id } };
  } catch { fail(400, 'INVALID_QUERY', 'cursor is invalid.'); }
}
export function makeCursor(row: { created_at: string; id: string }): string {
  return btoa(JSON.stringify({ createdAt: row.created_at, id: row.id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
