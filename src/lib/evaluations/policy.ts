import type { Job,JobPreferences } from "@/types/job";import { evaluateEligibility } from "@/lib/ingestion/eligibility";
export function mayUseAiEvaluation(job:Job,preferences:JobPreferences){return evaluateEligibility(job,preferences).eligible}
export function paginationRange(page:number,pageSize:number){const safePage=Math.max(1,page),safeSize=Math.min(50,Math.max(1,pageSize));return{from:(safePage-1)*safeSize,to:safePage*safeSize-1,page:safePage,pageSize:safeSize}}
