import { ApiError, allowKeys, isUuid, makeCursor, optionalString, readJson, readListOptions, requireOneOf, requireObject, requireRequestId, requireString, requireStringArray, requireUuid, requireVersion } from './validation.ts';
import type { Actor, Db } from './services/access.ts';
import { assertContentAccess, assertCourseAccess, assignedCourseIds, assertPersonalStudent, isTeacher } from './services/access.ts';
import { createPracticeAttempt, createStudySession } from './services/ai.ts';
import { assertSameRequest, createOnce, requestFingerprint } from './services/idempotency.ts';
import { canTransitionAttempt, canTransitionContent, canTransitionProgress, canTransitionSession } from './services/transitions.ts';
import { issueCourseNoteUpload, validateStoredNote } from './integrations/storage.ts';

export type ApiContext = { db: Db; actor: Actor; correlationId: string; model: string };
export type RouteResult = { status: number; body: Record<string, unknown> };
const ok = (context: ApiContext, status: number, body: Record<string, unknown>): RouteResult => ({ status, body: { ...body, requestId: context.correlationId } });
const recordSelect = {
  study_content: 'id,organization_id,course_id,created_by,request_id,title,subject,source_type,storage_path,status,version,created_at,updated_at',
  study_sessions: 'id,actor_id,organization_id,course_id,content_id,request_id,question,answer,citations,status,version,created_at,updated_at',
  practice_attempts: 'id,actor_id,organization_id,course_id,content_id,request_id,question,answers,score,feedback,status,version,created_at,updated_at',
  learning_progress: 'id,actor_id,organization_id,course_id,content_id,completion,last_practiced_at,status,version,created_at,updated_at',
} as const;
type Entity = keyof typeof recordSelect;

function checkDb(error: unknown, message: string): never {
  console.error('api database operation failed');
  throw new ApiError(503, 'DATABASE_UNAVAILABLE', message);
}
function cleanCoursePath(path: string, organizationId: string, courseId: string) {
  const parts = path.split('/');
  if (parts.length < 3 || parts[0] !== organizationId || parts[1] !== courseId || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) {
    throw new ApiError(400, 'INVALID_STORAGE_PATH', 'storagePath must use organization/course/file path segments.');
  }
  return path;
}
async function assertOwnedRow(db: Db, actor: Actor, entity: Entity, id: string) {
  const { data: row } = await db.from(entity).select(recordSelect[entity]).eq('id', id).is('deleted_at', null).maybeSingle();
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'The requested record was not found.');
  const ownerField = entity === 'study_content' ? 'created_by' : 'actor_id';
  if (row[ownerField] !== actor.id) throw new ApiError(403, 'ACCESS_DENIED', 'You do not own this record.');
  if (row.organization_id && row.organization_id !== actor.organizationId) throw new ApiError(403, 'ACCESS_DENIED', 'You do not have access to this organization.');
  if (row.course_id) await assertCourseAccess(db, actor, row.course_id, entity === 'study_content' ? 'manage' : 'learn');
  return row;
}
async function pagedList(context: ApiContext, url: URL, entity: Entity): Promise<RouteResult> {
  const { limit, cursor } = readListOptions(url);
  const db = context.db; const actor = context.actor;
  let query = db.from(entity).select(recordSelect[entity]).is('deleted_at', null);
  if (entity === 'study_content') {
    const ids = await assignedCourseIds(db, actor);
    if (!actor.organizationId || !ids.length) return ok(context, 200, { data: [], nextCursor: null });
    query = query.eq('organization_id', actor.organizationId).in('course_id', ids).eq('status', 'active');
  } else if (actor.role === 'student') {
    query = query.eq('actor_id', actor.id);
  } else {
    const ids = await assignedCourseIds(db, actor);
    if (!actor.organizationId || !ids.length) return ok(context, 200, { data: [], nextCursor: null });
    query = query.eq('organization_id', actor.organizationId).in('course_id', ids);
  }
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  query = query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  const { data, error } = await query;
  if (error) checkDb(error, 'Records could not be loaded.');
  const rows = (data ?? []) as Array<Record<string, unknown> & { id: string; created_at: string }>;
  const hasMore = rows.length > limit; const page = hasMore ? rows.slice(0, limit) : rows;
  return ok(context, 200, { data: page, nextCursor: hasMore && page.length ? makeCursor(page[page.length - 1]) : null });
}

