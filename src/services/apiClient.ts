import { isSupabaseConfigured, supabase } from './supabase';
import { isSessionExpiry } from './authSession';

export type LearningCitation = { contentId: string; title: string };
export type LearningAnswer = { id: string; kind: 'question' | 'quiz'; prompt: string; response: string; created_at: string; citations?: LearningCitation[] };
export type LearningRequest = { kind: 'question' | 'quiz'; contentId?: string; prompt: string; sourceText: string; requestId: string };
export type StudyContent = { id: string; title: string; subject: string; source_type: 'text' | 'markdown' | 'pdf'; storage_path: string; status: 'active' | 'archived'; version: number; created_at: string };
export type LearningProgress = { id: string; content_id: string | null; completion: number; last_practiced_at: string | null; status: 'in_progress' | 'completed'; created_at: string; updated_at: string };
export type ListResult<T> = { data: T[]; nextCursor: string | null };

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public code: string, public requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type JsonObject = Record<string, unknown>;
function invalidResponse(): never { throw new ApiClientError('The learning service returned an invalid response.', 502, 'INVALID_RESPONSE'); }
function objectValue(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidResponse();
  return value as JsonObject;
}
function stringValue(value: unknown): string {
  if (typeof value !== 'string') invalidResponse();
  return value;
}
function numberValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidResponse();
  return value;
}
function nullableString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}
function parseList<T>(value: unknown, parseItem: (value: unknown) => T): ListResult<T> {
  const response = objectValue(value);
  if (!Array.isArray(response.data) || (response.nextCursor !== null && typeof response.nextCursor !== 'string')) invalidResponse();
  return { data: response.data.map(parseItem), nextCursor: response.nextCursor as string | null };
}

export function newRequestId() {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  return cryptoObject?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
}

