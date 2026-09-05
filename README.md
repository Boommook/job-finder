# Job Finder

## Phase 6: continuous public job discovery

Phase 6 expands the existing provider → normalization → persistence → recommendation architecture without coupling ingestion to AI. Supported public sources are Greenhouse, Lever, Ashby, SmartRecruiters, and Recruitee. SmartRecruiters was selected for its stable company postings JSON and broad enterprise coverage; Recruitee was selected for its documented public JSON job feed and direct careers/application URLs. Workday is deferred because external-site tenant/site/pagination variants require a more complex provider configuration; Workable, Jobvite, and BambooHR are deferred where reliable broad access would require credentials or brittle employer-specific HTML.

Sources remain database configuration in `job_sources`. Add a company with a validated provider enum and its provider-specific identifier (Greenhouse board token, Lever/Ashby/Recruitee subdomain, or SmartRecruiters company identifier). Identifiers are restricted to 1–100 letters, numbers, underscores, and hyphens. Adapters construct fixed HTTPS provider hosts; arbitrary URLs are never fetch targets. Disable a row by setting `enabled=false`. Phase 6 seeds 40 total boards spanning major technology, software/devtools, robotics, graphics/gaming, and startup employers; board ownership can change, so verify a source before enabling it in production.

Each provider posting has a durable `job_provenance` row keyed by `(source_id, external_id)`. Canonical jobs use a deterministic key: the same normalized employer ATS URL merges, or an exact normalized company + title + location + employment type + description fingerprint merges. A matching title alone never merges; materially different company, location, employment type, or description stays separate. Provenance, first seen, statuses, evaluations, and internal job IDs are retained. Apply links prefer an employer ATS application URL, then employer careers URL, then a third-party listing; no application is ever submitted.

Complete successful board scans deactivate missing provenance and close a canonical job only when no active provenance remains. Failed scans never close anything. Incomplete/paginated scans do not close missing postings. Jobs not confirmed for 14 days can become `stale`; history is never deleted and saved/applied status remains intact. Rediscovery updates the same provenance and canonical identity. "New" remains per-user and durable until detail is opened; list browsing does not set `viewed_at`.

Call `GET` or `POST /api/cron/ingest` with `Authorization: Bearer $CRON_SECRET`. Each invocation processes at most `INGESTION_MAX_SOURCES_PER_RUN` (default 8, hard cap 25), selecting least-recently-attempted enabled sources first so repeated calls rotate fairly. Sources run independently with a 20-second provider timeout and concise per-source diagnostics. Overlap is reduced by bounded rotation; deployments should schedule a single ingestion invocation at a time.

Call `GET` or `POST /api/cron/recommendations` with the same authorization. It processes the comma-separated `RECOMMENDATION_USER_IDS` (falling back to `INGESTION_ADMIN_USER_IDS`), bounded by `RECOMMENDATION_MAX_USERS_PER_RUN`, and reuses `runRecommendationsForUser()`. The existing hard eligibility → deterministic prefilter → bounded AI evaluation → ranking flow and evaluation cache remain unchanged. Ingestion never invokes OpenAI, and Phase 5's `AUTO_EVALUATION_LIMIT`, hard safety cap, prefilter threshold, description cap, and candidate scan cap still apply.

New server-only configuration:

```dotenv
INGESTION_MAX_SOURCES_PER_RUN=8
RECOMMENDATION_USER_IDS=your-auth-user-uuid
```

Run `supabase/migrations/20260830020000_phase_6_source_expansion.sql` after all Phase 5 migrations. The service-role key, OpenAI key, cron secret, and recommendation user IDs must never use a `NEXT_PUBLIC_` prefix. Supabase RLS keeps private user data private; authenticated users can only read shared source/provenance diagnostics. Job Finder does **not** scrape authenticated LinkedIn, Indeed, or Handshake accounts, does not use browser automation or embeddings, and never applies to jobs automatically. The user always follows the original employer link and applies manually.

## Phase 5: personalized recommendation agent

Run `supabase/migrations/20260830000000_phase_5_recommendations.sql` after Phase 4, followed by `supabase/migrations/20260830010000_phase_5_recommendations_cleanup.sql`. They add private `user_job_discovery` inbox state, recommendation-run diagnostics, and the globally filtered/ranked feed RPC. Discovery is separate from saved/rejected/applied status: `first_seen_at` is durable, list views only update `last_seen_at`/`surfaced_at`, and `viewed_at` is set only when a detail page is opened.

