import type { Role } from './access.ts';

export function canUseCourse(actorRole: Role, membershipRole: string, intent: 'learn' | 'manage'): boolean {
  if (intent === 'manage') return actorRole !== 'student' && membershipRole === 'teacher';
  return (actorRole === 'student' && membershipRole === 'student') || (actorRole !== 'student' && membershipRole === 'teacher');
}

export function canTransitionSession(from: string, to: string): boolean {
  return from === 'active' && (to === 'completed' || to === 'archived');
}
export function canTransitionAttempt(from: string, to: string): boolean {
  return from === 'submitted' && to === 'reviewed';
}
export function canTransitionProgress(from: string, to: string, completion: number): boolean {
  return from === 'in_progress' && to === 'completed' && completion === 100;
}
export function canTransitionContent(from: string, to: string): boolean {
  return from === 'active' && to === 'archived';
}
