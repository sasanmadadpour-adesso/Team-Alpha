import cds from '@sap/cds';
import { listCases } from './construct/cases.js';

export const PORTAL_RANGES = ['24h','7d','30d','90d','1y'] as const;
export type PortalRange = typeof PORTAL_RANGES[number];
type Consumption={startTime:string;endTime:string;buildingId:string;maloId:string;consumptionKwh:number|string};
type Generation={startTime:string;endTime:string;buildingId:string;productionType:string;plantCapacityKw:number|string;generationKwh:number|string};
type Point={timestamp:string;intervalCount:number;consumptionKwh:number;generationKwh:number;localEnergyKwh:number;gridImportKwh:number;gridExportKwh:number};
const ns=(n:string)=>`mk7.controlcenter.${n}`;
const n=(v:number|string|undefined)=>Number(v??0);
const round=(v:number)=>Math.round((v+Number.EPSILON)*1000)/1000;
const rangeMs:Record<PortalRange,number>={"24h":24*3600e3,"7d":7*86400e3,"30d":30*86400e3,"90d":90*86400e3,"1y":365*86400e3};
const granularity=(range:PortalRange)=>range==='24h'?'hour':range==='1y'?'week':'day';
function bucket(iso:string,g:'hour'|'day'|'week'){
  const d=new Date(iso); if(g==='hour') return d.toISOString().slice(0,13)+':00:00.000Z';
  d.setUTCHours(0,0,0,0); if(g==='week'){const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-day+1);} return d.toISOString();
}
function address(street:string|undefined,city:string|undefined,sourceData:string|undefined){
  let postalCode='00000'; try{const raw=JSON.parse(sourceData??'{}') as Record<string,unknown>;const value=String(raw.city_postal_code??'');postalCode=value.match(/\b\d{5}\b/)?.[0]??postalCode;}catch{/* source diagnostics only */}
  return {street:street||'Unknown service location',postalCode,city:city||'Unknown'};
}
function aggregate(consumption:Consumption[],generation:Generation[],memberMalo:string,range:PortalRange){
  const byHour=new Map<string,{member:number;building:number;generation:number;intervals:Set<string>}>();
  for(const row of consumption){const x=byHour.get(row.startTime)??{member:0,building:0,generation:0,intervals:new Set<string>()};x.building+=n(row.consumptionKwh);if(row.maloId===memberMalo)x.member+=n(row.consumptionKwh);x.intervals.add(row.startTime);byHour.set(row.startTime,x);}
  for(const row of generation){const x=byHour.get(row.startTime)??{member:0,building:0,generation:0,intervals:new Set<string>()};x.generation+=n(row.generationKwh);x.intervals.add(row.startTime);byHour.set(row.startTime,x);}
  const grouped=new Map<string,Point>(); const g=granularity(range);
  for(const [time,x] of [...byHour].sort()){
    const local=Math.min(x.building,x.generation), gridImport=Math.max(x.building-x.generation,0), gridExport=Math.max(x.generation-x.building,0);
    // Explicit demo assumption: local energy is shared in proportion to each member's hourly consumption.
    const memberLocal=x.building>0?local*(x.member/x.building):0, memberGrid=Math.max(x.member-memberLocal,0), key=bucket(time,g);
    const p=grouped.get(key)??{timestamp:key,intervalCount:0,consumptionKwh:0,generationKwh:0,localEnergyKwh:0,gridImportKwh:0,gridExportKwh:0};
    p.intervalCount++;p.consumptionKwh+=x.building;p.generationKwh+=x.generation;p.localEnergyKwh+=local;p.gridImportKwh+=gridImport;p.gridExportKwh+=gridExport;
    (p as Point&{memberConsumption?:number;memberLocal?:number;memberGrid?:number}).memberConsumption=((p as Point&{memberConsumption?:number}).memberConsumption??0)+x.member;
    (p as Point&{memberLocal?:number}).memberLocal=((p as Point&{memberLocal?:number}).memberLocal??0)+memberLocal;
    (p as Point&{memberGrid?:number}).memberGrid=((p as Point&{memberGrid?:number}).memberGrid??0)+memberGrid;grouped.set(key,p);
  }
  const points=[...grouped.values()];
  const memberPoints=points.map(p=>{const x=p as Point&{memberConsumption?:number;memberLocal?:number;memberGrid?:number};return{timestamp:p.timestamp,intervalCount:p.intervalCount,consumptionKwh:round(x.memberConsumption??0),localEnergyKwh:round(x.memberLocal??0),gridImportKwh:round(x.memberGrid??0)}});
  const buildingPoints=points.map(p=>({timestamp:p.timestamp,intervalCount:p.intervalCount,consumptionKwh:round(p.consumptionKwh),generationKwh:round(p.generationKwh),localEnergyKwh:round(p.localEnergyKwh),gridImportKwh:round(p.gridImportKwh),gridExportKwh:round(p.gridExportKwh)}));
  const sum=<T>(xs:T[],f:(x:T)=>number)=>round(xs.reduce((a,x)=>a+f(x),0));
  return {g,memberPoints,buildingPoints,memberEnergy:{consumptionKwh:sum(memberPoints,x=>x.consumptionKwh),localEnergyKwh:sum(memberPoints,x=>x.localEnergyKwh),gridImportKwh:sum(memberPoints,x=>x.gridImportKwh)},buildingEnergy:{consumptionKwh:sum(buildingPoints,x=>x.consumptionKwh),generationKwh:sum(buildingPoints,x=>x.generationKwh),localEnergyKwh:sum(buildingPoints,x=>x.localEnergyKwh),gridImportKwh:sum(buildingPoints,x=>x.gridImportKwh),gridExportKwh:sum(buildingPoints,x=>x.gridExportKwh)}};
}

