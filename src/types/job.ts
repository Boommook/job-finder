export type JobStatus = "discovered" | "saved" | "applying" | "applied" | "interview" | "rejected" | "offer" | "archived";
export type MatchVerdict = "excellent" | "strong" | "possible" | "weak";
export type Recommendation = "apply" | "consider" | "skip";
export type WorkArrangement = "onsite" | "hybrid" | "remote";
export type EmploymentType = "internship" | "part-time" | "full-time" | "contract";
export interface JobEvaluation { overallScore:number; skillScore:number; experienceScore:number; interestScore:number; locationScore:number; educationScore:number; companyScore:number; compensationScore:number; verdict:MatchVerdict; recommendation:Recommendation; summary:string; matchingSkills:string[]; missingSkills:string[]; strengths:string[]; concerns:string[]; experienceRequirement?:string; }
export interface Job { id:string; externalId?:string; source?:string; company:string; title:string; category:string; location:string; workArrangement?:WorkArrangement; employmentType?:EmploymentType; description:string; salaryMin?:number; salaryMax?:number; postedAt?:string; discoveredAt:string; sourceUrl:string; applyUrl?:string; status:JobStatus; evaluation?:JobEvaluation; }
