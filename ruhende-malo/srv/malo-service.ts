import cds from '@sap/cds';
import { CapTransitionRepository } from './adapters/cap-transition-repository.js';
import { buildDormantPlan, type PrerequisiteProfile, type TransitionInput, type TransitionPlan } from './domain/transition.js';
import { CapLifecycleRepository } from './adapters/cap-lifecycle-repository.js';
import { buildLifecyclePlan,type LifecycleOperation,type LifecyclePlan } from './domain/lifecycle.js';
import {executeDormant} from './domain/dormant-execution.js';
import {summarizeBatch} from './domain/batch.js';
import {runScenarios} from './domain/scenario-runner.js';

interface ActionData { maloId:string; buildingId:string; effectiveDate:string; prerequisiteProfile:string; confirmed?:boolean; reason?:string; referenceOperationId?:string; }
const profile=(value:string):PrerequisiteProfile=>value==='ASSUMED_DEMO'?'ASSUMED_DEMO':'STRICT';
const response=(plan:TransitionPlan,requestId?:string)=>({...plan,reststromMaloId:plan.reststromMaloId??'',beforeState:plan.beforeState??'',checksJson:JSON.stringify(plan.checks),reconciliationJson:JSON.stringify(plan.reconciliation),requestId:requestId??null,checks:undefined,reconciliation:undefined});
const lifecycleResponse=(plan:LifecyclePlan,requestId?:string)=>({...plan,maloId:'',buildingId:'',reststromMaloId:'',simulated:true,prerequisiteProfile:'ASSUMED_DEMO',checksJson:JSON.stringify([{code:'LIFECYCLE_VALIDATION',result:plan.canExecute?'PASSED':'FAILED',confidence:'VERIFIED_SIMULATED',message:plan.message}]),reconciliationJson:'[]',requestId:requestId??null,changes:undefined});

