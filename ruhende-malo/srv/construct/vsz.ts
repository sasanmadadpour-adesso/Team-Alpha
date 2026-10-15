/**
 * Upstream "Aufbau vSZ" readiness checklist, taken 1:1 from Prozessschritte.pdf (steps 1–4.7).
 * These steps are NOT implemented by the MVP. They must be confirmed by a person (or a calling
 * service) with evidence before the Umstellung may run. Nothing here is ever confirmed automatically.
 */
export interface VszItem { itemCode: string; step: string; label: string; pdfPage: string; note?: string }

export const VSZ_ITEMS: VszItem[] = [
  { itemCode: 'MESSKONZEPT', step: '1', label: 'Measuring concepts ordered via DSO-DP (C1001_M001 Bezug; C1003_M001/C1006_M001 Einspeisung)', pdfPage: '2' },
  { itemCode: 'STECKBRIEFE', step: '2', label: 'Steckbriefe incl. meter lists received from the MK7 operator (KAB)', pdfPage: '2' },
  { itemCode: 'IMSYS_EINBAU', step: '3', label: 'iMSys meters installed with correct tariffing (OBIS 1-1:1.29.0 / 1-1:2.29.0)', pdfPage: '2' },
  { itemCode: 'RESTSTROM_MALO', step: '4.1', label: 'Reststrom-MaLo and Anlage created (ES30)', pdfPage: '2–3' },
  { itemCode: 'GERAETEINFOSATZ', step: '4.2', label: 'Geräteinfosatz with billing installation (OBIS 1.8.0, EG34)', pdfPage: '4' },
  { itemCode: 'ZAEHLPUNKTART', step: '4.3', label: 'Zählpunktart = Marktlokation, description VBZS', pdfPage: '5' },
  { itemCode: 'LASTPROFIL', step: '4.4', label: 'Load profiles maintained on the Reststrom-MaLo Anlage', pdfPage: '6' },
  { itemCode: 'ZP_STATUS', step: '4.5', label: 'ZP status dated to the commissioning (IBN) date', pdfPage: '7', note: 'Setup step only — not the dormancy mechanism.' },
  { itemCode: 'BILANZIERUNG', step: '4.6', label: 'Settlement data (SETTLEMALO, KN-L) maintained', pdfPage: '8' },
  { itemCode: 'SERVICES', step: '4.7', label: 'BIKO and MSB services on the supply scenario', pdfPage: '9', note: 'PDF: /EKN/ESERVICE_UPD did not work; maintenance transaction used instead.' },
];

export interface ChecklistState { itemCode: string; status: string }
export const vszComplete = (items: ChecklistState[]) => items.length === VSZ_ITEMS.length && items.every((i) => i.status === 'CONFIRMED');
export const vszMissing = (items: ChecklistState[]) => VSZ_ITEMS.filter((v) => items.find((i) => i.itemCode === v.itemCode)?.status !== 'CONFIRMED');
