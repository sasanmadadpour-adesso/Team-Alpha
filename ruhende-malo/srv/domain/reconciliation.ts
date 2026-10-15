export type RelationshipKind='MEMA'|'MAMA';
export type RelationshipSource='EXPECTED'|'MOCK_OBSERVED';
export type ReconciliationStatus='MATCH'|'MISSING'|'EXTRA'|'CONFLICT';
export interface RelationshipRecord { kind:RelationshipKind; source:RelationshipSource; buildingId:string; fromLocationId:string; toLocationId:string; validFrom?:string; validToExclusive?:string; provenance?:string; }
export interface RelationshipDifference { kind:RelationshipKind; status:ReconciliationStatus; expected?:RelationshipRecord; observed?:RelationshipRecord; code:string; message:string; blocking:boolean; }
const active=(r:RelationshipRecord,date:string)=>(!r.validFrom||r.validFrom<=date)&&(!r.validToExclusive||date<r.validToExclusive);
const same=(a:RelationshipRecord,b:RelationshipRecord)=>a.kind===b.kind&&a.buildingId===b.buildingId&&a.fromLocationId===b.fromLocationId&&a.toLocationId===b.toLocationId&&a.validFrom===b.validFrom&&a.validToExclusive===b.validToExclusive;
export function intervalsOverlap(a:RelationshipRecord,b:RelationshipRecord):boolean { const startA=a.validFrom??'0000-01-01',startB=b.validFrom??'0000-01-01',endA=a.validToExclusive??'9999-12-31',endB=b.validToExclusive??'9999-12-31'; return startA<endB&&startB<endA; }
export function invalidInterval(r:RelationshipRecord):boolean{return Boolean(r.validFrom&&r.validToExclusive&&r.validToExclusive<=r.validFrom);}
export function reconcileRelationships(records:RelationshipRecord[],buildingId:string,maloId:string,effectiveDate:string):RelationshipDifference[]{
  const relevant=records.filter(r=>r.buildingId===buildingId&&(r.kind==='MEMA'||r.fromLocationId===maloId));
  const expected=relevant.filter(r=>r.source==='EXPECTED'&&active(r,effectiveDate)); const observed=relevant.filter(r=>r.source==='MOCK_OBSERVED'&&active(r,effectiveDate)); const differences:RelationshipDifference[]=[];
  for(const r of relevant.filter(invalidInterval)) differences.push({kind:r.kind,status:'CONFLICT',expected:r.source==='EXPECTED'?r:undefined,observed:r.source==='MOCK_OBSERVED'?r:undefined,code:'INVALID_RELATIONSHIP_INTERVAL',message:'Relationship interval end must be after its start.',blocking:true});
  for(const r of expected){ if(observed.some(o=>same(r,o))) differences.push({kind:r.kind,status:'MATCH',expected:r,observed:observed.find(o=>same(r,o)),code:'RELATIONSHIP_MATCH',message:`${r.kind} relationship matches the mock-observed assignment.`,blocking:false}); else { const conflict=observed.find(o=>o.kind===r.kind&&o.fromLocationId===r.fromLocationId&&o.toLocationId!==r.toLocationId&&intervalsOverlap(r,o)); differences.push({kind:r.kind,status:conflict?'CONFLICT':'MISSING',expected:r,observed:conflict,code:conflict?'CONFLICTING_TARGET':'RELATIONSHIP_MISSING',message:conflict?`${r.kind} points to a conflicting target.`:`Expected ${r.kind} relationship is missing from mock-observed data.`,blocking:true}); }}
  for(const r of observed) if(!expected.some(e=>same(e,r))&&!differences.some(d=>d.observed===r)) differences.push({kind:r.kind,status:'EXTRA',observed:r,code:'RELATIONSHIP_EXTRA',message:`Mock-observed ${r.kind} relationship is not expected.`,blocking:true});
  const mama=observed.filter(r=>r.kind==='MAMA'&&r.fromLocationId===maloId); for(let i=0;i<mama.length;i++) for(let j=i+1;j<mama.length;j++) if(mama[i].toLocationId!==mama[j].toLocationId&&intervalsOverlap(mama[i],mama[j])) differences.push({kind:'MAMA',status:'CONFLICT',observed:mama[j],code:'OVERLAPPING_MAMA_TARGETS',message:'Overlapping MaMa intervals point to conflicting targets.',blocking:true});
  return differences;
}
