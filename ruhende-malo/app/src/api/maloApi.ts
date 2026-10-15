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