The pipeline is: real ATS job -> hard eligibility -> deterministic prefilter -> bounded selection -> Phase 4 AI evaluation -> persistent hash/version cache -> personalized ranking. The prefilter uses explicit title, skill, level, workplace, location, industry, compensation, and freshness signals without an LLM or embeddings. Recommended filtering occurs across the complete eligible set before pagination, using current `apply`/`consider` evaluations at or above `RECOMMENDED_SCORE_THRESHOLD`. New is likewise filtered before pagination and means `viewed_at is null`; `first_seen_at` never implies viewed. Normal match sorting and Recommended both rank the complete filtered set before pagination.

The shared ranking contract is documented in the cleanup migration and `src/lib/recommendations/ranking.ts`: a current evaluation ranks as `100 + overall score + recommendation boost + freshness`, with boosts of `apply +25`, `consider +12`, and `skip -20`; freshness contributes at most 15 points. A job without a current evaluation ranks as `min(prefilter score, 99) + freshness * 0.5`. Ties use discovered date and job ID. Recommendation state is `excluded` for automatic hard exclusions, `new` below the AI prefilter threshold, `candidate` above threshold without a valid evaluation, `evaluated` for a current non-recommendation, `recommended` for a current evaluation satisfying the centralized threshold/verdict rule, `failed` after an automatic evaluation error, and `dismissed` after explicit user rejection. Automatic runs never overwrite `dismissed`.

Cost controls live in `src/lib/recommendations/config.ts`. Runs default to 10 evaluations with an absolute cap of 25, scan at most 200 candidates, exclude closed/hard-ineligible/older-than-90-day jobs, apply a prefilter threshold, truncate descriptions, and check the Phase 4 cache first. Individual failures do not abort a batch. Model and token usage remain stored on `job_evaluations`.

```dotenv
CRON_SECRET=a-long-random-server-only-value
AUTO_EVALUATION_LIMIT=10
RECOMMENDED_SCORE_THRESHOLD=70
AI_PREFILTER_THRESHOLD=55
AI_MAX_JOB_DESCRIPTION_LENGTH=12000
RECOMMENDATION_MAX_USERS_PER_RUN=10
RECOMMENDATION_CANDIDATE_SCAN_LIMIT=200
RECOMMENDATION_ACTIVE_UNIVERSE_LIMIT=5000
```

Schedule ingestion with `GET` or `POST /api/cron/ingest` and `Authorization: Bearer $CRON_SECRET`. It calls the existing scheduler-neutral ingestion runner. `POST /api/recommendations/run` is a bounded per-user admin entry point: invoke while signed in as an ID in `INGESTION_ADMIN_USER_IDS`; it processes only that user. Future all-user scheduling should page opted-in user IDs with a durable cursor and fixed runtime budget while reusing this one-user service.

For development, sign in, open `/jobs`, and choose **Evaluate top jobs**. Open a job to mark it viewed. Inspect diagnostics with `select * from recommendation_runs order by started_at desc limit 20`. Matching candidate, job, and prompt hashes prevent repeated OpenAI spending.

Automatic here: protected scheduled ATS ingestion when invoked, discovery persistence, bounded/cached selection, and requested/admin-run evaluation. Not automatic: applications, form filling, tailored resumes or cover letters, browser automation, arbitrary scraping, notifications, embeddings, or training. Applications are never submitted automatically. Future notification delivery can consume discovery state without coupling itself to ingestion or evaluation.

A personal job-opportunity dashboard built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Phase 2

Phase 2 adds email/password authentication, Supabase/Postgres persistence, per-user durable job statuses, an editable profile and preference form, RLS-protected private data, and a deterministic 60-job development seed. The Phase 1 search, filters, sorting, responsive navigation, cards, and match-detail UI remain intact.

The UI talks to application/repository functions and Server Actions. Supabase-specific row mapping stays in `src/lib/jobs.ts`; UI components do not issue ad hoc database queries. The original 1,215-job generator remains in `src/data/mock-jobs.ts` as a development fixture and future ingestion test input, but is no longer loaded at runtime.

## Setup

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. In the project Connect/API settings, copy the Project URL and **publishable key** (not a secret/service-role key).
3. Copy `.env.example` to `.env.local` and populate:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. In the Supabase SQL Editor, run the complete contents of `supabase/migrations/20260828000000_phase_2.sql` once. This creates tables, indexes, triggers, grants, RLS, and policies.
5. In the SQL Editor, run `supabase/seed.sql` once. It inserts 60 deterministic, varied jobs and is safe to rerun.
6. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

7. Open `http://localhost:3000`. Missing environment variables redirect to a clear setup page.

