import { ApiError, requireOneOf, requireString, requireUuid } from '../validation.ts';
import type { Actor, Db } from '../services/access.ts';
import { assertCourseAccess } from '../services/access.ts';

export type NoteFormat = 'text' | 'markdown' | 'pdf';
export type UploadDescriptor = { filename: string; sourceType: NoteFormat; contentType: string; sizeBytes: number };

export function safeNoteFilename(value: unknown): string {
  const filename = requireString(value, 'filename', 1, 100);
  if (filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..' || !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,99}$/.test(filename)) {
    throw new ApiError(400, 'INVALID_UPLOAD', 'Choose a simple file name without folder paths or special characters.');
  }
  return filename.replace(/\s+/g, '-');
}

export function validateUploadDescriptor(descriptor: UploadDescriptor): void {
  if (!Number.isInteger(descriptor.sizeBytes) || descriptor.sizeBytes < 1 || descriptor.sizeBytes > 10_000_000) {
    throw new ApiError(413, 'UPLOAD_TOO_LARGE', 'Choose a course note between 1 byte and 10 MB.');
  }
  const ext = descriptor.filename.split('.').at(-1)?.toLowerCase();
  const mime = descriptor.contentType.split(';')[0].trim().toLowerCase();
  const valid = descriptor.sourceType === 'text' ? ext === 'txt' && mime === 'text/plain'
    : descriptor.sourceType === 'markdown' ? ['md','markdown'].includes(ext ?? '') && ['text/markdown','text/plain'].includes(mime)
      : ext === 'pdf' && mime === 'application/pdf';
  if (!valid) throw new ApiError(400, 'INVALID_UPLOAD', 'The selected file extension and media type do not match.');
}

export async function validateStoredNote(file: Blob, sourceType: NoteFormat, path: string): Promise<void> {
  if (file.size < 1 || file.size > 10_000_000) throw new ApiError(400, 'INVALID_STORAGE_PATH', 'Course notes must be between 1 byte and 10 MB.');
  const filename = path.split('/').at(-1)?.replace(/^[0-9a-f-]{36}-/i, '') ?? '';
  validateUploadDescriptor({ filename, sourceType, contentType: file.type, sizeBytes: file.size });
  const firstBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (sourceType === 'pdf') {
    if (new TextDecoder().decode(firstBytes) !== '%PDF') throw new ApiError(400, 'INVALID_STORAGE_PATH', 'The uploaded file is not a valid PDF.');
    return;
  }
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (content.includes('\u0000')) throw new Error('Binary content');
  } catch {
    throw new ApiError(400, 'INVALID_STORAGE_PATH', 'The uploaded note is not valid text.');
  }
}

export async function issueCourseNoteUpload(db: Db, actor: Actor, body: Record<string, unknown>) {
  const courseId = requireUuid(body.courseId, 'courseId');
  const requestId = requireUuid(body.requestId, 'requestId');
  const filename = safeNoteFilename(body.filename);
  const sourceType = requireOneOf(body.sourceType, 'sourceType', ['text','markdown','pdf'] as const);
  const contentType = requireString(body.contentType, 'contentType', 1, 100);
  const sizeBytes = body.sizeBytes;
  const descriptor = { filename, sourceType, contentType, sizeBytes };
  validateUploadDescriptor(descriptor as UploadDescriptor);

  const course = await assertCourseAccess(db, actor, courseId, 'manage');
  const path = `${course.organization_id}/${courseId}/${actor.id}/${requestId}-${filename}`;
  const storage = db.storage.from('course-notes');
  const { data: existing } = await storage.download(path);
  if (existing) {
    await validateStoredNote(existing, sourceType, path);
    if (existing.size !== sizeBytes) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This upload request ID already contains a different file. Start a new upload.');
    return { path, signedUrl: null, alreadyUploaded: true };
  }
  const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.signedUrl) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Private course-note storage is unavailable. Keep the file and retry shortly.');
  return { path, signedUrl: data.signedUrl, alreadyUploaded: false };
}
