import {expect,it,vi} from 'vitest';
import type {NativeSessionCustodyPort} from '@virtual-city/client-sdk';
import {nativeWorldPlatform} from './world-platform';
vi.mock('@capacitor/app',()=>({App:{}}));vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>false}}));
const account='a0000000-0000-4000-8000-000000000001',other='a0000000-0000-4000-8000-000000000002',intent='a0000000-0000-4000-8000-000000000003';
const setup=()=>{const session={world:vi.fn().mockResolvedValue({status:200,body:{ok:true}}),request:vi.fn(),roomTicket:vi.fn(),avatarState:vi.fn()}as unknown as NativeSessionCustodyPort;return {session,platform:nativeWorldPlatform(session,account,vi.fn())};};
it('maps only dedicated world operations;arbitrary origins,paths and mutating reads never reach native HTTP',async()=>{
 const {session,platform}=setup();
 for(const path of ['https://localhost/v1/worlds','//evil/v1/worlds','/v1/worlds?admin=1','/v1/reports','/v1/me/export','/v1/travel-intents/'+intent+'/../cancel'])expect((await platform.request(path)).status).toBe(503);
 expect((await platform.request('/v1/worlds',{method:'POST'})).status).toBe(503);expect(session.world).not.toHaveBeenCalled();expect(session.request).not.toHaveBeenCalled();
 await platform.request('/v1/worlds');await platform.request('/v1/client-compatibility');await platform.request('/v1/me/room');expect(vi.mocked(session.world).mock.calls.map(([call])=>call)).toEqual(['catalog','compatibility','visit'].map(operation=>({operation,expectedAccountId:account})));
});
it('keeps travel creation and cancellation keys exact and forbids path/body injection',async()=>{
 const {session,platform}=setup(),input={schemaVersion:1,source:null,destination:{worldSlug:'deadline',worldVersion:'1.1.0',sceneVersion:'1.0.0'}};
 const init={method:'POST',headers:{'idempotency-key':intent},body:JSON.stringify(input)};
 await platform.request('/v1/travel-intents',init);await platform.request('/v1/travel-intents',init);expect(vi.mocked(session.world).mock.calls.slice(0,2).map(([call])=>call)).toEqual(Array(2).fill({operation:'travel-create',expectedAccountId:account,requestId:intent,input}));
 await platform.request('/v1/travel-intents/'+intent);await platform.request('/v1/travel-intents/'+intent+'/cancel',{method:'POST',headers:{'idempotency-key':intent},body:'{}'});
 expect((await platform.request('/v1/travel-intents/'+intent+'/cancel',{method:'POST',headers:{'idempotency-key':intent},body:'{"accountId":"other"}'})).status).toBe(503);expect(session.world).toHaveBeenCalledTimes(4);
});
it('drops an aborted native response even though its possibly committed operation cannot be retried automatically',async()=>{
 const {session,platform}=setup(),controller=new AbortController();let finish!:(value:{status:number;body:unknown})=>void;vi.mocked(session.world).mockImplementation(()=>new Promise(ok=>{finish=ok;}));const pending=platform.request('/v1/me/room',{signal:controller.signal});controller.abort();finish({status:200,body:{ok:true}});await expect(pending).rejects.toThrow();expect(session.world).toHaveBeenCalledTimes(1);
});
it('rejects a ticket requested for another displayed account before bridge access',async()=>{
 const {session,platform}=setup();await expect(platform.socketAuth!({expectedAccountId:other,protocol:{nonce:intent,versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]}})).rejects.toThrow('Account changed');expect(session.roomTicket).not.toHaveBeenCalled();
});
it('validates one-use ticket nonce and expiry without exposing reusable credentials',async()=>{
 const {session,platform}=setup(),protocol={nonce:intent,versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]},ticket={schemaVersion:1,ticket:'nt1.'+'1'.repeat(64),expiresAt:new Date(Date.now()+30000).toISOString(),selection:{schemaVersion:1,nonce:other,protocolVersion:1,sceneSchemaVersion:1,capabilities:[],roomDelta:'full-snapshot'}};
 vi.mocked(session.roomTicket).mockResolvedValue(ticket as never);await expect(platform.socketAuth!({expectedAccountId:account,protocol})).rejects.toThrow('Connection changed');ticket.selection.nonce=intent;
 expect(await platform.socketAuth!({expectedAccountId:account,protocol})).toEqual({schemaVersion:1,nativeTicket:ticket.ticket,protocol});ticket.expiresAt=new Date(Date.now()-1).toISOString();await expect(platform.socketAuth!({expectedAccountId:account,protocol})).rejects.toThrow('Connection changed');expect(session.request).not.toHaveBeenCalled();
});