export default class MaloService extends cds.ApplicationService {
  async init(): Promise<void> {
    this.on('health', () => ({
      status: 'OK',
      mode: 'SIMULATION',
      sapConnection: 'NOT_CONFIGURED',
    }));
    this.on('previewTransition', async req=>{
      const data=req.data as ActionData; const input:TransitionInput={maloId:data.maloId,buildingId:data.buildingId,effectiveDate:data.effectiveDate,prerequisiteProfile:profile(data.prerequisiteProfile)};
      return response(await buildDormantPlan(new CapTransitionRepository(cds.tx(req)),input));
    });
    this.on('reconcileRelationships',async req=>{const data=req.data as ActionData; return response(await buildDormantPlan(new CapTransitionRepository(cds.tx(req)),{maloId:data.maloId,buildingId:data.buildingId,effectiveDate:data.effectiveDate,prerequisiteProfile:'STRICT'}));});
    this.on('setDormant', async req=>{
      const data=req.data as ActionData; const result=await executeDormant(cds.tx(req),{maloId:data.maloId,buildingId:data.buildingId,effectiveDate:data.effectiveDate,prerequisiteProfile:profile(data.prerequisiteProfile),confirmed:data.confirmed===true,mode:'MANUAL',actor:'DEMO_USER'}); return response(result.plan,result.requestId);
    });
    const lifecycleAction=async(operation:LifecycleOperation,req:cds.Request)=>{
      const data=req.data as ActionData; const tx=cds.tx(req); const repository=new CapLifecycleRepository(tx); const currentState=await repository.state(data.maloId);
      if(!currentState)return lifecycleResponse({status:'BLOCKED',code:'MALO_NOT_FOUND',message:'MaLo was not found.',canExecute:false,beforeState:'ACTIVE',afterState:'ACTIVE',effectiveDate:data.effectiveDate,changes:{}});
      const reference=await repository.reference(data.referenceOperationId,data.maloId); const input={operation,effectiveDate:data.effectiveDate,reason:data.reason,referenceOperationId:data.referenceOperationId,currentState,periods:await repository.periods(data.maloId),reference,alreadyCompleted:await repository.completed(operation,data.maloId,data.buildingId,data.effectiveDate,data.referenceOperationId),alreadyReversed:operation==='REVERSE_TRANSITION'?await repository.reversed(data.referenceOperationId):false};
      let plan=buildLifecyclePlan(input); if(data.confirmed!==true&&plan.canExecute)plan={...plan,status:'BLOCKED',code:'CONFIRMATION_REQUIRED',message:'Explicit confirmation is required.',canExecute:false}; if(!plan.canExecute)return {...lifecycleResponse(plan),maloId:data.maloId,buildingId:data.buildingId};
      const requestId=cds.utils.uuid(),now=new Date().toISOString(),idempotencyKey=[operation,data.maloId,data.buildingId,data.effectiveDate,data.referenceOperationId??''].join('|');
      await tx.run(INSERT.into('mk7.controlcenter.ProcessRequests').entries({ID:requestId,operation,maloId:data.maloId,buildingId:data.buildingId,effectiveDate:data.effectiveDate,mode:'MANUAL',status:'PROCESSING',idempotencyKey,referenceOperationId:data.referenceOperationId,actor:'DEMO_USER',reason:data.reason,simulated:true}));
      const before={businessState:currentState,periods:input.periods};
      if(plan.changes.closePeriodId)await tx.run(UPDATE('mk7.controlcenter.LifecyclePeriods').set({validToExclusive:data.effectiveDate}).where({ID:plan.changes.closePeriodId}));
      if(plan.changes.openState){await tx.run(INSERT.into('mk7.controlcenter.LifecyclePeriods').entries({maloId:data.maloId,businessState:plan.changes.openState,validFrom:data.effectiveDate,provenance:`SIMULATED_${operation}`}));await tx.run(UPDATE('mk7.controlcenter.MarketLocations').set({businessState:plan.afterState}).where({maloId:data.maloId}));}
      if(plan.changes.relationshipAction==='CLOSE'){
        const sourceRows=await tx.run(SELECT.from('mk7.controlcenter.ParticipantSourceRows').columns('meloId').where({maloId:data.maloId,buildingId:data.buildingId})) as {meloId:string}[];
        const openRelationships=await tx.run(SELECT.from('mk7.controlcenter.Relationships').columns('ID','fromLocationId','toLocationId').where({source:'MOCK_OBSERVED',buildingId:data.buildingId,validToExclusive:null})) as {ID:string;fromLocationId:string;toLocationId:string}[];
        const meloIds=new Set(sourceRows.map(row=>row.meloId)); const relationshipIds=openRelationships.filter(item=>item.fromLocationId===data.maloId||meloIds.has(item.toLocationId)).map(item=>item.ID);
        if(relationshipIds.length)await tx.run(UPDATE('mk7.controlcenter.Relationships').set({validToExclusive:data.effectiveDate}).where({ID:{in:relationshipIds}}));
      }
      if(plan.changes.correction){await tx.run(UPDATE('mk7.controlcenter.LifecyclePeriods').set({validToExclusive:plan.changes.correction.newDate}).where({maloId:data.maloId,validToExclusive:plan.changes.correction.previousDate}));await tx.run(UPDATE('mk7.controlcenter.LifecyclePeriods').set({validFrom:plan.changes.correction.newDate}).where({maloId:data.maloId,validFrom:plan.changes.correction.previousDate}));}
      const afterPeriods=await repository.periods(data.maloId),persistedState=await repository.state(data.maloId); if(persistedState!==plan.afterState||afterPeriods.some(p=>p.validFrom&&p.validToExclusive&&p.validToExclusive<=p.validFrom))throw new Error('Lifecycle write verification failed.');
      await tx.run(INSERT.into('mk7.controlcenter.AuditEvents').entries({requestId,referenceOperationId:data.referenceOperationId,operation,maloId:data.maloId,actor:'DEMO_USER',effectiveDate:data.effectiveDate,eventTime:now,beforeValue:JSON.stringify(before),afterValue:JSON.stringify({businessState:persistedState,periods:afterPeriods,relationshipAction:plan.changes.relationshipAction}),reason:data.reason??plan.message,simulated:true}));
      await tx.run(UPDATE('mk7.controlcenter.ProcessRequests').set({status:'SUCCESS'}).where({ID:requestId})); plan={...plan,status:'SUCCESS',code:'SIMULATED_SUCCESS',message:`${operation} persisted and verified in SQLite.`,canExecute:false}; return {...lifecycleResponse(plan,requestId),maloId:data.maloId,buildingId:data.buildingId};
    };
    this.on('reactivate',req=>lifecycleAction('REACTIVATE',req));
    this.on('removeFromConstruct',req=>lifecycleAction('REMOVE_FROM_CONSTRUCT',req));
    this.on('correctTransition',req=>lifecycleAction('CORRECT_TRANSITION',req));
    this.on('reverseTransition',req=>lifecycleAction('REVERSE_TRANSITION',req));
    this.on('executeBatch',async req=>{
      const data=req.data as ActionData;if(data.confirmed!==true)return req.reject(400,'Explicit batch confirmation is required.'); const tx=cds.tx(req); const sourceRows=await tx.run(SELECT.from('mk7.controlcenter.ParticipantSourceRows').columns('maloId').where({buildingId:data.buildingId,role:'Haushaltsverbrauch'})) as {maloId:string}[]; const maloIds=[...new Set(sourceRows.map(row=>row.maloId))],batchId=cds.utils.uuid(),results:Record<string,unknown>[]=[];
      for(const maloId of maloIds){try{const captured=await executeDormant(tx,{maloId,buildingId:data.buildingId,effectiveDate:data.effectiveDate,prerequisiteProfile:profile(data.prerequisiteProfile),confirmed:true,mode:'BATCH',actor:'DEMO_BATCH',batchId});results.push({...captured.plan,requestId:captured.requestId});}catch(error){results.push({maloId,status:'ERROR',code:'BATCH_ITEM_ERROR',message:error instanceof Error?error.message:'Unexpected batch item error.'});}}
      return {batchId,buildingId:data.buildingId,...summarizeBatch(results as {status:string;code:string;maloId:string}[]),resultsJson:JSON.stringify(results),simulated:true};
    });
    this.on('resetDemo',async req=>{
      if(req.data.confirmed!==true)return req.reject(400,'Explicit reset confirmation is required.'); const tx=cds.tx(req); await tx.run(DELETE.from('mk7.controlcenter.PrerequisiteChecks'));await tx.run(DELETE.from('mk7.controlcenter.AuditEvents'));await tx.run(DELETE.from('mk7.controlcenter.ProcessRequests'));await tx.run(DELETE.from('mk7.controlcenter.LifecyclePeriods'));await tx.run(UPDATE('mk7.controlcenter.MarketLocations').set({businessState:'ACTIVE'}));
      const households=await tx.run(SELECT.from('mk7.controlcenter.MarketLocations').columns('maloId').where({primaryRole:'Haushaltsverbrauch'})) as {maloId:string}[];if(households.length)await tx.run(INSERT.into('mk7.controlcenter.LifecyclePeriods').entries(households.map(row=>({maloId:row.maloId,businessState:'ACTIVE',provenance:'WORKBOOK_BASELINE'}))));await tx.run(DELETE.from('mk7.controlcenter.Relationships').where({source:'MOCK_OBSERVED'}));const expected=await tx.run(SELECT.from('mk7.controlcenter.Relationships').where({source:'EXPECTED'})) as Record<string,unknown>[];if(expected.length)await tx.run(INSERT.into('mk7.controlcenter.Relationships').entries(expected.map(({ID,createdAt,createdBy,modifiedAt,modifiedBy,...row})=>({...row,source:'MOCK_OBSERVED',provenance:'EXPLICIT_LOCAL_DEMO_FIXTURE_NOT_SAP'}))));return 'Demo baseline restored in SQLite. Source workbook was not modified.';
    });
    this.on('runScenarioTests',async()=>{const executedAt=new Date().toISOString(),cases=await runScenarios();return {executedAt,passed:cases.filter(item=>item.passed).length,failed:cases.filter(item=>!item.passed).length,resultsJson:JSON.stringify(cases)};});

    await super.init();
  }
}
