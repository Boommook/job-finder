import{notFound}from"next/navigation";import{getJobById}from"@/lib/jobs";import{JobDetail}from"@/components/job-detail";import{requireUser}from"@/lib/auth";
export default async function JobPage({params}:{params:Promise<{id:string}>}){const[{id},user]=await Promise.all([params,requireUser()]);const job=await getJobById(id,user.id);if(!job)notFound();return <JobDetail initialJob={job}/>}
