import {mockJobs} from "@/data/mock-jobs";import type{Job}from"@/types/job";
export interface JobRepository{getJobs():Promise<Job[]>;getJobById(id:string):Promise<Job|undefined>}
export const mockJobRepository:JobRepository={async getJobs(){return mockJobs},async getJobById(id){return mockJobs.find(job=>job.id===id)}};
export const getJobs=()=>mockJobRepository.getJobs();export const getJobById=(id:string)=>mockJobRepository.getJobById(id);
