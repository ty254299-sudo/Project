# Release and recovery runbook

Status: deployment configuration is prepared but no Firebase or production Supabase project has been provisioned or deployed. A real production domain, public Supabase project values, service credentials, and approved billing plan are not present in this workspace. Do not promote a release until the checks below are complete.

## Hosting/runtime decision

The frontend is an Expo Router app configured with `web.output: "static"`. `npm run build:web` exports route-specific HTML and client assets into `dist`; Firebase Hosting serves these static files. `cleanUrls` maps `/dashboard` to the generated `dashboard.html`. The Firebase host does not execute Supabase code. The existing trusted API remains in Supabase Edge Functions, and the app calls it over HTTPS. Firebase App Hosting targets server-rendered web frameworks and managed Cloud Run backends; it is not required for this static Expo output. Expo documents static output as suitable for static hosts and separate HTML files per route: [Expo static rendering](https://docs.expo.dev/router/web/static-rendering/), [Firebase Hosting](https://firebase.google.com/docs/hosting/).

As checked on 2026-10-28, Firebase Hosting has a no-cost quota (10 GB stored content and 360 MB/day data transfer); beyond quotas, the Blaze plan bills usage, including storage/transfer. App Hosting requires billing and Cloud Run/Cloud Build/Artifact Registry/Logging/Secrets costs can apply. Supabase Free includes 500,000 Edge Function invocations and 500 MB database size per project; Pro includes 2 million function invocations and 8 GB database disk per project, with overages and compute billed as described by Supabase. These are provider quotas, not a cost estimate for this workload. Review the current [Firebase pricing](https://firebase.google.com/pricing), [Firebase Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), and [Edge Function pricing](https://supabase.com/docs/guides/functions/pricing) before enabling paid service. Region and traffic are unknown; choose the Supabase database region with the product owner and place database-heavy workloads near it. Supabase Edge Functions otherwise run near the caller by default; see [regional invocation](https://supabase.com/docs/guides/functions/regional-invocation) and [limits](https://supabase.com/docs/guides/functions/limits).

## Required host setup

1. Create the Firebase project and Hosting site in the approved account. Add `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` to both GitHub Environments (`preview` and `production`); store the service account JSON only as an encrypted GitHub environment secret. Restrict the account to the least Firebase Hosting deploy permissions. Require a reviewer for the `production` GitHub Environment.
2. Create/select separate Supabase projects for preview and production. Apply the migrations in `supabase/migrations` in order only after a current database backup has been confirmed. Provision Auth, Storage, roles, profiles, course memberships, and private bucket policies. Confirm the project region with the data owner.
3. Set each GitHub environment's `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` variables. They are public browser configuration, embedded in the JavaScript bundle; RLS and Edge Function authorization remain required. The app uses these `EXPO_PUBLIC_` names. Never set `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` in GitHub build variables, Firebase Hosting, or the Expo client.
4. Set backend secrets in the matching Supabase project, using Supabase Edge Function secrets: `OPENAI_API_KEY`, `OPENAI_MODEL`, and `TRUSTED_WEB_ORIGINS`. Supabase provides the project URL and keys to Edge Functions. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only; the API uses it only after verifying the user's Supabase Auth identity and database role.
5. Deploy `api` to the preview Supabase project first. Point `TRUSTED_WEB_ORIGINS` at the exact preview origin (scheme + host, no path). In Supabase Auth URL Configuration, set the preview site URL and exact approved redirect URLs. Repeat for production after the permanent Firebase/custom domain exists. Add the exact `https://<project-id>.web.app` origin (and only the actual `firebaseapp.com` or custom domain used) to Auth redirects and `TRUSTED_WEB_ORIGINS`. Do not use a wildcard CORS origin.
6. Configure Grafana Cloud error monitoring before launch. Send redacted Supabase Edge Function logs through an approved log drain or supported integration; alert on 5xx rates, authentication/authorization failures, AI timeout/unavailable codes, and database/storage errors. The API currently logs only request ID and error type for unexpected failures; never forward prompts, notes, tokens, email addresses, or raw request/response bodies. Verify alert delivery with a synthetic event and inspect the ingested event for redaction. Supabase log drains and Grafana Cloud can have separate costs; confirm those costs before enabling them.
7. Add an error budget/billing alert in Firebase/Google Cloud and Supabase. Review usage dashboards after candidate smoke checks. Do not enable public student access until profile roles and course membership provisioning are confirmed.

## CI and release steps

`tests.yml` runs typecheck, unit/security/API/AI/auth tests, Cypress, and a production Expo static export on pushes and pull requests. `deploy.yml` is manual: it repeats verification, then deploys to the `candidate` preview channel or `live` Firebase channel. Choose `preview` first. The workflow builds with the variables from the selected GitHub Environment. All checks must finish before the deployment job can run; the production environment reviewer gate should be enabled in GitHub settings.

Current local supply-chain scan (2026-10-28) reports 13 advisories: 9 low, 3 moderate, and 1 high. A compatible PostCSS override removes its high findings. The remaining high finding is transitive `image-size` pulled by Metro; the advisory lists `2.0.3` as fixed, while Metro's declared range is 1.x and that fix is not currently a verified compatible release for this tree. CI gates on high-severity advisories, so candidate deployment remains blocked until Expo/Metro supplies a compatible fix or the finding is safely resolved and retested. Do not bypass the gate or force an Expo major downgrade to publish.

Supabase schema/function deployment is a separate operator step so a migration cannot run before backup and review. With the approved project linked, inspect and apply pending migrations, then deploy the API function:

```sh
supabase login
supabase link --project-ref <approved-project-ref>
supabase db push --dry-run
# Confirm backup freshness and migration review before applying:
supabase db push
supabase functions deploy api --project-ref <approved-project-ref>
```

Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and the environment's exact `TRUSTED_WEB_ORIGINS` through Supabase Dashboard → Edge Functions → Secrets or `supabase secrets set --env-file <secure-file> --project-ref <approved-project-ref>`. Keep that secure file out of the repository and remove it from the workstation after the update. Do not set `SUPABASE_*` reserved variables manually; Supabase injects project values. Do not deploy the optional `learning-assistant` adapter unless a client still uses it.

Before dispatching a production run:

1. Confirm the candidate URL, Auth callback allowlist, CORS origin, and Firebase custom domain match exactly.
2. Confirm database backup freshness and migration compatibility with both current and prior frontend builds. For production Supabase Pro/Team/Enterprise projects, Supabase documents daily backups; Free projects should make an off-site logical dump. Database backups do not include Storage object bytes. See [Supabase database backups](https://supabase.com/docs/guides/platform/backups).
3. Verify the candidate route directly and after browser refresh: `/`, `/login`, `/dashboard`, `/learn`, `/practice`, `/progress`, and `/assistant`. Check static assets load and errors remain readable/redacted.
4. Using an approved real student account, sign in, choose Continue session, save, refresh, and reopen the saved progress. Verify a different account cannot access the record. Test sign-out then a direct private route. Confirm an unavailable backend preserves the draft and exposes a Grafana alert.
5. Promote the verified candidate with the manual workflow's `live` destination. Re-run the real primary journey on the permanent domain immediately after deployment and inspect Firebase/Supabase/Grafana health.

The current Cypress suite uses mocked Auth/API responses; it is a repeatable UI check, not proof that production credentials, domain, policies, model, storage, monitoring, or billing are configured. Run `npm run test:integration` and `npm run test:integration:api` against isolated preview services before production.

## Rollback and restore

### Frontend rollback

Firebase Hosting preserves releases and supports rollback. From Firebase Console → Hosting → Release history, select the last known-good release and roll it back; or use the Firebase CLI's hosting rollback flow after confirming the exact project/site. Then verify `/login`, `/dashboard` refresh, static assets, and sign-in. Record the rolled-back release and incident time. A rollback is only safe if the database schema remains compatible with that client.

### Database recovery

Prefer additive/expand-contract migrations. Do not drop or reverse a production migration as part of a frontend rollback. For corrupted/missing data, notify the owner, stop writes if needed, and restore a Supabase daily backup/PITR snapshot to a recovery project first. Compare expected tables/row counts, validate account access, and separately recover Storage object bytes from the configured object backup. Only restore over production after an owner approves the data-loss window and the recovery project has been verified. Supabase notes that restoring a backup makes the project unavailable during restoration and that database backups do not restore later-deleted Storage objects.

For Free tier, schedule an off-site logical dump with the Supabase CLI and test restoring it to an isolated project; a database dump alone is not a Storage backup. Keep the backup outside the source repository, encrypt it at rest, limit access, and define retention with the data owner. Record the last backup time and last successful restore drill here after the service exists.

### Release owner checklist

- [ ] Firebase project/site and billing limits approved; GitHub production Environment reviewer configured.
- [ ] Preview and production Supabase projects/regions approved; migrations applied from a verified backup.
- [ ] Auth redirect URLs, exact CORS origins, role assignments, and course memberships checked.
- [ ] Edge secrets set in Supabase only; public Expo variables set for the matching Firebase environment.
- [ ] Candidate E2E and live integration/business-authorization checks pass.
- [ ] Grafana redaction and alert delivery tested; billing alerts set.
- [ ] Backup restore drill and Firebase rollback steps tested and recorded.
- [ ] Permanent-domain journey verified after promotion.
