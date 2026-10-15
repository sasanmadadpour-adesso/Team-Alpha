import cds from '@sap/cds';
import type { LocationState, SourceAssignment, TransitionReader } from '../domain/transition.js';
export class CapTransitionRepository implements TransitionReader {
  constructor(private readonly tx:cds.Service){}
  async assignments(maloId:string):Promise<SourceAssignment[]>{ const rows=await this.tx.run(SELECT.from('mk7.controlcenter.ParticipantSourceRows').columns('buildingId','role','participates','reststromMaloId','maloConflict','supplyStartUtc').where({maloId})); return rows as SourceAssignment[]; }
  async location(maloId:string):Promise<LocationState|undefined>{ const row=await this.tx.run(SELECT.one.from('mk7.controlcenter.MarketLocations').columns('maloId','businessState','conflictingAssignment').where({maloId})); return row as LocationState|undefined; }
  async completed(maloId:string,buildingId:string,effectiveDate:string):Promise<boolean>{ const row=await this.tx.run(SELECT.one.from('mk7.controlcenter.ProcessRequests').columns('ID').where({maloId,buildingId,effectiveDate,operation:'SET_DORMANT',status:'SUCCESS'})); return Boolean(row); }
}
