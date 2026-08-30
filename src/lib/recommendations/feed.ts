import type{Job}from"@/types/job";
import{isRecommended}from"./config";
import{compareRecommendations,type RankableJob}from"./ranking";

export interface FeedCandidate extends RankableJob{viewedAt?:string|null}
export function paginateRecommendationFeed(candidates:FeedCandidate[],options:{view:"all"|"recommended"|"new";page:number;pageSize:number;sort:"match"|"discovered"|"posted"},now=new Date()){
  const filtered=candidates.filter(job=>options.view==="recommended"?Boolean(job.evaluation&&isRecommended(job.evaluation)):options.view==="new"?!job.viewedAt:true);
  const chronologicalSort=options.sort==="posted"?"posted":"discovered",ordered=[...filtered].sort(options.sort==="match"||options.view==="recommended"?(a,b)=>compareRecommendations(a,b,now):(a,b)=>dateForSort(b,chronologicalSort)-dateForSort(a,chronologicalSort)||b.discoveredAt.localeCompare(a.discoveredAt)||a.id.localeCompare(b.id));
  const offset=Math.max(0,(options.page-1)*options.pageSize),jobs=ordered.slice(offset,offset+options.pageSize);
  return{jobs,total:ordered.length,hasMore:offset+jobs.length<ordered.length};
}
function dateForSort(job:Job,sort:"discovered"|"posted"){return new Date(sort==="posted"?job.postedAt??job.discoveredAt:job.discoveredAt).getTime()}
