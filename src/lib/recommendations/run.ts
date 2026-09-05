import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentServiceClient } from "@/lib/supabase/service-context";
import { getCandidateData } from "@/lib/candidate/repository";
import { candidateProfileHash } from "@/lib/candidate/hash";
import { EVALUATION_PROMPT_VERSION } from "@/lib/ai/prompts";
import { evaluateJobForUserDetailed } from "@/lib/evaluations/service";
import { getPreferences } from "@/lib/jobs";
import { evaluateEligibility } from "@/lib/ingestion/eligibility";
import { prefilterJob } from "./prefilter";
import { isRecommended, recommendationConfig } from "./config";
import { runRecommendationSelection } from "./engine";
import type { EmploymentType, Job, JobEvaluation, WorkArrangement } from "@/types/job";
import type { Database, Json } from "@/types/database";

type JobRow=Database["public"]["Tables"]["jobs"]["Row"];
const category=(raw:Json|null)=>raw&&!Array.isArray(raw)&&typeof raw==="object"&&typeof raw.category==="string"?raw.category:"Other";
const mapJob=(row:JobRow):Job=>({id:row.id,externalId:row.external_id??undefined,source:row.source,sourceId:row.source_id??undefined,sourceUrl:row.source_url,applyUrl:row.application_url??undefined,company:row.company,title:row.title,description:row.description,category:category(row.raw_payload),location:row.location,workArrangement:row.workplace_type as WorkArrangement|undefined,employmentType:row.employment_type as EmploymentType|undefined,salaryMin:row.salary_min??undefined,salaryMax:row.salary_max??undefined,salaryCurrency:row.salary_currency??undefined,compensationInterval:row.compensation_interval as Job["compensationInterval"],skills:row.skills,seniority:row.seniority??undefined,sponsorship:row.sponsorship??undefined,postedAt:row.posted_at??undefined,discoveredAt:row.discovered_at,status:"new",isActive:row.is_active,contentHash:row.content_hash??undefined});

async function loadActiveJobs(db:Awaited<ReturnType<typeof createClient>>):Promise<Job[]>{
  const pageSize=1_000,rows:JobRow[]=[];
  while(rows.length<recommendationConfig.activeUniverseLimit){
    const end=Math.min(rows.length+pageSize,recommendationConfig.activeUniverseLimit)-1;
    const {data,error}=await db.from("jobs").select("*").eq("is_active",true).order("id",{ascending:true}).range(rows.length,end);
    if(error)throw new Error("Unable to load recommendation candidates.");
    const page=data??[];rows.push(...page);if(page.length<pageSize)break;
  }
  return rows.map(mapJob);
}

