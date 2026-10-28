import { ApiError } from '../api/validation.ts';

export type Citation = { contentId: string; title: string };
export type AssistantResult = { answer: string; citationContentIds: string[] };
export type PracticeResult = { score: number; feedback: string };

export const assistantSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    citationContentIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['answer', 'citationContentIds'],
};
export const practiceSchema = {
  type: 'object', additionalProperties: false,
  properties: { score: { type: 'integer' }, feedback: { type: 'string' } },
  required: ['score', 'feedback'],
};

function invalid(): never { throw new ApiError(503, 'MODEL_INVALID_RESPONSE', 'AI returned an incomplete or invalid result. Your input is still saved here; retry the request.'); }

export function parseAssistantResult(value: unknown, allowedContentIds: string[]): AssistantResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(',') !== 'answer,citationContentIds' || typeof item.answer !== 'string') invalid();
  const answer = item.answer.trim();
  if (!answer || answer.length > 8000 || !Array.isArray(item.citationContentIds) || item.citationContentIds.length > 10) invalid();
  const permitted = new Set(allowedContentIds);
  if (item.citationContentIds.some((id) => typeof id !== 'string' || !permitted.has(id))) invalid();
  if (new Set(item.citationContentIds).size !== item.citationContentIds.length) invalid();
  return { answer, citationContentIds: item.citationContentIds as string[] };
}

export function parsePracticeResult(value: unknown): PracticeResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(',') !== 'feedback,score' || !Number.isInteger(item.score) || (item.score as number) < 0 || (item.score as number) > 100 || typeof item.feedback !== 'string') invalid();
  const feedback = item.feedback.trim();
  if (!feedback || feedback.length > 3000) invalid();
  return { score: item.score as number, feedback };
}

export function parseModelJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return invalid(); }
}
