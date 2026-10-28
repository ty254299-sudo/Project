# Study Sprout

An Expo Router learning app for college students, focused on course-note Q&A, short practice with feedback, and saved progress.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and add the Supabase project URL and anon key.
3. Apply all migrations in `supabase/migrations` to your Supabase project, in filename order.
4. Deploy the `api` Edge Function. The optional `learning-assistant` function is a compatibility adapter for older clients and forwards to `api`.
5. Configure backend-only secrets and deploy:

   ```sh
   supabase secrets set OPENAI_API_KEY=... OPENAI_MODEL=... TRUSTED_WEB_ORIGINS=http://localhost:8081,http://localhost:8082,http://localhost:4174
   supabase functions deploy api
   supabase functions deploy learning-assistant
   ```

   Supabase provides its project URL and backend key to Edge Functions. For local Edge Function development, put `OPENAI_API_KEY` and `OPENAI_MODEL` in `supabase/functions/.env`. Use a supported OpenAI model name for `OPENAI_MODEL`. The AI function uses the Responses API, disables response storage, and treats generated practice scores as advisory feedback rather than official grades. See the [OpenAI text generation guide](https://developers.openai.com/api/docs/guides/text).
6. Start the app with `npm run web` or `npm start`.

## Web release

The web target is a statically exported Expo Router site for Firebase Hosting. Run `npm run typecheck`, `npm run test:unit`, and `npm run build:web` to verify the release bundle. The `deploy.yml` GitHub workflow is manual and gated: it repeats the test/build checks, then deploys either a Firebase candidate channel or the live channel after the selected GitHub Environment is configured and (for production) approved. Set the browser-safe Supabase URL and anon key as environment variables; keep service-role/OpenAI credentials only in Supabase Edge Function secrets. See [the release and recovery runbook](docs/runbook.md) before applying migrations or promoting a live release.

For endpoint payloads, trust boundaries, retry behavior, timeouts, and CORS
configuration, see [docs/api-contracts.md](docs/api-contracts.md). The local
backend-only secret template is `supabase/functions/.env.example`; it contains
placeholders only. Set the production Firebase origin in
`TRUSTED_WEB_ORIGINS` after its domain is assigned.

## Authentication setup

The implementation currently assumes Supabase-managed email/password sign-in; the requested provider was not specified. Provision college accounts in Supabase Auth. No public self-registration flow is exposed.

In the Supabase Dashboard, enable Email provider and configure **Authentication → URL Configuration** with these development return URLs:

- `http://localhost:8081/**` for Expo web
- `http://localhost:4174/**` for the static preview
- `studysprout://**` for native deep links

Set the production Site URL and add the Firebase Hosting/App Hosting origin (for example, `https://<your-firebase-domain>/**`) after the production domain is assigned. The local Auth config is in `supabase/config.toml`; dashboard URLs must also be set for the hosted project.

`/` and `/login` are public. `/dashboard`, `/learn`, `/practice`, `/progress`, and `/assistant` wait for session restoration and redirect signed-out visitors to `/login` with a validated return route. Native sessions use AsyncStorage; web sessions use browser storage. The API verifies the bearer token with Supabase Auth on every request and gets role, organization, and ownership from trusted database records. A 401 triggers one session refresh and retry; if the session cannot be refreshed, sign-in is required again. Assistant and practice drafts remain in memory through that route transition and are cleared after a successful manual sign-out.

Never put `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` in the Expo app or `.env`. The frontend uses only the public anon key and a signed-in user's access token. Assign profile roles, organization IDs, courses, and course memberships through trusted administration tooling. Clients cannot assign themselves those permissions.

## Backend API

The authenticated Supabase Edge Function at `/functions/v1/api` serves:

- `GET` and `POST` for `study_content`, `study_sessions`, `practice_attempts`, and `learning_progress`.
- `POST /assistant` for course-note questions.
- Versioned `PATCH` and soft `DELETE` for users and each learning resource.

Requests are authenticated against Supabase Auth. The function reads the actor's role and organization from `profiles`; it never trusts a client-supplied owner, role, score, feedback, or completion value. Writes use request IDs for idempotency and expected versions for conflict detection. Lists are bounded and cursor-paginated. Errors include a stable code and correlation/request ID.

Course note files belong in the private `course-notes` Storage bucket, under `organization-id/course-id/file-name`. The storage policy and API both check course membership. Uploading files is separate from creating the `study_content` metadata record. Text and Markdown notes can be used by the assistant; PDF text extraction is not enabled. The current app supports personal student activities; course-aware management requires memberships and course content to be provisioned by an administrator.

Progress is calculated on the server from saved activities (20 percentage points per session or practice attempt, capped at 100). Client-supplied progress flags are rejected. Self-deleting a user deactivates its profile; it does not delete the Supabase Auth identity or revoke its refresh tokens, so actual account erasure must be handled through trusted administration.

## Database ownership and retention

`profiles.id` is the application user ID and references Supabase Auth. Email is mirrored from Auth and is private; `current_skills` and `career_goal` are optional user-provided profile data. Learning tables expose a canonical `owner_id` while keeping the existing API owner columns synchronized by a database trigger. The migration is additive so existing records and API calls keep their identifiers.

The API soft-deletes profiles and learning records by setting `deleted_at`; records and uploaded note files are retained until an authorized administrator performs an explicit purge. There is no automatic purge job. Users should not upload sensitive information. Before rolling back database migrations, take a database backup; the third migration adds profile and owner fields and removing it would discard values written to those fields. `supabase/tests/access.test.sql` exercises owner, cross-tenant, assigned-teacher, anonymous, and direct-write policy behavior.

## API tests

Run the focused validation, transition, and idempotency tests with `npm run test:api`; AI contract tests use `npm run test:ai`. Run the app TypeScript check with `npm run typecheck`. The paid synthetic model evaluation is `npm run eval:ai` and requires backend OpenAI secrets. Applying migrations and exercising live authenticated requests requires a configured Supabase project.

## Product scope

The approved learning features define the product scope; the initial attendance idea does not include attendance capture or biometric features. Course and organization administration is not part of the frontend.
