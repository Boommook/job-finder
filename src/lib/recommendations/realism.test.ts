import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEligibility } from "@/lib/ingestion/eligibility";
import { runRecommendationSelection } from "./engine";
import { classifyCareerLevel, evaluateLocation, parseMinimumYearsExperience } from "./realism";
import type { CandidateData, Job, JobEvaluation, JobPreferences } from "@/types/job";

const preferences:JobPreferences={desiredTitles:["Software Engineer"],desiredLocations:["Massachusetts"],allowUsRemote:true,remotePreference:"flexible",employmentTypes:[],minimumSalary:null,preferredIndustries:[],preferredSkills:[],excludedKeywords:[],sponsorshipRequired:false};
const candidate={profile:{preferredRoleLevel:"entry level"}} as Pick<CandidateData,"profile">;
const job=(values:Partial<Job>={}):Job=>({id:"job",company:"Acme",title:"Software Engineer",category:"Other",location:"Boston, MA",description:"Build software",discoveredAt:"2026-08-01T00:00:00Z",sourceUrl:"https://example.com",status:"new",isActive:true,...values});
const evaluation:JobEvaluation={overallScore:80,skillScore:80,experienceScore:80,educationScore:80,interestScore:80,locationScore:80,compensationScore:null,verdict:"strong",recommendation:"apply",summary:"",matchingSkills:[],missingSkills:[],strengths:[],concerns:[]};

test("seniority classifier uses normalized title tokens and phrases",()=>{
  for(const title of ["Staff Software Engineer","Senior ML Engineer","Programming Team Lead"])assert.equal(classifyCareerLevel(title),"senior");
  assert.equal(classifyCareerLevel("Software Engineer"),"standard");
  assert.equal(classifyCareerLevel("Software Engineer, Leadership Program"),"standard");
  for(const title of ["Software Engineer Intern","Software Engineering Co-op","New Grad Software Engineer","Software Engineer I"])assert.equal(classifyCareerLevel(title),"early");
});

test("experience parser extracts only explicit professional requirements",()=>{
  assert.equal(parseMinimumYearsExperience("Requires 7+ years of experience."),7);
  assert.equal(parseMinimumYearsExperience("Requires 47+ years."),47);
  assert.equal(parseMinimumYearsExperience("This role requires 47+ years."),47);
  assert.equal(parseMinimumYearsExperience("A minimum of 4 years is required."),4);
  assert.equal(parseMinimumYearsExperience("You have 4-6 years professional experience."),4);
  assert.equal(parseMinimumYearsExperience("At least 3 years of relevant experience."),3);
  assert.equal(parseMinimumYearsExperience("Founded in 2019 with 500 customers and a 2027 roadmap."),null);
});

test("location matching respects desired geography and US remote",()=>{
  assert.equal(evaluateLocation(job({location:"Boston, MA"}),{...preferences,desiredLocations:["Boston"]}).eligible,true);
  assert.equal(evaluateLocation(job({location:"Cambridge, MA"}),preferences).eligible,true);
  assert.equal(evaluateLocation(job({location:"Remote - US",workArrangement:"remote"}),preferences).eligible,true);
  assert.equal(evaluateLocation(job({location:"Paris, France",workArrangement:"remote"}),preferences).eligible,false);
  assert.equal(evaluateLocation(job({location:"Montreal, Canada"}),preferences).eligible,false);
  assert.deepEqual(evaluateLocation(job({location:"Unknown"}),preferences),{eligible:true,matched:false,known:false});
});

test("early-career realism hard-excludes senior and 4+ year jobs but not ambiguous titles",()=>{
  assert.equal(evaluateEligibility(job({title:"Staff Software Engineer"}),preferences,candidate).eligible,false);
  assert.equal(evaluateEligibility(job({description:"Minimum of 4 years of professional experience"}),preferences,candidate).eligible,false);
  assert.equal(evaluateEligibility(job(),preferences,candidate).eligible,true);
  assert.equal(evaluateEligibility(job({description:"2 years of professional experience"}),preferences,candidate).eligible,true);
});

test("global score outranks ingestion freshness and hard exclusions never invoke AI",async()=>{
  const called:string[]=[];
  const result=await runRecommendationSelection([
    {jobId:"new-weak",active:true,stale:false,hardEligible:true,prefilterScore:60,freshness:200,hasValidEvaluation:false},
    {jobId:"old-strong",active:true,stale:false,hardEligible:true,prefilterScore:95,freshness:100,hasValidEvaluation:false},
    {jobId:"senior",active:true,stale:false,hardEligible:false,prefilterScore:100,freshness:300,exclusionKinds:["seniority"],hasValidEvaluation:false},
  ],{limit:1,threshold:55,evaluate:async id=>{called.push(id);return{cached:false,evaluation}},persist:async()=>{}});
  assert.deepEqual(called,["old-strong"]);
  assert.equal(result.selected,1);assert.equal(result.evaluated,1);assert.equal(result.seniorityExcluded,1);
});

test("AI evaluation remains capped at 25",async()=>{
  let calls=0;await runRecommendationSelection(Array.from({length:40},(_,i)=>({jobId:String(i),active:true,stale:false,hardEligible:true,prefilterScore:100-i/100,hasValidEvaluation:false})),{limit:100,threshold:0,evaluate:async()=>{calls++;return{cached:false,evaluation}},persist:async()=>{}});assert.equal(calls,25);
});
