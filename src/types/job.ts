export type JobStatus = "new" | "saved" | "rejected" | "applied";
export type MatchVerdict = "excellent" | "strong" | "possible" | "weak";
export type Recommendation = "apply" | "consider" | "skip";
export type WorkArrangement = "onsite" | "hybrid" | "remote";
export type EmploymentType = "internship" | "part-time" | "full-time" | "contract";
export type CompensationInterval = "hourly" | "yearly" | "monthly" | "weekly" | "unknown";

export interface JobEvaluation { id?:string; overallScore:number; skillScore:number; experienceScore:number; interestScore:number; locationScore:number; educationScore:number; companyScore?:number; compensationScore:number|null; verdict:MatchVerdict; recommendation:Recommendation; summary:string; matchingSkills:string[]; missingSkills:string[]; strengths:string[]; concerns:string[]; requirementGaps?:string[]; model?:string; promptVersion?:string; stale?:boolean; fixture?:boolean; }
export interface Job { id:string; externalId?:string; source?:string; sourceId?:string; company:string; title:string; category:string; location:string; workArrangement?:WorkArrangement; employmentType?:EmploymentType; description:string; salaryMin?:number; salaryMax?:number; salaryCurrency?:string; compensationInterval?:CompensationInterval; skills?:string[]; seniority?:string; sponsorship?:boolean; postedAt?:string; discoveredAt:string; sourceUrl:string; applyUrl?:string; status:JobStatus; isActive?:boolean; contentHash?:string; evaluation?:JobEvaluation; eligibility?:{eligible:boolean;reasons:string[]}; }
export interface UserProfile { fullName:string; school:string; degreeProgram:string; graduationYear:number|null; location:string; }
export interface JobPreferences { desiredTitles:string[]; desiredLocations:string[]; remotePreference:WorkArrangement|"flexible"; employmentTypes:EmploymentType[]; minimumSalary:number|null; preferredIndustries:string[]; preferredSkills:string[]; excludedKeywords:string[]; sponsorshipRequired:boolean; }
export interface UserSettings { profile:UserProfile; preferences:JobPreferences; }
export type CandidateSource="manual"|"resume"|"inferred";
export interface CandidateProfile { professionalSummary:string; yearsExperience:number|null; workAuthorization:string; requiresSponsorship:boolean|null; preferredRoleLevel:string; githubUrl:string; linkedinUrl:string; portfolioUrl:string; }
export interface CandidateSkill { id:string; skillName:string; proficiency:string; yearsExperience:number|null; source:CandidateSource; confirmed:boolean; }
export interface CandidateExperience { id:string; organization:string; title:string; startDate:string; endDate:string; isCurrent:boolean; location:string; description:string; skills:string[]; source:CandidateSource; confirmed:boolean; }
export interface CandidateProject { id:string; name:string; description:string; technologies:string[]; projectUrl:string; repositoryUrl:string; startDate:string; endDate:string; source:CandidateSource; confirmed:boolean; }
export interface CandidateEducation { id:string; institution:string; degree:string; programs:string[]; graduationDate:string; coursework:string[]; gpa:number|null; source:CandidateSource; confirmed:boolean; }
export interface CandidateResume { id:string; originalFilename:string; uploadedAt:string; parsedAt:string|null; parsingStatus:"uploaded"|"parsing"|"parsed"|"failed"; parsingError:string|null; importedProfile?:{professionalSummary:string;githubUrl:string;linkedinUrl:string;portfolioUrl:string}; }
export interface CandidateData { profile:CandidateProfile; skills:CandidateSkill[]; experiences:CandidateExperience[]; projects:CandidateProject[]; education:CandidateEducation[]; resume:CandidateResume|null; }
export interface JobQuery { page?:number; pageSize?:number; search?:string; status?:"all"|JobStatus; company?:string; source?:string; arrangement?:"all"|WorkArrangement; sort?:"match"|"posted"|"discovered"; }
export interface PaginatedJobs { jobs:Job[]; page:number; pageSize:number; total:number; hasMore:boolean; companies:string[]; sources:string[]; }