export class PortalError extends Error{constructor(readonly status:number,readonly code:string,message:string,readonly details:object={}){super(message)}}
export async function houseMemberPortal(malo:string,range:PortalRange,building?:string){
  const db=cds.db;
  const assignments=await db.run(SELECT.from(ns('ParticipantSourceRows')).columns('sourceId','buildingId','maloId','meloId','role','participates','excluded','streetAddress','city','sourceData').where({maloId:malo})) as Array<Record<string,unknown>>;
  const eligible=assignments.filter(x=>x.role==='Haushaltsverbrauch'&&x.participates&&!x.excluded);
  if(!eligible.length) throw new PortalError(404,'MALO_NOT_FOUND','No participating household was found for this MaLo.');
  const selected=building?eligible.find(x=>x.buildingId===building):eligible.length===1?eligible[0]:undefined;
  if(!selected) throw new PortalError(409,'AMBIGUOUS_MALO','MaLo is assigned to multiple buildings. Select building.',{availableBuildings:[...new Set(eligible.map(x=>x.buildingId))]});
  const buildingId=String(selected.buildingId);
  const latestConsumption=await db.run(SELECT.one.from(ns('HourlyConsumption')).columns({func:'max',args:[{ref:['endTime']}],as:'latest'}).where({buildingId})) as {latest?:string}|undefined;
  const latestGeneration=await db.run(SELECT.one.from(ns('HourlyGeneration')).columns({func:'max',args:[{ref:['endTime']}],as:'latest'}).where({buildingId})) as {latest?:string}|undefined;
  const end=[latestConsumption?.latest,latestGeneration?.latest].filter(Boolean).sort()[0];
  if(!end) throw new PortalError(422,'ENERGY_DATA_UNAVAILABLE','No complete consumption and generation period is available.');
  const start=new Date(Date.parse(end)-rangeMs[range]).toISOString();
  const consumption=await db.run(SELECT.from(ns('HourlyConsumption')).columns('startTime','endTime','buildingId','maloId','consumptionKwh').where({buildingId,startTime:{'>=':start},endTime:{'<=':end}})) as Consumption[];
  const generation=await db.run(SELECT.from(ns('HourlyGeneration')).columns('startTime','endTime','buildingId','productionType','plantCapacityKw','generationKwh').where({buildingId,startTime:{'>=':start},endTime:{'<=':end}})) as Generation[];
  if(!consumption.some(x=>x.maloId===malo)||!generation.length) throw new PortalError(422,'ENERGY_DATA_UNAVAILABLE','The selected range has no complete member/building energy data.');
  const a=aggregate(consumption,generation,malo,range); const cases=await listCases(db); const c=cases.find(x=>x.maloId===malo&&x.constructId===buildingId);
  const completed=c?.status==='DONE'&&c.businessState==='RUHEND'; const addr=address(String(selected.streetAddress??''),String(selected.city??''),String(selected.sourceData??''));
  const memberRows=await db.run(SELECT.from(ns('ParticipantSourceRows')).columns('maloId').where({buildingId,role:'Haushaltsverbrauch',participates:true,excluded:false})) as {maloId:string}[];
  const members=new Set(memberRows.map(x=>x.maloId)); const types=[...new Set(generation.map(x=>x.productionType))]; const capacities=new Map(types.map(type=>[type,Math.max(...generation.filter(x=>x.productionType===type).map(x=>n(x.plantCapacityKw)))]));
  const be={...a.buildingEnergy,selfSufficiencyPercent:a.buildingEnergy.consumptionKwh?round(100*a.buildingEnergy.localEnergyKwh/a.buildingEnergy.consumptionKwh):0};
  return {schemaVersion:'1.0',generatedAt:new Date().toISOString(),range,brand:{name:process.env.PORTAL_BRAND_NAME??'MK7 Demo Energy',portalName:{de:process.env.PORTAL_NAME_DE??'Hausmitglieder-Portal',en:process.env.PORTAL_NAME_EN??'House Member Portal'},logoUrl:process.env.PORTAL_LOGO_URL??'https://example.org/mk7-demo-logo.svg',primaryColor:process.env.PORTAL_PRIMARY_COLOR??'#0A6ED1',accentColor:process.env.PORTAL_ACCENT_COLOR??'#16A085'},member:{malo,melo:String(selected.meloId),address:addr,switchoverStatus:completed?'COMPLETED':'IN_PROGRESS',energy:a.memberEnergy},building:{displayId:buildingId,address:addr,productionTypes:types,installedCapacityKw:round([...capacities.values()].reduce((x,y)=>x+y,0)),memberCount:members.size,energy:be},trends:{member:{granularity:a.g,unit:'kWh',points:a.memberPoints},building:{granularity:a.g,unit:'kWh',points:a.buildingPoints}}};
}
