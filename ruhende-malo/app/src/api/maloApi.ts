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
