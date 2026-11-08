import {GameCommandSchema,GameErrorCodeSchema,GameIdSchema,GameModeSchema,GameOwnViewSchema,GamePublicViewSchema,GameRulesetVersionSchema,GameSourceSchema,GameSpectatorViewSchema,GameTimeSchema,GameVersionSchema,type GameCommand,type GameErrorCode,type GameMode,type GameOwnView,type GamePrivateState,type GamePublicBoard,type GamePublicView,type PublicProfile,type AvatarAppearanceV2} from '@virtual-city/contracts';
import {immutableJson,type Json,type ReadonlyJson} from './json';
export type DeepReadonly<T>=T extends object?{readonly[K in keyof T]:DeepReadonly<T[K]>}:T;
export interface GameMember {accountId:string;membershipId:string;seatIndex:number;ready:boolean;connected:boolean;handCount:number}
export interface GameState {
 matchId:string;tableId:string;generation:string;roomEpoch:string;roomId:string;mode:GameMode;rulesetVersion:string;stateVersion:number;committedAt:number;
 status:GamePublicView['status'];phase:GamePublicView['phase'];deadline:number|null;turnSeat:number|null;seedCommitment:string|null;members:GameMember[];
 board:GamePublicBoard|null;own:Record<string,GamePrivateState|null>;internal:Json;result:GamePublicView['result'];
}
// Host supplies an already-authenticated/fenced snapshot,then rechecks its real
// services before COMMIT. Pure code cannot authenticate a session or own a room.
export interface GameDecisionContext {accountId:string;source:GameCommand['source'];now:number;randomWords:readonly number[]}
export type GameTransition=Pick<GameState,'status'|'phase'|'deadline'|'turnSeat'|'members'|'board'|'own'|'internal'|'result'>;
export type RuleDecision={ok:false;error:GameErrorCode}|{ok:true;next:GameTransition};
export type ReadonlyGameState=DeepReadonly<Omit<GameState,'internal'>>&{readonly internal:ReadonlyJson};
export interface GameModeRules {mode:GameMode;rulesetVersion:string;reduce(input:{state:ReadonlyGameState;command:DeepReadonly<GameCommand>;clock:number;randomWords:readonly number[]}):RuleDecision}
export type GameEffect={kind:'PUBLIC_CHANGED'}|{kind:'PRIVATE_CHANGED';seatIndex:number}|{kind:'DEADLINE_SCHEDULE';at:number;stateVersion:number};
export type GameDecision={ok:false;state:GameState;error:GameErrorCode;effects:[]}|{ok:true;state:GameState;effects:GameEffect[]};
export type Visibility=Readonly<Record<string,{profile:PublicProfile;appearance:AvatarAppearanceV2|null}>>;
export type Projection<T>={ok:true;value:T}|{ok:false;error:'NOT_PARTICIPANT'|'UNAVAILABLE'};
const prefix:Record<GameMode,string>={'lantern-colors':'color.','mask-and-tell':'mask.','mistbound-routes':'route.'};
const nextFields=new Set(['status','phase','deadline','turnSeat','members','board','own','internal','result']);
function publicValue(state:GameState,clock:number,visibility:Visibility={}):GamePublicView{
 const approved=immutableJson(visibility);
 return GamePublicViewSchema.parse({schemaVersion:1,protocolVersion:1,projection:'public',matchId:state.matchId,tableId:state.tableId,generation:state.generation,roomId:state.roomId,mode:state.mode,rulesetVersion:state.rulesetVersion,stateVersion:state.stateVersion,status:state.status,phase:state.phase,serverTime:clock,deadline:state.deadline,turnSeat:state.turnSeat,seedCommitment:state.seedCommitment,result:state.result,board:state.board,seats:state.members.map(member=>{
  const visible=approved[member.accountId];if(visible&&visible.profile.id!==member.accountId)throw Error('Projection unavailable');
  return {seatIndex:member.seatIndex,ready:member.ready,connected:member.connected,handCount:member.handCount,profile:visible?.profile??null,appearance:visible?.appearance??null};
 })});
}
function validateState(state:GameState,clock:number){
 GameTimeSchema.parse(clock);GameTimeSchema.parse(state.committedAt);GameVersionSchema.parse(state.stateVersion);GameModeSchema.parse(state.mode);GameRulesetVersionSchema.parse(state.rulesetVersion);
 if(new Set(state.members.map(member=>member.accountId)).size!==state.members.length||new Set(state.members.map(member=>member.membershipId)).size!==state.members.length)throw Error('Invalid game state');
 if(Object.keys(state.own).length!==state.members.length||state.members.some(member=>!Object.hasOwn(state.own,member.accountId)))throw Error('Invalid private owners');
 for(const id of [state.matchId,state.tableId,state.generation,state.roomEpoch,state.roomId,...state.members.flatMap(member=>[member.accountId,member.membershipId])])if(GameIdSchema.parse(id)!==id)throw Error('Noncanonical game identity');
 const ids=new Set<string>();for(const member of state.members){GameSourceSchema.parse({epoch:state.roomEpoch,roomId:state.roomId,membershipId:member.membershipId});const own=state.own[member.accountId];if(own)for(const item of own.hand){const id='cardId'in item?item.cardId:item.tileId;if(GameIdSchema.parse(id)!==id||ids.has(id))throw Error('Duplicate private item');ids.add(id);}}
 const view=publicValue(state,clock);
 for(const member of state.members)GameOwnViewSchema.parse({schemaVersion:1,projection:'own',accountId:member.accountId,ownSeat:member.seatIndex,public:view,private:state.own[member.accountId]});
 if(state.status!=='ACTIVE'&&['FINISHED','ABORTED','INTERRUPTED'].includes(state.status)&&(state.turnSeat!==null||state.deadline!==null))throw Error('Terminal phase still active');
}
export function projectGamePublic(input:GameState,clock:number,visibility:Visibility={}):Projection<GamePublicView>{
 try{const state=immutableJson(input);validateState(state,clock);return {ok:true,value:publicValue(state,clock,visibility)};}catch{return {ok:false,error:'UNAVAILABLE'};}
}
export function projectGameOwn(input:GameState,accountId:string,clock:number,visibility:Visibility={}):Projection<GameOwnView>{
 try{const state=immutableJson(input);validateState(state,clock);const member=state.members.find(member=>member.accountId===accountId);if(!member)return {ok:false,error:'NOT_PARTICIPANT'};return {ok:true,value:GameOwnViewSchema.parse({schemaVersion:1,projection:'own',accountId,ownSeat:member.seatIndex,public:publicValue(state,clock,visibility),private:state.own[accountId]})};}catch{return {ok:false,error:'UNAVAILABLE'};}
}
export function projectGameSpectator(){return GameSpectatorViewSchema.parse({schemaVersion:1,projection:'spectator',enabled:false});}
// Independent Leave/Block/Travel/recovery is a host operation,not a turn action.
// Host authenticates/fences it and commits the abort/claim cleanup atomically.
export function abortGame(input:GameState,clock:number):GameDecision{
 const reject=(error:GameErrorCode):GameDecision=>({ok:false,state:input,error,effects:[]});
 try{const state=immutableJson(input);validateState(state,clock);if(clock<state.committedAt||state.stateVersion===2147483647)return reject('STATE_CONFLICT');if(['FINISHED','ABORTED'].includes(state.status))return reject('WRONG_PHASE');const next=immutableJson({...state,stateVersion:state.stateVersion+1,committedAt:clock,status:'ABORTED' as const,phase:'ABORTED' as const,deadline:null,turnSeat:null,result:{outcome:'aborted' as const,winnerSeats:[]}});validateState(next,clock);return {ok:true,state:next,effects:[{kind:'PUBLIC_CHANGED'},...next.members.map(member=>({kind:'PRIVATE_CHANGED' as const,seatIndex:member.seatIndex}))]};}catch{return reject('INTERNAL_ERROR');}
}
export class GameRulesEngine {
 readonly #rules=new Map<string,GameModeRules>();
 constructor(rules:readonly GameModeRules[]=[]){for(const rule of rules){GameModeSchema.parse(rule.mode);GameRulesetVersionSchema.parse(rule.rulesetVersion);const key=rule.mode+'@'+rule.rulesetVersion;if(this.#rules.has(key))throw Error('Duplicate ruleset');this.#rules.set(key,Object.freeze({...rule}));}}
 get registered(){return [...this.#rules.keys()].sort();}
 decide(input:GameState,rawCommand:unknown,rawContext:GameDecisionContext):GameDecision{
  const reject=(error:GameErrorCode):GameDecision=>({ok:false,state:input,error,effects:[]});
  try{
   const state=immutableJson(input),context=immutableJson(rawContext),parsed=GameCommandSchema.safeParse(rawCommand);if(!parsed.success)return reject('INVALID_REQUEST');const command=immutableJson(parsed.data);
   GameTimeSchema.parse(context.now);validateState(state,context.now);
   if(context.now<state.committedAt||command.matchId!==state.matchId||command.tableId!==state.tableId||command.generation!==state.generation||command.expectedVersion!==state.stateVersion||state.stateVersion===2147483647)return reject('STATE_CONFLICT');
   const member=state.members.find(member=>member.accountId===context.accountId);if(!member)return reject('NOT_PARTICIPANT');
   if(context.source.epoch!==state.roomEpoch||context.source.roomId!==state.roomId||context.source.membershipId!==member.membershipId||command.source.epoch!==context.source.epoch||command.source.roomId!==context.source.roomId||command.source.membershipId!==context.source.membershipId)return reject('NOT_IN_ROOM');
   if(command.kind==='game.leave')return reject('UNAVAILABLE');
   if(state.status!=='ACTIVE')return reject('WRONG_PHASE');if(state.deadline===null||context.now>=state.deadline)return reject('DEADLINE_EXPIRED');
   if(!command.kind.startsWith(prefix[state.mode]))return reject('WRONG_MODE');
   if(member.seatIndex!==state.turnSeat)return reject('WRONG_TURN');
   const rule=this.#rules.get(state.mode+'@'+state.rulesetVersion);if(!rule)return reject('UNAVAILABLE');
   if(context.randomWords.length>16384||context.randomWords.some(word=>!Number.isInteger(word)||word<0||word>4294967295))return reject('UNAVAILABLE');
   const result=rule.reduce({state,command,clock:context.now,randomWords:context.randomWords});if(!result.ok)return reject(GameErrorCodeSchema.parse(result.error));
   const changes=immutableJson(result.next);if(Object.keys(changes).some(key=>!nextFields.has(key)))return reject('INTERNAL_ERROR');
   // A reducer cannot mint identities,seats or authority generations. Admission
   // belongs to the host's separately authorized lobby transaction.
   if(changes.members.some(next=>!state.members.some(previous=>previous.accountId===next.accountId&&previous.membershipId===next.membershipId&&previous.seatIndex===next.seatIndex)))return reject('INTERNAL_ERROR');
   const next=immutableJson({...state,status:changes.status,phase:changes.phase,deadline:changes.deadline,turnSeat:changes.turnSeat,members:changes.members,board:changes.board,own:changes.own,internal:changes.internal,result:changes.result,stateVersion:state.stateVersion+1,committedAt:context.now});validateState(next,context.now);
   if(next.status==='ACTIVE'&&(next.deadline===null||next.deadline<=context.now))return reject('INTERNAL_ERROR');
   const effects:GameEffect[]=[{kind:'PUBLIC_CHANGED'},...next.members.map(member=>({kind:'PRIVATE_CHANGED' as const,seatIndex:member.seatIndex}))];if(next.deadline!==null)effects.push({kind:'DEADLINE_SCHEDULE',at:next.deadline,stateVersion:next.stateVersion});
   return {ok:true,state:next,effects};
  }catch{return reject('INTERNAL_ERROR');}
 }
}
