import { describe, expect, it } from 'vitest';
import { parseAssistantResult, parsePracticeResult } from '../../supabase/functions/ai/contracts.ts';
import { requireString, requireStringArray } from '../../supabase/functions/api/validation.ts';
import { canTransitionAttempt, canTransitionProgress, canTransitionSession } from '../../supabase/functions/api/services/transitions.ts';

describe('Course-note Q&A', () => {
  it('accepts bounded questions and citations scoped to supplied notes', () => {
    expect(requireString('What does ATP do?', 'question', 1, 2000)).toBe('What does ATP do?');
    expect(parseAssistantResult({ answer: 'ATP carries usable energy for cell processes.', citationContentIds: ['note-a'] }, ['note-a']).citationContentIds).toEqual(['note-a']);
  });

  it('rejects empty/oversized questions and citations outside the supplied notes', () => {
    expect(() => requireString('', 'question', 1, 2000)).toThrow();
    expect(() => requireString('x'.repeat(2001), 'question', 1, 2000)).toThrow();
    expect(() => parseAssistantResult({ answer: 'Answer', citationContentIds: ['another-owner-note'] }, ['note-a'])).toThrow();
  });
});

describe('practice quizzes', () => {
  it('accepts bounded answers and advisory feedback', () => {
    expect(requireStringArray(['ATP transfers energy.'], 'answers', 1, 20, 2000)).toEqual(['ATP transfers energy.']);
    expect(parsePracticeResult({ score: 80, feedback: 'Good start; explain where the energy goes.' })).toMatchObject({ score: 80 });
  });

  it('rejects empty, excessive, and malformed answers without producing feedback', () => {
    expect(() => requireStringArray([], 'answers', 1, 20, 2000)).toThrow();
    expect(() => requireStringArray(['x'.repeat(2001)], 'answers', 1, 20, 2000)).toThrow();
    expect(() => parsePracticeResult({ score: 101, feedback: 'Invalid score' })).toThrow();
  });
});

describe('progress tracking', () => {
  it('allows only server-computed completion and forward state changes', () => {
    expect(canTransitionProgress('in_progress', 'completed', 100)).toBe(true);
    expect(canTransitionAttempt('submitted', 'reviewed')).toBe(true);
    expect(canTransitionSession('active', 'completed')).toBe(true);
  });

  it('rejects premature completion and reverse transitions', () => {
    expect(canTransitionProgress('in_progress', 'completed', 80)).toBe(false);
    expect(canTransitionAttempt('reviewed', 'submitted')).toBe(false);
    expect(canTransitionSession('completed', 'active')).toBe(false);
  });
});
