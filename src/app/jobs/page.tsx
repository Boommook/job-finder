import{Suspense}from"react";import{getJobs}from"@/lib/jobs";import{JobsDashboard}from"@/components/jobs-dashboard";import{requireUser}from"@/lib/auth";
export default async function JobsPage({searchParams}:{searchParams:Promise<{status?:string}>}){
    const user=await requireUser();const[jobs,query]=await Promise.all([getJobs(user.id),searchParams]);
    return <Suspense fallback={<p className="text-slate-500">Loading opportunities…</p>}><JobsDashboard key={query.status??"all"} initialJobs={jobs}/></Suspense>}
