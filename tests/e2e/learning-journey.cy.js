const studentId = '10000000-0000-4000-8000-000000000001';
const sessionId = '60000000-0000-4000-8000-000000000001';
const now = '2026-10-28T08:00:00.000Z';

function encode(value) {
  return btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mockSession() {
  const user = {
    id: studentId, aud: 'authenticated', role: 'authenticated', email: 'student@example.test',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    created_at: now, email_confirmed_at: now, identities: [],
  };
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: studentId, aud: 'authenticated', role: 'authenticated', exp: 4_000_000_000 })}.test-signature`;
  return { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: 4_000_000_000, refresh_token: 'e2e-refresh-token', user };
}

function signIn() {
  cy.intercept('POST', '**/auth/v1/token*', { statusCode: 200, body: mockSession() }).as('signIn');
  cy.visit('/dashboard');
  cy.location('pathname').should('eq', '/login');
  cy.get('[aria-label="Email address"]').type('student@example.test');
  cy.get('[aria-label="Password"]').type('test-password');
  cy.contains('[role="button"]', 'Sign in').click();
  cy.wait('@signIn');
  cy.location('pathname').should('eq', '/dashboard');
}

function interceptProgress({ sessions = [], attempts = [], progress = [] } = {}) {
  cy.intercept('GET', '**/functions/v1/api/api/study_sessions?limit=50', { statusCode: 200, body: { data: sessions, nextCursor: null } });
  cy.intercept('GET', '**/functions/v1/api/api/practice_attempts?limit=50', { statusCode: 200, body: { data: attempts, nextCursor: null } });
  cy.intercept('GET', '**/functions/v1/api/api/learning_progress?limit=50', { statusCode: 200, body: { data: progress, nextCursor: null } });
}

describe('student learning journey', () => {
  it('keeps the public introduction usable and the dashboard behind sign-in', () => {
    cy.viewport(360, 800);
    cy.visit('/');
    cy.contains('Make a difficult task easier.').should('be.visible');
    cy.contains('Ask about your course notes').should('be.visible');
    cy.visit('/login');
    cy.get('[aria-label="Email address"]').focus().type('{tab}');
    cy.focused().should('have.attr', 'aria-label', 'Password');

    cy.viewport(1920, 1080);
    cy.visit('/dashboard');
    cy.location('pathname').should('eq', '/login');
    cy.contains('Welcome back.').should('be.visible');
    cy.get('[aria-label="Email address"]').should('be.visible');
  });

  it('preserves sign-in input when authentication fails', () => {
    cy.intercept('POST', '**/auth/v1/token*', {
      statusCode: 400,
      body: { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
    });
    cy.visit('/login?returnTo=%2Fdashboard');
    cy.get('[aria-label="Email address"]').type('student@example.test');
    cy.get('[aria-label="Password"]').type('wrong-password');
    cy.contains('[role="button"]', 'Sign in').click();
    cy.contains('That email and password did not match').should('be.visible');
    cy.get('[aria-label="Email address"]').should('have.value', 'student@example.test');
    cy.get('[aria-label="Password"]').should('have.value', 'wrong-password');
  });

  it('continues to a study path, saves it, refreshes, and finds the saved row in progress', () => {
    cy.viewport(360, 800);
    signIn();
    cy.contains('[role="button"]', 'Continue session').should('be.visible');
    cy.intercept('POST', '**/functions/v1/api/api/study_sessions', {
      statusCode: 201,
      body: { id: sessionId, success: true, requestId: 'e2e-request' },
    }).as('saveSession');
    cy.get('[aria-label="Current level"]').type('Reviewing for a biology quiz');
    cy.contains('[role="button"]', 'Continue session').click();
    cy.location('pathname').should('eq', '/learn');
    cy.contains('[role="button"]', 'Save this session').click();
    cy.wait('@saveSession').its('request.body.message').should('include', 'Understand a tough topic');
    cy.contains('Session saved. You can return to it from your progress.').should('be.visible');

    cy.reload();
    cy.contains('Work through the idea.').should('be.visible');
    interceptProgress({
      sessions: [{ id: sessionId, question: 'Explain the main ideas', answer: 'A concise explanation', created_at: now }],
      progress: [{ id: 'a0000000-0000-4000-8000-000000000001', content_id: null, completion: 20, last_practiced_at: now, status: 'in_progress', created_at: now, updated_at: now }],
    });
    cy.contains('a', 'Progress').click();
    cy.contains('Return to your learning').should('be.visible');
    cy.contains('Notes question').should('be.visible');
    cy.contains('20%').should('be.visible');
  });

  it('keeps the course-note question after an unavailable AI response and allows retry', () => {
    signIn();
    cy.intercept('GET', '**/functions/v1/api/api/study_content?limit=50', { statusCode: 200, body: { data: [], nextCursor: null } });
    cy.intercept('POST', '**/functions/v1/api/api/assistant', {
      statusCode: 503,
      body: { error: { code: 'MODEL_UNAVAILABLE', message: 'AI assistance is temporarily unavailable. Your input is still here; retry shortly.' }, requestId: 'e2e-ai' },
    }).as('aiUnavailable');
    cy.contains('a', 'Ask AI').click();
    cy.get('[aria-label="Course notes"]').type('ATP stores transferable energy in cells.');
    cy.get('[aria-label="Your question"]').type('What does ATP do?');
    cy.contains('[role="button"]', 'Ask assistant').click();
    cy.wait('@aiUnavailable');
    cy.contains('AI assistance is temporarily unavailable').should('be.visible');
    cy.get('[aria-label="Course notes"]').should('have.value', 'ATP stores transferable energy in cells.');
    cy.get('[aria-label="Your question"]').should('have.value', 'What does ATP do?');
  });

  it('preserves a practice answer when the service fails', () => {
    signIn();
    cy.intercept('POST', '**/functions/v1/api/api/practice_attempts', {
      statusCode: 504,
      body: { error: { code: 'MODEL_TIMEOUT', message: 'AI took too long to respond. Your input is still here; retry.' }, requestId: 'e2e-practice' },
    }).as('practiceTimeout');
    cy.contains('[role="button"]', 'Start practice').click();
    cy.get('[aria-label="Your answer"]').type('ATP transfers energy that cells can use.');
    cy.contains('[role="button"]', 'Submit answer').click();
    cy.wait('@practiceTimeout');
    cy.contains('AI took too long to respond').should('be.visible');
    cy.get('[aria-label="Your answer"]').should('have.value', 'ATP transfers energy that cells can use.');
  });

  it('shows an empty progress state, then supports retry after a load error', () => {
    signIn();
    cy.intercept('GET', '**/functions/v1/api/api/study_sessions?limit=50', { statusCode: 200, body: { data: [], nextCursor: null } });
    cy.intercept('GET', '**/functions/v1/api/api/practice_attempts?limit=50', { statusCode: 200, body: { data: [], nextCursor: null } });
    cy.intercept('GET', '**/functions/v1/api/api/learning_progress?limit=50', { delay: 400, statusCode: 200, body: { data: [], nextCursor: null } });
    cy.contains('a', 'Progress').click();
    cy.contains('Loading your saved progress...').should('be.visible');
    cy.contains('Your story starts here.').should('be.visible');

    cy.intercept('GET', '**/functions/v1/api/api/learning_progress?limit=50', {
      statusCode: 503,
      body: { error: { code: 'DATABASE_UNAVAILABLE', message: 'Progress could not be loaded.' }, requestId: 'e2e-progress' },
    }).as('progressUnavailable');
    cy.reload();
    cy.wait('@progressUnavailable');
    cy.contains('Progress could not be loaded.').should('be.visible');
    cy.contains('[role="button"]', 'Try again').should('be.visible');
  });
});
