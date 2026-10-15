/** Domain types stay independent of CAP transport and persistence details. */
export type SimulationMode = 'SIMULATION';

export interface SystemHealth {
  status: 'OK';
  mode: SimulationMode;
  sapConnection: 'NOT_CONFIGURED';
}
