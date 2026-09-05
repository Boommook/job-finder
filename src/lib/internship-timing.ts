import type { InternshipSeason, Job } from "@/types/job";

export const internshipSeasons = ["any", "summer", "fall", "spring", "winter"] as const;

export function parseInternshipPreferences(season: string, year: string) {
  if (!internshipSeasons.includes(season as InternshipSeason)) throw new Error("Select a valid internship season.");
  const internshipYear = year.trim() ? Number(year) : null;
  if (internshipYear !== null && (!/^\d{4}$/.test(year.trim()) || internshipYear < 2000 || internshipYear > 2100)) {
    throw new Error("Enter an internship year between 2000 and 2100, or leave it blank.");
  }
  return { internshipSeason: season as InternshipSeason, internshipYear };
}

export function isInternship(job: Pick<Job, "title" | "employmentType">) {
  return job.employmentType === "internship" || (!job.employmentType && /\bintern(?:ship)?\b/i.test(job.title));
}

/** Description dates require explicit timing context; graduation requirements are not job dates. */
export function detectInternshipTiming(job: Pick<Job, "title" | "description" | "employmentType">) {
  const seasons = new Set<Exclude<InternshipSeason, "any">>();
  const years = new Set<number>();
  if (!isInternship(job)) return { seasons: [...seasons], years: [...years] };
  const seasonPattern = /\b(summer|fall|autumn|spring|winter)\b/gi;
  const addSeasons = (text: string) => {
    for (const match of text.matchAll(seasonPattern)) seasons.add(match[1].toLowerCase() === "autumn" ? "fall" : match[1].toLowerCase() as Exclude<InternshipSeason, "any">);
  };
  addSeasons(job.title);
  for (const match of job.title.matchAll(/\b20\d{2}\b/g)) years.add(Number(match[0]));
  for (const sentence of job.description.split(/[.!?;\n]+/)) {
    if (/\b(graduat\w*|class of|enroll\w*|degree)\b/i.test(sentence)) continue;
    const explicit = /\b(?:(?:summer|fall|autumn|spring|winter|internship|intern)\s+(?:(?:of|in|for)\s+)?(20\d{2})|(20\d{2})\s+(?:summer|fall|autumn|spring|winter|internship|intern))\b/gi;
    for (const match of sentence.matchAll(explicit)) {
      years.add(Number(match[1] ?? match[2]));
      addSeasons(match[0]);
    }
    if (/\bintern(?:ship)?s?\b/i.test(sentence) || /\b(?:during|starts? in|runs? (?:in|through)|for the)\s+(?:summer|fall|autumn|spring|winter)\b/i.test(sentence)) addSeasons(sentence);
  }
  return { seasons: [...seasons], years: [...years] };
}
