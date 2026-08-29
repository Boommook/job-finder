import type { Json } from "@/types/database";
export function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
export function asString(value:unknown){return typeof value==="string"?value:undefined}
export function asNumber(value:unknown){return typeof value==="number"&&Number.isFinite(value)?value:undefined}
export function raw(value:unknown):Json{return value as Json}
export function validPostings<T>(values:unknown[],provider:string,parse:(value:Record<string,unknown>)=>T|undefined,warn:(message:string)=>void=console.warn){const parsed:T[]=[];values.forEach((value,index)=>{const posting=isRecord(value)?parse(value):undefined;if(posting)parsed.push(posting);else warn(`${provider} posting at index ${index} was skipped because required identity fields are missing or invalid`) });return parsed}
export async function fetchJson(url:string,signal:AbortSignal):Promise<unknown>{const response=await fetch(url,{signal,headers:{Accept:"application/json","User-Agent":"JobFinder/Phase3"},cache:"no-store"});if(!response.ok)throw new Error(`Provider returned HTTP ${response.status}`);try{return await response.json()}catch{throw new Error("Provider returned invalid JSON")}}