export async function runRecommendationsForUser(userId:string,requestedLimit=recommendationConfig.autoEvaluationLimit){
  const serviceClient=currentServiceClient(),db=await createClient(),started=new Date().toISOString(),{data:run,error:runError}=await db.from("recommendation_runs").insert({user_id:userId,started_at:started}).select("id").single();if(runError)throw new Error("Unable to start recommendation run.");
  try{
    const[candidate,preferences,jobs]=await Promise.all([getCandidateData(userId),getPreferences(userId),loadActiveJobs(db)]);
    const analyzed=jobs.map(job=>{const hard=evaluateEligibility(job,preferences,candidate),prefilter=prefilterJob(job,preferences,candidate),freshness=new Date(job.postedAt??job.discoveredAt).getTime();return{job,hard,prefilter,freshness:Number.isFinite(freshness)?freshness:0}});
    const plausibleIds=analyzed.filter(x=>x.hard.eligible).sort((a,b)=>b.prefilter.score-a.prefilter.score||b.freshness-a.freshness).slice(0,recommendationConfig.plausibleCandidateLimit).map(x=>x.job.id);
    const profileHash=candidateProfileHash({candidate,preferences});
    const[{data:evaluations},{data:discovery}]=await Promise.all([plausibleIds.length?db.from("job_evaluations").select("*").eq("user_id",userId).in("job_id",plausibleIds).order("created_at",{ascending:false}):Promise.resolve({data:[]}),plausibleIds.length?db.from("user_job_discovery").select("job_id,recommendation_state").eq("user_id",userId).in("job_id",plausibleIds):Promise.resolve({data:[]})]);
    const jobById=new Map(jobs.map(job=>[job.id,job])),valid=new Map<string,JobEvaluation>();
    for(const row of evaluations??[]){if(valid.has(row.job_id)||row.candidate_profile_hash!==profileHash||row.prompt_version!==EVALUATION_PROMPT_VERSION||row.job_content_hash!==jobById.get(row.job_id)?.contentHash)continue;valid.set(row.job_id,{overallScore:row.overall_score,skillScore:row.skill_score,experienceScore:row.experience_score,educationScore:row.education_score,interestScore:row.interest_score,locationScore:row.location_score,compensationScore:row.compensation_score,recommendation:row.recommendation,verdict:row.verdict,summary:row.summary,matchingSkills:row.matching_skills,missingSkills:row.missing_skills,strengths:row.strengths,concerns:row.concerns,requirementGaps:row.requirement_gaps})}
    const plausibleSet=new Set(plausibleIds),dismissed=new Set((discovery??[]).filter(x=>x.recommendation_state==="dismissed").map(x=>x.job_id)),reasonMap=new Map(analyzed.map(x=>[x.job.id,x.prefilter.reasons]));
    const candidates=analyzed.map(({job,hard,prefilter,freshness})=>{const age=(Date.now()-freshness)/86_400_000,evaluation=valid.get(job.id);return{jobId:job.id,active:job.isActive!==false,stale:age>90,hardEligible:hard.eligible,inCandidatePool:plausibleSet.has(job.id),prefilterScore:prefilter.score,freshness,exclusionKinds:hard.exclusions,hasValidEvaluation:Boolean(evaluation),validEvaluationRecommended:evaluation?isRecommended(evaluation):false,dismissed:dismissed.has(job.id)}});
    const result=await runRecommendationSelection(candidates,{limit:requestedLimit,threshold:recommendationConfig.aiPrefilterThreshold,evaluate:jobId=>evaluateJobForUserDetailed(userId,jobId),persist:async(jobId,state)=>{const common={p_job_id:jobId,p_prefilter_score:state.prefilterScore,p_prefilter_reasons:reasonMap.get(jobId)??[],p_recommendation_state:state.recommendationState,p_requested:state.requested,p_evaluated:state.evaluated,p_error:state.error?.slice(0,1000)??null},response=serviceClient?await db.rpc("update_recommendation_discovery_for_user",{p_user_id:userId,...common}):await db.rpc("update_recommendation_discovery",common),error=response.error;if(error){console.error("Unable to update recommendation discovery state.",{code:error.code,message:error.message,details:error.details,hint:error.hint});throw new Error("Unable to update recommendation discovery state.")}}});
    await db.from("recommendation_runs").update({completed_at:new Date().toISOString(),status:result.failures.length?"partial":"succeeded",considered_count:result.considered,active_jobs_scanned_count:jobs.length,hard_excluded_count:result.hardExcluded,location_excluded_count:result.locationExcluded,seniority_excluded_count:result.seniorityExcluded,experience_excluded_count:result.experienceExcluded,below_threshold_count:result.belowThreshold,selected_count:result.selected,evaluated_count:result.evaluated,cache_reused_count:result.cacheReused,recommended_count:result.recommended,failure_count:result.failures.length,error_message:result.failures.length?`${result.failures.length} evaluation(s) failed.`:null}).eq("id",run.id);return result;
  }catch(error){await db.from("recommendation_runs").update({completed_at:new Date().toISOString(),status:"failed",error_message:(error instanceof Error?error.message:"Recommendation run failed").slice(0,1000)}).eq("id",run.id);throw error}
}
