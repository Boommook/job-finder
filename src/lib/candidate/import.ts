import { createHash } from "node:crypto";
import type { CandidateResumeExtraction } from "@/lib/ai/schemas";
import { normalizeResumeDate } from "@/lib/candidate/resume-date";

function normalized(value:unknown):unknown {
  if (typeof value === "string") return value.trim().replace(/\s+/g," ").toLowerCase();
  if (Array.isArray(value)) return value.map(normalized).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,normalized(item)]));
  return value ?? null;
}

export function importFingerprint(kind:"experience"|"project"|"education",value:unknown):string {
  return createHash("sha256").update(JSON.stringify(normalized({kind,value}))).digest("hex");
}

export function resumeImportPayload(extraction:CandidateResumeExtraction) {
  return {
    ...extraction,
    experiences:extraction.experiences.map(item=>{const value={...item,startDate:normalizeResumeDate(item.startDate),endDate:normalizeResumeDate(item.endDate)};return{...value,fingerprint:importFingerprint("experience",value)}}),
    projects:extraction.projects.map(item=>{const value={...item,startDate:normalizeResumeDate(item.startDate),endDate:normalizeResumeDate(item.endDate)};return{...value,fingerprint:importFingerprint("project",value)}}),
    education:extraction.education.map(item=>{const value={...item,graduationDate:normalizeResumeDate(item.graduationDate)};return{...value,fingerprint:importFingerprint("education",value)}}),
  };
}
