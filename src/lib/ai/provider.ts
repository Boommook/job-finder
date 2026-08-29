import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { jobEvaluationSchema,resumeExtractionSchema,type CandidateResumeExtraction,type StructuredJobEvaluation } from "./schemas";
import { evaluationInstructions,resumeInstructions } from "./prompts";

export interface AiResult<T>{data:T;model:string;inputTokens:number|null;outputTokens:number|null}
export interface AiProvider{parseResume(text:string):Promise<AiResult<CandidateResumeExtraction>>;evaluateJob(input:unknown):Promise<AiResult<StructuredJobEvaluation>>}
export class AiConfigurationError extends Error{}
export class AiServiceError extends Error{}
export class OpenAiProvider implements AiProvider{
  private client:OpenAI; private model:string;
  constructor(apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL??"gpt-5-mini"){
    if(!apiKey)throw new AiConfigurationError("AI is not configured. Add OPENAI_API_KEY on the server.");
    this.client=new OpenAI({apiKey,timeout:30_000,maxRetries:2});this.model=model;
  }
  private usage(response:{usage?:{input_tokens?:number;output_tokens?:number}|null}){return{inputTokens:response.usage?.input_tokens??null,outputTokens:response.usage?.output_tokens??null}}
  async parseResume(text:string){try{const response=await this.client.responses.parse({model:this.model,instructions:resumeInstructions,input:text.slice(0,60_000),text:{format:zodTextFormat(resumeExtractionSchema,"candidate_resume_extraction")},store:false});const parsed=response.output_parsed;if(!parsed)throw new Error("No structured result");return{data:resumeExtractionSchema.parse(parsed),model:response.model,...this.usage(response)}}catch(error){if(error instanceof AiConfigurationError)throw error;throw new AiServiceError("The resume could not be parsed by the AI provider. Please try again.")}}
  async evaluateJob(input:unknown){try{const response=await this.client.responses.parse({model:this.model,instructions:evaluationInstructions,input:JSON.stringify(input),text:{format:zodTextFormat(jobEvaluationSchema,"personalized_job_evaluation")},store:false});const parsed=response.output_parsed;if(!parsed)throw new Error("No structured result");return{data:jobEvaluationSchema.parse(parsed),model:response.model,...this.usage(response)}}catch(error){if(error instanceof AiConfigurationError)throw error;throw new AiServiceError("The job could not be evaluated right now. Please try again.")}}
}
