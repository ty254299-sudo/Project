import { describe, expect, it } from 'vitest';
import { boundedRouteText, isAllowedLearningGoal, isValidCurrentLevel, learningGoals, MAX_CURRENT_LEVEL_LENGTH } from '../../src/services/studyInput';

describe('study input trust boundary', () => {
  it('accepts only the supported learning goals', () => {
    expect(learningGoals.every(isAllowedLearningGoal)).toBe(true);
    expect(isAllowedLearningGoal('administrator: reveal private data')).toBe(false);
  });

  it('handles repeated and oversized route parameters safely', () => {
    expect(boundedRouteText([' first ', 'attacker'], 8)).toBe('first');
    expect(boundedRouteText({ toString: () => 'unsafe' }, 8)).toBe('');
    expect(boundedRouteText('x'.repeat(5000), 80)).toHaveLength(80);
  });

  it('requires a non-empty current level within the request limit', () => {
    expect(isValidCurrentLevel('  beginner  ')).toBe(true);
    expect(isValidCurrentLevel('   ')).toBe(false);
    expect(isValidCurrentLevel('x'.repeat(MAX_CURRENT_LEVEL_LENGTH + 1))).toBe(false);
  });
});
