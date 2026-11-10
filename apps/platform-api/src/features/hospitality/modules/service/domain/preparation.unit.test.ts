import { it,expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { OrderWorkflowStrategySchema } from '@virtual-city/contracts';
import { preparationFor,verifyPreparation,canRestartPreparation } from './preparation';
const sign=(value:unknown)=>createHmac('sha256','synthetic-recipe-test-only').update(JSON.stringify(value)).digest('hex');
const workflow=OrderWorkflowStrategySchema.parse({key:'coffee',version:'1.1.0',kind:'timed-courses',courses:[{key:'coffee',label:'Coffee',prepareSeconds:2,recipe:{steps:['coffee','water'],choices:['coffee','water','milk']}}]});
const row={id:'order-a',assignee_id:'worker-a',phase:'PREPARING' as const,version:2,course_index:0,ready_at:new Date(10000),workflow};
const challenge=()=>preparationFor(row,'worker-a',sign)!;
it('nonce binds order,assignee,course,version and deadline without exposing it to other actors or phases',()=>{
 const own=challenge();expect(preparationFor(row,'customer-a',sign)).toBeUndefined();expect(preparationFor({...row,phase:'READY'},'worker-a',sign)).toBeUndefined();
 for(const changed of [{id:'order-b'},{assignee_id:'worker-b'},{version:3},{ready_at:new Date(11000)}])expect(preparationFor({...row,...changed},changed.assignee_id??'worker-a',sign)!.nonce===own.nonce).toBe(false);
 expect(preparationFor(row,'worker-a',sign)!.nonce===own.nonce).toBe(true);
 const multi={...row,workflow:{...workflow,courses:[workflow.courses[0],{...workflow.courses[0],key:'second'}]}};expect(preparationFor(multi,'worker-a',sign)!.nonce===preparationFor({...multi,course_index:1},'worker-a',sign)!.nonce).toBe(false);
});
it('valid recipe requires minimum server time and rejects exact expiry,wrong sequence,forgery and stale version',()=>{
 const input={nonce:challenge().nonce,ingredients:['coffee','water']};expect(()=>verifyPreparation(row,'worker-a',input,10000,sign)).not.toThrow();
 for(const at of [9999,70000,NaN,Infinity])expect(()=>verifyPreparation(row,'worker-a',input,at,sign)).toThrow();
 for(const bad of [undefined,{...input,nonce:'00'.repeat(32)},{...input,ingredients:['water','coffee']},{...input,ingredients:['coffee','water','water']}])expect(()=>verifyPreparation(row,'worker-a',bad,12000,sign)).toThrow();
 expect(()=>verifyPreparation({...row,version:3},'worker-a',input,12000,sign)).toThrow();
});
it('only expired recipe preparation offers a restart;ordinary timed workflow does not accept recipe fields',()=>{
 expect(canRestartPreparation(row,69999)).toBe(false);expect(canRestartPreparation(row,70000)).toBe(true);expect(canRestartPreparation({...row,phase:'READY'},70000)).toBe(false);
 const plain={...row,workflow:OrderWorkflowStrategySchema.parse({key:'tea',version:'1.0.0',kind:'timed-courses',courses:[{key:'tea',label:'Tea',prepareSeconds:2}]})};expect(canRestartPreparation(plain,70000)).toBe(false);expect(()=>verifyPreparation(plain,'worker-a',undefined,10000,sign)).not.toThrow();expect(()=>verifyPreparation(plain,'worker-a',{nonce:challenge().nonce,ingredients:['coffee','water']},10000,sign)).toThrow();
});
it('trusted recipe contract bounds steps/choices and rejects unresolved ingredients without changing ordinary workflow schema',()=>{
 for(const recipe of [{steps:['coffee'],choices:['water']},{steps:Array(9).fill('coffee'),choices:['coffee']},{steps:['coffee'],choices:['coffee','coffee']}])expect(OrderWorkflowStrategySchema.safeParse({...workflow,courses:[{...workflow.courses[0],recipe}]}).success).toBe(false);
});
