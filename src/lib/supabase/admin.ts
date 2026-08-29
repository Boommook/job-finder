import "server-only";
import{createClient}from"@supabase/supabase-js";import type{Database}from"@/types/database";
export function createAdminClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Server ingestion requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");return createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
