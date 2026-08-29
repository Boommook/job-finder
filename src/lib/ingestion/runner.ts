import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter } from "./adapters";
import type { JobSourceProvider, NormalizedJobInput, SourceConfig } from "./types";
import type { Database } from "@/types/database";

type AdminClientFactory = () => SupabaseClient<Database>;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
function message(error: unknown) { return error instanceof Error ? error.message : "Unknown ingestion error"; }
function row(job: NormalizedJobInput, sourceId: string) { return { source_id: sourceId, external_id: job.externalId, source: job.provider, source_url: job.sourceUrl, application_url: job.applicationUrl ?? null, company: job.company, title: job.title, description: job.description, location: job.location, workplace_type: job.workplaceType ?? null, employment_type: job.employmentType ?? null, salary_min: job.salaryMin ?? null, salary_max: job.salaryMax ?? null, salary_currency: job.salaryCurrency ?? null, compensation_interval: job.compensationInterval, skills: job.skills, seniority: job.seniority ?? null, sponsorship: job.sponsorship ?? null, posted_at: job.postedAt ?? null, last_seen_at: new Date().toISOString(), is_active: true, raw_payload: job.rawPayload, content_hash: job.contentHash }; }

export function createIngestionRunner(createAdminClient: AdminClientFactory) {
  async function ingestSource(source: SourceConfig) {
    if (!IDENTIFIER.test(source.boardIdentifier)) throw new Error("Invalid board identifier");
    const db = createAdminClient(), { data: run, error: runError } = await db.from("ingestion_runs").insert({ source_id: source.id }).select("id").single();
    if (runError) throw new Error(runError.message);
    try {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
      let jobs: NormalizedJobInput[];
      try { jobs = await getAdapter(source.provider).fetchJobs(source, controller.signal); } finally { clearTimeout(timer); }
      const ids = jobs.map((job) => job.externalId), { data: existing, error: existingError } = await db.from("jobs").select("external_id").eq("source_id", source.id).in("external_id", ids.length ? ids : ["__none__"]);
      if (existingError) throw new Error(existingError.message);
      const known = new Set((existing ?? []).map((value) => value.external_id)), { error: upsertError } = await db.from("jobs").upsert(jobs.map((job) => row(job, source.id)), { onConflict: "source_id,external_id" });
      if (upsertError) throw new Error(upsertError.message);
      const staleQuery = db.from("jobs").update({ is_active: false }).eq("source_id", source.id).eq("is_active", true);
      const { data: stale, error: staleError } = ids.length ? await staleQuery.not("external_id", "in", `(${ids.map((id) => `\"${id.replaceAll('"', "")}\"`).join(",")})`).select("id") : await staleQuery.select("id");
      if (staleError) throw new Error(staleError.message);
      const now = new Date().toISOString(), inserted = jobs.filter((job) => !known.has(job.externalId)).length;
      await Promise.all([db.from("job_sources").update({ last_scanned_at: now, last_success_at: now, last_error: null }).eq("id", source.id), db.from("ingestion_runs").update({ completed_at: now, status: "succeeded", fetched_count: jobs.length, inserted_count: inserted, updated_count: jobs.length - inserted, deactivated_count: stale?.length ?? 0 }).eq("id", run.id)]);
      return { sourceId: source.id, ok: true as const, fetched: jobs.length, inserted, updated: jobs.length - inserted, deactivated: stale?.length ?? 0 };
    } catch (error) {
      const now = new Date().toISOString(), errorText = message(error).slice(0, 1000);
      await Promise.all([db.from("job_sources").update({ last_scanned_at: now, last_error: errorText }).eq("id", source.id), db.from("ingestion_runs").update({ completed_at: now, status: "failed", error_message: errorText }).eq("id", run.id)]);
      return { sourceId: source.id, ok: false as const, error: errorText };
    }
  }
  async function ingestEnabledSources(sourceId?: string) {
    const db = createAdminClient();
    let query = db.from("job_sources").select("id,provider,company_name,board_identifier,enabled").eq("enabled", true);
    if (sourceId) query = query.eq("id", sourceId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const results = [];
    for (const item of data ?? []) results.push(await ingestSource({ id: item.id, provider: item.provider as JobSourceProvider, companyName: item.company_name, boardIdentifier: item.board_identifier, enabled: item.enabled }));
    return results;
  }
  return { ingestSource, ingestEnabledSources };
}