async function createContent(context: ApiContext, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['courseId','title','subject','sourceType','storagePath','requestId']);
  const courseId = requireUuid(body.courseId, 'courseId'); const requestId = requireRequestId(body.requestId);
  const title = requireString(body.title, 'title', 1, 160); const subject = requireString(body.subject, 'subject', 1, 100);
  const sourceType = requireOneOf(body.sourceType, 'sourceType', ['text','markdown','pdf'] as const);
  const storagePath = requireString(body.storagePath, 'storagePath', 1, 512);
  const course = await assertCourseAccess(context.db, context.actor, courseId, 'manage');
  cleanCoursePath(storagePath, course.organization_id, courseId);
  const requestHash = await requestFingerprint({ courseId, title, subject, sourceType, storagePath });
  const result = await createOnce(
    async () => {
      const { data } = await context.db.from('study_content').select('id,request_hash').eq('created_by', context.actor.id).eq('request_id', requestId).maybeSingle();
      if (data) assertSameRequest(data.request_hash, requestHash);
      return data;
    },
    async () => {
      const { data: file, error: fileError } = await context.db.storage.from('course-notes').download(storagePath);
      if (fileError || !file) throw new ApiError(400, 'INVALID_STORAGE_PATH', 'The course note could not be found.');
      await validateStoredNote(file, sourceType, storagePath);
      const { data, error } = await context.db.from('study_content').insert({
        organization_id: context.actor.organizationId, course_id: courseId, created_by: context.actor.id, request_id: requestId, request_hash: requestHash,
        title, subject, source_type: sourceType, storage_path: storagePath,
      }).select('id').single();
      if (error || !data) checkDb(error, 'Study content could not be saved.');
      return data;
    },
  );
  return ok(context, result.created ? 201 : 200, { id: result.value.id, success: true });
}

async function requestCourseNoteUpload(context: ApiContext, request: Request): Promise<RouteResult> {
  const body = await readJson(request);
  allowKeys(body, ['courseId','requestId','filename','sourceType','contentType','sizeBytes']);
  const upload = await issueCourseNoteUpload(context.db, context.actor, body);
  return ok(context, upload.alreadyUploaded ? 200 : 201, { upload });
}

async function createSession(context: ApiContext, request: Request, assistantResponse: boolean): Promise<RouteResult> {
  const body = await readJson(request);
  const allowed = assistantResponse ? ['message','contextIds','notes','requestId'] : ['contentId','question','contextIds','sourceText','requestId'];
  allowKeys(body, allowed);
  const requestId = requireRequestId(body.requestId);
  const question = requireString(assistantResponse ? body.message : body.question, assistantResponse ? 'message' : 'question', 1, 2000);
  const contextIds = body.contextIds === undefined ? [] : body.contextIds;
  if (!Array.isArray(contextIds) || contextIds.length > 10 || contextIds.some((id) => !isUuid(id))) throw new ApiError(400, 'INVALID_FIELD', 'contextIds must contain up to 10 valid content IDs.');
  const contentId = assistantResponse ? undefined : body.contentId === undefined ? undefined : requireUuid(body.contentId, 'contentId');
  const ids = [...new Set([...(contextIds as string[]), ...(contentId ? [contentId] : [])])];
  const notes = optionalString(assistantResponse ? body.notes : body.sourceText, assistantResponse ? 'notes' : 'sourceText', 12_000);
  if (ids.length === 0 && !notes) throw new ApiError(400, 'MISSING_CONTEXT', 'Provide course notes or select course content.');
  const result = await createStudySession(context.db, context.actor, { requestId, question, contextIds: ids, notes }, context.model, request.signal);
  if (assistantResponse) return ok(context, result.created ? 201 : 200, {
    answer: result.row.answer, citations: result.row.citations, sessionId: result.row.id, createdAt: result.row.created_at,
  });
  return ok(context, result.created ? 201 : 200, { id: result.row.id, success: true });
}

