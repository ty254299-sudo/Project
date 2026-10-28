type AssistantDraft = { note: string; question: string; requestId?: string };
type PracticeDraft = { answer: string; requestId?: string };
type LearningDrafts = { assistant?: AssistantDraft; practice?: PracticeDraft };

let drafts: LearningDrafts = {};
let learnRequestId: string | undefined;

export function readAssistantDraft(): AssistantDraft { return drafts.assistant ?? { note: '', question: '' }; }
export function writeAssistantDraft(draft: AssistantDraft): void { drafts = { ...drafts, assistant: draft }; }
export function readPracticeDraft(): PracticeDraft { return drafts.practice ?? { answer: '' }; }
export function writePracticeDraft(draft: PracticeDraft): void { drafts = { ...drafts, practice: draft }; }
export function readLearnRequestId(): string | undefined { return learnRequestId; }
export function writeLearnRequestId(value: string): void { learnRequestId = value; }
export function clearLearningDrafts(): void { drafts = {}; learnRequestId = undefined; }
