import { ApiError } from '../validation.ts';
import { canUseCourse } from './transitions.ts';

export type Role = 'student' | 'teacher' | 'administrator';
export type Actor = { id: string; role: Role; organizationId: string | null; displayName: string | null; version: number };
export type Db = any;

export async function assertCourseAccess(db: Db, actor: Actor, courseId: string, intent: 'learn' | 'manage') {
  if (!actor.organizationId) throw new ApiError(403, 'ACCESS_DENIED', 'This account is not assigned to an organization.');
  const [{ data: course }, { data: membership }] = await Promise.all([
    db.from('courses').select('id,organization_id,title').eq('id', courseId).maybeSingle(),
    db.from('course_memberships').select('role').eq('course_id', courseId).eq('user_id', actor.id).maybeSingle(),
  ]);
  if (!course || course.organization_id !== actor.organizationId || !membership) throw new ApiError(403, 'ACCESS_DENIED', 'You do not have access to this course.');
  if (!canUseCourse(actor.role, membership.role, intent)) throw new ApiError(403, 'ACCESS_DENIED', 'Your role is not allowed to perform this course action.');
  return course;
}

export async function assertPersonalStudent(actor: Actor) {
  if (actor.role !== 'student' || !actor.organizationId) throw new ApiError(403, 'ACCESS_DENIED', 'Student access is required for personal learning activity.');
}

export async function assertContentAccess(db: Db, actor: Actor, contentId: string, intent: 'learn' | 'manage' = 'learn') {
  const { data: content } = await db.from('study_content')
    .select('id,organization_id,course_id,created_by,request_id,title,subject,source_type,storage_path,status,version,created_at,updated_at,deleted_at')
    .eq('id', contentId).maybeSingle();
  if (!content || content.deleted_at || content.status !== 'active') throw new ApiError(404, 'NOT_FOUND', 'Study content was not found.');
  await assertCourseAccess(db, actor, content.course_id, intent);
  if (content.organization_id !== actor.organizationId) throw new ApiError(403, 'ACCESS_DENIED', 'You do not have access to this content.');
  return content;
}

export async function assignedCourseIds(db: Db, actor: Actor): Promise<string[]> {
  const membershipRole = actor.role === 'student' ? 'student' : 'teacher';
  const { data, error } = await db.from('course_memberships').select('course_id').eq('user_id', actor.id).eq('role', membershipRole);
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Course access could not be checked.');
  return (data ?? []).map((row: { course_id: string }) => row.course_id);
}

export function isTeacher(actor: Actor) { return actor.role === 'teacher' || actor.role === 'administrator'; }
