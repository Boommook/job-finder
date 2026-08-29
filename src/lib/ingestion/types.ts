import type { CompensationInterval, EmploymentType, WorkArrangement } from "@/types/job";
import type { Json } from "@/types/database";

export type JobSourceProvider = "greenhouse" | "lever" | "ashby";
export interface SourceConfig { id:string; provider:JobSourceProvider; companyName:string; boardIdentifier:string; enabled:boolean }
export interface NormalizedJobInput { externalId:string; provider:JobSourceProvider; company:string; title:string; description:string; location:string; workplaceType?:WorkArrangement; employmentType?:EmploymentType; applicationUrl?:string; sourceUrl:string; postedAt?:string; discoveredAt:string; skills:string[]; salaryMin?:number; salaryMax?:number; salaryCurrency?:string; compensationInterval:CompensationInterval; seniority?:string; sponsorship?:boolean; rawPayload:Json; contentHash:string }
export interface JobSourceAdapter { readonly source:JobSourceProvider; fetchJobs(source:SourceConfig, signal:AbortSignal):Promise<NormalizedJobInput[]> }
export interface EligibilityResult { eligible:boolean; reasons:string[] }
