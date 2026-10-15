import {describe,expect,it} from 'vitest';
import {runScenarios} from '../srv/domain/scenario-runner.js';
describe('in-app isolated scenario runner',()=>{it('executes real domain assertions without presentation-state writes',async()=>{const results=await runScenarios();expect(results).toHaveLength(3);expect(results.every(item=>item.passed)).toBe(true);});});