async function createAttempt(context: ApiContext, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['contentId','question','answers','requestId']);
  const requestId = requireRequestId(body.requestId); const question = requireString(body.question, 'question', 1, 2000);
  const answers = requireStringArray(body.answers, 'answers', 1, 20, 2000);
  const contentId = body.contentId === undefined ? undefined : requireUuid(body.contentId, 'contentId');
  const result = await createPracticeAttempt(context.db, context.actor, { requestId, question, answers, contentId }, context.model, request.signal);
  return ok(context, result.created ? 201 : 200, { id: result.row.id, success: true, score: result.row.score, feedback: result.row.feedback, createdAt: result.row.created_at });
}

async function createOrRefreshProgress(context: ApiContext, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['contentId']);
  const contentId = body.contentId === undefined || body.contentId === null ? null : requireUuid(body.contentId, 'contentId');
  if (contentId) await assertContentAccess(context.db, context.actor, contentId, 'learn');
  else await assertPersonalStudent(context.actor);
  const { error } = await context.db.rpc('recalculate_learning_progress', { p_actor_id: context.actor.id, p_content_id: contentId });
  if (error) checkDb(error, 'Progress could not be refreshed.');
  let query = context.db.from('learning_progress').select(recordSelect.learning_progress).eq('actor_id', context.actor.id).is('deleted_at', null);
  query = contentId ? query.eq('content_id', contentId) : query.is('content_id', null);
  const { data, error: readError } = await query.maybeSingle();
  if (readError || !data) checkDb(readError, 'Progress could not be loaded.');
  return ok(context, 200, { id: data.id, success: true, item: data });
}

async function versionedUpdate(context: ApiContext, entity: Entity, id: string, expectedVersion: number, changes: Record<string, unknown>, allowed: readonly string[]) {
  allowKeys(changes, allowed);
  if (!Object.keys(changes).length) throw new ApiError(400, 'INVALID_CHANGES', 'Provide at least one allowed change.');
  const update = { ...changes, version: expectedVersion + 1, updated_at: new Date().toISOString() };
  const { data, error } = await context.db.from(entity).update(update).eq('id', id).eq('version', expectedVersion).is('deleted_at', null)
    .select(recordSelect[entity]).maybeSingle();
  if (error) checkDb(error, 'The record could not be updated.');
  if (data) return data;
  const { data: current } = await context.db.from(entity).select('id,version,deleted_at').eq('id', id).maybeSingle();
  if (!current || current.deleted_at) throw new ApiError(404, 'NOT_FOUND', 'The requested record was not found.');
  throw new ApiError(409, 'STALE_VERSION', 'This record changed since you opened it. Reload it and try again.');
}

