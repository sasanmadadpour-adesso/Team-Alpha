export interface SystemStatus {
  ID: string;
  code: string;
  label: string;
  environment: string;
  sapConnected: boolean;
}

interface ODataCollection<T> {
  value: T[];
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await fetch('/odata/v4/malo/SystemStatuses');
  if (!response.ok) {
    throw new Error(`CAP API is unavailable (${response.status})`);
  }

  const payload: ODataCollection<SystemStatus> = await response.json();
  const status = payload.value[0];
  if (!status) throw new Error('The CAP API returned no system status.');
  return status;
}

export interface SourceRow { sourceId:string; sourceRowNumber:number; buildingId:string; role:string; participationRaw:string; participates:boolean; meloId:string; maloId:string; reststromMaloId:string; maloConflict:boolean; supplyStartUtc?:string; }

export async function getSourceRows(): Promise<SourceRow[]> {
  const response=await fetch('/odata/v4/malo/ParticipantSourceRows?$orderby=sourceRowNumber');
  if(!response.ok) throw new Error(`Source data is unavailable (${response.status})`);
  return ((await response.json()) as ODataCollection<SourceRow>).value;
}
export interface TransitionResult { status:string; code:string; message:string; maloId:string; buildingId:string; reststromMaloId:string; effectiveDate:string; beforeState:string; afterState:string; canExecute:boolean; simulated:boolean; prerequisiteProfile:string; checksJson:string; reconciliationJson:string; requestId?:string; }
async function action(name:string,body:object):Promise<TransitionResult>{const response=await fetch(`/odata/v4/malo/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!response.ok) throw new Error(`Transition API failed (${response.status})`); return response.json();}
export const previewTransition=(body:object)=>action('previewTransition',body);
export const setDormant=(body:object)=>action('setDormant',body);
export const executeLifecycle=(name:'reactivate'|'removeFromConstruct'|'correctTransition'|'reverseTransition',body:object)=>action(name,body);
export interface RequestHistory {ID:string;operation:string;maloId:string;buildingId:string;effectiveDate:string;mode:string;status:string;resultCode?:string;resultMessage?:string;beforeState?:string;afterState?:string;actor:string;executionTime?:string;simulated:boolean;}
export interface BatchResult {batchId:string;buildingId:string;total:number;success:number;skipped:number;alreadyDone:number;blocked:number;review:number;error:number;resultsJson:string;simulated:boolean;}
export interface ScenarioResult {executedAt:string;passed:number;failed:number;resultsJson:string;}
async function collection<T>(entity:string,query=''):Promise<T[]>{const response=await fetch(`/odata/v4/malo/${entity}${query}`);if(!response.ok)throw new Error(`${entity} is unavailable (${response.status})`);return ((await response.json()) as ODataCollection<T>).value;}
export const getHistory=()=>collection<RequestHistory>('ProcessRequests','?$orderby=createdAt desc');
export const getLocations=()=>collection<{maloId:string;businessState:string;primaryRole:string;participates:boolean;conflictingAssignment:boolean}>('MarketLocations','?$orderby=maloId');
export async function executeBatch(body:object):Promise<BatchResult>{const response=await fetch('/odata/v4/malo/executeBatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`Batch API failed (${response.status})`);return response.json();}
export async function resetDemo(confirmed:boolean):Promise<string>{const response=await fetch('/odata/v4/malo/resetDemo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed})});if(!response.ok)throw new Error(`Reset failed (${response.status})`);return (await response.json()).value;}
export async function runScenarioTests():Promise<ScenarioResult>{const response=await fetch('/odata/v4/malo/runScenarioTests',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error(`Scenario tests failed (${response.status})`);return response.json();}
