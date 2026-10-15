using { mk7.controlcenter as db } from '../db/schema';

@path: '/odata/v4/malo'
service MaloService {
  @readonly entity SystemStatuses as projection on db.SystemStatuses;

  type HealthResponse {
    status       : String;
    mode         : String;
    sapConnection: String;
  }

  function health() returns HealthResponse;
}
