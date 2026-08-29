export type JobStatus = "new" | "saved" | "rejected" | "applied";
export type MatchVerdict = "excellent" | "strong" | "possible" | "weak";
export type Recommendation = "apply" | "consider" | "skip";
export type WorkArrangement = "onsite" | "hybrid" | "remote";
export type EmploymentType = "internship" | "part-time" | "full-time" | "contract";
export type CompensationInterval = "hourly" | "yearly" | "monthly" | "weekly" | "unknown";

export interface JobEvaluation { overallScore:number; skillScore:number; experienceScore:number; interestScore:number; locationScore:number; educationScore:number; companyScore:number; compensationScore:number; verdict:MatchVerdict; recommendation:Recommendation; summary:string; matchingSkills:string[]; missingSkills:string[]; strengths:string[]; concerns:string[]; experienceRequirement?:string; }
export interface Job { id:string; externalId?:string; source?:string; company:string; title:string; category:string; location:string; workArrangement?:WorkArrangement; employmentType?:EmploymentType; description:string; salaryMin?:number; salaryMax?:number; salaryCurrency?:string; compensationInterval?:CompensationInterval; skills?:string[]; seniority?:string; sponsorship?:boolean; postedAt?:string; discoveredAt:string; sourceUrl:string; applyUrl?:string; status:JobStatus; isActive?:boolean; evaluation?:JobEvaluation; }
export interface UserProfile { fullName:string; school:string; degreeProgram:string; graduationYear:number|null; location:string; }
export interface JobPreferences { desiredTitles:string[]; desiredLocations:string[]; remotePreference:WorkArrangement|"flexible"; employmentTypes:EmploymentType[]; minimumSalary:number|null; preferredIndustries:string[]; preferredSkills:string[]; excludedKeywords:string[]; sponsorshipRequired:boolean; }
export interface UserSettings { profile:UserProfile; preferences:JobPreferences; }
