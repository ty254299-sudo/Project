import { ApiError } from '../api/validation.ts';
import type { Actor, Db } from '../api/services/access.ts';

export type UserLearningContext = {
  goals: string[];
  skills: string[];
  recentQuestions: string[];
  recentPractice: string[];
  progress: Array<{ contentId: string | null; completion: number; status: string }>;
};

const clip = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function loadAuthorizedLearningContext(db: Db, actor: Actor): Promise<UserLearningContext> {
  // Every private query is explicitly scoped to the already verified actor, even though
  // the Edge Function uses a service role client for its guarded writes.
  const [profileResult, sessionsResult, attemptsResult, progressResult] = await Promise.all([
    db.from('profiles').select('career_goal,current_skills').eq('id', actor.id).is('deleted_at', null).maybeSingle(),
    db.from('study_sessions').select('question').eq('actor_id', actor.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(3),
    db.from('practice_attempts').select('question,answers').eq('actor_id', actor.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(3),
    db.from('learning_progress').select('content_id,completion,status').eq('actor_id', actor.id).is('deleted_at', null).order('updated_at', { ascending: false }).limit(3),
  ]);
  if (profileResult.error || sessionsResult.error || attemptsResult.error || progressResult.error || !profileResult.data) {
    throw new ApiError(503, 'CONTEXT_UNAVAILABLE', 'Your learning context could not be loaded. Your input is still here; retry shortly.');
  }
  const skills = Array.isArray(profileResult.data.current_skills)
    ? profileResult.data.current_skills.filter((value: unknown): value is string => typeof value === 'string').slice(0, 10).map((value: string) => clip(value, 80)).filter(Boolean)
    : [];
  const recentQuestions = (sessionsResult.data ?? []).map((row: Record<string, unknown>) => clip(row.question, 200)).filter(Boolean);
  const recentPractice = (attemptsResult.data ?? []).flatMap((row: Record<string, unknown>) => {
    const answers = Array.isArray(row.answers) ? row.answers.filter((value: unknown): value is string => typeof value === 'string') : [];
    return [`Question: ${clip(row.question, 160)} Answer: ${clip(answers.join(' '), 240)}`.slice(0, 400)];
  });
  const progress = (progressResult.data ?? []).flatMap((row: Record<string, unknown>) => {
    if (typeof row.completion !== 'number' || row.completion < 0 || row.completion > 100 || !['in_progress','completed'].includes(String(row.status))) return [];
    return [{ contentId: typeof row.content_id === 'string' ? row.content_id : null, completion: row.completion, status: String(row.status) }];
  });
  const goal = clip(profileResult.data.career_goal, 200);
  return { goals: goal ? [goal] : [], skills, recentQuestions, recentPractice, progress };
}

export function formatContextAsUntrustedData(context: UserLearningContext, notes: string, question: string): string {
  return JSON.stringify({
    untrusted_learning_context: context,
    untrusted_course_notes: notes.slice(0, 12_000),
    untrusted_student_request: question.slice(0, 2_000),
  });
}
