import cds from '@sap/cds';
import { CapTransitionRepository } from './adapters/cap-transition-repository.js';
import { buildDormantPlan, type PrerequisiteProfile, type TransitionInput, type TransitionPlan } from './domain/transition.js';
import { CapLifecycleRepository } from './adapters/cap-lifecycle-repository.js';
import { buildLifecyclePlan,type LifecycleOperation,type LifecyclePlan } from './domain/lifecycle.js';

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
      const data=req.data as ActionData; const input:TransitionInput={maloId:data.maloId,buildingId:data.buildingId,effectiveDate:data.effectiveDate,prerequisiteProfile:profile(data.prerequisiteProfile),confirmed:data.confirmed};
      if(data.confirmed!==true) return response({...await buildDormantPlan(new CapTransitionRepository(cds.tx(req)),input),status:'BLOCKED',code:'CONFIRMATION_REQUIRED',message:'Explicit confirmation is required.',canExecute:false});
      const tx=cds.tx(req);
        const plan=await buildDormantPlan(new CapTransitionRepository(tx),input); if(!plan.canExecute) return response(plan);
        const requestId=cds.utils.uuid(); const idempotencyKey=`SET_DORMANT|${data.maloId}|${data.buildingId}|${data.effectiveDate}`; const now=new Date().toISOString();
        await tx.run(INSERT.into('mk7.controlcenter.ProcessRequests').entries({ID:requestId,operation:'SET_DORMANT',maloId:data.maloId,buildingId:data.buildingId,effectiveDate:data.effectiveDate,mode:'MANUAL',status:'PROCESSING',idempotencyKey,actor:'DEMO_USER',reststromMaloId:plan.reststromMaloId,simulated:true}));
        await tx.run(INSERT.into('mk7.controlcenter.PrerequisiteChecks').entries(plan.checks.map(item=>({requestId,checkCode:item.code,result:item.result,confidence:item.confidence,notes:item.message}))));
        await tx.run(UPDATE('mk7.controlcenter.LifecyclePeriods').set({validToExclusive:data.effectiveDate}).where({maloId:data.maloId,businessState:'ACTIVE',validToExclusive:null}));
        await tx.run(INSERT.into('mk7.controlcenter.LifecyclePeriods').entries({maloId:data.maloId,businessState:'RUHEND',validFrom:data.effectiveDate,provenance:'SIMULATED_TRANSITION'}));
        await tx.run(UPDATE('mk7.controlcenter.MarketLocations').set({businessState:'RUHEND'}).where({maloId:data.maloId}));
        const persisted=await tx.run(SELECT.one.from('mk7.controlcenter.MarketLocations').columns('businessState').where({maloId:data.maloId})); if(persisted?.businessState!=='RUHEND') throw new Error('Persisted state verification failed.');
        await tx.run(INSERT.into('mk7.controlcenter.AuditEvents').entries({requestId,operation:'SET_DORMANT',maloId:data.maloId,actor:'DEMO_USER',effectiveDate:data.effectiveDate,eventTime:now,beforeValue:JSON.stringify({businessState:'ACTIVE'}),afterValue:JSON.stringify({businessState:'RUHEND',reststromMaloId:plan.reststromMaloId}),reason:'Explicitly confirmed simulated Ruhendstellung',simulated:true}));
        await tx.run(UPDATE('mk7.controlcenter.ProcessRequests').set({status:'SUCCESS'}).where({ID:requestId}));
      return response({...plan,status:'SUCCESS',code:'SIMULATED_SUCCESS',message:'Simulated Ruhendstellung persisted and verified in SQLite.',beforeState:'ACTIVE',afterState:'RUHEND',canExecute:false},requestId);
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

    await super.init();
  }
}
