import{evaluateEligibility}from"@/lib/ingestion/eligibility";import{classifyCareerLevel,evaluateLocation,isEarlyCareerPreference}from"./realism";import type{CandidateData,Job,JobPreferences}from"@/types/job";
export interface PrefilterResult{eligible:boolean;score:number;reasons:string[]}
const words=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9+#.]+/g," ").split(/\s+/).filter(x=>x.length>1));
const overlap=(a:Iterable<string>,b:Iterable<string>)=>{const right=new Set([...b].map(x=>x.toLowerCase()));return[...a].filter(x=>right.has(x.toLowerCase())).length};
export function prefilterJob(job:Job,preferences:JobPreferences,candidate:Pick<CandidateData,"profile"|"skills">,now=new Date()):PrefilterResult{
  const hard=evaluateEligibility(job,preferences,candidate);if(!hard.eligible)return{eligible:false,score:0,reasons:hard.reasons.map(x=>`Excluded: ${x}`)};
  let score=35;const reasons:string[]=[];
  const titleWords=words(job.title),desired=preferences.desiredTitles.map(words),titleMatch=desired.reduce((best,item)=>Math.max(best,overlap(titleWords,item)),0);
  if(titleMatch){const points=Math.min(22,10+titleMatch*6);score+=points;reasons.push("Title matches a desired role")}else if(preferences.desiredTitles.length){score-=8;reasons.push("Title is outside desired roles")}
  const candidateSkills=candidate.skills.map(x=>x.skillName),wanted=[...candidateSkills,...preferences.preferredSkills],skillMatches=overlap(job.skills??[],wanted);if(skillMatches){score+=Math.min(24,skillMatches*6);reasons.push(`${skillMatches} declared skill match${skillMatches===1?"":"es"}`)}
  if(job.workArrangement&&preferences.remotePreference!=="flexible"&&job.workArrangement===preferences.remotePreference){score+=7;reasons.push("Workplace preference matches")}
  if(evaluateLocation(job,preferences).matched){score+=7;reasons.push("Preferred location matches")}
  if(preferences.preferredIndustries.some(x=>`${job.category} ${job.company}`.toLowerCase().includes(x.toLowerCase()))){score+=5;reasons.push("Preferred industry matches")}
  const jobLevel=classifyCareerLevel(job.title),earlyCandidate=isEarlyCareerPreference(candidate.profile.preferredRoleLevel);if(earlyCandidate&&jobLevel==="early"){score+=16;reasons.push("Explicit early-career role")}else if(candidate.profile.preferredRoleLevel&&jobLevel==="standard"){score+=4;reasons.push("Seniority is not explicitly above the preferred level")}
  const minimumYears=hard.minimumYearsExperience;if(earlyCandidate&&minimumYears!==undefined&&minimumYears!==null&&minimumYears>=2){score-=minimumYears===2?18:28;reasons.push(`Requires ${minimumYears} years of experience`)}else if(earlyCandidate&&minimumYears!==undefined&&minimumYears!==null&&minimumYears<=1){score+=5;reasons.push("Experience requirement fits an early-career candidate")}
  if(preferences.minimumSalary!==null&&job.salaryMin!==undefined&&job.compensationInterval==="yearly"&&job.salaryMin>=preferences.minimumSalary){score+=5;reasons.push("Known compensation meets preference")}
  const freshDate=new Date(job.postedAt??job.discoveredAt).getTime(),ageDays=(now.getTime()-freshDate)/86_400_000;if(ageDays<=3){score+=8;reasons.push("Recently posted")}else if(ageDays<=14){score+=4;reasons.push("Recently posted")}else if(ageDays>60){score-=12;reasons.push("Posting is older")}
  return{eligible:true,score:Math.max(0,Math.min(100,Math.round(score))),reasons};
}
