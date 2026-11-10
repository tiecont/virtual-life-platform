import {afterEach,it,expect,vi} from 'vitest';
import type {ClientPlatform} from '@virtual-city/client-sdk';
import {QueueController} from '../src/queue-controller';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',ticket='33333333-3333-4333-8333-333333333333';
const me=(id=first)=>({profile:{id,displayName:'Synthetic queue visitor',avatarKey:'mint'},kind:'guest',expiresAt:'2027-01-01T00:00:00.000Z',csrfToken:'a'.repeat(64)});
const view=(id=first,state:'WAITING'|'RESERVED'|'ACTIVE'='WAITING')=>({schemaVersion:1,viewerAccountId:id,observedAt:new Date(Date.now()).toISOString(),availability:'FULL',etaSeconds:null,own:{schemaVersion:1,policyVersion:1,version:1,id:ticket,state,observedAt:new Date(Date.now()).toISOString(),expiresAt:state==='ACTIVE'?null:new Date(Date.now()+3000).toISOString(),...(state==='WAITING'?{position:2}:{})}});
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const flush=async()=>{await vi.advanceTimersByTimeAsync(0);};
function setup(handler:(path:string,init?:RequestInit)=>Promise<Response>){vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));let watch=()=>{},life=(_active:boolean)=>{};const request=vi.fn(handler);const platform:ClientPlatform={request,navigate:vi.fn(),visitChanged(){},watchIdentity(listener){watch=listener;return()=>{watch=()=>{};};},lifecycle:{subscribe(listener){life=listener;return()=>{life=()=>{};};}}};const changed=vi.fn(),controller=new QueueController(platform,changed,Date.now,()=>.5);controller.start();return{controller,request,changed,identityChanged:()=>watch(),lifecycleChanged:(active:boolean)=>life(active)};}
afterEach(()=>vi.useRealTimers());
it('requires both document visibility and native lifecycle to be active before polling resumes',async()=>{
 const {controller,request,lifecycleChanged}=setup(async path=>response(path==='/v1/me'?me():view()));await flush();controller.setForeground(false);const count=request.mock.calls.length;lifecycleChanged(true);await vi.advanceTimersByTimeAsync(20000);expect(request).toHaveBeenCalledTimes(count);
 lifecycleChanged(false);controller.setForeground(true);await vi.advanceTimersByTimeAsync(20000);expect(request).toHaveBeenCalledTimes(count);lifecycleChanged(true);await vi.advanceTimersByTimeAsync(1100);expect(request.mock.calls.length).toBeGreaterThan(count);controller.stop();
});
it('polls with bounded delay, never auto-claims and stops all requests while backgrounded or disposed',async()=>{
 const {controller,request}=setup(async path=>response(path==='/v1/me'?me():view(first,'RESERVED')));await flush();expect(controller.state.snapshot?.own?.state).toBe('RESERVED');expect(request).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(3100);expect(controller.state.remainingSeconds).toBe(0);expect(request.mock.calls.every(([,init])=>!init?.method)).toBe(true);
 controller.setForeground(false);const count=request.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);expect(request).toHaveBeenCalledTimes(count);controller.setForeground(true);await vi.advanceTimersByTimeAsync(1100);expect(request.mock.calls.length).toBeGreaterThan(count);controller.stop();const stopped=request.mock.calls.length;await vi.advanceTimersByTimeAsync(120000);expect(request).toHaveBeenCalledTimes(stopped);
});
it('an old identity response cannot replace a newer session or initiate a queue read for that old identity',async()=>{
 let release!:(response:Response)=>void,reads=0,current=first;const {controller,identityChanged,request}=setup(async path=>path==='/v1/me'?(++reads===1?new Promise(resolve=>release=resolve):response(me(current))):response(view(current)));
 await flush();current=second;identityChanged();await flush();expect(controller.state.snapshot?.viewerAccountId).toBe(second);release(response(me(first)));await flush();expect(controller.state.snapshot?.viewerAccountId).toBe(second);expect(request.mock.calls.filter(([p])=>p==='/v1/admission')).toHaveLength(1);controller.stop();
});
it('drops a late old-ticket response after account switch, and rejects a response for a different viewer',async()=>{
 let release!:(response:Response)=>void,current=first,reads=0;const {controller,identityChanged}=setup(async path=>path==='/v1/me'?response(me(current)):(++reads===1?new Promise(resolve=>release=resolve):response(view(current))));await flush();current=second;identityChanged();await flush();release(response(view(first)));await flush();expect(controller.state.snapshot?.viewerAccountId).toBe(second);controller.stop();
 const mismatch=setup(async path=>response(path==='/v1/me'?me(first):view(second)));await flush();expect(mismatch.controller.state.phase).toBe('signed-out');expect(mismatch.controller.state.snapshot).toBeNull();mismatch.controller.stop();
});
it('retains the exact command after lost acknowledgement and blocks a different action until that receipt is confirmed',async()=>{
 const bodies:string[]=[];let writes=0;const {controller}=setup(async(path,init)=>{if(path==='/v1/me')return response(me());if(init?.method==='POST'){bodies.push(String(init.body));if(++writes===1)throw Error('synthetic lost acknowledgement');const input=JSON.parse(String(init.body));return response({...view(),requestId:input.requestId});}return response({...view(),own:writes?view().own:null});});await flush();await controller.act('enqueue');expect(controller.state.uncertain).toBe(true);await controller.act('leave');expect(writes).toBe(1);await vi.advanceTimersByTimeAsync(8001);await controller.retry();expect(writes).toBe(2);expect(bodies[0]).toBe(bodies[1]);expect(controller.state.uncertain).toBe(false);controller.stop();
});
it('rate limits manual refresh and respects a full minute of429backoff',async()=>{
 let reads=0;const {controller,request}=setup(async path=>path==='/v1/me'?response(me()):(reads++,response({},429)));await flush();expect(controller.state.phase).toBe('offline');for(let i=0;i<50;i++)await controller.refresh();await vi.advanceTimersByTimeAsync(59999);expect(reads).toBe(1);await vi.advanceTimersByTimeAsync(2);expect(reads).toBe(2);expect(request).toHaveBeenCalledTimes(3);controller.stop();
});
it('bounds a hung read to eight seconds and never exposes an unvalidated ticket',async()=>{
 const {controller}=setup(async path=>path==='/v1/me'?response(me()):new Promise(()=>{}));await flush();await vi.advanceTimersByTimeAsync(8001);expect(controller.state.phase).toBe('offline');expect(controller.state.snapshot).toBeNull();controller.stop();
});
it('clears a pending command and private ticket on identity change, including a late successful mutation',async()=>{
 let release!:(response:Response)=>void,current=first,input:{requestId:string}|undefined;const {controller,identityChanged}=setup(async(path,init)=>{if(path==='/v1/me')return response(me(current));if(init?.method==='POST'){input=JSON.parse(String(init.body));return new Promise(resolve=>release=resolve);}return response({...view(current),own:null});});await flush();const pending=controller.act('enqueue');await flush();current=second;identityChanged();await flush();release(response({...view(first),requestId:input!.requestId}));await pending;await flush();expect(controller.state.snapshot?.viewerAccountId).toBe(second);expect(controller.state.uncertain).toBe(false);expect(controller.state.busy).toBe(false);controller.stop();
});