async function patchContent(context: ApiContext, id: string, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['changes','expectedVersion']);
  const expectedVersion = requireVersion(body.expectedVersion); const changes = requireObject(body.changes, 'changes');
  allowKeys(changes, ['title','subject','sourceType','storagePath','status']);
  const { data: current } = await context.db.from('study_content').select(recordSelect.study_content).eq('id', id).is('deleted_at', null).maybeSingle();
  if (!current) throw new ApiError(404, 'NOT_FOUND', 'Study content was not found.');
  await assertCourseAccess(context.db, context.actor, current.course_id, 'manage');
  if (current.organization_id !== context.actor.organizationId) throw new ApiError(403, 'ACCESS_DENIED', 'You do not have access to this organization.');
  if (current.status !== 'active') throw new ApiError(409, 'INVALID_TRANSITION', 'Archived study content cannot be edited.');
  const validated: Record<string, unknown> = {};
  if ('title' in changes) validated.title = requireString(changes.title, 'title', 1, 160);
  if ('subject' in changes) validated.subject = requireString(changes.subject, 'subject', 1, 100);
  if ('sourceType' in changes) validated.source_type = requireOneOf(changes.sourceType, 'sourceType', ['text','markdown','pdf'] as const);
  if ('storagePath' in changes) {
    const path = requireString(changes.storagePath, 'storagePath', 1, 512);
    cleanCoursePath(path, current.organization_id, current.course_id);
    const { data: file, error } = await context.db.storage.from('course-notes').download(path);
    if (error || !file) throw new ApiError(400, 'INVALID_STORAGE_PATH', 'The course note could not be found.');
    await validateStoredNote(file, (validated.source_type ?? current.source_type) as 'text' | 'markdown' | 'pdf', path);
    validated.storage_path = path;
  }
  if ('sourceType' in changes && !('storagePath' in changes)) {
    const { data: file, error } = await context.db.storage.from('course-notes').download(current.storage_path);
    if (error || !file) throw new ApiError(400, 'INVALID_STORAGE_PATH', 'The course note could not be found.');
    await validateStoredNote(file, validated.source_type as 'text' | 'markdown' | 'pdf', current.storage_path);
  }
  if ('status' in changes) {
    const status = requireOneOf(changes.status, 'status', ['archived'] as const);
    validated.status = status;
  }
  const item = await versionedUpdate(context, 'study_content', id, expectedVersion, validated, ['title','subject','source_type','storage_path','status']);
  return ok(context, 200, { item });
}

async function patchSession(context: ApiContext, id: string, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['changes','expectedVersion']);
  const expectedVersion = requireVersion(body.expectedVersion); const changes = requireObject(body.changes, 'changes');
  allowKeys(changes, ['status']);
  const current = await assertOwnedRow(context.db, context.actor, 'study_sessions', id);
  const next = requireOneOf(changes.status, 'status', ['completed','archived'] as const);
  if (!canTransitionSession(current.status, next)) throw new ApiError(409, 'INVALID_TRANSITION', 'Only an active study session can be completed or archived.');
  const item = await versionedUpdate(context, 'study_sessions', id, expectedVersion, { status: next }, ['status']);
  return ok(context, 200, { item });
}

async function patchAttempt(context: ApiContext, id: string, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['changes','expectedVersion']);
  const expectedVersion = requireVersion(body.expectedVersion); const changes = requireObject(body.changes, 'changes');
  allowKeys(changes, ['status']);
  const { data: current } = await context.db.from('practice_attempts').select(recordSelect.practice_attempts).eq('id', id).is('deleted_at', null).maybeSingle();
  if (!current) throw new ApiError(404, 'NOT_FOUND', 'Practice attempt was not found.');
  if (current.actor_id === context.actor.id) throw new ApiError(403, 'ACCESS_DENIED', 'Students cannot edit submitted answers or feedback.');
  if (!current.course_id) throw new ApiError(403, 'ACCESS_DENIED', 'This practice attempt is not part of an assigned course.');
  await assertCourseAccess(context.db, context.actor, current.course_id, 'manage');
  if (current.organization_id !== context.actor.organizationId) throw new ApiError(403, 'ACCESS_DENIED', 'You do not have access to this organization.');
  const next = requireOneOf(changes.status, 'status', ['reviewed'] as const);
  if (!canTransitionAttempt(current.status, next)) throw new ApiError(409, 'INVALID_TRANSITION', 'Only a submitted practice attempt can be reviewed.');
  const item = await versionedUpdate(context, 'practice_attempts', id, expectedVersion, { status: next }, ['status']);
  return ok(context, 200, { item });
}

