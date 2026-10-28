import { describe, expect, it } from 'vitest';
import { assertCourseAccess, type Actor } from '../../supabase/functions/api/services/access';
import { canUseCourse } from '../../supabase/functions/api/services/transitions';

const student: Actor = { id: 'student-a', role: 'student', organizationId: 'org-a', displayName: null, version: 1 };
const teacher: Actor = { id: 'teacher-a', role: 'teacher', organizationId: 'org-a', displayName: null, version: 1 };

function mockDb(course: unknown, membership: unknown) {
  const filters: Record<string, Array<[string, unknown]>> = {};
  const db = { from(table: string) {
    const query = { select() { return query; }, eq(column: string, value: unknown) {
      (filters[table] ??= []).push([column, value]); return query;
    }, maybeSingle: async () => ({ data: table === 'courses' ? course : membership, error: null }) };
    return query;
  } };
  return { db, filters };
}

describe('server course authorization', () => {
  it('requires the authenticated actor to have a matching course membership', async () => {
    const { db, filters } = mockDb({ id: 'course-a', organization_id: 'org-a' }, { role: 'student' });
    await assertCourseAccess(db, student, 'course-a', 'learn');
    expect(filters.course_memberships).toContainEqual(['user_id', 'student-a']);
    expect(filters.course_memberships).toContainEqual(['course_id', 'course-a']);
  });

  it('denies cross-organization courses and missing memberships', async () => {
    const crossOrg = mockDb({ id: 'course-b', organization_id: 'org-b' }, { role: 'student' }).db;
    const noMembership = mockDb({ id: 'course-a', organization_id: 'org-a' }, null).db;
    await expect(assertCourseAccess(crossOrg, student, 'course-b', 'learn')).rejects.toMatchObject({ status: 403 });
    await expect(assertCourseAccess(noMembership, student, 'course-a', 'learn')).rejects.toMatchObject({ status: 403 });
  });

  it('separates identity role from course membership permissions', () => {
    expect(canUseCourse('student', 'student', 'learn')).toBe(true);
    expect(canUseCourse('student', 'student', 'manage')).toBe(false);
    expect(canUseCourse('teacher', 'teacher', 'manage')).toBe(true);
    expect(canUseCourse('administrator', 'teacher', 'manage')).toBe(true);
    expect(canUseCourse('teacher', 'student', 'manage')).toBe(false);
  });

  it('rejects an actor without an organization before querying access', async () => {
    const { db } = mockDb(null, null);
    await expect(assertCourseAccess(db, { ...teacher, organizationId: null }, 'course-a', 'manage'))
      .rejects.toMatchObject({ status: 403 });
  });
});
