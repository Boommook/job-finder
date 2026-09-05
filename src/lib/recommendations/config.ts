const integer=(value:string|undefined,fallback:number,min:number,max:number)=>{const parsed=Number(value);return Number.isInteger(parsed)?Math.min(max,Math.max(min,parsed)):fallback};
export const AUTO_EVALUATION_SAFETY_CAP=25;
export const recommendationConfig={
  autoEvaluationLimit:integer(process.env.AUTO_EVALUATION_LIMIT,10,1,AUTO_EVALUATION_SAFETY_CAP),
  recommendedScoreThreshold:integer(process.env.RECOMMENDED_SCORE_THRESHOLD,70,0,100),
  aiPrefilterThreshold:integer(process.env.AI_PREFILTER_THRESHOLD,55,0,100),
  maxJobDescriptionLength:integer(process.env.AI_MAX_JOB_DESCRIPTION_LENGTH,12_000,1_000,24_000),
  maxUsersPerRun:integer(process.env.RECOMMENDATION_MAX_USERS_PER_RUN,10,1,50),
  plausibleCandidateLimit:integer(process.env.RECOMMENDATION_CANDIDATE_SCAN_LIMIT,200,100,500),
  activeUniverseLimit:integer(process.env.RECOMMENDATION_ACTIVE_UNIVERSE_LIMIT,5_000,500,10_000),
} as const;

export function isRecommended(evaluation:{overallScore:number;recommendation:string;stale?:boolean}){
  return !evaluation.stale&&evaluation.overallScore>=recommendationConfig.recommendedScoreThreshold&&(evaluation.recommendation==="apply"||evaluation.recommendation==="consider");
}
