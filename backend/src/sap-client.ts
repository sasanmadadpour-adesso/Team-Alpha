import { mockSapLocations } from './mock-sap-data';
import { SapLocation } from './types';

// This is the single replacement point for a real SAP integration.
// Today it reads from local mock data. When a real SAP API becomes
// available, replace the body of this function with something like:
//
//   const response = await fetch(
//     `${process.env.SAP_BASE_URL}/locations/${encodeURIComponent(identifier)}`,
//   );
//
//   if (response.status === 404) {
//     return null;
//   }
//
//   if (!response.ok) {
//     throw new Error('SAP source unavailable');
//   }
//
//   return response.json();
//
// The rest of the application only calls this function and never reads
// mock-sap-data.ts directly, so no other code needs to change.
export async function getSapLocation(identifier: string): Promise<SapLocation | null> {
  if (identifier === 'DE000000000000UNAVAILABLE') {
    throw new Error('SAP source unavailable');
  }

  const location = mockSapLocations.find((candidate) => candidate.identifier === identifier);
  return location ?? null;
}