async function apiRequest(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, signal?: AbortSignal): Promise<JsonObject> {
  throwIfAborted(signal);
  if (!supabase || !isSupabaseConfigured) throw new ApiClientError('Learning services are not connected yet. Add the Supabase app settings to .env.', 503, 'BACKEND_NOT_CONFIGURED');
  const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !initialSession) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new ApiClientError('Your session expired. Sign in again; your form input has been kept.', 401, 'AUTH_REQUIRED');
  }
  const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  let session = initialSession;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal);
    let response: Response;
    const requestController = new AbortController();
    const onAbort = () => requestController.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => requestController.abort(new DOMException('The request timed out.', 'TimeoutError')), 25_000);
    try {
      response = await fetch(`${projectUrl}/functions/v1/api${path}`, {
        method, signal: requestController.signal,
        headers: {
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'X-Request-Id': newRequestId(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
      if (requestController.signal.aborted) throw new ApiClientError('The learning service took too long to respond. Your input is still here; retry the same action.', 408, 'REQUEST_TIMEOUT');
      throw new ApiClientError('The learning service could not be reached. Check your connection and retry.', 503, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
    let raw: unknown;
    try { raw = await response.json(); } catch { invalidResponse(); }
    const result = objectValue(raw);
    const errorBody = result.error && typeof result.error === 'object' ? result.error as JsonObject : {};
    const code = typeof errorBody.code === 'string' ? errorBody.code : 'REQUEST_FAILED';
    if (!response.ok && isSessionExpiry(response.status, code)) {
      if (attempt === 0) {
        throwIfAborted(signal);
        const { data } = await supabase.auth.refreshSession();
        if (data.session) { session = data.session; continue; }
      }
      await supabase.auth.signOut({ scope: 'local' });
      throw new ApiClientError('Your session expired. Sign in again; your form input has been kept.', 401, 'AUTH_REQUIRED');
    }
    if (!response.ok) {
      throw new ApiClientError(
        typeof errorBody.message === 'string' ? errorBody.message : 'The request could not be completed. Retry shortly.',
        response.status,
        code,
        typeof result.requestId === 'string' ? result.requestId : undefined,
      );
    }
    return result;
  }
  throw new ApiClientError('Your session expired. Sign in again; your form input has been kept.', 401, 'AUTH_REQUIRED');
}

function parseSessionRow(value: unknown) {
  const row = objectValue(value);
  return { id: stringValue(row.id), question: stringValue(row.question), answer: stringValue(row.answer), created_at: stringValue(row.created_at) };
}
function parseAttemptRow(value: unknown) {
  const row = objectValue(value);
  return { id: stringValue(row.id), question: stringValue(row.question), score: numberValue(row.score), feedback: stringValue(row.feedback), created_at: stringValue(row.created_at) };
}
function parseProgress(value: unknown): LearningProgress {
  const row = objectValue(value);
  const completion = numberValue(row.completion);
  if (completion < 0 || completion > 100 || !['in_progress', 'completed'].includes(String(row.status))) invalidResponse();
  return {
    id: stringValue(row.id), content_id: nullableString(row.content_id), completion,
    last_practiced_at: nullableString(row.last_practiced_at), status: row.status as LearningProgress['status'],
    created_at: stringValue(row.created_at), updated_at: stringValue(row.updated_at),
  };
}
function parseContent(value: unknown): StudyContent {
  const row = objectValue(value);
  if (!['text', 'markdown', 'pdf'].includes(String(row.source_type)) || !['active', 'archived'].includes(String(row.status))) invalidResponse();
  return {
    id: stringValue(row.id), title: stringValue(row.title), subject: stringValue(row.subject),
    source_type: row.source_type as StudyContent['source_type'], storage_path: stringValue(row.storage_path),
    status: row.status as StudyContent['status'], version: numberValue(row.version), created_at: stringValue(row.created_at),
  };
}

export async function submitLearningRequest(input: LearningRequest, signal?: AbortSignal): Promise<LearningAnswer> {
  if (input.kind === 'question') {
    const result = await apiRequest('/api/assistant', 'POST', {
      message: input.prompt, contextIds: input.contentId ? [input.contentId] : [], notes: input.sourceText, requestId: input.requestId,
    }, signal);
    const citations = result.citations === undefined ? [] : result.citations;
    if (!Array.isArray(citations) || citations.length > 10) invalidResponse();
    const parsedCitations = citations.map((value) => {
      const citation = objectValue(value);
      return { contentId: stringValue(citation.contentId), title: stringValue(citation.title) };
    });
    return {
      id: stringValue(result.sessionId), kind: 'question', prompt: input.prompt,
      response: stringValue(result.answer), created_at: result.createdAt === undefined ? new Date().toISOString() : stringValue(result.createdAt),
      citations: parsedCitations,
    };
  }
  const result = await apiRequest('/api/practice_attempts', 'POST', {
    contentId: input.contentId, question: input.prompt, answers: [input.sourceText], requestId: input.requestId,
  }, signal);
  const score = numberValue(result.score);
  if (score < 0 || score > 100) invalidResponse();
  return {
    id: stringValue(result.id), kind: 'quiz', prompt: input.prompt,
    response: `${score}% - ${stringValue(result.feedback)}`,
    created_at: result.createdAt === undefined ? new Date().toISOString() : stringValue(result.createdAt),
  };
}

export async function listStudyContent(signal?: AbortSignal): Promise<ListResult<StudyContent>> {
  return parseList(await apiRequest('/api/study_content?limit=50', 'GET', undefined, signal), parseContent);
}

export async function createStudyContent(input: { courseId: string; title: string; subject: string; sourceType: StudyContent['source_type']; storagePath: string; requestId: string }, signal?: AbortSignal): Promise<{ id: string; success: true }> {
  const result = objectValue(await apiRequest('/api/study_content', 'POST', input, signal));
  if (result.success !== true) invalidResponse();
  return { id: stringValue(result.id), success: true };
}

export async function uploadCourseNote(input: {
  courseId: string; file: Blob & { name?: string }; sourceType: StudyContent['source_type']; requestId: string;
}, signal?: AbortSignal): Promise<{ storagePath: string }> {
  if (!input.file.name || !input.file.type || input.file.size < 1 || input.file.size > 10_000_000) {
    throw new ApiClientError('Choose a named course note with a supported file type and a size up to 10 MB.', 400, 'INVALID_UPLOAD');
  }
  const reservation = objectValue(await apiRequest('/api/course_note_uploads', 'POST', {
    courseId: input.courseId, requestId: input.requestId, filename: input.file.name,
    sourceType: input.sourceType, contentType: input.file.type, sizeBytes: input.file.size,
  }, signal));
  const upload = objectValue(reservation.upload);
  const storagePath = stringValue(upload.path);
  if (upload.alreadyUploaded !== true) {
    const signedUrl = stringValue(upload.signedUrl);
    throwIfAborted(signal);
    const apiOrigin = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!).origin;
    const target = new URL(signedUrl);
    if (target.origin !== apiOrigin || !target.pathname.includes('/storage/v1/object/upload/sign/course-notes/')) invalidResponse();
    const uploadController = new AbortController();
    const forwardAbort = () => uploadController.abort(signal?.reason);
    signal?.addEventListener('abort', forwardAbort, { once: true });
    const uploadTimeout = setTimeout(() => uploadController.abort(new DOMException('Upload deadline reached.', 'TimeoutError')), 60_000);
    let response: Response;
    try {
      response = await fetch(target.toString(), {
        method: 'PUT', body: input.file, signal: uploadController.signal,
        headers: { 'Content-Type': input.file.type, 'Cache-Control': 'max-age=3600', 'x-upsert': 'false' },
      });
    } catch (cause) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
      if (uploadController.signal.aborted) throw new ApiClientError('The upload took too long. Keep the file and retry the same upload request.', 408, 'UPLOAD_TIMEOUT');
      throw new ApiClientError('The course note upload was interrupted. Keep the file and retry the same upload request.', 503, 'STORAGE_UNAVAILABLE');
    } finally {
      clearTimeout(uploadTimeout);
      signal?.removeEventListener('abort', forwardAbort);
    }
    if (!response.ok) throw new ApiClientError('The course note could not be uploaded. Keep the file and retry the same upload request.', response.status, 'STORAGE_UNAVAILABLE');
  }
  return { storagePath };
}

export async function createOrRefreshLearningProgress(contentId?: string, signal?: AbortSignal): Promise<LearningProgress> {
  const result = objectValue(await apiRequest('/api/learning_progress', 'POST', contentId ? { contentId } : {}, signal));
  return parseProgress(result.item);
}

export async function listMyLearning(signal?: AbortSignal): Promise<LearningAnswer[]> {
  const [sessionResult, attemptResult] = await Promise.all([
    apiRequest('/api/study_sessions?limit=50', 'GET', undefined, signal),
    apiRequest('/api/practice_attempts?limit=50', 'GET', undefined, signal),
  ]);
  const sessions = parseList(sessionResult, parseSessionRow).data;
  const attempts = parseList(attemptResult, parseAttemptRow).data;
  return [
    ...sessions.map((row) => ({ id: row.id, kind: 'question' as const, prompt: row.question, response: row.answer, created_at: row.created_at })),
    ...attempts.map((row) => ({ id: row.id, kind: 'quiz' as const, prompt: row.question, response: `${row.score}% - ${row.feedback}`, created_at: row.created_at })),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 50);
}

export async function listMyProgress(signal?: AbortSignal): Promise<LearningProgress[]> {
  return parseList(await apiRequest('/api/learning_progress?limit=50', 'GET', undefined, signal), parseProgress).data;
}
