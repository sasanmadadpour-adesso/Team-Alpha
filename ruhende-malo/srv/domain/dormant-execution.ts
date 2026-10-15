import cds from '@sap/cds';
import {CapTransitionRepository} from '../adapters/cap-transition-repository.js';
import {buildDormantPlan,type PrerequisiteProfile,type TransitionPlan} from './transition.js';
export interface DormantExecutionInput {maloId:string;buildingId:string;effectiveDate:string;prerequisiteProfile:PrerequisiteProfile;confirmed:boolean;mode:'MANUAL'|'BATCH';actor:string;batchId?:string;}
export interface DormantExecutionResult {plan:TransitionPlan;requestId?:string;}
const entity=(name:string)=>`mk7.controlcenter.${name}`;
export async function executeDormant(tx:cds.Service,input:DormantExecutionInput):Promise<DormantExecutionResult>{
 const repository=new CapTransitionRepository(tx); let plan=await buildDormantPlan(repository,input);
 if(!input.confirmed&&plan.canExecute)return {plan:{...plan,status:'BLOCKED',code:'CONFIRMATION_REQUIRED',message:'Explicit confirmation is required.',canExecute:false}};
 const existing=await tx.run(SELECT.one.from(entity('ProcessRequests')).columns('ID').where({idempotencyKey:`SET_DORMANT|${input.maloId}|${input.buildingId}|${input.effectiveDate}`}));
 if(existing)return {plan:{...plan,status:'ALREADY_DONE',code:'ALREADY_DONE',message:'The identical simulated Ruhendstellung was already processed.',canExecute:false},requestId:existing.ID};
 const terminal=!plan.canExecute; const requestId=cds.utils.uuid(),now=new Date().toISOString(),idempotencyKey=`SET_DORMANT|${input.maloId}|${input.buildingId}|${input.effectiveDate}`;
 await tx.run(INSERT.into(entity('ProcessRequests')).entries({ID:requestId,operation:'SET_DORMANT',maloId:input.maloId,buildingId:input.buildingId,effectiveDate:input.effectiveDate,mode:input.mode,status:terminal?plan.status:'PROCESSING',resultCode:terminal?plan.code:undefined,resultMessage:terminal?plan.message:undefined,beforeState:plan.beforeState,afterState:terminal?plan.beforeState:undefined,executionTime:now,batchId:input.batchId,idempotencyKey,actor:input.actor,reststromMaloId:plan.reststromMaloId,simulated:true}));
 if(plan.checks.length)await tx.run(INSERT.into(entity('PrerequisiteChecks')).entries(plan.checks.map(item=>({requestId,checkCode:item.code,result:item.result,confidence:item.confidence,notes:item.message}))));
 if(terminal)return {plan,requestId};
 await tx.run(UPDATE(entity('LifecyclePeriods')).set({validToExclusive:input.effectiveDate}).where({maloId:input.maloId,businessState:'ACTIVE',validToExclusive:null}));
 await tx.run(INSERT.into(entity('LifecyclePeriods')).entries({maloId:input.maloId,businessState:'RUHEND',validFrom:input.effectiveDate,provenance:'SIMULATED_TRANSITION'}));
 await tx.run(UPDATE(entity('MarketLocations')).set({businessState:'RUHEND'}).where({maloId:input.maloId}));
 const persisted=await tx.run(SELECT.one.from(entity('MarketLocations')).columns('businessState').where({maloId:input.maloId})); if(persisted?.businessState!=='RUHEND')throw new Error('Persisted state verification failed.');
 await tx.run(INSERT.into(entity('AuditEvents')).entries({requestId,operation:'SET_DORMANT',maloId:input.maloId,actor:input.actor,effectiveDate:input.effectiveDate,eventTime:now,beforeValue:JSON.stringify({businessState:'ACTIVE'}),afterValue:JSON.stringify({businessState:'RUHEND',reststromMaloId:plan.reststromMaloId}),reason:'Explicitly confirmed simulated Ruhendstellung',simulated:true}));
 plan={...plan,status:'SUCCESS',code:'SIMULATED_SUCCESS',message:'Simulated Ruhendstellung persisted and verified in SQLite.',beforeState:'ACTIVE',afterState:'RUHEND',canExecute:false};
 await tx.run(UPDATE(entity('ProcessRequests')).set({status:'SUCCESS',resultCode:plan.code,resultMessage:plan.message,beforeState:'ACTIVE',afterState:'RUHEND',executionTime:now}).where({ID:requestId})); return {plan,requestId};
}
