import { z } from "zod";

const nullableText = z.string().nullable();
export const resumeExtractionSchema = z.object({
  summary: nullableText,
  skills: z.array(z.object({ name:z.string(), proficiency:nullableText, yearsExperience:z.number().min(0).nullable(), confidence:z.enum(["explicit","inferred"]) })),
  experiences: z.array(z.object({ organization:z.string(), title:z.string(), startDate:nullableText, endDate:nullableText, isCurrent:z.boolean(), location:nullableText, description:nullableText, skills:z.array(z.string()) })),
  projects: z.array(z.object({ name:z.string(), description:nullableText, technologies:z.array(z.string()), projectUrl:nullableText, repositoryUrl:nullableText, startDate:nullableText, endDate:nullableText })),
  education: z.array(z.object({ institution:z.string(), degree:nullableText, programs:z.array(z.string()), graduationDate:nullableText, coursework:z.array(z.string()), gpa:z.number().min(0).max(5).nullable() })),
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
