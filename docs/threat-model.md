# Security threat model

## Scope and assumptions

This is a repository-level review of the current Study Sprout implementation. It is not evidence that a Supabase project, Firebase site, production policy, or external scanner is configured. The product currently has student learning, teacher course management, private course notes, study sessions, quizzes, progress, and AI assistance. `student`, `teacher`, and `administrator` are the internal roles; the brief's Customers/sellers/administrators labels do not map one-to-one to course permissions, so the existing student/teacher/administrator model is retained.

## Trust boundaries and controls

| Boundary | Data/action | Controls in code or migrations | Remaining concern |
|---|---|---|---|
| Browser / Expo app → Edge Function | Private API calls | Bearer token required; Supabase `auth.getUser(token)` verifies identity; profile and active state loaded by verified user ID; request body does not establish identity or role. CORS allows exact configured origins. | CORS is not authorization. Native clients can omit `Origin`; bearer verification and server-side checks remain mandatory. Configure `TRUSTED_WEB_ORIGINS` to exact production origins. |
| Edge Function → PostgreSQL | Read/write study data | Server checks organization, membership, role, and ownership in `services/access.ts` and route handlers. RLS restricts direct authenticated reads and client mutations; server-only service role is used only after token verification. | Service role bypasses RLS, so every new service-role query/mutation must repeat an authorization check and derive actor ID from the verified Auth user. Apply migrations and run SQL access tests against a disposable local Supabase instance before release. |
| Browser → Supabase Auth | Session lifecycle | Supabase Auth owns credentials/session verification; browser uses only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Private API calls send explicit Authorization headers. | Set approved login provider and exact development/production redirect URLs in the Supabase project; project credentials are not present here. |
| Teacher browser → Edge Function → private Storage | Course-note uploads/downloads | Teacher/administrator course membership checked before issuing a scoped signed upload URL. Bucket `course-notes` is private; max 10 MB, MIME allowlist, extension/MIME match, safe filename, UTF-8/no-NUL text check, PDF `%PDF` signature check. Storage policies restrict reads to assigned course members. | **No malware scanner or quarantine service is configured.** MIME and magic-byte checks do not prove a file is safe. Until scanning/quarantine is added, treat uploaded files as untrusted and do not extract/execute them; production policy must decide whether to disable PDF uploads. Soft-deleted rows/files need an explicit scheduled purge/retention policy. |
| Edge Function → OpenAI | AI request and retrieved context | OpenAI key read only from Edge Function environment; context queries filter to verified actor; prompts/notes are serialized as untrusted data; inputs, outputs, latency and request frequency are bounded; structured output is validated; no model tool can perform privileged actions. | Avoid adding raw notes, tokens, or provider errors to logs. Reassess limits and retention against the actual deployment plan. |
| User-controlled text → UI / AI | Learning goal, level, prompt, notes, generated text | UI renders text through React Native `Text` (no raw HTML sink in app source); learning goal allowlisted; route parameters bounded; API/AI schemas validate length and shape. Model output is data and cannot grant access. | Keep any future HTML/markdown renderer configured to escape HTML and disable unsafe links/actions. |

## Data access matrix

| Resource | Student | Teacher / administrator | Database/API enforcement |
|---|---|---|---|
| `profiles` | Own profile; selected aggregate fields only | Own profile; assigned-course reporting where defined | Authenticated identity, RLS, role fields are not user-editable through the client |
| `study_content` | Active content in assigned courses | Manage content in assigned courses | Organization + course membership + role checks; RLS read policy |
| `study_sessions`, `practice_attempts`, `learning_progress` | Own records | Assigned-course records where applicable | Actor/owner filter, course assignment, RLS; client writes are revoked in favor of guarded API routes |
| `course_memberships` | Own membership | Assigned course membership context | User ID comes from verified token; role assignment is administrative data |
| `course-notes` Storage | Read notes for assigned courses | Read assigned course notes; upload/manage as assigned teacher/admin | Private bucket, RLS policies, scoped upload authorization |

## Abuse cases to keep testing

1. Replace a body `userId`, `actorId`, `organizationId`, or role with another account's value. Expected: identity and ownership remain derived from the verified token/profile; request rejected or safely scoped.
2. Use a valid account in another organization, or a student without the course membership. Expected: no course/session/attempt/progress/note access.
3. Escalate a student course membership to teacher in request data. Expected: no permission change; only trusted membership/profile state grants teacher actions.
4. Upload an oversized, mismatched, malformed, or executable-looking file. Expected: type/size/content checks reject known-invalid inputs; malware detection is **not** claimed until an external scanner is deployed.
5. Put instructions in notes or model output asking for another student's data or a privileged action. Expected: only actor-scoped context is assembled and no model tool/action is executed.
6. Trigger errors with private payloads/tokens. Expected: client gets generic actionable messages and API logs contain request ID plus error class only.

## Operational checklist

- Keep service-role and OpenAI credentials in Supabase Edge Function secrets, never `EXPO_PUBLIC_*`, source, build artifacts, or logs.
- Configure exact trusted web origins and Supabase Auth redirect URLs separately for development and production.
- Apply migrations 001–005, then run `supabase/tests/access.test.sql` against a local/disposable Supabase database. RLS does not protect service-role queries.
- Run the security workflow; its ZAP baseline job scans the public static web export only, without an authenticated Supabase session. It cannot prove private authorization. Keep the SQL/business-rule negative tests as a separate check.
- Before production note uploads: choose and deploy malware scanning/quarantine, file-serving policy, retention period, and purge job; confirm private bucket and RLS state in the live project.
- This app currently authenticates private mutations with an explicit Bearer header, not ambient cookies. CSRF/SameSite cookie defenses are therefore not the primary control; keep exact CORS origin checks and bearer authorization. Revisit CSRF protection if cookie authentication is introduced.
- Firebase Hosting security headers are configured in `firebase.json`; a restrictive CSP is intentionally left for deployment-specific validation because Expo web output may require inline/runtime resources.
