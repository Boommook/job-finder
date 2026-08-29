import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createIngestionRunner } from "../src/lib/ingestion/runner";
import type { Database } from "../src/types/database";

loadEnvConfig(process.cwd());

function createCliAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CLI ingestion requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const { ingestEnabledSources } = createIngestionRunner(createCliAdminClient);
const sourceId = process.argv[2];
ingestEnabledSources(sourceId).then((results) => { console.table(results); if (results.some((result) => !result.ok)) process.exitCode = 1; }).catch((error) => { console.error(error); process.exitCode = 1; });
