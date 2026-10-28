# API and integration contracts

The Expo client calls the authenticated Supabase Edge Function at
`{EXPO_PUBLIC_SUPABASE_URL}/functions/v1/api`. The function validates the
Supabase bearer token on every request, looks up the role and organization from
the trusted `profiles` row, and then applies ownership/course-membership checks.
Client-provided user IDs, roles, ownership, grades, and progress values are not
authorization inputs. PostgreSQL RLS remains enabled as a second boundary.

## API routes

All routes below are under `/api`. JSON requests and responses are expected.
List routes return `{ data: [...], nextCursor: string | null, requestId }` and
accept `limit` (bounded by the server) and an opaque `cursor`.

| Method and route | Purpose |
| --- | --- |
| `GET /study_content` | List active notes for assigned courses |
| `POST /course_note_uploads` | Teacher-only request for a one-path signed upload token; requires `courseId`, `requestId`, `filename`, `sourceType`, `contentType`, `sizeBytes` |
| `POST /study_content` | Save note metadata after uploading to private `course-notes` storage; requires `courseId`, `title`, `subject`, `sourceType`, `storagePath`, `requestId` |
| `GET /study_sessions` | List permitted saved Q&A sessions |
| `POST /study_sessions` | Create a session using note IDs and/or `sourceText`, `question`, `requestId` |
| `POST /assistant` | Ask about inline `notes` or up to ten `contextIds`; requires `message` and `requestId` |
| `GET /practice_attempts` | List permitted practice attempts |
| `POST /practice_attempts` | Save an AI-reviewed answer; requires `question`, `answers`, `requestId`, optional `contentId` |
| `GET /learning_progress` | List permitted progress rows |
| `POST /learning_progress` | Recalculate server-owned progress, optionally for `contentId` |
| `PATCH /{users,study_content,study_sessions,practice_attempts,learning_progress}/:id` | Apply an allowed state/profile change with `changes` and `expectedVersion` |
| `DELETE /{study_content,study_sessions,practice_attempts,learning_progress}/:id` | Soft-delete an owned/managed record with `expectedVersion` |
| `DELETE /users/:id` | Deactivate the signed-in user's own profile with `expectedVersion` |

The signed upload request is `POST /api/course_note_uploads` with
`{ courseId, requestId, filename, sourceType, contentType, sizeBytes }`. A new
upload returns `201 { upload: { path, signedUrl, alreadyUploaded: false }, requestId }`;
a safe same-request recovery returns `200` with `alreadyUploaded: true` and no
new signed URL. Only a teacher/administrator with management membership may
request one. The returned signed URL is a temporary capability scoped to the
generated object path; Supabase documents signed upload URLs as valid for two
hours. The frontend validates the returned URL origin against the configured
Supabase project, aborts its PUT if the user leaves the screen, and enforces a
60-second upload deadline.

Writes use optimistic concurrency via `expectedVersion` where applicable.
AI/session/practice writes accept a UUID `requestId`; the server records a
request fingerprint and replays a matching completed write rather than creating
a duplicate. Reusing the same ID with different input is rejected. Clients
should keep the same request ID after network failure or cancellation, and
create a new one only after success or when the user changes the submitted work.

The server rejects unknown fields and validates identifiers and text lengths.
Course-note uploads are limited to 10 MB by Storage and the API. A teacher with
management membership requests an upload token; the server generates the
organization/course/actor/request-specific object path and checks the extension,
MIME type, and declared byte count. The signed token permits upload to that
single private object. The client then saves metadata separately. Before metadata
is persisted or edited, the API checks file size, media type, text/PDF signature,
and UTF-8 validity for text formats. Reuse the same upload request ID to recover
after a lost response; use a new ID when the selected file changes. If the upload
succeeds but metadata saving fails, retain the returned `storagePath` and retry
metadata saving with the same metadata request ID. PDF extraction is not
implemented; text and Markdown can be used as assistant context. No note-upload
screen/file picker is included yet; the typed `uploadCourseNote` service is
available for the teacher course-management UI.

## Errors and reliability

Errors use `{ error: { code, message }, requestId }`; the same correlation ID is
also returned in `X-Request-Id`. Clients validate response shapes, preserve form
fields on failure, cancel requests when a screen loses focus, and enforce a
25-second client request timeout. Only session-expiry responses trigger one
token refresh and retry. Other failures are shown to the user for manual retry;
the API client does not blindly replay writes. The AI provider call also has a
25-second timeout and a per-user daily usage limit enforced in PostgreSQL.

