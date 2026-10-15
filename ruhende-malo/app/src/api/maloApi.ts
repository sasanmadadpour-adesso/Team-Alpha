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
    throw new Error(`CAP API nicht erreichbar (${response.status})`);
  }

  const payload: ODataCollection<SystemStatus> = await response.json();
  const status = payload.value[0];
  if (!status) throw new Error('CAP API lieferte keinen Systemstatus.');
  return status;
}
