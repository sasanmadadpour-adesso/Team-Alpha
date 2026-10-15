import {describe,expect,it} from 'vitest';
import {summarizeBatch} from '../srv/domain/batch.js';
describe('Phase F batch isolation and summary',()=>{
 it('TC17 summarizes valid, skipped, blocked, and errors independently',()=>expect(summarizeBatch([{maloId:'1',status:'SUCCESS',code:'SIMULATED_SUCCESS'},{maloId:'2',status:'SKIPPED',code:'NOT_ELIGIBLE'},{maloId:'3',status:'BLOCKED',code:'PREREQUISITES_UNKNOWN'},{maloId:'4',status:'ERROR',code:'BATCH_ITEM_ERROR'}])).toEqual({total:4,success:1,skipped:1,alreadyDone:0,blocked:1,review:0,error:1}));
 it('TC16 classifies repeated items without duplicate success',()=>expect(summarizeBatch([{maloId:'1',status:'ALREADY_DONE',code:'ALREADY_DONE'},{maloId:'2',status:'ALREADY_DONE',code:'ALREADY_DONE'}]).alreadyDone).toBe(2));
});
