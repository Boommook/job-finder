import test from "node:test";
import assert from "node:assert/strict";
import { detectInternshipTiming, parseInternshipPreferences } from "./internship-timing";
import { evaluateEligibility } from "./ingestion/eligibility";
import { prefilterJob } from "./recommendations/prefilter";
import { candidateProfileHash, isEvaluationCacheValid } from "./candidate/hash";
import { mayUseAiEvaluation } from "./evaluations/policy";
import type { CandidateData, Job, JobPreferences } from "@/types/job";

const preferences: JobPreferences = { internshipSeason: "summer", internshipYear: 2027, desiredTitles: [], desiredLocations: [], remotePreference: "flexible", employmentTypes: [], minimumSalary: null, preferredIndustries: [], preferredSkills: [], excludedKeywords: [], sponsorshipRequired: false };
const candidate = { profile: { preferredRoleLevel: "" }, skills: [] } as unknown as Pick<CandidateData, "profile" | "skills">;
const job = (title: string, description = ""): Job => ({ id: "1", title, description, company: "Acme", category: "Software", location: "Boston", employmentType: "internship", isActive: true, status: "new", discoveredAt: "2026-09-01", sourceUrl: "https://example.com" });

for (const title of ["Summer 2027 Software Engineering Intern", "2027 Summer Software Intern", "Software Engineer Intern"]) {
  test(`${title} stays eligible for Summer 2027`, () => assert.equal(evaluateEligibility(job(title), preferences).eligible, true));
}
for (const [title, reason] of [
  ["Fall 2027 Software Engineering Intern", "Internship season fall does not match summer"],
  ["Spring 2027 Intern", "Internship season spring does not match summer"],
  ["Summer 2026 Intern", "Internship year 2026 does not match 2027"],
  ["Summer 2028 Intern", "Internship year 2028 does not match 2027"],
]) {
  test(`${title} is excluded before AI evaluation`, () => {
    assert.ok(evaluateEligibility(job(title), preferences).reasons.includes(reason));
    assert.equal(mayUseAiEvaluation(job(title), preferences), false);
    assert.equal(prefilterJob(job(title), preferences, candidate).eligible, false);
  });
}
test("autumn is fall and winter is recognized", () => {
  assert.deepEqual(detectInternshipTiming(job("Autumn 2027 Intern")), { seasons: ["fall"], years: [2027] });
  assert.deepEqual(detectInternshipTiming(job("Winter 2027 Intern")), { seasons: ["winter"], years: [2027] });
});
test("explicit description timing is detected but graduation and unrelated years are ignored", () => {
  for (const description of ["Summer 2027", "2027 Summer", "2027 Internship", "Internship 2027"]) assert.deepEqual(detectInternshipTiming(job("Software Intern", description)).years, [2027]);
  assert.deepEqual(detectInternshipTiming(job("Software Intern", "Must graduate in Summer 2028. Founded in 2020. Copyright 2026.")), { seasons: [], years: [] });
  assert.equal(evaluateEligibility(job("Summer 2027 Intern", "Graduating in Spring 2028 required."), preferences).eligible, true);
});
test("multiple offered seasons and years allow a matching option", () => {
  assert.equal(evaluateEligibility(job("Summer/Fall 2027/2028 Intern"), preferences).eligible, true);
});
test("season and year add modest independent ranking boosts; unknown timing has no penalty", () => {
  const rank = (title: string) => prefilterJob(job(title), preferences, candidate, new Date("2026-09-05"));
  const unknown = rank("Software Intern"), season = rank("Summer Software Intern"), year = rank("2027 Software Intern"), both = rank("Summer 2027 Software Intern");
  assert.equal(season.score - unknown.score, 8);
  assert.equal(year.score - unknown.score, 5);
  assert.equal(both.score - unknown.score, 13);
  assert.ok(season.reasons.includes("Matches target internship season"));
  assert.ok(year.reasons.includes("Matches target internship year"));
  assert.ok(unknown.reasons.includes("Internship timing is not specified"));
});
test("non-internship roles ignore timing preferences", () => {
  const role = { ...job("Fall 2026 Software Engineer"), employmentType: "full-time" as const };
  assert.equal(evaluateEligibility(role, preferences).eligible, true);
  assert.deepEqual(detectInternshipTiming(role), { seasons: [], years: [] });
});
test("intern titles with missing employment metadata still receive timing checks", () => {
  assert.equal(evaluateEligibility({ ...job("Fall 2027 Intern"), employmentType: undefined }, preferences).eligible, false);
});
test("default and legacy preferences retain identical eligibility and scores", () => {
  const defaults = { ...preferences, internshipSeason: "any" as const, internshipYear: null };
  const legacy = { ...defaults } as Partial<JobPreferences>;
  delete legacy.internshipSeason; delete legacy.internshipYear;
  for (const title of ["Fall 2026 Intern", "Software Intern"]) {
    assert.equal(evaluateEligibility(job(title), defaults).eligible, true);
    assert.deepEqual(prefilterJob(job(title), defaults, candidate), prefilterJob(job(title), legacy as JobPreferences, candidate));
  }
});
test("timing changes invalidate the candidate/preferences evaluation cache", () => {
  const original = { candidateProfileHash: candidateProfileHash({ candidate, preferences }), jobContentHash: "job", promptVersion: "version" };
  for (const changed of [{ ...preferences, internshipSeason: "fall" }, { ...preferences, internshipYear: 2028 }]) {
    assert.equal(isEvaluationCacheValid(original, { ...original, candidateProfileHash: candidateProfileHash({ candidate, preferences: changed }) }), false);
  }
});
test("settings timing validation accepts defaults and rejects malformed values", () => {
  assert.deepEqual(parseInternshipPreferences("any", ""), { internshipSeason: "any", internshipYear: null });
  assert.deepEqual(parseInternshipPreferences("summer", "2027"), { internshipSeason: "summer", internshipYear: 2027 });
  for (const year of ["2027.5", "NaN", "1999", "2101", "2e3"]) assert.throws(() => parseInternshipPreferences("summer", year));
  assert.throws(() => parseInternshipPreferences("autumn", "2027"));
});
