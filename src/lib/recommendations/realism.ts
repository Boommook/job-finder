import type { Job, JobPreferences } from "@/types/job";

export type CareerLevel = "early" | "standard" | "senior";

const normalize = (value: string) => ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const seniorPhrases = ["senior staff", "vice president"];
const seniorTokens = new Set(["senior", "sr", "staff", "principal", "lead", "manager", "director", "head", "vp", "chief"]);
const earlyPhrases = ["co op", "new grad", "entry level", "early career"];
const earlyTokens = new Set(["intern", "internship", "entry", "junior", "jr", "associate", "graduate"]);

export function classifyCareerLevel(title: string): CareerLevel {
  const value = normalize(title);
  if (seniorPhrases.some((phrase) => value.includes(` ${phrase} `))) return "senior";
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.some((token) => seniorTokens.has(token))) return "senior";
  if (earlyPhrases.some((phrase) => value.includes(` ${phrase} `))) return "early";
  if (tokens.some((token) => earlyTokens.has(token))) return "early";
  if (/\b(?:engineer|developer)\s+(?:i|1)\b/.test(value)) return "early";
  return "standard";
}

export function isEarlyCareerPreference(preferredRoleLevel: string | undefined): boolean {
  if (!preferredRoleLevel?.trim()) return false;
  return classifyCareerLevel(preferredRoleLevel) === "early";
}

const experiencePatterns = [
  /\b(\d{1,2})\s*\+\s*years?(?:(?:\s+of)?\s+(?:relevant\s+|professional\s+|industry\s+|work\s+)?experience)?\b/gi,
  /\bminimum(?:\s+of)?\s+(\d{1,2})\s+years?(?:\s+of)?(?:\s+(?:relevant|professional|industry|work))?(?:\s+experience)?\b/gi,
  /\bat\s+least\s+(\d{1,2})\s+years?(?:\s+of)?(?:\s+(?:relevant|professional|industry|work))?(?:\s+experience)?\b/gi,
  /\b(\d{1,2})\s*(?:-|–|to)\s*\d{1,2}\s+years?(?:\s+of)?\s+(?:relevant\s+|professional\s+|industry\s+|work\s+)?experience\b/gi,
  /\b(\d{1,2})\s+years?\s+of\s+(?:relevant\s+|professional\s+|industry\s+|work\s+)?experience\b/gi,
  /(?<![-–]\s)(?<![-–])(?<!to\s)\b(\d{1,2})\s+years?\s+(?:relevant\s+|professional\s+|industry\s+|work\s+)experience\b/gi,
];

export function parseMinimumYearsExperience(description: string): number | null {
  const matches: number[] = [];
  for (const pattern of experiencePatterns) {
    pattern.lastIndex = 0;
    for (const match of description.matchAll(pattern)) {
      const years = Number(match[1]);
      if (Number.isInteger(years) && years >= 0 && years <= 99) matches.push(years);
    }
  }
  return matches.length ? Math.max(...matches) : null;
}

const states: Record<string, string> = {
  alabama:"al",alaska:"ak",arizona:"az",arkansas:"ar",california:"ca",colorado:"co",connecticut:"ct",delaware:"de",florida:"fl",georgia:"ga",hawaii:"hi",idaho:"id",illinois:"il",indiana:"in",iowa:"ia",kansas:"ks",kentucky:"ky",louisiana:"la",maine:"me",maryland:"md",massachusetts:"ma",michigan:"mi",minnesota:"mn",mississippi:"ms",missouri:"mo",montana:"mt",nebraska:"ne",nevada:"nv","new hampshire":"nh","new jersey":"nj","new mexico":"nm","new york":"ny","north carolina":"nc","north dakota":"nd",ohio:"oh",oklahoma:"ok",oregon:"or",pennsylvania:"pa","rhode island":"ri","south carolina":"sc","south dakota":"sd",tennessee:"tn",texas:"tx",utah:"ut",vermont:"vt",virginia:"va",washington:"wa","west virginia":"wv",wisconsin:"wi",wyoming:"wy",
};
const foreignMarkers = ["france","paris","romania","canada","montreal","toronto","vancouver","united kingdom","uk","london","germany","india","ireland","spain","poland","netherlands","australia","singapore"];
const usRemote = /\b(?:remote\s*(?:[-,/]|in)?\s*(?:us|usa|u s|united states)|(?:us|usa|u s|united states)\s*(?:[-,/]|only)?\s*remote|remote within (?:the )?(?:us|united states))\b/;
const unknownLocation = /^(?:|unknown|not specified|multiple locations|various)$/;

const locationTokens = (value: string) => normalize(value).trim();
const stateCode = (value: string) => states[locationTokens(value)] ?? (/^[a-z]{2}$/.test(locationTokens(value)) ? locationTokens(value) : null);

export interface LocationEligibility { eligible: boolean; matched: boolean; known: boolean; reason?: string }

export function evaluateLocation(job: Pick<Job,"location"|"workArrangement">, preferences: Pick<JobPreferences,"desiredLocations"|"allowUsRemote">): LocationEligibility {
  const raw = locationTokens(job.location ?? "");
  if (unknownLocation.test(raw)) return { eligible:true, matched:false, known:false };
  const foreign = foreignMarkers.some((marker) => new RegExp(`\\b${marker.replace(" ", "\\s+")}\\b`).test(raw));
  if (foreign) return { eligible:false, matched:false, known:true, reason:`Location ${job.location} is outside the desired geography` };
  if (preferences.allowUsRemote !== false && (usRemote.test(raw) || (job.workArrangement === "remote" && /\b(?:us|usa|united states|nationwide)\b/.test(raw)))) return { eligible:true, matched:true, known:true };
  if (!preferences.desiredLocations.length) return { eligible:true, matched:false, known:true };
  for (const desired of preferences.desiredLocations) {
    const wanted = locationTokens(desired);
    if (!wanted) continue;
    if (raw.includes(wanted) || wanted.includes(raw)) return { eligible:true, matched:true, known:true };
    const code = stateCode(wanted);
    if (code && (new RegExp(`(?:^|\\s)${code}(?:$|\\s)`).test(raw) || Object.entries(states).some(([name, abbreviation]) => abbreviation === code && raw.includes(name)))) return { eligible:true, matched:true, known:true };
  }
  if (job.workArrangement === "remote" && preferences.allowUsRemote !== false && /^(?:remote|remote work|work from home)$/.test(raw)) return { eligible:true, matched:true, known:false };
  return { eligible:false, matched:false, known:true, reason:`Location ${job.location} does not match desired locations` };
}
