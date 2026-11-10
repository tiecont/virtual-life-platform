// Internal trusted-clock model only. Callers must authorize grants,source,
// event phase and consent,then serialize room capacity/receipts in SQL.
// No client-provided phase,timestamps,role or score can authorize a transition.
export type StagePhase='QUEUED'|'OFFERED'|'ACTIVE'|'ENDED';
export type StageEndReason='expired'|'declined'|'withdrawn'|'revoked'|'event-ended'|'authority-lost';
export type StageState=Readonly<{phase:StagePhase;version:number;createdAt:number;changedAt:number;queueExpiresAt:number;offeredAt:number|null;offerExpiresAt:number|null;startedAt:number|null;endsAt:number|null;closedAt:number|null;reason:StageEndReason|null}>;
export type StageAction={kind:'observe'|'offer'|'accept'|'decline'|'withdraw'|'revoke'|'event-end'|'authority-lost'};
export type StageBounds=Readonly<{offerSeconds:number;slotSeconds:number;authorityEndsAt:number}>;
const phases:StagePhase[]=['QUEUED','OFFERED','ACTIVE','ENDED'],reasons:StageEndReason[]=['expired','declined','withdrawn','revoked','event-ended','authority-lost'];
export class StageTransitionError extends Error{constructor(readonly code:'CLOCK_UNAVAILABLE'|'INVALID_STATE'|'INVALID_TRANSITION'){super(code);}}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const fail=(code:StageTransitionError['code']):never=>{throw new StageTransitionError(code);};
export function checkStageState(state:StageState){
 if(!state||!phases.includes(state.phase)||!integer(state.version)||!integer(state.createdAt)||!integer(state.changedAt)||state.changedAt<state.createdAt||!integer(state.queueExpiresAt)||state.queueExpiresAt<=state.createdAt)fail('INVALID_STATE');
 for(const time of [state.offeredAt,state.offerExpiresAt,state.startedAt,state.endsAt,state.closedAt])if(time!==null&&!integer(time))fail('INVALID_STATE');
 const hasOffer=state.offeredAt!==null&&state.offerExpiresAt!==null,hasSlot=state.startedAt!==null&&state.endsAt!==null;
 if((state.offeredAt===null)!==(state.offerExpiresAt===null)||(state.startedAt===null)!==(state.endsAt===null)||hasOffer&&(state.offeredAt!<state.createdAt||state.offeredAt!>state.changedAt||state.offerExpiresAt!<=state.offeredAt!||state.offerExpiresAt!>state.queueExpiresAt)||hasSlot&&(!hasOffer||state.startedAt!<state.offeredAt!||state.startedAt!>state.changedAt||state.startedAt!>=state.offerExpiresAt!||state.endsAt!<=state.startedAt!))fail('INVALID_STATE');
 if(state.phase==='QUEUED'&&(hasOffer||hasSlot)||state.phase==='OFFERED'&&(!hasOffer||hasSlot)||state.phase==='ACTIVE'&&!hasSlot||state.phase!=='ENDED'&&(state.closedAt!==null||state.reason!==null)||state.phase==='ENDED'&&(state.closedAt===null||state.closedAt<(state.startedAt??state.offeredAt??state.createdAt)||state.closedAt>state.changedAt||state.reason===null||!reasons.includes(state.reason)))fail('INVALID_STATE');
 return state;
}
export function createStageRequest(now:number,queueExpiresAt:number):StageState{
 if(!integer(now)||!integer(queueExpiresAt)||queueExpiresAt<=now||queueExpiresAt-now>600000)fail('INVALID_STATE');return Object.freeze(checkStageState({phase:'QUEUED',version:0,createdAt:now,changedAt:now,queueExpiresAt,offeredAt:null,offerExpiresAt:null,startedAt:null,endsAt:null,closedAt:null,reason:null}));
}
export function advanceStage(state:StageState,action:StageAction,now:number,bounds:StageBounds):StageState{
 checkStageState(state);if(!integer(now)||now<state.changedAt)fail('CLOCK_UNAVAILABLE');if(!action||!['observe','offer','accept','decline','withdraw','revoke','event-end','authority-lost'].includes(action.kind)||!bounds||!Number.isInteger(bounds.offerSeconds)||bounds.offerSeconds<1||bounds.offerSeconds>120||!Number.isInteger(bounds.slotSeconds)||bounds.slotSeconds<1||bounds.slotSeconds>300||!integer(bounds.authorityEndsAt))fail('INVALID_STATE');
 if(state.phase==='ENDED')return state;
 const close=(reason:StageEndReason,closedAt=now):StageState=>Object.freeze(checkStageState({...state,phase:'ENDED',version:state.version+1,changedAt:now,closedAt,reason}));
 const deadline=Math.min(bounds.authorityEndsAt,state.phase==='QUEUED'?state.queueExpiresAt:state.phase==='OFFERED'?state.offerExpiresAt!:state.endsAt!);
 if(now>=deadline)return close('expired',Math.max(state.changedAt,deadline));
 if(action.kind==='observe')return state;if(action.kind==='withdraw')return close('withdrawn');if(action.kind==='revoke')return close('revoked');if(action.kind==='event-end')return close('event-ended');if(action.kind==='authority-lost')return close('authority-lost');
 if(action.kind==='offer'&&state.phase==='QUEUED')return Object.freeze(checkStageState({...state,phase:'OFFERED',version:state.version+1,changedAt:now,offeredAt:now,offerExpiresAt:Math.min(now+bounds.offerSeconds*1000,state.queueExpiresAt,bounds.authorityEndsAt)}));
 if(action.kind==='accept'&&state.phase==='OFFERED')return Object.freeze(checkStageState({...state,phase:'ACTIVE',version:state.version+1,changedAt:now,startedAt:now,endsAt:Math.min(now+bounds.slotSeconds*1000,bounds.authorityEndsAt)}));
 if(action.kind==='decline'&&state.phase==='OFFERED')return close('declined');return fail('INVALID_TRANSITION');
}
