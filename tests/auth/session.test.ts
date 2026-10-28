import { describe, expect, it } from 'vitest';
import { isSessionExpiry } from '../../src/services/authSession';
import { clearLearningDrafts, readAssistantDraft, readPracticeDraft, writeAssistantDraft, writePracticeDraft } from '../../src/services/learningDrafts';

describe('session expiry and unsent form drafts', () => {
  it('recognizes only authentication failures as expired sessions', () => {
    expect(isSessionExpiry(401, 'AUTH_INVALID')).toBe(true);
    expect(isSessionExpiry(401, 'ACCESS_DENIED')).toBe(false);
    expect(isSessionExpiry(403, 'AUTH_INVALID')).toBe(false);
  });

  it('keeps assistant and practice input available after a route remount', () => {
    clearLearningDrafts();
    writeAssistantDraft({ note: 'Lecture notes', question: 'Explain this point' });
    writePracticeDraft({ answer: 'My draft answer' });
    expect(readAssistantDraft()).toEqual({ note: 'Lecture notes', question: 'Explain this point' });
    expect(readPracticeDraft()).toEqual({ answer: 'My draft answer' });
    clearLearningDrafts();
  });
});
