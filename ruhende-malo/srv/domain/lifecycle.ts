export type LifecycleOperation='REACTIVATE'|'REMOVE_FROM_CONSTRUCT'|'CORRECT_TRANSITION'|'REVERSE_TRANSITION';
export type BusinessState='ACTIVE'|'RUHEND';
export interface Period { id?:string; businessState:BusinessState; validFrom?:string; validToExclusive?:string; }
export interface ReferencedOperation { id:string; operation:string; effectiveDate:string; status:string; referenceOperationId?:string; }
export interface LifecycleInput { operation:LifecycleOperation; effectiveDate:string; reason?:string; referenceOperationId?:string; currentState:BusinessState; periods:Period[]; reference?:ReferencedOperation; alreadyCompleted?:boolean; alreadyReversed?:boolean; }
export interface LifecyclePlan { status:'READY'|'SUCCESS'|'BLOCKED'|'ALREADY_DONE'; code:string; message:string; canExecute:boolean; beforeState:BusinessState; afterState:BusinessState; effectiveDate:string; referenceOperationId?:string; changes:{closePeriodId?:string;openState?:BusinessState;relationshipAction?:'CLOSE';correction?:{previousDate:string;newDate:string}}; }
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const covers=(p:Period,date:string)=>(!p.validFrom||p.validFrom<=date)&&(!p.validToExclusive||date<p.validToExclusive);
export function hasContradictoryOverlaps(periods:Period[]):boolean { for(let i=0;i<periods.length;i++) for(let j=i+1;j<periods.length;j++){const a=periods[i],b=periods[j];const overlap=(a.validFrom??'0000-01-01')<(b.validToExclusive??'9999-12-31')&&(b.validFrom??'0000-01-01')<(a.validToExclusive??'9999-12-31');if(overlap&&a.businessState!==b.businessState)return true;} return periods.some(p=>Boolean(p.validFrom&&p.validToExclusive&&p.validToExclusive<=p.validFrom)); }
const blocked=(input:LifecycleInput,code:string,message:string):LifecyclePlan=>({status:'BLOCKED',code,message,canExecute:false,beforeState:input.currentState,afterState:input.currentState,effectiveDate:input.effectiveDate,referenceOperationId:input.referenceOperationId,changes:{}});
export function buildLifecyclePlan(input:LifecycleInput):LifecyclePlan {
  if(!validDate(input.effectiveDate)) return blocked(input,'INVALID_EFFECTIVE_DATE','Effective date must be a valid YYYY-MM-DD date.');
  if(hasContradictoryOverlaps(input.periods)) return blocked(input,'LIFECYCLE_INTERVAL_CONFLICT','Lifecycle history contains invalid or contradictory overlapping periods.');
  if(input.alreadyCompleted) return {...blocked(input,'ALREADY_DONE','The identical lifecycle operation was already completed.'),status:'ALREADY_DONE'};
  if(input.operation==='CORRECT_TRANSITION'||input.operation==='REVERSE_TRANSITION'){
    if(!input.referenceOperationId||!input.reason?.trim()) return blocked(input,'REFERENCE_AND_REASON_REQUIRED','A valid reference operation and reason are required.');
    if(!input.reference||input.reference.status!=='SUCCESS') return blocked(input,'REFERENCE_NOT_FOUND','Referenced successful operation was not found for this MaLo.');
  }
  if(input.operation==='REACTIVATE'){
    if(input.currentState!=='RUHEND') return blocked(input,'INVALID_OPERATION_SEQUENCE','Only a dormant MaLo can be reactivated.');
    const current=input.periods.find(p=>p.businessState==='RUHEND'&&covers(p,input.effectiveDate)); if(!current||!current.validFrom||input.effectiveDate<=current.validFrom) return blocked(input,'INVALID_CHRONOLOGY','Reactivation must occur after the dormant period started.');
    return {status:'READY',code:'READY',message:'Wiederaktivierung is valid for local simulation.',canExecute:true,beforeState:'RUHEND',afterState:'ACTIVE',effectiveDate:input.effectiveDate,changes:{closePeriodId:current.id,openState:'ACTIVE'}};
  }
  if(input.operation==='REMOVE_FROM_CONSTRUCT') return {status:'READY',code:'READY',message:'Herauslösung will close mock-observed construct relationships; business state remains unchanged.',canExecute:true,beforeState:input.currentState,afterState:input.currentState,effectiveDate:input.effectiveDate,changes:{relationshipAction:'CLOSE'}};
  if(input.operation==='CORRECT_TRANSITION'){
    const oldDate=input.reference!.effectiveDate; if(input.effectiveDate===oldDate) return blocked(input,'NO_CORRECTION_CHANGE','Corrected date must differ from the original date.');
    const started=input.periods.find(p=>p.validFrom===oldDate); const ended=input.periods.find(p=>p.validToExclusive===oldDate); if(!started||!ended) return blocked(input,'CORRECTION_BOUNDARY_NOT_FOUND','Referenced transition boundary is not present in lifecycle history.');
    if((ended.validFrom&&input.effectiveDate<=ended.validFrom)||(started.validToExclusive&&input.effectiveDate>=started.validToExclusive)) return blocked(input,'INVALID_CHRONOLOGY','Corrected date would create an invalid or overlapping interval.');
    return {status:'READY',code:'READY',message:'Korrektur will move the referenced lifecycle boundary while preserving audit history.',canExecute:true,beforeState:input.currentState,afterState:input.currentState,effectiveDate:input.effectiveDate,referenceOperationId:input.referenceOperationId,changes:{correction:{previousDate:oldDate,newDate:input.effectiveDate}}};
  }
  if(input.alreadyReversed) return {...blocked(input,'ALREADY_DONE','The referenced operation was already reversed.'),status:'ALREADY_DONE'};
  if(input.effectiveDate<=input.reference!.effectiveDate) return blocked(input,'INVALID_CHRONOLOGY','Reversal must be effective after the referenced operation.');
  const target:BusinessState=input.reference!.operation==='SET_DORMANT'?'ACTIVE':'RUHEND'; if(input.currentState===target) return blocked(input,'INVALID_OPERATION_SEQUENCE','Current state already equals the compensating target state.');
  const current=input.periods.find(p=>p.businessState===input.currentState&&covers(p,input.effectiveDate)); if(!current) return blocked(input,'LIFECYCLE_INTERVAL_CONFLICT','No current lifecycle period covers the reversal date.');
  return {status:'READY',code:'READY',message:'Rücknahme will append a compensating state transition and retain the original event.',canExecute:true,beforeState:input.currentState,afterState:target,effectiveDate:input.effectiveDate,referenceOperationId:input.referenceOperationId,changes:{closePeriodId:current.id,openState:target}};
}
