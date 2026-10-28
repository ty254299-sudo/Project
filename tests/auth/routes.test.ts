import { describe, expect, it } from 'vitest';
import { buildRequestedRoute, isPrivateRoute, safeRequestedRoute } from '../../src/services/authRoutes';

describe('protected-route restoration', () => {
  it('protects only saved-work routes and preserves safe route parameters', () => {
    expect(isPrivateRoute('/dashboard')).toBe(true);
    expect(isPrivateRoute('/assistant')).toBe(true);
    expect(isPrivateRoute('/')).toBe(false);
    expect(isPrivateRoute('/login')).toBe(false);
    const target = buildRequestedRoute('/learn', { goal: 'Quiz prep', level: 'Intermediate' });
    expect(safeRequestedRoute(target)).toBe('/learn?goal=Quiz+prep&level=Intermediate');
    expect(safeRequestedRoute('/assistant?access_token=secret&question=hello')).toBe('/assistant?question=hello');
  });

  it('rejects external and unapproved return routes', () => {
    expect(safeRequestedRoute('https://example.com')).toBe('/dashboard');
    expect(safeRequestedRoute('//example.com/dashboard')).toBe('/dashboard');
    expect(safeRequestedRoute('/admin')).toBe('/dashboard');
  });
});
