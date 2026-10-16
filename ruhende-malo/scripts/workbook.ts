import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

export const WORKBOOK_PATH = path.resolve('data/source/new-data-source.xlsx');
export const SOURCE_SHEET = 'MK7 Participants';
const LEGACY_SOURCE_SHEET = 'MK7 Teilnehmer';
export const ROLES = { reststrom: 'Marktlokation Reststrom', household: 'Haushaltsverbrauch', generation: new Set(['Solaranlage', 'Windkraftanlage']) } as const;
type CellValue = string | number | boolean | Date | null | undefined;
type RawRow = Record<string, CellValue>;
export interface ParticipantRow { sourceId:string; sourceFile:string; sourceSheet:string; sourceRowNumber:number; buildingId:string; role:string; participationRaw:string; participates:boolean; meloId:string; maloId:string; generationFeedInMaloId?:string; supplyStartUtc?:string; contractFromUtc?:string; contractToUtc?:string; city?:string; operator?:string; streetAddress?:string; reststromMaloId?:string; maloConflict:boolean; unverifiedSourceAttributes:string; sourceData:string; }
export interface WorkbookData { checksum:string; rows:ParticipantRow[]; }
const headerAliases = {gebaeude_id:'building_id',mk7_rolle:'mk7_role',messlokation_id_MeLo:'metering_location_id_MeLo',marktlokation_id_bezug_MaLo:'market_location_id_import_MaLo',marktlokation_id_einspeisung_MaLo:'market_location_id_export_MaLo',mk7_versorgungsbeginn_utc:'mk7_supply_start_utc',vertragsbeginn_utc:'contract_start_utc',vertragsende_utc:'contract_end_utc',stadt:'city',mk7_betreiber:'mk7_operator',strassenadresse:'street_address'} as const;
const requiredHeaders = ['building_id','mk7_role','Teilnahme MK7','metering_location_id_MeLo','market_location_id_import_MaLo','market_location_id_export_MaLo','mk7_supply_start_utc','contract_start_utc','contract_end_utc'] as const;
const roleAliases:Record<string,string>={'Residual Supply Market Location':ROLES.reststrom,'Household Consumption':ROLES.household,'Solar Plant':'Solaranlage','Wind Plant':'Windkraftanlage'};
function text(value: CellValue): string { return value === null || value === undefined ? '' : String(value).trim(); }
export function excelDateToIso(value: CellValue): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) return value.toISOString().slice(0,10);
  if (typeof value === 'number') { const parsed=XLSX.SSF.parse_date_code(value); if(!parsed) throw new Error(`Invalid Excel date: ${value}`); return `${String(parsed.y).padStart(4,'0')}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`; }
  const match=text(value).match(/^(\d{4})-(\d{2})-(\d{2})/); if(!match) throw new Error(`Unsupported date: ${String(value)}`); return match[0];
}
export async function readParticipantWorkbook(filePath=WORKBOOK_PATH): Promise<WorkbookData> {
  return parseParticipantWorkbook(await readFile(filePath),path.basename(filePath));
}

/** Parses an MK7 Teilnehmer workbook from bytes (file import or API upload). */
export function parseParticipantWorkbook(bytes:Buffer,fileName:string): WorkbookData { const checksum=createHash('sha256').update(bytes).digest('hex');
  const workbook=XLSX.read(bytes,{type:'buffer',cellDates:false}); const sourceSheet=workbook.Sheets[SOURCE_SHEET]?SOURCE_SHEET:LEGACY_SOURCE_SHEET; const sheet=workbook.Sheets[sourceSheet]; if(!sheet) throw new Error(`Sheet '${SOURCE_SHEET}' or '${LEGACY_SOURCE_SHEET}' is missing.`);
  const matrix=XLSX.utils.sheet_to_json<CellValue[]>(sheet,{header:1,raw:true,defval:null}); const headers=(matrix[0]??[]).map(text);
  const english=sourceSheet===SOURCE_SHEET;
  for(const header of requiredHeaders) { const expected=english?header:Object.entries(headerAliases).find(([,alias])=>alias===header)?.[0]??header; if(!headers.includes(expected)) throw new Error(`Required column is missing: ${expected}`); }
  const rows: ParticipantRow[]=matrix.slice(1).filter(cells=>cells.some(cell=>text(cell))).map((cells,index)=>{
    const sourceRaw=Object.fromEntries(headers.map((header,column)=>[header,cells[column]])) as RawRow; const raw={...sourceRaw} as RawRow; if(english) for(const [canonical,alias] of Object.entries(headerAliases)) raw[canonical]=sourceRaw[alias]; const sourceRowNumber=index+2;
    const buildingId=text(raw.gebaeude_id), sourceRole=text(raw.mk7_rolle), role=roleAliases[sourceRole]??sourceRole, meloId=text(raw.messlokation_id_MeLo), maloId=text(raw.marktlokation_id_bezug_MaLo);
    if(!buildingId||!role||!meloId||!maloId) throw new Error(`Row ${sourceRowNumber}: required ID or role is missing.`);
    const participationRaw=text(raw['Teilnahme MK7']); // Invalid participation values are kept and reported by Prüfung der Daten (rule V07), not rejected here.
    const unverified=Object.fromEntries(['inaktive_marktlokationseigenschaften','zaehlpunktkopf_status','abrechnungssperre','korrekturvorschlag'].map(key=>[key,text(raw[key])]));
    return { sourceId:`${sourceSheet}:${sourceRowNumber}`, sourceFile:fileName, sourceSheet, sourceRowNumber, buildingId, role, participationRaw, participates:participationRaw.toLocaleLowerCase('de')==='ja', meloId, maloId, generationFeedInMaloId:text(raw.marktlokation_id_einspeisung_MaLo)||undefined, supplyStartUtc:excelDateToIso(raw.mk7_versorgungsbeginn_utc), contractFromUtc:excelDateToIso(raw.vertragsbeginn_utc), contractToUtc:excelDateToIso(raw.vertragsende_utc), city:text(raw.stadt)||undefined, operator:text(raw.mk7_betreiber)||undefined, streetAddress:text(raw.strassenadresse)||undefined, maloConflict:false, unverifiedSourceAttributes:JSON.stringify(unverified), sourceData:JSON.stringify(sourceRaw) } satisfies ParticipantRow;
  });
  const reststromByBuilding=new Map<string,string[]>(); for(const row of rows.filter(item=>item.role===ROLES.reststrom)) reststromByBuilding.set(row.buildingId,[...(reststromByBuilding.get(row.buildingId)??[]),row.maloId]);
  for(const row of rows){ const targets=[...new Set(reststromByBuilding.get(row.buildingId)??[])]; // Zero or several Reststrom-MaLos are reported by Prüfung der Daten (rule V04).
 row.reststromMaloId=targets.length===1?targets[0]:undefined; }
  const rowsByMalo=new Map<string,ParticipantRow[]>(); for(const row of rows) rowsByMalo.set(row.maloId,[...(rowsByMalo.get(row.maloId)??[]),row]);
  // Multiple MeLos can legitimately measure one MaLo. Flag a conflict only
  // when the same MaLo is assigned across buildings; the UI can then show the
  // exact source assignments without claiming the MeLos themselves conflict.
  for(const assignments of rowsByMalo.values()){ const buildings=new Set(assignments.map(row=>row.buildingId)); assignments.forEach(row=>{row.maloConflict=buildings.size>1;}); }
  return {checksum,rows};
}
