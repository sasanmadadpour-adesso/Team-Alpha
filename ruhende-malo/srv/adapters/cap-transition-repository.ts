import cds from '@sap/cds';
import type { LocationState, SourceAssignment, TransitionReader } from '../domain/transition.js';
import type { RelationshipRecord } from '../domain/reconciliation.js';
export class CapTransitionRepository implements TransitionReader {
  constructor(private readonly tx:cds.Service){}
  async assignments(maloId:string):Promise<SourceAssignment[]>{ const rows=await this.tx.run(SELECT.from('mk7.controlcenter.ParticipantSourceRows').columns('buildingId','role','participates','reststromMaloId','maloConflict','supplyStartUtc').where({maloId})); return rows as SourceAssignment[]; }
  async location(maloId:string):Promise<LocationState|undefined>{ const row=await this.tx.run(SELECT.one.from('mk7.controlcenter.MarketLocations').columns('maloId','businessState','conflictingAssignment').where({maloId})); return row as LocationState|undefined; }
  async completed(maloId:string,buildingId:string,effectiveDate:string):Promise<boolean>{ const row=await this.tx.run(SELECT.one.from('mk7.controlcenter.ProcessRequests').columns('ID').where({maloId,buildingId,effectiveDate,operation:'SET_DORMANT',status:'SUCCESS'})); return Boolean(row); }
  async relationships(buildingId:string):Promise<RelationshipRecord[]>{const rows=await this.tx.run(SELECT.from('mk7.controlcenter.Relationships').columns('kind','source','buildingId','fromLocationId','toLocationId','validFrom','validToExclusive','provenance').where({buildingId}));return rows as RelationshipRecord[];}
  async lifecyclePeriods(maloId:string):Promise<{businessState:string;validFrom?:string;validToExclusive?:string}[]>{const rows=await this.tx.run(SELECT.from('mk7.controlcenter.LifecyclePeriods').columns('businessState','validFrom','validToExclusive').where({maloId}));return rows as {businessState:string;validFrom?:string;validToExclusive?:string}[];}
}