`.env.local` is covered by `.env*` in `.gitignore`; `.env.example` is the only environment file intentionally tracked. The browser only receives Supabase's publishable key. No secret or service-role key is used.

## Authentication

Visit `/signup`, enter a name, email, and password of at least eight characters, then submit. Supabase creates private profile/preference rows through a database trigger. If Confirm email is enabled in Supabase Auth settings, use the confirmation link and then sign in at `/login`; if disabled for local testing, signup creates a session immediately and redirects to `/jobs`.

`proxy.ts` refreshes auth cookies and redirects unauthenticated requests for `/jobs`, job details, and `/settings` to `/login`. Server pages also verify the user. Sign out is available at the bottom of the desktop sidebar. RLS—not frontend routing—enforces that users can only access their own profile, preferences, and status rows. Authenticated users can read shared jobs.

To test isolation, create two accounts (a second private browser window is convenient), save a job and edit settings in the first, then sign in as the second. The second account sees the shared jobs but not the first account's statuses or private settings.

## Database model

- `profiles`: one private row per `auth.users` record
- `job_preferences`: one private preference row per user, with arrays for titles, locations, industries, skills, exclusions, and employment types
- `jobs`: shared normalized job records, source identity, URLs, compensation, skills, timestamps, and a JSON payload for the existing deterministic evaluation
- `user_job_statuses`: one row per user/job with `new`, `saved`, `rejected`, or `applied`

Rejected jobs are excluded by the repository from the normal feed. Saved and Applications navigation filter the current user's durable status. Status actions update optimistically and roll back with a readable error if persistence fails.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

## Assumptions and deferred work

The seed uses example.com URLs and deterministic match analyses so the existing dashboard can be tested without external systems. Salary values preserve Phase 1's hourly-style mock amounts; future ingestion can normalize compensation more deeply. Email confirmation behavior follows the Supabase project's Auth setting.

Intentionally deferred to later phases: Lever/Greenhouse/Ashby adapters, scraping and external APIs, deduplication execution, eligibility/ranking engines, AI analysis, scheduled scans, notifications, feedback-driven scoring, and tailored CV generation. The normalized `jobs` table, `source`/`external_id` uniqueness, `content_hash`, `raw_payload`, and repository boundary provide natural seams for that work without implementing it early.

## Phase 3: public ATS ingestion

Phase 3 adds server-only ingestion for the documented public Greenhouse Job Board API, Lever Postings API, and Ashby Public Job Posting API. `src/lib/ingestion/adapters` isolates provider response parsing; normalized records then flow through one persistence runner. Provider endpoints are generated from a validated provider and board identifier, never from a client-supplied URL. HTML descriptions are converted to plain text and the original provider JSON remains in `raw_payload`.

Run `supabase/migrations/20260828010000_phase_3_ingestion.sql` after the unchanged Phase 2 migration, then run `supabase/migrations/20260829000000_fix_job_identity.sql` (the idempotent development seed may be run afterward). The new migration removes the legacy `(source, external_id)` uniqueness constraint and preserves Phase 3's correct `(source_id, external_id)` identity. Phase 3 adds compensation intervals, active/last-seen lifecycle fields, `job_sources`, and concise `ingestion_runs` metadata. A successful complete source scan upserts by source configuration plus external ID, preserves the internal job UUID and all separate user statuses, and closes jobs missing from that board. A failed fetch records the error and never closes jobs. Malformed individual postings without required identity fields are reported and skipped without failing an otherwise valid board response. `content_hash` supplies a deterministic conservative comparison identity; cross-provider title-only merging is intentionally not performed.

The migration seeds 12 verified-format public boards: Linear, Notion, Ramp, Cursor, and Retool (Ashby); Cloudflare, Datadog, Anduril, and Highspot (Greenhouse); Palantir, Canva, and Zoox (Lever). Boards change over time; disable or remove a configuration if its company changes ATS.

