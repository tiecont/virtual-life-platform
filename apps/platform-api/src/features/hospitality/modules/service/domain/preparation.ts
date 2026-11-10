import { timingSafeEqual } from 'node:crypto';
import type { OrderPhase,OrderWorkflowStrategy } from '@virtual-city/contracts';
import { DomainError } from '../../../../../shared/common/errors';
type Order={id:string;assignee_id:string|null;phase:OrderPhase;version:number;course_index:number;ready_at:Date|null;workflow:OrderWorkflowStrategy|null};
type Input={nonce:string;ingredients:string[]};
type Sign=(value:unknown)=>string;
const windowMs=60000;
const recipe=(row:Order)=>row.workflow?.courses[row.course_index]?.recipe;
const deadline=(row:Order)=>row.ready_at!.getTime()+windowMs;
export function preparationFor(row:Order,actor:string,sign:Sign){
 const value=recipe(row);if(!value||row.phase!=='PREPARING'||!row.ready_at||row.assignee_id!==actor)return undefined;
 const expires=deadline(row),nonce=sign({purpose:'order-preparation-v1',orderId:row.id,assigneeId:actor,version:row.version,course:row.course_index,readyAt:row.ready_at.toISOString(),expiresAt:expires});
 return {nonce,expiresAt:new Date(expires).toISOString(),recipe:[...value.steps],choices:[...value.choices]};
}
export function verifyPreparation(row:Order,actor:string,input:Input|undefined,at:number,sign:Sign){
 if(!recipe(row)){if(input)throw new DomainError('INVALID_REQUEST',422,'This workflow does not accept ingredients');return;}
 const challenge=preparationFor(row,actor,sign);
 if(!challenge||!input||!Number.isFinite(at)||at<row.ready_at!.getTime()||at>=deadline(row)||!/^[a-f0-9]{64}$/.test(input.nonce)||!timingSafeEqual(Buffer.from(input.nonce,'hex'),Buffer.from(challenge.nonce,'hex'))||input.ingredients.length!==challenge.recipe.length||input.ingredients.some((value,i)=>value!==challenge.recipe[i]))throw new DomainError('NOT_AVAILABLE',409,'Preparation is unconfirmed or expired. Refresh the ticket.');
}
export function canRestartPreparation(row:Order,at:number){return Number.isFinite(at)&&!!recipe(row)&&row.phase==='PREPARING'&&row.ready_at!==null&&at>=deadline(row);}
