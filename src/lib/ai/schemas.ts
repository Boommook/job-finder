import { z } from "zod";

const nullableText = z.string().nullable();
export const resumeDateSchema = z.object({
  precision: z.enum(["day","month","year","present","unknown"]),
  year: z.number().int().min(1900).max(2200).nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  day: z.number().int().min(1).max(31).nullable(),
  raw: nullableText,
}).strict().superRefine((value,context)=>{
  const expected=value.precision==="day"?[true,true,true]:value.precision==="month"?[true,true,false]:value.precision==="year"?[true,false,false]:[false,false,false];
  const actual=[value.year!==null,value.month!==null,value.day!==null];
  if(expected.some((required,index)=>required!==actual[index]))context.addIssue({code:"custom",message:`Date components do not match ${value.precision} precision.`});
  if(value.precision==="day"&&value.year!==null&&value.month!==null&&value.day!==null){const date=new Date(Date.UTC(value.year,value.month-1,value.day));if(date.getUTCFullYear()!==value.year||date.getUTCMonth()!==value.month-1||date.getUTCDate()!==value.day)context.addIssue({code:"custom",message:"Invalid calendar date."});}
});
export type ResumeDate=z.infer<typeof resumeDateSchema>;
export const resumeExtractionSchema = z.object({
  summary: nullableText,
  skills: z.array(z.object({ name:z.string(), proficiency:nullableText, yearsExperience:z.number().min(0).nullable(), confidence:z.enum(["explicit","inferred"]) })),
  experiences: z.array(z.object({ organization:z.string(), title:z.string(), startDate:resumeDateSchema, endDate:resumeDateSchema, isCurrent:z.boolean(), location:nullableText, description:nullableText, skills:z.array(z.string()) })),
  projects: z.array(z.object({ name:z.string(), description:nullableText, technologies:z.array(z.string()), projectUrl:nullableText, repositoryUrl:nullableText, startDate:resumeDateSchema, endDate:resumeDateSchema })),
  education: z.array(z.object({ institution:z.string(), degree:nullableText, programs:z.array(z.string()), graduationDate:resumeDateSchema, coursework:z.array(z.string()), gpa:z.number().min(0).max(5).nullable() })),
  links: z.object({ github:nullableText, linkedin:nullableText, portfolio:nullableText }),
  uncertainties: z.array(z.string()),
}).strict();
export type CandidateResumeExtraction=z.infer<typeof resumeExtractionSchema>;

export const jobEvaluationSchema = z.object({
  overallScore:z.number().int().min(0).max(100), skillScore:z.number().int().min(0).max(100),
  experienceScore:z.number().int().min(0).max(100), educationScore:z.number().int().min(0).max(100),
  interestScore:z.number().int().min(0).max(100), locationScore:z.number().int().min(0).max(100),
  compensationScore:z.number().int().min(0).max(100).nullable(), verdict:z.enum(["excellent","strong","possible","weak"]),
  recommendation:z.enum(["apply","consider","skip"]), summary:z.string().min(1).max(1200),
  matchingSkills:z.array(z.string()), missingSkills:z.array(z.string()), strengths:z.array(z.string()),
  concerns:z.array(z.string()), requirementGaps:z.array(z.string()),
}).strict();
export type StructuredJobEvaluation=z.infer<typeof jobEvaluationSchema>;
