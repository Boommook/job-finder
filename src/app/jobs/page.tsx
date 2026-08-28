import{Suspense}from"react";import{getJobs}from"@/lib/jobs";import{JobsDashboard}from"@/components/jobs-dashboard";
export default async function JobsPage({searchParams}:{searchParams:Promise<{status?:string}>}){
    const[jobs,query]=await Promise.all([getJobs(),searchParams]);
    return <Suspense fallback={<p className="text-slate-500">Loading opportunities…</p>}><JobsDashboard key={query.status??"all"} initialJobs={jobs}/></Suspense>}
