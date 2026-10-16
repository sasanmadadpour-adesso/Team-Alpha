import cds from '@sap/cds';
import type { BusinessState,Period,ReferencedOperation } from '../domain/lifecycle.js';
const ns='mk7.controlcenter.';
export class CapLifecycleRepository {
  constructor(readonly tx:cds.Service){}
  async state(maloId:string):Promise<BusinessState|undefined>{const row=await this.tx.run(SELECT.one.from(`${ns}MarketLocations`).columns('businessState').where({maloId}));return row?.businessState as BusinessState|undefined;}
  async periods(maloId:string):Promise<Period[]>{const rows=await this.tx.run(SELECT.from(`${ns}LifecyclePeriods`).columns('ID as id','businessState','validFrom','validToExclusive').where({maloId}));return rows as Period[];}
  async reference(id:string|undefined,maloId:string):Promise<ReferencedOperation|undefined>{if(!id)return undefined;const row=await this.tx.run(SELECT.one.from(`${ns}ProcessRequests`).columns('ID as id','operation','effectiveDate','status','referenceOperationId').where({ID:id,maloId}));return row as ReferencedOperation|undefined;}
  async completed(operation:string,maloId:string,buildingId:string,effectiveDate:string,referenceOperationId?:string):Promise<boolean>{const where:Record<string,unknown>={operation,maloId,buildingId,effectiveDate,status:'SUCCESS'};if(referenceOperationId)where.referenceOperationId=referenceOperationId;return Boolean(await this.tx.run(SELECT.one.from(`${ns}ProcessRequests`).columns('ID').where(where)));}
  async reversed(referenceOperationId:string|undefined):Promise<boolean>{if(!referenceOperationId)return false;return Boolean(await this.tx.run(SELECT.one.from(`${ns}ProcessRequests`).columns('ID').where({operation:'REVERSE_TRANSITION',referenceOperationId,status:'SUCCESS'})));}
}
