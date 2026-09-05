import { AUTO_EVALUATION_SAFETY_CAP, isRecommended } from "./config";
import type { JobEvaluation } from "@/types/job";
import type { RecommendationState } from "./ranking";

export interface RecommendationCandidate { jobId:string; active:boolean; stale:boolean; hardEligible:boolean; inCandidatePool?:boolean; prefilterScore:number; freshness?:number; exclusionKinds?:string[]; hasValidEvaluation:boolean; validEvaluationRecommended?:boolean; dismissed?:boolean }
export interface RecommendationRunResult { considered:number; hardExcluded:number; locationExcluded:number; seniorityExcluded:number; experienceExcluded:number; belowThreshold:number; selected:number; evaluated:number; cacheReused:number; recommended:number; failures:{jobId:string;message:string}[] }
export interface DiscoveryStateUpdate { prefilterScore:number; requested:boolean; evaluated:boolean; recommendationState:RecommendationState; error?:string }

export async function runRecommendationSelection(candidates:RecommendationCandidate[],options:{limit:number;threshold:number;evaluate:(jobId:string)=>Promise<{cached:boolean;evaluation:JobEvaluation}>;persist:(jobId:string,state:DiscoveryStateUpdate)=>Promise<void>}):Promise<RecommendationRunResult>{
  const limit=Math.min(AUTO_EVALUATION_SAFETY_CAP,Math.max(0,options.limit));
  const result:RecommendationRunResult={considered:candidates.length,hardExcluded:0,locationExcluded:0,seniorityExcluded:0,experienceExcluded:0,belowThreshold:0,selected:0,evaluated:0,cacheReused:0,recommended:0,failures:[]};
  const selected:RecommendationCandidate[]=[];
  for(const item of [...candidates].sort((a,b)=>b.prefilterScore-a.prefilterScore||(b.freshness??0)-(a.freshness??0))){
    if(item.dismissed)continue;
    if(!item.active||item.stale||!item.hardEligible){result.hardExcluded++;if(item.exclusionKinds?.includes("location"))result.locationExcluded++;if(item.exclusionKinds?.includes("seniority"))result.seniorityExcluded++;if(item.exclusionKinds?.includes("experience"))result.experienceExcluded++;await options.persist(item.jobId,{prefilterScore:item.prefilterScore,requested:false,evaluated:false,recommendationState:"excluded"});continue}
    if(item.inCandidatePool===false){if(item.prefilterScore<options.threshold)result.belowThreshold++;await options.persist(item.jobId,{prefilterScore:item.prefilterScore,requested:false,evaluated:false,recommendationState:item.prefilterScore>=options.threshold?"candidate":"new"});continue}
    if(item.hasValidEvaluation){result.cacheReused++;if(item.validEvaluationRecommended)result.recommended++;await options.persist(item.jobId,{prefilterScore:item.prefilterScore,requested:false,evaluated:false,recommendationState:item.validEvaluationRecommended?"recommended":"evaluated"});continue}
    if(item.prefilterScore<options.threshold){result.belowThreshold++;await options.persist(item.jobId,{prefilterScore:item.prefilterScore,requested:false,evaluated:false,recommendationState:"new"});continue}
    if(selected.length<limit)selected.push(item);else await options.persist(item.jobId,{prefilterScore:item.prefilterScore,requested:false,evaluated:false,recommendationState:"candidate"});
  }
  result.selected=selected.length;
  for(const item of selected){try{const value=await options.evaluate(item.jobId);if(value.cached)result.cacheReused++;else result.evaluated++;const recommended=isRecommended(value.evaluation);if(recommended)result.recommended++;await options.persist(item.jobId,{prefilterScore:item.prefilterScore,requested:true,evaluated:!value.cached,recommendationState:recommended?"recommended":"evaluated"})}catch(error){const message=error instanceof Error?error.message:"Evaluation failed";result.failures.push({jobId:item.jobId,message});await options.persist(item.jobId,{prefilterScore:item.prefilterScore,requested:true,evaluated:false,recommendationState:"failed",error:message})}}
  return result;
}