Add these server-only settings to `.env.local`:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
INGESTION_ADMIN_USER_IDS=your-auth-user-uuid
```

Obtain the service-role key from the Supabase Dashboard under Project Settings / API. It bypasses RLS, must never use a `NEXT_PUBLIC_` prefix, and must never be committed. Find your UUID in Authentication / Users. Existing browser authentication continues to use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Run all enabled boards with `npm run ingest`, or one source with `npm run ingest -- <job_sources UUID>`. The CLI explicitly loads `.env.local` from the project root, matching Next.js environment-file behavior; run it from that root directory. The same framework-neutral runner powers the CLI and authenticated `/sources` controls. The Next.js entrypoint remains guarded by `server-only`, and `/sources` additionally requires the signed-in UUID in `INGESTION_ADMIN_USER_IDS`. Authenticated users have read-only RLS access to source/run status; no browser role can mutate ingestion tables or jobs.

Verify ingestion in Supabase with:

```sql
select company, title, source, source_id, external_id, is_active, last_seen_at
from public.jobs where source_id is not null order by discovered_at desc limit 25;
```

Mock rows have `external_id like 'mock-%'`, `source_id is null`, and example.com URLs. They remain available until explicitly removed; delete only those rows when ready. Real compensation is stored with its provider-supplied currency and `hourly`, `yearly`, `monthly`, `weekly`, or `unknown` interval—unknown values are not guessed.

`evaluateEligibility` is deterministic and conservative, and the `/jobs` discovery feed now applies it using the authenticated user's `job_preferences`. It excludes rejected/closed jobs and only applies employment, keyword, known workplace, known yearly minimum-compensation, and explicit sponsorship conflicts. Unknown facts remain eligible, and soft preferences such as desired titles and preferred skills are not hard exclusions. Saved and applied jobs remain accessible even if they later become inactive or ineligible; rejected jobs remain hidden.

Phase 3 does not use AI, analyze a résumé, generate résumés, rank with embeddings, apply automatically, scrape arbitrary sites, or schedule recurring scans. Existing seeded match analysis is fixture data, not a real personalized recommendation. Rich candidate skills, work history, education, projects, résumé content, and AI evaluation are deferred to Phase 4.

## Phase 4: candidate intelligence and personalized evaluation

Run `supabase/migrations/20260829010000_phase_4_candidate_ai.sql` after the three Phase 2/3 migrations listed above, followed by `supabase/migrations/20260829020000_phase_4_import_and_discovery.sql`. The second migration adds atomic, fingerprinted résumé imports plus database-side eligible-feed pagination and full-dataset facets. No previous migration is modified.

Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` to `.env.local`. The documented model default is `gpt-5-mini`. Neither variable uses `NEXT_PUBLIC_`. OpenAI calls are isolated in `src/lib/ai/provider.ts`, use the Responses API with strict Zod-backed Structured Outputs, have bounded retries/timeouts, and never run in browser code. Résumé and job text sent to the configured AI provider is used only for the user-requested parse or evaluation; authentication metadata, Supabase IDs, and unrelated settings are not sent.

Open `/profile` to upload a selectable-text PDF. The server validates type/size, generates a user-scoped path, uploads to the private bucket, extracts text without OCR, and requests a structured résumé extraction. Image-only or malformed files fail recoverably; OCR is intentionally not automatic. Imported skills, experience, projects, and education are marked by source and remain unconfirmed until reviewed; deterministic fingerprints make reprocessing idempotent without touching manual or confirmed records. Extracted summary and profile links are staged on the résumé for side-by-side review and only replace saved profile fields when the user explicitly accepts them. Candidate collection persistence and the final parsed status update run atomically.

On a real job detail page, `Evaluate this job` first runs deterministic hard eligibility. Closed, rejected, explicit sponsorship-incompatible, employment/workplace-incompatible, excluded-keyword, and known below-minimum jobs do not call AI. AI performs only soft fit/ranking: skill, project, coursework, experience, interest, location, compensation, and learnable-gap analysis. It cannot override a hard exclusion. Real jobs without an evaluation display **Not evaluated**, never a fake 0% score; Phase 2 fixture scores remain explicitly separate.

Evaluations persist with a normalized candidate/profile/preferences/résumé hash, job-content hash, and `phase4-v1` prompt version. A matching cache entry is reused without another API request. Candidate changes, résumé revisions, relevant job-content changes, or prompt-version changes mark prior output stale and expose `Re-evaluate`. Provider usage metadata is stored when returned. Candidate context and descriptions are compacted, and the visible-jobs batch is bounded to 25 sequential evaluations. It skips valid cache hits and hard-ineligible jobs; there is no automatic all-jobs batch.

The jobs feed requests at most 50 rows at a time from a database function that applies search, filters, deterministic hard eligibility, stable ordering, pagination, and the exact eligible count to the same dataset. Saved and applied jobs bypass inactive/hard-eligibility exclusions; rejected jobs remain hidden. Company and source facets use database-side distinct aggregation across the full relevant dataset rather than a 1,000-row sample. Feed descriptions are removed before data crosses the server/client boundary; detail pages fetch the full description separately. Global cross-page match ordering is deferred to Phase 5.

Validate with `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

Phase 4 intentionally defers tailored résumé generation, automated applications, recurring scheduled scans, OCR, arbitrary scraping, embeddings, and global/background evaluation of every job.
