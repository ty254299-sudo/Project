# Integration test boundary

`supabase/tests/access.test.sql` is the real PostgreSQL integration suite. It loads isolated fixture accounts, organizations, courses, memberships, study-content rows, sessions, and practice attempts inside a transaction and rolls them back. It verifies signed-out denial, cross-owner/tenant RLS, role restrictions, and database-computed progress from saved study and practice activity.

Run against the local Supabase stack (Docker required):

```sh
supabase start
supabase db reset
supabase test db
```

For a real Edge Function check, keep local Supabase running, serve the API in one terminal, then set the four `SUPABASE_TEST_*` variables from that local stack's `supabase status -o env` output in another terminal (never use a production URL/key):

```sh
supabase functions serve api
npm run test:integration:api
```

The API test refuses non-local hosts, creates two uniquely named confirmed test users plus an organization and a study session, checks signed-out/owner/cross-owner behavior, and removes those rows/users in teardown.

These tests exercise PostgreSQL and RLS, not a deployed Edge Function. Vitest API tests currently use deterministic fake query/provider responses; they check route validation and service behavior but do not prove a live Supabase or OpenAI integration. Do not treat them as production-readiness evidence.

## Feature-to-test map

| Feature | Success check | Failure check | Test layer |
|---|---|---|---|
| Course-note Q&A | Valid bounded question and authorized citation; successful browser save path | Empty/oversized question, foreign citation, AI unavailable/timeout/malformed response; draft retained | `tests/unit/learning-features.test.ts`, `tests/ai/*`, `tests/e2e/learning-journey.cy.js`, `tests/integration/edge-api.test.ts`, pgTAP RLS suite |
| Practice quizzes | Bounded answer produces advisory feedback and saved attempt | Empty/oversized answer, invalid score, provider timeout; answer retained | `tests/unit/learning-features.test.ts`, `tests/ai/*`, E2E retry case |
| Progress tracking | Saved sessions/attempts update progress; populated page survives reload | Premature completion is rejected; empty and load-error UI supports recovery | Unit transitions, `supabase/tests/access.test.sql`, Cypress browser flow |

Cypress signs in through a stubbed Supabase Auth response and stubs API responses to make browser state tests deterministic. That suite is a UI contract test only; the rollback-safe pgTAP suite checks actual database authorization and progress triggers. Real Auth/Edge Function/OpenAI end-to-end testing needs an isolated Supabase project and test credentials, which are not configured in this repository.
