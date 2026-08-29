import type { JobStatus } from "@/types/job";
export function cn(...classes:Array<string|false|null|undefined>){return classes.filter(Boolean).join(" ")}
export function scoreMeta(score=0){if(score>=90)return{label:"Excellent",tone:"excellent"};if(score>=80)return{label:"Strong",tone:"strong"};if(score>=70)return{label:"Worth reviewing",tone:"possible"};return{label:"Weak",tone:"weak"}}
export function formatStatus(status:JobStatus){return status.replace(/\b\w/g,c=>c.toUpperCase())}
export function formatDate(date?:string){if(!date)return"Date unavailable";const days=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/86400000));return days===0?"Today":days===1?"1 day ago":`${days} days ago`}
export function formatMoney(value:number,currency="USD"){return new Intl.NumberFormat("en-US",{style:"currency",currency,maximumFractionDigits:0}).format(value)}
export function formatCompensation(min?:number,max?:number,currency="USD",interval="unknown"){if(min===undefined&&max===undefined)return"";const amount=min!==undefined&&max!==undefined?`${formatMoney(min,currency)}–${formatMoney(max,currency)}`:formatMoney((min??max)!,currency);return interval==="unknown"?amount:`${amount}/${{hourly:"hr",yearly:"yr",monthly:"mo",weekly:"wk"}[interval]??interval}`}
