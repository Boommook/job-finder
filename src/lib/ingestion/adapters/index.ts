import type{JobSourceAdapter,JobSourceProvider}from"../types";import{ashbyAdapter}from"./ashby";import{greenhouseAdapter}from"./greenhouse";import{leverAdapter}from"./lever";
const adapters:Record<JobSourceProvider,JobSourceAdapter>={ashby:ashbyAdapter,greenhouse:greenhouseAdapter,lever:leverAdapter};export function getAdapter(provider:JobSourceProvider){return adapters[provider]}
