export type TransitionStatus = 'READY'|'SUCCESS'|'SKIPPED'|'REVIEW'|'BLOCKED'|'ALREADY_DONE';
export type PrerequisiteProfile = 'STRICT'|'ASSUMED_DEMO';
export interface SourceAssignment { buildingId:string; role:string; participates:boolean; reststromMaloId?:string; maloConflict:boolean; supplyStartUtc?:string; }
export interface LocationState { maloId:string; businessState:'ACTIVE'|'RUHEND'; conflictingAssignment:boolean; }
export interface TransitionCheck { code:string; result:'PASSED'|'FAILED'|'UNKNOWN'|'ASSUMED'; confidence:'VERIFIED_SIMULATED'|'FAILED'|'UNKNOWN'|'ASSUMED_DEMO'; message:string; }
export interface TransitionInput { maloId:string; buildingId:string; effectiveDate:string; prerequisiteProfile:PrerequisiteProfile; confirmed?:boolean; }
export interface TransitionPlan { status:TransitionStatus; code:string; message:string; maloId:string; buildingId:string; reststromMaloId?:string; effectiveDate:string; beforeState?:string; afterState:'RUHEND'; canExecute:boolean; simulated:true; prerequisiteProfile:PrerequisiteProfile; checks:TransitionCheck[]; }
export interface TransitionReader { assignments(maloId:string):Promise<SourceAssignment[]>; location(maloId:string):Promise<LocationState|undefined>; completed(maloId:string,buildingId:string,effectiveDate:string):Promise<boolean>; }

const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
const check=(code:string,result:TransitionCheck['result'],confidence:TransitionCheck['confidence'],message:string):TransitionCheck=>({code,result,confidence,message});
export async function buildDormantPlan(reader:TransitionReader,input:TransitionInput):Promise<TransitionPlan>{
  const base={maloId:input.maloId,buildingId:input.buildingId,effectiveDate:input.effectiveDate,afterState:'RUHEND' as const,simulated:true as const,prerequisiteProfile:input.prerequisiteProfile}; const checks:TransitionCheck[]=[];
  if(!dateOnly.test(input.effectiveDate)||Number.isNaN(Date.parse(`${input.effectiveDate}T00:00:00Z`))) return {...base,status:'BLOCKED',code:'INVALID_EFFECTIVE_DATE',message:'The effective date must be a valid date in YYYY-MM-DD format.',canExecute:false,checks:[check('EFFECTIVE_DATE','FAILED','FAILED','Invalid effective date.')]};
  checks.push(check('EFFECTIVE_DATE','PASSED','VERIFIED_SIMULATED','Effective date format is valid.'));
  const assignments=await reader.assignments(input.maloId); const location=await reader.location(input.maloId);
  if(!location||assignments.length===0) return {...base,status:'BLOCKED',code:'MALO_NOT_FOUND',message:'MaLo was not found.',canExecute:false,checks:[...checks,check('IDENTITY','FAILED','FAILED','MaLo was not found.')]};
  if(location.conflictingAssignment||assignments.some(a=>a.maloConflict)||new Set(assignments.map(a=>`${a.buildingId}|${a.reststromMaloId}`)).size>1) return {...base,beforeState:location.businessState,status:'REVIEW',code:'AMBIGUOUS_IDENTITY',message:'MaLo is assigned to multiple buildings or residual-supply targets.',canExecute:false,checks:[...checks,check('IDENTITY','FAILED','FAILED','Ambiguous global MaLo identity requires review.')]};
  const assignment=assignments.find(a=>a.buildingId===input.buildingId);
  if(!assignment) return {...base,beforeState:location.businessState,status:'BLOCKED',code:'BUILDING_MISMATCH',message:'MaLo is not assigned to the selected building.',canExecute:false,checks:[...checks,check('IDENTITY','FAILED','FAILED','Selected building does not match the source assignment.')]};
  checks.push(check('IDENTITY','PASSED','VERIFIED_SIMULATED','MaLo identity and building assignment are unambiguous.'));
  if(assignment.role!=='Haushaltsverbrauch'||!assignment.participates) return {...base,beforeState:location.businessState,reststromMaloId:assignment.reststromMaloId,status:'SKIPPED',code:'NOT_ELIGIBLE',message:'MaLo is not an eligible participating household.',canExecute:false,checks:[...checks,check('PARTICIPATION','FAILED','VERIFIED_SIMULATED','Source row is not an eligible participating household.')]};
  checks.push(check('PARTICIPATION','PASSED','VERIFIED_SIMULATED','Workbook confirms household participation.'));
  if(!assignment.reststromMaloId) return {...base,beforeState:location.businessState,status:'BLOCKED',code:'RESTSTROM_MISSING',message:'No residual-supply MaLo exists for the building.',canExecute:false,checks:[...checks,check('RESTSTROM_TARGET','FAILED','FAILED','Residual-supply target is missing.')]};
  checks.push(check('RESTSTROM_TARGET','PASSED','VERIFIED_SIMULATED',`Residual-supply MaLo ${assignment.reststromMaloId} was derived from workbook data.`));
  if(await reader.completed(input.maloId,input.buildingId,input.effectiveDate)) return {...base,beforeState:location.businessState,reststromMaloId:assignment.reststromMaloId,status:'ALREADY_DONE',code:'ALREADY_DONE',message:'The identical simulated Ruhendstellung was already completed.',canExecute:false,checks};
  if(location.businessState==='RUHEND') return {...base,beforeState:'RUHEND',reststromMaloId:assignment.reststromMaloId,status:'BLOCKED',code:'INVALID_STATE',message:'MaLo is already RUHEND.',canExecute:false,checks:[...checks,check('LIFECYCLE_STATE','FAILED','FAILED','Current state does not allow Ruhendstellung.')]};
  checks.push(check('LIFECYCLE_STATE','PASSED','VERIFIED_SIMULATED','Current simulated state is ACTIVE.'));
  if(input.prerequisiteProfile!=='ASSUMED_DEMO') return {...base,beforeState:'ACTIVE',reststromMaloId:assignment.reststromMaloId,status:'BLOCKED',code:'PREREQUISITES_UNKNOWN',message:'SAP and market prerequisite evidence is UNKNOWN. Select ASSUMED_DEMO explicitly to run the simulation.',canExecute:false,checks:[...checks,check('SAP_MARKET_PREREQUISITES','UNKNOWN','UNKNOWN','No verified SAP or market evidence is available.')]};
  checks.push(check('SAP_MARKET_PREREQUISITES','ASSUMED','ASSUMED_DEMO','Demo prerequisites were explicitly assumed; they are not SAP-verified.'));
  return {...base,beforeState:'ACTIVE',reststromMaloId:assignment.reststromMaloId,status:'READY',code:'READY',message:'Preview is valid for a simulated update only.',canExecute:true,checks};
}
