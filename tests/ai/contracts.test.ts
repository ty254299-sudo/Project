import { describe, expect, it } from 'vitest';
import { parseAssistantResult, parseModelJson, parsePracticeResult } from '../../supabase/functions/ai/contracts.ts';

describe('AI output contracts', () => {
  it('accepts a scoped answer and its provided citation', () => {
    expect(parseAssistantResult({ answer: 'ATP is made during cellular respiration.', citationContentIds: ['note-1'] }, ['note-1']))
      .toEqual({ answer: 'ATP is made during cellular respiration.', citationContentIds: ['note-1'] });
  });

  it('rejects empty, malformed, oversized, extra-action, and cross-context answers', () => {
    for (const output of [
      { answer: '', citationContentIds: [] },
      { answer: 'x'.repeat(8001), citationContentIds: [] },
      { answer: 'Answer', citationContentIds: ['another-owner-note'] },
      { answer: 'Answer', citationContentIds: [], action: { deleteUser: true } },
    ]) expect(() => parseAssistantResult(output, ['note-1'])).toThrow();
    expect(() => parseModelJson('{broken')).toThrow();
  });

  it('requires bounded advisory practice feedback and score', () => {
    expect(parsePracticeResult({ score: 80, feedback: 'Good explanation; add one example.' }).score).toBe(80);
    for (const output of [
      { score: 101, feedback: 'Try again.' },
      { score: 70.5, feedback: 'Try again.' },
      { score: 50, feedback: ' ' },
      { score: 50, feedback: 'Good', officialGrade: true },
    ]) expect(() => parsePracticeResult(output)).toThrow();
  });
});