The app currently uses ordinary requests and refreshes affected data when a
screen is opened. Supabase Realtime subscriptions are not enabled. Notifications
and payments are not part of the approved features and no providers are wired.

## AI architecture and limits

`supabase/functions/ai/provider.ts` is the only OpenAI transport. It reads
`OPENAI_API_KEY` at the Edge Function, sends requests to the Responses API with
`store: false`, no tools, strict JSON Schema output, disabled truncation, a
25-second deadline, and at most 700 output tokens. The maximum estimated input
is 6,000 tokens. Input size is estimated conservatively from UTF-8 bytes; actual
provider input/output token counts are stored when returned.

`supabase/functions/ai/context.ts` reads a student's career goal and skills,
recent self-owned questions/answers, current self-owned progress, and only note
content authorized by course membership. Every history/progress query filters
by the actor ID obtained from the verified access token. Saved documents,
student text, and profile fields are serialized as explicitly untrusted data.
Prompt instructions say to ignore instructions embedded in that data. The model
has no tools and cannot execute actions, access other users, or grant roles.

`supabase/functions/ai/contracts.ts` validates the response schema, bounds text
lengths and scores, rejects extra action fields, and restricts citations to the
selected authorized content IDs. An invalid, empty, refused, incomplete, or
uncited selected-note answer is not saved or presented as success. Errors retain
the request ID and tell the app to preserve the user's draft and allow retry.

Migration `202610280005_ai_limits_and_telemetry.sql` sets a rolling limit of 30
requests and 20,000 estimated/actual tokens per user per 24 hours, caps an input
at 6,000 estimated tokens, and allows at most three provider attempts per
idempotency key. A request can return a retryable `REQUEST_IN_PROGRESS` during
the 90-second reservation lease. Output is capped at 700 tokens. Event rows
record model, measured latency and provider-reported token counts. Optional
`OPENAI_INPUT_USD_PER_MILLION_TOKENS` and
`OPENAI_OUTPUT_USD_PER_MILLION_TOKENS` server secrets record an estimated cost
when set; rates must be updated from current model pricing. No dollar amount is
reported when either rate is missing. Current per-user telemetry remains
subject to the existing `ai_usage_events` row-level policy.

### Evaluation

`tests/ai/eval-cases.json` contains synthetic examples for supported answers,
missing evidence, prompt injection in notes, and practice feedback. Run
`npm run test:ai` for deterministic contract, privacy-scope, and timeout tests.
Run `npm run eval:ai` only when ready to make paid OpenAI calls; it requires
server-side `OPENAI_API_KEY` and `OPENAI_MODEL`, writes `ai-eval-results.json`,
and records model, latency, input/output tokens and optional estimated cost.
Each run marks cases for manual review against the listed quality criteria; a
schema-valid output alone is not a quality pass. This evaluation harness uses
synthetic fixtures and does not send real student data. Anthropic, Gemini, and
Azure AI Foundry have not been connected or benchmarked; no comparative model
claim has been measured.

## Configuration and secret scope

The Expo app needs only `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` in its local `.env`. Backend functions receive
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the
Supabase runtime; only the server may use the service role key. `OPENAI_API_KEY`
and `OPENAI_MODEL` are backend secrets. The local template is
`supabase/functions/.env.example`; do not put these values in Expo's public
environment or commit real secrets.

Browser CORS is an exact-origin allowlist configured by the comma-separated
`TRUSTED_WEB_ORIGINS` Edge Function environment variable. Local defaults are
`http://localhost:8081`, `http://localhost:8082`, and `http://localhost:4174`. Set the production value to
the exact assigned Firebase Hosting/App Hosting origin; that domain has not yet
been provided. Native requests without an `Origin` header are accepted. Supabase
Auth return URLs are configured separately in `supabase/config.toml` and the
hosted project's Auth URL settings.

## Local and production setup

1. Copy `.env.example` to `.env` and add the Supabase project URL and public anon key.
2. Apply migrations in `supabase/migrations` in filename order and deploy the `api` function.
3. Set backend secrets with `supabase secrets set OPENAI_API_KEY=... OPENAI_MODEL=... TRUSTED_WEB_ORIGINS=...` (quote values as required by your shell).
4. Set Supabase Auth development return URLs from `README.md`; add the assigned production return URL before release.
5. Start Expo with `npm run web`. A configured Supabase project is required to make authenticated API calls; this repository currently has no project credentials configured.
