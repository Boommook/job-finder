import{isRecommended,recommendationConfig}from"./config";import type{Job}from"@/types/job";
export interface RankableJob extends Job{prefilterScore?:number;firstSeenAt?:string;viewedAt?:string|null}
export const RECOMMENDATION_RANKING={evaluatedBase:100,applyBoost:25,considerBoost:12,skipBoost:-20,maxPrefilterScore:99,freshnessDays:15,unevaluatedFreshnessWeight:0.5}as const;
const freshness=(job:Job,now:Date)=>Math.max(0,RECOMMENDATION_RANKING.freshnessDays-Math.floor((now.getTime()-new Date(job.postedAt??job.discoveredAt).getTime())/86_400_000));
export function recommendationRank(job:RankableJob,now=new Date()){
  const evaluation=job.evaluation&&!job.evaluation.stale?job.evaluation:undefined;
  if(evaluation){const recommendationBoost=evaluation.recommendation==="apply"?RECOMMENDATION_RANKING.applyBoost:evaluation.recommendation==="consider"?RECOMMENDATION_RANKING.considerBoost:RECOMMENDATION_RANKING.skipBoost;return RECOMMENDATION_RANKING.evaluatedBase+evaluation.overallScore+recommendationBoost+freshness(job,now)}
  return Math.min(RECOMMENDATION_RANKING.maxPrefilterScore,job.prefilterScore??0)+freshness(job,now)*RECOMMENDATION_RANKING.unevaluatedFreshnessWeight;
}
export function compareRecommendations(a:RankableJob,b:RankableJob,now=new Date()){return recommendationRank(b,now)-recommendationRank(a,now)||new Date(b.discoveredAt).getTime()-new Date(a.discoveredAt).getTime()||a.id.localeCompare(b.id)}
export type RecommendationState="new"|"candidate"|"evaluated"|"recommended"|"excluded"|"failed"|"dismissed";
export function recommendationState(job:RankableJob):RecommendationState{if(job.status==="rejected")return"dismissed";if(isRecommended(job.evaluation??{overallScore:0,recommendation:"skip",stale:true}))return"recommended";if(job.evaluation&&!job.evaluation.stale)return"evaluated";return(job.prefilterScore??0)>=recommendationConfig.aiPrefilterThreshold?"candidate":"new"}