async function patchProgress(context: ApiContext, id: string, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['changes','expectedVersion']);
  const expectedVersion = requireVersion(body.expectedVersion); const changes = requireObject(body.changes, 'changes');
  allowKeys(changes, ['status']);
  const current = await assertOwnedRow(context.db, context.actor, 'learning_progress', id);
  const next = requireOneOf(changes.status, 'status', ['completed'] as const);
  if (!canTransitionProgress(current.status, next, current.completion)) throw new ApiError(409, 'INVALID_TRANSITION', 'Progress can be completed only after the server records five learning activities.');
  const { data: refreshed } = await context.db.from('learning_progress').select('completion,status').eq('id', id).maybeSingle();
  if (!refreshed || refreshed.completion < 100) throw new ApiError(409, 'INVALID_TRANSITION', 'Complete five saved learning activities before marking progress complete.');
  const item = await versionedUpdate(context, 'learning_progress', id, expectedVersion, { status: next }, ['status']);
  return ok(context, 200, { item });
}

async function patchUser(context: ApiContext, id: string, request: Request): Promise<RouteResult> {
  if (id !== context.actor.id) throw new ApiError(403, 'ACCESS_DENIED', 'You can only update your own profile.');
  const body = await readJson(request); allowKeys(body, ['changes','expectedVersion']);
  const expectedVersion = requireVersion(body.expectedVersion); const changes = requireObject(body.changes, 'changes');
  allowKeys(changes, ['displayName']);
  const displayName = requireString(changes.displayName, 'displayName', 1, 80);
  const { data, error } = await context.db.from('profiles').update({ display_name: displayName, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('id', id).eq('version', expectedVersion).is('deleted_at', null).select('id,display_name,version,updated_at').maybeSingle();
  if (error) checkDb(error, 'Your profile could not be updated.');
  if (data) return ok(context, 200, { item: data });
  const { data: current } = await context.db.from('profiles').select('id,version,deleted_at').eq('id', id).maybeSingle();
  if (!current || current.deleted_at) throw new ApiError(404, 'NOT_FOUND', 'Profile was not found.');
  throw new ApiError(409, 'STALE_VERSION', 'Your profile changed. Reload and try again.');
}

async function softDelete(context: ApiContext, entity: Entity, id: string, request: Request): Promise<RouteResult> {
  const body = await readJson(request); allowKeys(body, ['expectedVersion']); const version = requireVersion(body.expectedVersion);
  let current: Record<string, unknown>;
  if (entity === 'study_content') {
    const { data } = await context.db.from(entity).select(recordSelect[entity]).eq('id', id).is('deleted_at', null).maybeSingle();
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Study content was not found.');
    await assertCourseAccess(context.db, context.actor, data.course_id, 'manage');
    if (data.organization_id !== context.actor.organizationId) throw new ApiError(403, 'ACCESS_DENIED', 'You do not have access to this organization.');
    current = data;
  } else {
    current = await assertOwnedRow(context.db, context.actor, entity, id);
  }
  if (entity === 'study_content' && !canTransitionContent(current.status, 'archived')) throw new ApiError(409, 'INVALID_TRANSITION', 'Study content is already archived.');
  const { data: deleted, error } = await context.db.from(entity).update({
    ...(entity === 'study_content' ? { status: 'archived' } : {}),
    deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: version + 1,
  }).eq('id', id).eq('version', version).is('deleted_at', null).select('id').maybeSingle();
  if (error) checkDb(error, 'The record could not be deleted.');
  if (deleted) return ok(context, 200, { deleted: true });
  const { data: latest } = await context.db.from(entity).select('id,version,deleted_at').eq('id', id).maybeSingle();
  if (!latest || latest.deleted_at) throw new ApiError(404, 'NOT_FOUND', 'The requested record was not found.');
  if (latest.version !== version) throw new ApiError(409, 'STALE_VERSION', 'This record changed. Reload it and try again.');
  throw new ApiError(503, 'DELETE_FAILED', 'The record could not be deleted. Retry the request.');
}

async function deleteUser(context: ApiContext, id: string, request: Request): Promise<RouteResult> {
  if (id !== context.actor.id) throw new ApiError(403, 'ACCESS_DENIED', 'You can only deactivate your own profile.');
  const body = await readJson(request); allowKeys(body, ['expectedVersion']); const version = requireVersion(body.expectedVersion);
  const { data, error } = await context.db.from('profiles').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: version + 1 })
    .eq('id', id).eq('version', version).is('deleted_at', null).select('id').maybeSingle();
  if (error) checkDb(error, 'Your profile could not be deactivated.');
  if (data) return ok(context, 200, { deleted: true });
  const { data: current } = await context.db.from('profiles').select('id,version,deleted_at').eq('id', id).maybeSingle();
  if (!current || current.deleted_at) throw new ApiError(404, 'NOT_FOUND', 'Profile was not found.');
  throw new ApiError(409, 'STALE_VERSION', 'Your profile changed. Reload and try again.');
}

