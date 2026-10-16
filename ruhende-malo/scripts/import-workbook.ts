import cds from '@sap/cds';
import { registerConstructs } from '../srv/construct/registration.js';
import { readFullWorkbook, type SourceRecord } from './full-workbook.js';

const ns=(name:string)=>`mk7.controlcenter.${name}`;
const CHUNK_SIZE=2_000;
async function replaceInChunks(tx:cds.Service,entity:string,records:SourceRecord[]){
  await tx.run(DELETE.from(ns(entity)));
  for(let offset=0;offset<records.length;offset+=CHUNK_SIZE) await tx.run(INSERT.into(ns(entity)).entries(records.slice(offset,offset+CHUNK_SIZE)));
}

/** Deploys the schema, imports every workbook sheet and registers the MK7 participant baseline. */
const workbook = await readFullWorkbook();
const dbFile = process.env.DB_FILE ?? 'db.sqlite';   // Docker: a file on the persistent volume
await cds.deploy('*').to(`sqlite:${dbFile}`);
const db = await cds.connect.to('db');
for(const statement of [
  'CREATE INDEX IF NOT EXISTS idx_consumption_building_time ON mk7_controlcenter_HourlyConsumption(buildingId,startTime)',
  'CREATE INDEX IF NOT EXISTS idx_consumption_malo_time ON mk7_controlcenter_HourlyConsumption(maloId,startTime)',
  'CREATE INDEX IF NOT EXISTS idx_consumption_melo_time ON mk7_controlcenter_HourlyConsumption(meloId,startTime)',
  'CREATE INDEX IF NOT EXISTS idx_generation_building_time ON mk7_controlcenter_HourlyGeneration(buildingId,startTime)',
  'CREATE INDEX IF NOT EXISTS idx_generation_malo_time ON mk7_controlcenter_HourlyGeneration(maloId,startTime)',
  'CREATE INDEX IF NOT EXISTS idx_energy_prices_time ON mk7_controlcenter_EnergyPrices(startTime,endTime)'
]) await db.run(statement);
const result = await db.tx(async(tx)=>{
  const sources:[string,SourceRecord[]][]=[['ProducerOnboarding',workbook.producerOnboarding],['HourlyConsumption',workbook.hourlyConsumption],['HourlyGeneration',workbook.hourlyGeneration],['EnergyPrices',workbook.energyPrices],['SourceFieldDescriptions',workbook.fieldDescriptions],['FinancialRules',workbook.financialRules]];
  for(const [entity,records] of sources) await replaceInChunks(tx,entity,records);
  await tx.run(DELETE.from(ns('ImportedSheets')));
  const now=new Date().toISOString();
  await tx.run(INSERT.into(ns('ImportedSheets')).entries([
    ['Producer Onboarding',workbook.producerOnboarding.length],['MK7 Participants',workbook.participants.length],['Hourly Consumption',workbook.hourlyConsumption.length],['Hourly Generation',workbook.hourlyGeneration.length],['Energy Pricing',workbook.energyPrices.length],['Field Descriptions',workbook.fieldDescriptions.length],['Financial Rules',workbook.financialRules.length]
  ].map(([sheetName,rowCount])=>({importChecksum:workbook.checksum,sourceFile:workbook.fileName,sheetName,rowCount,importedAt:now,status:'SUCCESS'}))));
  const registration=await registerConstructs(tx,workbook.participants,{file:workbook.fileName,checksum:workbook.checksum,actor:'IMPORT'},{replaceAll:true});
  const totalRows=workbook.producerOnboarding.length+workbook.participants.length+workbook.hourlyConsumption.length+workbook.hourlyGeneration.length+workbook.energyPrices.length+workbook.fieldDescriptions.length+workbook.financialRules.length;
  await tx.run(UPDATE(ns('ImportRuns')).set({totalRows,message:`Imported 7 sheets (${totalRows} rows); registered ${registration.constructIds.join(', ')}`}).where({sourceChecksum:workbook.checksum}));
  return registration;
});
const sourceRows=workbook.producerOnboarding.length+workbook.participants.length+workbook.hourlyConsumption.length+workbook.hourlyGeneration.length+workbook.energyPrices.length+workbook.fieldDescriptions.length+workbook.financialRules.length;
console.log(JSON.stringify({...result,sourceRows,sheets:7,conflicts:[...new Set(workbook.participants.filter(r=>r.maloConflict).map(r=>r.maloId))]},null,2));
