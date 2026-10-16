import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { excelDateToIso, parseParticipantWorkbook, type ParticipantRow } from './workbook.js';

export const FULL_WORKBOOK_PATH = path.resolve('data/source/new-data-source.xlsx');
export const FULL_SHEETS = ['Producer Onboarding','MK7 Participants','Hourly Consumption','Hourly Generation','Energy Pricing','Field Descriptions','Financial Rules'] as const;
type Cell = string | number | boolean | Date | null | undefined;
type Raw = Record<string, Cell>;
export interface SourceRecord { sourceId:string; sourceFile:string; sourceSheet:string; sourceRowNumber:number; importChecksum:string; [key:string]: unknown }
export interface FullWorkbookData { checksum:string; fileName:string; participants:ParticipantRow[]; producerOnboarding:SourceRecord[]; hourlyConsumption:SourceRecord[]; hourlyGeneration:SourceRecord[]; energyPrices:SourceRecord[]; fieldDescriptions:SourceRecord[]; financialRules:SourceRecord[] }
const text=(v:Cell)=>v===null||v===undefined?'':String(v).trim();
const number=(v:Cell):number|undefined=>v===null||v===undefined||v===''?undefined:Number(v);
const bool=(v:Cell)=>text(v).toLowerCase()==='true';
const timestamp=(v:Cell):string=>{const value=text(v); if(!value||Number.isNaN(Date.parse(value))) throw new Error(`Invalid timestamp: ${value}`); return new Date(value).toISOString();};

function rows(workbook:XLSX.WorkBook,sheetName:string,fileName:string,checksum:string):Array<{raw:Raw;meta:SourceRecord}> {
  const sheet=workbook.Sheets[sheetName]; if(!sheet) throw new Error(`Sheet '${sheetName}' is missing.`);
  const matrix=XLSX.utils.sheet_to_json<Cell[]>(sheet,{header:1,raw:true,defval:null});
  const headers=(matrix[0]??[]).map(text);
  return matrix.slice(1).map((cells,index)=>({cells,index})).filter(({cells})=>cells.some(v=>text(v))).map(({cells,index})=>({
    raw:Object.fromEntries(headers.map((header,column)=>[header,cells[column]])),
    meta:{sourceId:`${sheetName}:${index+2}`,sourceFile:fileName,sourceSheet:sheetName,sourceRowNumber:index+2,importChecksum:checksum}
  }));
}

export async function readFullWorkbook(filePath=FULL_WORKBOOK_PATH):Promise<FullWorkbookData>{
  const bytes=await readFile(filePath), fileName=path.basename(filePath), checksum=createHash('sha256').update(bytes).digest('hex');
  const workbook=XLSX.read(bytes,{type:'buffer',cellDates:false});
  for(const sheet of FULL_SHEETS) if(!workbook.Sheets[sheet]) throw new Error(`Sheet '${sheet}' is missing.`);
  const map=(sheet:string,fn:(r:Raw)=>Record<string,unknown>)=>rows(workbook,sheet,fileName,checksum).map(({raw,meta})=>({...meta,...fn(raw)}));
  return {
    checksum,fileName,participants:parseParticipantWorkbook(bytes,fileName).rows,
    producerOnboarding:map('Producer Onboarding',r=>({firstName:text(r.first_name),lastName:text(r.last_name),email:text(r.email),salutation:text(r.salutation),isBusiness:bool(r.is_business),isReverseCharge:bool(r.is_reverse_charge),deliveryStreet:text(r.deliv_address_street),deliveryHouseNumber:text(r.deliv_address_house_number),deliveryZipcode:text(r.deliv_address_zipcode),deliveryCity:text(r.deliv_address_city),subscriptionReason:text(r.subscription_reason),productionType:text(r.production_type),plantCapacityKw:number(r.plant_capacity_kw),latitude:number(r['plant_specifics.latitude']),longitude:number(r['plant_specifics.longitude']),marketLocationId:text(r.market_location_identifier),tranche:text(r.tranche),preferredDeliveryStart:excelDateToIso(r.preferred_delivery_start),saasCustomerId:text(r.saas_customer_id),saasContractId:text(r.saas_contract_id),productName:text(r.product_name),consumerSaasContractId:text(r.consumer_saas_contract_id),controlResource:text(r.control_resource),technicalResources:text(r.technical_resources),contractStartUtc:excelDateToIso(r.contract_start_utc),contractEndUtc:excelDateToIso(r.contract_end_utc),buildingId:text(r.building_id),sourceData:JSON.stringify(r)})),
    hourlyConsumption:map('Hourly Consumption',r=>({startTime:timestamp(r.start_time),endTime:timestamp(r.end_time),buildingId:text(r.building_id),meloId:text(r.metering_location_id_MeLo),maloId:text(r.market_location_id_MaLo),participationRaw:text(r['Teilnahme MK7']),participates:text(r['Teilnahme MK7']).toLowerCase()==='ja',consumptionKwh:number(r.consumption_kwh),energyUnit:text(r.energy_unit),aggregationType:text(r.aggregation_type)})),
    hourlyGeneration:map('Hourly Generation',r=>({startTime:timestamp(r.start_time),endTime:timestamp(r.end_time),buildingId:text(r.building_id),maloId:text(r.market_location_id_MaLo),productionType:text(r.production_type),plantCapacityKw:number(r.plant_capacity_kw),generationKwh:number(r.generation_kwh),energyUnit:text(r.energy_unit),aggregationType:text(r.aggregation_type)})),
    energyPrices:map('Energy Pricing',r=>({startTime:timestamp(r.start_time),endTime:timestamp(r.end_time),aggregationType:text(r.aggregation_type),marketPriceEurKwh:number(r.market_price_eur_kwh),retailPriceEurKwh:number(r.retail_price_eur_kwh),plantPurchasePriceEurKwh:number(r.plant_purchase_price_eur_kwh),exportRemunerationEurKwh:number(r.export_remuneration_eur_kwh),tenantElectricitySubsidyEurKwh:number(r.mieterstrom_subsidy_eur_kwh),meteringFeeEurPerMeter24h:number(r.metering_fee_eur_per_meter_24h),residualSupplier:text(r.reststrom_supplier),networkOperator:text(r.network_operator),meteringOperator:text(r.metering_operator)})),
    fieldDescriptions:map('Field Descriptions',r=>({fieldName:text(r.field),requirement:text(r.requirement),description:text(r.description)})),
    financialRules:map('Financial Rules',r=>({section:text(r.section),item:text(r.item),payer:text(r.payer),recipient:text(r.recipient),rateSource:text(r.rate_source),calculationOrRule:text(r.calculation_or_rule)}))
  };
}
