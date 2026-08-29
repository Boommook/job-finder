import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createIngestionRunner } from "./runner";

export const { ingestSource, ingestEnabledSources } = createIngestionRunner(createAdminClient);
