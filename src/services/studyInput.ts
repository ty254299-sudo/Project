export const learningGoals = [
  'Understand a tough topic',
  'Get ready for a quiz',
  'Catch up on class notes',
] as const;

export const MAX_CURRENT_LEVEL_LENGTH = 120;
export const MAX_LEARNING_GOAL_LENGTH = 80;

export function boundedRouteText(value: unknown, maxLength: number): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' ? candidate.trim().slice(0, maxLength) : '';
}

export function isAllowedLearningGoal(value: unknown): value is (typeof learningGoals)[number] {
  return typeof value === 'string' && (learningGoals as readonly string[]).includes(value);
}

export function isValidCurrentLevel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_CURRENT_LEVEL_LENGTH;
}
