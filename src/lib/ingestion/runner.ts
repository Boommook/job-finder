import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { getAdapter } from "./adapters";
import type { JobSourceProvider, SourceConfig } from "./types";

type AdminClientFactory = () => SupabaseClient<Database>;
type RpcResult = { data: Json | null; error: { message: string } | null };
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
export const INGESTION_MAX_SOURCES_SAFETY_CAP = 25;

const integer = (value:string|undefined,fallback:number,min:number,max:number) => {
  const parsed=Number(value); return Number.isInteger(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
};
export const ingestionMaxSources=()=>integer(process.env.INGESTION_MAX_SOURCES_PER_RUN,8,1,INGESTION_MAX_SOURCES_SAFETY_CAP);
const message=(error:unknown)=>error instanceof Error?error.message:"Unknown ingestion error";

export function selectFairSources<T extends {enabled:boolean;lastSuccessfulRun?:string|null;lastAttemptedRun?:string|null}>(sources:T[],limit:number){
  return sources.filter(x=>x.enabled).sort((a,b)=>(a.lastAttemptedRun??a.lastSuccessfulRun??"").localeCompare(b.lastAttemptedRun??b.lastSuccessfulRun??"")).slice(0,limit);
}

export function createIngestionRunner(createAdminClient:AdminClientFactory){
  async function ingestSource(source:SourceConfig){
    if(!IDENTIFIER.test(source.boardIdentifier))throw new Error("Invalid board identifier");
    const db=createAdminClient();
    const {data:run,error:runError}=await db.from("ingestion_runs").insert({source_id:source.id}).select("id").single();
    if(runError)throw new Error(runError.message);
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);let scan;
      try{scan=await getAdapter(source.provider).fetchJobs(source,controller.signal)}finally{clearTimeout(timer)}
      const payload=scan.jobs.map(job=>({external_id:job.externalId,source:job.provider,source_url:job.sourceUrl,application_url:job.applicationUrl??null,company:job.company,title:job.title,description:job.description,location:job.location,workplace_type:job.workplaceType??null,employment_type:job.employmentType??null,salary_min:job.salaryMin??null,salary_max:job.salaryMax??null,salary_currency:job.salaryCurrency??null,compensation_interval:job.compensationInterval,skills:job.skills,seniority:job.seniority??null,sponsorship:job.sponsorship??null,posted_at:job.postedAt??null,raw_payload:job.rawPayload,content_hash:job.contentHash,canonical_key:job.canonicalKey}));
      const rpc=db.rpc as unknown as (fn:string,args:Record<string,unknown>)=>Promise<RpcResult>;
      const {data,error}=await rpc("persist_ingestion_scan",{p_source_id:source.id,p_jobs:payload as Json,p_complete:scan.complete});
      if(error)throw new Error(error.message);
      const counts=(data??{})as Record<string,number>,now=new Date().toISOString();
      await Promise.all([db.from("job_sources").update({last_scanned_at:now,last_success_at:now,last_error:null}).eq("id",source.id),db.from("ingestion_runs").update({completed_at:now,status:"succeeded",fetched_count:scan.jobs.length,inserted_count:counts.inserted??0,updated_count:counts.updated??0,deactivated_count:counts.deactivated??0}).eq("id",run.id)]);
      return{sourceId:source.id,ok:true as const,complete:scan.complete,fetched:scan.jobs.length,inserted:counts.inserted??0,updated:counts.updated??0,deactivated:counts.deactivated??0};
    }catch(error){
      const now=new Date().toISOString(),errorText=message(error).slice(0,1000);
      await Promise.all([db.from("job_sources").update({last_scanned_at:now,last_error:errorText}).eq("id",source.id),db.from("ingestion_runs").update({completed_at:now,status:"failed",error_message:errorText}).eq("id",run.id)]);
      return{sourceId:source.id,ok:false as const,error:errorText};
    }
  }
  async function ingestEnabledSources(sourceId?:string){
    const db=createAdminClient();let query=db.from("job_sources").select("id,provider,company_name,board_identifier,enabled,last_success_at,last_scanned_at").eq("enabled",true);if(sourceId)query=query.eq("id",sourceId);
    const{data,error}=await query;if(error)throw new Error(error.message);
    const selected=sourceId?(data??[]):selectFairSources((data??[]).map(x=>({...x,lastSuccessfulRun:x.last_success_at,lastAttemptedRun:x.last_scanned_at})),ingestionMaxSources());
    const results=[];for(const item of selected)results.push(await ingestSource({id:item.id,provider:item.provider as JobSourceProvider,companyName:item.company_name,boardIdentifier:item.board_identifier,enabled:item.enabled}));return results;
  }
  return{ingestSource,ingestEnabledSources};
}
