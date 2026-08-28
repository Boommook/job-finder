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
