import{notFound}from"next/navigation";import{getJobById}from"@/lib/jobs";import{JobDetail}from"@/components/job-detail";
export default async function JobPage({params}:{params:Promise<{id:string}>}){const{id}=await params;const job=await getJobById(id);if(!job)notFound();return <JobDetail initialJob={job}/>}