export async function routeRequest(request: Request, context: ApiContext, pathAndQuery?: string): Promise<RouteResult> {
  const method = request.method.toUpperCase(); const routeUrl = pathAndQuery ? new URL(pathAndQuery, 'http://api.local') : new URL(request.url);
  const rawPath = routeUrl.pathname.replace(/\/+$/, '') || '/';
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath === '/' ? '' : rawPath}`;
  if (method === 'GET') {
    const entityByPath: Record<string, Entity> = {
      '/api/study_content': 'study_content', '/api/study_sessions': 'study_sessions',
      '/api/practice_attempts': 'practice_attempts', '/api/learning_progress': 'learning_progress',
    };
    const entity = entityByPath[path];
    if (entity) return await pagedList(context, routeUrl, entity);
  }
  if (method === 'POST') {
    switch (path) {
      case '/api/study_content': return await createContent(context, request);
      case '/api/course_note_uploads': return await requestCourseNoteUpload(context, request);
      case '/api/study_sessions': return await createSession(context, request, false);
      case '/api/practice_attempts': return await createAttempt(context, request);
      case '/api/learning_progress': return await createOrRefreshProgress(context, request);
      case '/api/assistant': return await createSession(context, request, true);
    }
  }
  const match = path.match(/^\/api\/(users|study_content|study_sessions|practice_attempts|learning_progress)\/([^/]+)$/);
  if (match) {
    const [, resource, rawId] = match;
    const id = requireUuid(rawId, 'id');
    if (resource === 'users') return method === 'PATCH' ? await patchUser(context, id, request) : method === 'DELETE' ? await deleteUser(context, id, request) : (() => { throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for users.'); })();
    if (resource === 'study_content') return method === 'PATCH' ? await patchContent(context, id, request) : method === 'DELETE' ? await softDelete(context, 'study_content', id, request) : (() => { throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for study content.'); })();
    if (resource === 'study_sessions') return method === 'PATCH' ? await patchSession(context, id, request) : method === 'DELETE' ? await softDelete(context, 'study_sessions', id, request) : (() => { throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for study sessions.'); })();
    if (resource === 'practice_attempts') return method === 'PATCH' ? await patchAttempt(context, id, request) : method === 'DELETE' ? await softDelete(context, 'practice_attempts', id, request) : (() => { throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for practice attempts.'); })();
    if (resource === 'learning_progress') return method === 'PATCH' ? await patchProgress(context, id, request) : method === 'DELETE' ? await softDelete(context, 'learning_progress', id, request) : (() => { throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for learning progress.'); })();
  }
  if (['/api/study_content','/api/course_note_uploads','/api/study_sessions','/api/practice_attempts','/api/learning_progress','/api/assistant'].includes(path)) {
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for this route.');
  }
  throw new ApiError(404, 'NOT_FOUND', 'API route was not found.');
}
