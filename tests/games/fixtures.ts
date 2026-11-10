import type {GameMode,GameCommand,GamePrivateState} from '@virtual-city/contracts';
import type {GameState,GameModeRules,GameTransition,GameDecisionContext,ReadonlyGameState} from '@virtual-city/boardgame-core';
export const id=(number:number)=>'a1000000-0000-4000-8000-'+String(number).padStart(12,'0');
// Synthetic foundation adapters only. These do NOT implement or qualify the
// actual Color/Mask/Routes rules,deals,seeds,card conservation or balance.
export function gameState(mode:GameMode='lantern-colors'):GameState{
 const count=mode==='lantern-colors'?2:mode==='mask-and-tell'?3:4,members=Array.from({length:count},(_,seatIndex)=>({accountId:id(seatIndex+1),membershipId:id(seatIndex+21),seatIndex,ready:true,connected:true,handCount:1})),own:Record<string,GamePrivateState>={};
 for(const member of members){const item=id(member.seatIndex+201);own[member.accountId]=mode==='lantern-colors'?{mode,hand:[{cardId:item,face:{kind:'number',color:'red',value:1}}]}:mode==='mask-and-tell'?{mode,hand:[{cardId:item,symbol:member.seatIndex===0?'moon':'flower'}]}:member.seatIndex===0?{mode,role:'mist',targetGateId:'gate-a',hand:[{tileId:item,connectors:['N','S']}]}:{mode,role:'crew',hand:[{tileId:item,connectors:['E','W']}]};}
 return {matchId:id(101),tableId:id(102),generation:id(103),roomId:id(104),roomEpoch:id(105),mode,rulesetVersion:'1.0.0',stateVersion:0,committedAt:100,status:'ACTIVE',phase:mode==='lantern-colors'?'WAITING_PLAY':mode==='mask-and-tell'?'SUBMIT_CLAIM':'TILE_TURN',deadline:1000,turnSeat:0,seedCommitment:'a'.repeat(64),members,own,internal:{secret:'SERVER_ONLY_DECK_AND_RNG',steps:0},result:{outcome:'none',winnerSeats:[]},board:mode==='lantern-colors'?{mode,top:{kind:'number',color:'red',value:1},color:'red',direction:1,drawCount:61,glow:members.map(member=>({seatIndex:member.seatIndex,amount:0}))}:mode==='mask-and-tell'?{mode,targetSymbol:'moon',round:1,claimCount:0,lastClaim:null,revealedClaim:null,scores:members.map(member=>({seatIndex:member.seatIndex,credibility:3,mastery:0}))}:{mode,tiles:[],gates:[{id:'gate-a',x:3,y:0,connector:'S',status:'unknown'},{id:'gate-b',x:6,y:3,connector:'W',status:'unknown'},{id:'gate-c',x:0,y:3,connector:'E',status:'unknown'}],scansRemaining:2,turnsRemaining:count*3,drawCount:24}};
}
export function command(state:GameState,seat=0):GameCommand{
 const member=state.members[seat],base={schemaVersion:1 as const,protocolVersion:1 as const,requestId:id(301),matchId:state.matchId,tableId:state.tableId,generation:state.generation,expectedVersion:state.stateVersion,source:{epoch:state.roomEpoch,roomId:state.roomId,membershipId:member.membershipId}};
 return state.mode==='lantern-colors'?{...base,kind:'color.draw',payload:{}}:state.mode==='mask-and-tell'?{...base,kind:'mask.trust',payload:{}}:{...base,kind:'route.scan',payload:{}};
}
export function context(state:GameState,seat=0):GameDecisionContext{return {accountId:state.members[seat].accountId,source:command(state,seat).source,now:200,randomWords:[0,1,2,3,4,5]};}
export function transition(state:ReadonlyGameState,overrides:Partial<GameTransition>={}):GameTransition{
 const value=JSON.parse(JSON.stringify(state))as GameState;return {status:value.status,phase:value.phase,deadline:value.deadline,turnSeat:value.turnSeat,members:value.members,board:value.board,own:value.own,internal:value.internal,result:value.result,...overrides};
}
export function fixtureRules(mode:GameMode):GameModeRules{return {mode,rulesetVersion:'1.0.0',reduce({state,clock,command}){
 const owner=state.members.find(member=>member.seatIndex===state.turnSeat)!,hand=state.own[owner.accountId]?.hand??[],owned=new Set(hand.map(item=>'cardId'in item?item.cardId:item.tileId));
 const claimed='cardId'in command.payload?[command.payload.cardId]:'tileId'in command.payload?[command.payload.tileId]:'cardIds'in command.payload?command.payload.cardIds:[];
 if(claimed.some(item=>!owned.has(item)))return {ok:false,error:'INVALID_CARD'};
 return {ok:true,next:transition(state,{deadline:clock+1000,turnSeat:(state.turnSeat!+1)%state.members.length,internal:{secret:'SERVER_ONLY_DECK_AND_RNG',observedClock:clock}})};
 }};}
