export function isIngestionAdmin(userId:string){return(process.env.INGESTION_ADMIN_USER_IDS??"").split(",").map(value=>value.trim()).filter(Boolean).includes(userId)}
