import{isRecommended,recommendationConfig}from"./config";import type{Job}from"@/types/job";
export interface RankableJob extends Job{prefilterScore?:number;firstSeenAt?:string;viewedAt?:string|null}
const freshness=(job:Job,now:Date)=>Math.max(0,15-Math.floor((now.getTime()-new Date(job.postedAt??job.discoveredAt).getTime())/86_400_000));
export function recommendationRank(job:RankableJob,now=new Date()){
  const evaluation=job.evaluation&&!job.evaluation.stale?job.evaluation:undefined;
  if(evaluation){const recommendationBoost=evaluation.recommendation==="apply"?25:evaluation.recommendation==="consider"?12:-20;return 100+evaluation.overallScore+recommendationBoost+freshness(job,now)}
  return Math.min(99,job.prefilterScore??0)+freshness(job,now)*0.5;
}
export function compareRecommendations(a:RankableJob,b:RankableJob,now=new Date()){return recommendationRank(b,now)-recommendationRank(a,now)||new Date(b.discoveredAt).getTime()-new Date(a.discoveredAt).getTime()}
export function recommendationState(job:RankableJob){if(job.status==="rejected")return"dismissed";if(isRecommended(job.evaluation??{overallScore:0,recommendation:"skip",stale:true}))return"recommended";if(job.evaluation&&!job.evaluation.stale)return"evaluated";return(job.prefilterScore??0)>=recommendationConfig.aiPrefilterThreshold?"candidate":"new"}
