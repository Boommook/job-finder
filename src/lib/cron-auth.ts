import{timingSafeEqual}from"node:crypto";
export function isCronAuthorized(request:Pick<Request,"headers">){const secret=process.env.CRON_SECRET;if(!secret)return false;const header=request.headers.get("authorization")??"",provided=header.startsWith("Bearer ")?header.slice(7):"";const a=Buffer.from(secret),b=Buffer.from(provided);return a.length===b.length&&timingSafeEqual(a,b)}
