import { SapLocation } from './types';

// Addresses are readable normalizations of the workbook's encoding-corrupted
// values (for example, "Köln" and "Straße" were corrupted in the source
// spreadsheet). These records are illustrative demo data only.
export const mockSapLocations: SapLocation[] = [
  {
    identifier: 'DE0073325707820000000000000088943',
    identifier_type: 'MELO',
    network_operator: 'VNB-DEMO',
    status: 'ACTIVE',
    address: {
      street: 'Vilbeler Landstrasse',
      house_number: '21',
      postal_code: '60388',
      city: 'Frankfurt am Main',
    },
    plant: { production_type: 'Solar', capacity_kw: 6 },
    building_id: 'B-FRA-01',
    valid_from: '2026-01-01T00:00:00Z',
    valid_to: null,
  },
  {
    identifier: 'DE00733257078200000000000000880945',
    identifier_type: 'MELO',
    network_operator: 'VNB-DEMO',
    status: 'ACTIVE',
    address: {
      street: 'Milanweg',
      house_number: '10',
      postal_code: '50859',
      city: 'Köln',
    },
    plant: { production_type: 'Wind', capacity_kw: 7 },
    building_id: 'B-CGN-01',
    valid_from: '2026-01-01T00:00:00Z',
    valid_to: null,
  },
  {
    identifier: 'DE0001815707800000101300000139428',
    identifier_type: 'MELO',
    network_operator: 'VNB-DEMO',
    status: 'ACTIVE',
    address: {
      street: 'Franz-Fischer-Strasse 24',
      house_number: '24',
      postal_code: '45470',
      city: 'Mülheim an der Ruhr',
    },
    plant: { production_type: 'Solar', capacity_kw: 5.5 },
    building_id: 'B-MUL-01',
    valid_from: '2026-01-01T00:00:00Z',
    valid_to: null,
  },
  // Demonstrates a record that is not currently active (outside valid_from/valid_to).
  {
    identifier: 'DE000000000000INACTIVE',
    identifier_type: 'MELO',
    network_operator: 'VNB-DEMO',
    status: 'INACTIVE',
    address: {
      street: 'Example Street',
      house_number: '1',
      postal_code: '60388',
      city: 'Frankfurt am Main',
    },
    plant: { production_type: 'Solar', capacity_kw: 1 },
    building_id: 'B-FRA-01',
    valid_from: '2020-01-01T00:00:00Z',
    valid_to: '2021-01-01T00:00:00Z',
  },
  // Demonstrates a location operated by a different VNB (should be rejected).
  {
    identifier: 'DE000000000000WRONGNETWORK',
    identifier_type: 'MELO',
    network_operator: 'OTHER-VNB',
    status: 'ACTIVE',
    address: {
      street: 'Vilbeler Landstrasse',
      house_number: '21',
      postal_code: '60388',
      city: 'Frankfurt am Main',
    },
    plant: { production_type: 'Solar', capacity_kw: 6 },
    building_id: 'B-FRA-01',
    valid_from: '2026-01-01T00:00:00Z',
    valid_to: null,
  },
];
