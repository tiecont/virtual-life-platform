import {expect,it} from 'vitest';
import {GameAckSchema,GameCommandSchema,GameOwnViewSchema,GamePublicViewSchema,GameSpectatorViewSchema} from '@virtual-city/contracts';
import {GameRulesEngine,abortGame,projectGameOwn,projectGamePublic,projectGameSpectator,shuffleWithWords} from '@virtual-city/boardgame-core';
import {assertPureGameSource} from '../../scripts/boardgame-boundary.mjs';
import {command,context,fixtureRules,gameState,id,transition} from './fixtures';
const modes=['lantern-colors','mask-and-tell','mistbound-routes']as const;
it.each(modes)('%s routes the immutable state/command/injected clock deterministically with one revision and sanitized effects',mode=>{
 const state=gameState(mode),before=JSON.stringify(state),engine=new GameRulesEngine([fixtureRules(mode)]),a=engine.decide(state,command(state),context(state)),b=engine.decide(state,command(state),context(state));expect(a).toEqual(b);expect(a.ok).toBe(true);expect(JSON.stringify(state)).toBe(before);if(a.ok){expect(a.state.stateVersion).toBe(1);expect(a.state.committedAt).toBe(200);expect(a.state.deadline).toBe(1200);expect(a.effects.filter(effect=>effect.kind==='DEADLINE_SCHEDULE')).toEqual([{kind:'DEADLINE_SCHEDULE',at:1200,stateVersion:1}]);expect(JSON.stringify(a.effects)).not.toContain('SERVER_ONLY');}
});
it.each(modes)('%s public and own projections isolate every hand;default profiles hidden and spectator fully OFF',mode=>{
 const state=gameState(mode),publicView=projectGamePublic(state,200);expect(publicView.ok).toBe(true);if(!publicView.ok)throw Error('Fixture projection unavailable');GamePublicViewSchema.parse(publicView.value);const serialized=JSON.stringify(publicView.value);expect(serialized).not.toContain('SERVER_ONLY');expect(serialized).not.toContain('targetGateId');expect(serialized).not.toContain('"role"');for(const member of state.members){expect(serialized).not.toContain(member.accountId);expect(serialized).not.toContain(id(member.seatIndex+201));expect(publicView.value.seats[member.seatIndex].profile).toBeNull();const own=projectGameOwn(state,member.accountId,200);expect(own.ok).toBe(true);if(!own.ok)throw Error('Own fixture unavailable');GameOwnViewSchema.parse(own.value);expect(JSON.stringify(own.value.private)).toContain(id(member.seatIndex+201));for(const other of state.members.filter(other=>other!==member))expect(JSON.stringify(own.value.private)).not.toContain(id(other.seatIndex+201));if(own.value.private?.mode==='mistbound-routes'){expect('targetGateId'in own.value.private).toBe(member.seatIndex===0);}}
 expect(projectGameSpectator()).toEqual({schemaVersion:1,projection:'spectator',enabled:false});expect(projectGameOwn(state,id(999),200)).toEqual({ok:false,error:'NOT_PARTICIPANT'});
});
it('command DTO rejects authority,clock,private fields,unknown schemas,foreign payload shapes and unbounded values',()=>{
 const state=gameState(),valid=command(state);for(const extra of [{accountId:id(2)},{role:'mist'},{serverTime:0},{ownerHeld:true},{private:{hand:[]}},{schemaVersion:2},{expectedVersion:2147483648}])expect(GameCommandSchema.safeParse({...valid,...extra}).success).toBe(false);
 expect(GameCommandSchema.safeParse({...valid,kind:'mask.submit',payload:{cardIds:[id(201),id(201)]}}).success).toBe(false);expect(GameCommandSchema.safeParse({...valid,kind:'mask.submit',payload:{cardIds:[id(201),id(202),id(203)]}}).success).toBe(false);for(const [x,rotation]of [[7,0],[0,4],[-1,0]])expect(GameCommandSchema.safeParse({...valid,kind:'route.place',payload:{tileId:id(201),x,y:1,rotation}}).success).toBe(false);
 expect(GameCommandSchema.safeParse({...valid,kind:'route.scan',payload:{targetGateId:'gate-a'}}).success).toBe(false);expect(GameCommandSchema.safeParse({...valid,kind:'color.play',payload:{cardId:'https://secret.invalid/card',chosenColor:'purple'}}).success).toBe(false);
});
it('strict public/own/spectator DTOs fail closed on raw secret fields and crew target knowledge',()=>{
 const state=gameState('mistbound-routes'),publicView=projectGamePublic(state,200),own=projectGameOwn(state,id(2),200);if(!publicView.ok||!own.ok)throw Error('Fixture unavailable');for(const secret of [{hand:[id(201)]},{role:'mist'},{targetGateId:'gate-a'},{seed:'secret'},{deckOrder:[id(201)]}])expect(GamePublicViewSchema.safeParse({...publicView.value,...secret}).success).toBe(false);
 expect(GameOwnViewSchema.safeParse({...own.value,private:{...own.value.private,targetGateId:'gate-a'}}).success).toBe(false);expect(GameSpectatorViewSchema.safeParse({...projectGameSpectator(),public:publicView.value}).success).toBe(false);
 const bad={...state,board:{...state.board,hand:[id(201)]}};expect(projectGamePublic(bad as typeof state,200)).toEqual({ok:false,error:'UNAVAILABLE'});
});
it('ACK receipt can precede the fresh current view but cannot carry a future version or private rejected view',()=>{
 const state=gameState(),own=projectGameOwn(state,id(1),200);if(!own.ok)throw Error('Fixture unavailable');own.value.public.stateVersion=4;
 expect(GameAckSchema.safeParse({schemaVersion:1,requestId:id(301),ok:true,replayed:true,committedVersion:1,view:own.value}).success).toBe(true);expect(GameAckSchema.safeParse({schemaVersion:1,requestId:id(301),ok:true,replayed:true,committedVersion:5,view:own.value}).success).toBe(false);expect(GameAckSchema.safeParse({schemaVersion:1,requestId:id(301),ok:false,serverVersion:4,error:{code:'STATE_CONFLICT',retryable:false},view:own.value}).success).toBe(false);
});
it.each([
 ['version', 'STATE_CONFLICT'],['generation','STATE_CONFLICT'],['match','STATE_CONFLICT'],['room','NOT_IN_ROOM'],['membership','NOT_IN_ROOM'],['actor','NOT_PARTICIPANT'],['turn','WRONG_TURN'],['deadline','DEADLINE_EXPIRED'],['clock-regression','STATE_CONFLICT'],['mode','WRONG_MODE'],
])('rejects %s without changing the original state/reference/effects',(variant,error)=>{
 const state=gameState(),before=JSON.stringify(state),input=command(state),ctx=context(state),engine=new GameRulesEngine([fixtureRules(state.mode)]);
 if(variant==='version')input.expectedVersion++;if(variant==='generation')input.generation=id(900);if(variant==='match')input.matchId=id(900);if(variant==='room')ctx.source.roomId=id(900);if(variant==='membership')ctx.source.membershipId=id(900);if(variant==='actor')ctx.accountId=id(900);if(variant==='turn'){Object.assign(input,command(state,1));Object.assign(ctx,context(state,1));}if(variant==='deadline')ctx.now=1000;if(variant==='clock-regression')ctx.now=99;if(variant==='mode')Object.assign(input,{kind:'route.scan',payload:{}});
 const result=engine.decide(state,input,ctx);expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toBe(error);expect(result.state).toBe(state);expect(result.effects).toEqual([]);expect(JSON.stringify(state)).toBe(before);
});
it('cutoff is exact;an injected clock before deadline can act and at/after cannot',()=>{
 const state=gameState(),engine=new GameRulesEngine([fixtureRules(state.mode)]);expect(engine.decide(state,command(state),{...context(state),now:999}).ok).toBe(true);expect(engine.decide(state,command(state),{...context(state),now:1000}).ok).toBe(false);expect(engine.decide(state,command(state),{...context(state),now:1001}).ok).toBe(false);
});
it.each(modes)('%s propagates rule-owner denial of a foreign item without a partial transition',mode=>{
 const state=gameState(mode),input=command(state),raw=mode==='lantern-colors'?{...input,kind:'color.play',payload:{cardId:id(202)}}:mode==='mask-and-tell'?{...input,kind:'mask.submit',payload:{cardIds:[id(202)]}}:{...input,kind:'route.place',payload:{tileId:id(202),x:3,y:2,rotation:0}},engine=new GameRulesEngine([fixtureRules(mode)]),result=engine.decide(state,raw,context(state));expect(result).toMatchObject({ok:false,error:'INVALID_CARD',effects:[]});expect(result.state).toBe(state);
});
it('all actual modes stay unregistered;host abort is independent of turns/deadlines and never awards a winner',()=>{
 const engine=new GameRulesEngine();expect(engine.registered).toEqual([]);for(const mode of modes){const state=gameState(mode);expect(engine.decide(state,command(state),context(state))).toMatchObject({ok:false,error:'UNAVAILABLE',effects:[]});const result=abortGame(state,2000);expect(result.ok).toBe(true);if(result.ok){expect(result.state.result).toEqual({outcome:'aborted',winnerSeats:[]});expect(result.state.status).toBe('ABORTED');expect(result.state.deadline).toBeNull();expect(result.state.turnSeat).toBeNull();expect(result.effects.some(effect=>effect.kind==='DEADLINE_SCHEDULE')).toBe(false);expect(abortGame(result.state,2001)).toMatchObject({ok:false,error:'WRONG_PHASE'});}}
});
it('pins reducer versions,refuses duplicate registration and never serializes raw core output as an ACK',()=>{
 const state=gameState(),rule=fixtureRules(state.mode);expect(()=>new GameRulesEngine([rule,rule])).toThrow('Duplicate ruleset');expect(new GameRulesEngine([rule]).decide({...state,rulesetVersion:'2.0.0'},command({...state,rulesetVersion:'2.0.0'}),context(state))).toMatchObject({ok:false,error:'UNAVAILABLE'});const result=new GameRulesEngine([rule]).decide(state,command(state),context(state));expect(GameAckSchema.safeParse(result).success).toBe(false);
});
it('reducer mutation,foreign-member creation and illegal output/projection are isolated and rejected',()=>{
 const state=gameState(),before=JSON.stringify(state);for(const reduce of [
  (({state}:Parameters<NonNullable<ReturnType<typeof fixtureRules>['reduce']>>[0])=>{(state.members as unknown as {handCount:number}[])[0].handCount=999;return {ok:false as const,error:'INVALID_CARD' as const};}),
  (({state}:Parameters<ReturnType<typeof fixtureRules>['reduce']>[0])=>({ok:true as const,next:transition(state,{members:[...state.members.map(member=>({...member})),{...state.members[0],accountId:id(900),seatIndex:7}]})})),
  (({state}:Parameters<ReturnType<typeof fixtureRules>['reduce']>[0])=>({ok:true as const,next:transition(state,{deadline:1})})),
  (({state}:Parameters<ReturnType<typeof fixtureRules>['reduce']>[0])=>({ok:true as const,next:transition(state,{board:{...state.board,deckOrder:[id(201)]} as never})})),
 ]){const engine=new GameRulesEngine([{...fixtureRules(state.mode),reduce}]);const result=engine.decide(state,command(state),context(state));expect(result).toMatchObject({ok:false,error:'INTERNAL_ERROR',effects:[]});expect(result.state).toBe(state);expect(JSON.stringify(state)).toBe(before);}
});
it('only explicitly approved matching profiles appear;wrong account labels fail closed',()=>{
 const state=gameState(),profile={id:id(1),displayName:'Visible fixture',avatarKey:'fern' as const};const view=projectGamePublic(state,200,{[id(1)]:{profile,appearance:null}});expect(view.ok).toBe(true);if(view.ok){expect(view.value.seats[0].profile).toEqual(profile);expect(view.value.seats[1].profile).toBeNull();}expect(projectGamePublic(state,200,{[id(1)]:{profile:{...profile,id:id(2)},appearance:null}})).toEqual({ok:false,error:'UNAVAILABLE'});
});
it('unbiased shuffle rejects the modulo tail,keeps inventory/input and consumes only injected words',()=>{
 const cards=Object.freeze(['a','b','c']),words=Object.freeze([4294967295,0,1]);const a=shuffleWithWords(cards,words),b=shuffleWithWords(cards,words);expect(a).toEqual(b);expect(a.nextCursor).toBe(3);expect([...a.items].sort()).toEqual([...cards]);expect(cards).toEqual(['a','b','c']);expect(()=>shuffleWithWords(cards,[])).toThrow('entropy');expect(()=>shuffleWithWords(cards,[-1,0])).toThrow('entropy');expect(()=>shuffleWithWords(cards,[4294967296,0])).toThrow('entropy');
});
it('state cycles,accessors,prototype objects and duplicate private ownership fail without executing accessors',()=>{
 const state=gameState(),engine=new GameRulesEngine([fixtureRules(state.mode)]),cycle:Record<string,unknown>={};cycle.self=cycle;expect(projectGamePublic({...state,internal:cycle as never},200)).toEqual({ok:false,error:'UNAVAILABLE'});
 let calls=0;const data=Object.defineProperty({},'secret',{enumerable:true,get(){calls++;return 'leak';}});expect(projectGamePublic({...state,internal:data as never},200)).toEqual({ok:false,error:'UNAVAILABLE'});expect(calls).toBe(0);expect(engine.decide({...state,internal:new Map()as never},command(state),context(state))).toMatchObject({ok:false,effects:[]});
 const duplicate=JSON.parse(JSON.stringify(state))as typeof state;duplicate.own[id(2)]=duplicate.own[id(1)];expect(projectGamePublic(duplicate,200)).toEqual({ok:false,error:'UNAVAILABLE'});
});
it('pure source guard rejects network,DB,React,app imports,system clocks/RNG and escape paths',()=>{
 for(const source of ["import 'node:fs'","import x from 'pg'","import React from 'react'","import x from '../../../apps/platform-api/src/app'","const x=Date.now()","const x=Math.random()","const x=Math['random']()","const {random}=Math","const rng=Math; rng.random()","const x=globalThis.crypto","fetch('/v1/me')","setTimeout(()=>{},1)","import(name)","const x=Function('return process')()"]){expect(()=>assertPureGameSource(source)).toThrow();}
 expect(()=>assertPureGameSource("import {GameModeSchema} from '@virtual-city/contracts';export const f=(clock:number)=>clock+1;")).not.toThrow();
 for(const source of ["import * as contracts from '@virtual-city/contracts'","import {sceneManifestHash} from '@virtual-city/contracts'","export * from '@virtual-city/contracts'","import fs = require('node:fs')","console.log('secret')","import {x} from '../escape'"])expect(()=>assertPureGameSource(source)).toThrow();
});
