import { resumeDateSchema,type ResumeDate } from "@/lib/ai/schemas";

export const unknownResumeDate=():ResumeDate=>({precision:"unknown",year:null,month:null,day:null,raw:null});

export function normalizeResumeDate(value:unknown):ResumeDate {const parsed=resumeDateSchema.safeParse(value);if(parsed.success)return parsed.data;const raw=value&&typeof value==="object"&&"raw" in value&&typeof value.raw==="string"?value.raw:null;return{...unknownResumeDate(),raw};}

export function formatResumeDate(value:ResumeDate):string {
  if(value.precision==="present")return "Present";
  if(value.precision==="year"&&value.year!==null)return String(value.year);
  if(value.precision==="month"&&value.year!==null&&value.month!==null)return `${value.year}-${String(value.month).padStart(2,"0")}`;
  if(value.precision==="day"&&value.year!==null&&value.month!==null&&value.day!==null)return `${value.year}-${String(value.month).padStart(2,"0")}-${String(value.day).padStart(2,"0")}`;
  return value.raw?.trim()||"";
}

export function parseResumeDateInput(input:string,allowPresent=false):ResumeDate {
  const raw=input.trim();
  if(!raw)return unknownResumeDate();
  if(allowPresent&&/^(present|current|now)$/i.test(raw))return{precision:"present",year:null,month:null,day:null,raw};
  let match=raw.match(/^(\d{4})$/);if(match)return{precision:"year",year:Number(match[1]),month:null,day:null,raw};
  match=raw.match(/^(\d{4})-(\d{2})$/);if(match){const year=Number(match[1]),month=Number(match[2]);if(month>=1&&month<=12)return{precision:"month",year,month,day:null,raw};}
  match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(match){const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)return{precision:"day",year,month,day,raw};}
  const months:Record<string,number>={january:1,jan:1,february:2,feb:2,march:3,mar:3,april:4,apr:4,may:5,june:6,jun:6,july:7,jul:7,august:8,aug:8,september:9,sep:9,sept:9,october:10,oct:10,november:11,nov:11,december:12,dec:12};
  match=raw.match(/^([A-Za-z]+)\s+(\d{4})$/);if(match&&months[match[1].toLowerCase()])return{precision:"month",year:Number(match[2]),month:months[match[1].toLowerCase()],day:null,raw};
  match=raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);if(match&&months[match[1].toLowerCase()]){const year=Number(match[3]),month=months[match[1].toLowerCase()],day=Number(match[2]),date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)return{precision:"day",year,month,day,raw};}
  return{precision:"unknown",year:null,month:null,day:null,raw};
}
