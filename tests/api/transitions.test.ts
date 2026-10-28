import { describe, expect, it } from 'vitest';
import { canTransitionAttempt, canTransitionContent, canTransitionProgress, canTransitionSession, canUseCourse } from '../../supabase/functions/api/services/transitions.ts';

describe('authorization and state transitions', () => {
  it('limits course management to assigned teachers and administrators', () => {
    expect(canUseCourse('student', 'teacher', 'manage')).toBe(false);
    expect(canUseCourse('teacher', 'teacher', 'manage')).toBe(true);
    expect(canUseCourse('administrator', 'teacher', 'manage')).toBe(true);
    expect(canUseCourse('teacher', 'student', 'learn')).toBe(false);
  });

  it('allows only supported forward transitions', () => {
    expect(canTransitionSession('active', 'completed')).toBe(true);
    expect(canTransitionSession('completed', 'active')).toBe(false);
    expect(canTransitionAttempt('submitted', 'reviewed')).toBe(true);
    expect(canTransitionAttempt('reviewed', 'submitted')).toBe(false);
    expect(canTransitionProgress('in_progress', 'completed', 100)).toBe(true);
    expect(canTransitionProgress('in_progress', 'completed', 80)).toBe(false);
    expect(canTransitionContent('active', 'archived')).toBe(true);
  });
});
