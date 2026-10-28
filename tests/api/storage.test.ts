import { describe, expect, it } from 'vitest';
import { issueCourseNoteUpload, safeNoteFilename, validateStoredNote, validateUploadDescriptor } from '../../supabase/functions/api/integrations/storage.ts';
import type { Actor } from '../../supabase/functions/api/services/access.ts';

const actorId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';

describe('private course-note storage integration', () => {
  it('rejects traversal, type mismatches, and oversized uploads', () => {
    expect(() => safeNoteFilename('../notes.txt')).toThrow();
    expect(() => validateUploadDescriptor({ filename: 'notes.exe', sourceType: 'text', contentType: 'application/octet-stream', sizeBytes: 50 })).toThrow();
    expect(() => validateUploadDescriptor({ filename: 'notes.txt', sourceType: 'text', contentType: 'text/plain', sizeBytes: 10_000_001 })).toThrow();
  });

  it('validates stored text and PDF signatures', async () => {
    await expect(validateStoredNote(new Blob(['valid notes'], { type: 'text/plain' }), 'text', `${organizationId}/${courseId}/${actorId}/${requestId}-notes.txt`)).resolves.toBeUndefined();
    await expect(validateStoredNote(new Blob(['%PDF-1.7\n'], { type: 'application/pdf' }), 'pdf', `${organizationId}/${courseId}/${actorId}/${requestId}-notes.pdf`)).resolves.toBeUndefined();
    await expect(validateStoredNote(new Blob(['not a PDF'], { type: 'application/pdf' }), 'pdf', `${organizationId}/${courseId}/${actorId}/${requestId}-notes.pdf`)).rejects.toMatchObject({ code: 'INVALID_STORAGE_PATH' });
  });

  it('issues a private upload path only to a teacher assigned to manage that course', async () => {
    const calls: string[] = [];
    const db = {
      from(table: string) {
        let filters: Record<string, unknown> = {};
        const chain: Record<string, any> = {
          select: () => chain,
          eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
          maybeSingle: async () => table === 'courses'
            ? { data: { id: courseId, organization_id: organizationId, title: 'Biology' } }
            : { data: { role: 'teacher' } },
        };
        if (table === 'course_memberships') calls.push('membership-query');
        return chain;
      },
      storage: { from(bucket: string) { expect(bucket).toBe('course-notes'); return {
        download: async () => ({ data: null, error: new Error('not found') }),
        createSignedUploadUrl: async (path: string) => { calls.push(path); return { data: { signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/course-notes/example?token=short-lived-token' }, error: null }; },
      }; } },
    };
    const actor: Actor = { id: actorId, role: 'teacher', organizationId, displayName: null, version: 1 };
    const result = await issueCourseNoteUpload(db, actor, {
      courseId, requestId, filename: 'lecture-notes.txt', sourceType: 'text', contentType: 'text/plain', sizeBytes: 512,
    });
    expect(result).toEqual({ path: `${organizationId}/${courseId}/${actorId}/${requestId}-lecture-notes.txt`, signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/course-notes/example?token=short-lived-token', alreadyUploaded: false });
    expect(calls).toContain('membership-query');
  });

  it('denies students a course management upload token', async () => {
    const db = {
      from(table: string) {
        const chain: Record<string, any> = {
          select: () => chain, eq: () => chain,
          maybeSingle: async () => table === 'courses'
            ? { data: { id: courseId, organization_id: organizationId, title: 'Biology' } }
            : { data: { role: 'student' } },
        };
        return chain;
      },
      storage: { from: () => { throw new Error('Storage must not be touched'); } },
    };
    const student: Actor = { id: actorId, role: 'student', organizationId, displayName: null, version: 1 };
    await expect(issueCourseNoteUpload(db, student, {
      courseId, requestId, filename: 'lecture-notes.txt', sourceType: 'text', contentType: 'text/plain', sizeBytes: 512,
    })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('recovers the same upload request without issuing another token', async () => {
    const db = {
      from(table: string) {
        const chain: Record<string, any> = {
          select: () => chain, eq: () => chain,
          maybeSingle: async () => table === 'courses'
            ? { data: { id: courseId, organization_id: organizationId, title: 'Biology' } }
            : { data: { role: 'teacher' } },
        };
        return chain;
      },
      storage: { from: () => ({
        download: async () => ({ data: new Blob(['saved'], { type: 'text/plain' }), error: null }),
        createSignedUploadUrl: async () => { throw new Error('Should reuse the completed upload'); },
      }) },
    };
    const teacher: Actor = { id: actorId, role: 'teacher', organizationId, displayName: null, version: 1 };
    await expect(issueCourseNoteUpload(db, teacher, {
      courseId, requestId, filename: 'lecture-notes.txt', sourceType: 'text', contentType: 'text/plain', sizeBytes: 5,
    })).resolves.toMatchObject({ path: `${organizationId}/${courseId}/${actorId}/${requestId}-lecture-notes.txt`, signedUrl: null, alreadyUploaded: true });
  });
});
