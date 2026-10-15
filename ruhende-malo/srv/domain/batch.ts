export interface BatchItemResult {status:string;code:string;maloId:string;}
export function summarizeBatch(results:BatchItemResult[]){const count=(status:string)=>results.filter(item=>item.status===status).length;return {total:results.length,success:count('SUCCESS'),skipped:count('SKIPPED'),alreadyDone:count('ALREADY_DONE'),blocked:count('BLOCKED'),review:count('REVIEW'),error:count('ERROR')};}
