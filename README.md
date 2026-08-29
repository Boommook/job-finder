# Job Finder

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

Run all enabled boards with `npm run ingest`, or one source with `npm run ingest -- <job_sources UUID>`. The same runner powers authenticated `/sources` controls, which additionally require the signed-in UUID in `INGESTION_ADMIN_USER_IDS`. Authenticated users have read-only RLS access to source/run status; no browser role can mutate ingestion tables or jobs.

Verify ingestion in Supabase with:

```sql
select company, title, source, source_id, external_id, is_active, last_seen_at
from public.jobs where source_id is not null order by discovered_at desc limit 25;
```

Mock rows have `external_id like 'mock-%'`, `source_id is null`, and example.com URLs. They remain available until explicitly removed; delete only those rows when ready. Real compensation is stored with its provider-supplied currency and `hourly`, `yearly`, `monthly`, `weekly`, or `unknown` interval—unknown values are not guessed.

`evaluateEligibility` is deterministic and conservative, and the `/jobs` discovery feed now applies it using the authenticated user's `job_preferences`. It excludes rejected/closed jobs and only applies employment, keyword, known workplace, known yearly minimum-compensation, and explicit sponsorship conflicts. Unknown facts remain eligible, and soft preferences such as desired titles and preferred skills are not hard exclusions. Saved and applied jobs remain accessible even if they later become inactive or ineligible; rejected jobs remain hidden.

Phase 3 does not use AI, analyze a résumé, generate résumés, rank with embeddings, apply automatically, scrape arbitrary sites, or schedule recurring scans. Existing seeded match analysis is fixture data, not a real personalized recommendation. Rich candidate skills, work history, education, projects, résumé content, and AI evaluation are deferred to Phase 4.
