import cds from '@sap/cds';
import { CapTransitionRepository } from './adapters/cap-transition-repository.js';
import { buildDormantPlan, type PrerequisiteProfile, type TransitionInput, type TransitionPlan } from './domain/transition.js';

interface ActionData { maloId:string; buildingId:string; effectiveDate:string; prerequisiteProfile:string; confirmed?:boolean; }
const profile=(value:string):PrerequisiteProfile=>value==='ASSUMED_DEMO'?'ASSUMED_DEMO':'STRICT';
const response=(plan:TransitionPlan,requestId?:string)=>({...plan,reststromMaloId:plan.reststromMaloId??'',beforeState:plan.beforeState??'',checksJson:JSON.stringify(plan.checks),requestId:requestId??null,checks:undefined});

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

    await super.init();
  }
}
