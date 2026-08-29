import{ingestEnabledSources}from"../src/lib/ingestion/run";
const sourceId=process.argv[2];ingestEnabledSources(sourceId).then(results=>{console.table(results);if(results.some(r=>!r.ok))process.exitCode=1}).catch(error=>{console.error(error);process.exitCode=1});
