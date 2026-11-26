import Fastify,{type FastifyInstance} from 'fastify';
import cookie from '@fastify/cookie';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {registerNativeArena8} from './native-http';
import {readConfig} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import type {NativeArena8Provisioner} from '../application/native-provisioner';
import {DomainError} from '../../../../../shared/common/errors';

const ACCOUNT='11111111-1111-4111-8111-111111111111';
const REQUEST='77777777-7777-4777-8777-777777777777';
const CREDENTIAL='ab'.repeat(32);
const BODY={requestId:REQUEST,petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular'};
const VIEW={
  matchId:'33333333-3333-4333-8333-333333333333',
  wssUrl:'wss://127.0.0.1:4443/rt/v1',httpsOrigin:'https://127.0.0.1:4443',
  ticket:'header.payload.signature',expiresAt:'2023-11-14T22:13:50.000Z',
  contentHash:'ab'.repeat(32),bootId:'44444444-4444-4444-8444-444444444444',
  principal:ACCOUNT,
  allocation:{petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',level:12,
    artifacts:[{definitionId:'ember-core',upgradeLevel:2}]},
};

afterEach(()=>vi.restoreAllMocks());

function identityFixture(){
  return {
    hash:(key:string)=>key,
    authenticate:vi.fn(async(credential:string)=>{
      if(credential!==CREDENTIAL)throw new DomainError('UNAUTHENTICATED',401,'Session expired or unavailable');
      return {accountId:ACCOUNT,sessionId:ACCOUNT,kind:'guest',expiresAt:Date.now()+60000};
    }),
    verifyCsrf:vi.fn((credential:string,header:unknown)=>{
      if(credential!==CREDENTIAL||header!=='fixture-csrf')
        throw new DomainError('FORBIDDEN',403,'CSRF validation failed');
    }),
  };
}

async function fixture(enabled=true){
  const http=Fastify();
  const config=readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://fixture@127.0.0.1/aetheria_soulbound_test',SESSION_SECRET:'native-arena8-route-test-only-secret-000001'});
  const identity=identityFixture();
  const allocate=vi.fn(async()=>VIEW);
  const provisioner={allocate} as unknown as NativeArena8Provisioner;
  await http.register(cookie,{secret:config.SESSION_SECRET});
  registerNativeArena8(http,config,identity as unknown as IdentityService,provisioner,{} as never,enabled);
  await http.ready();
  const headers={
    origin:'http://127.0.0.1:3300',
    cookie:'city_session='+encodeURIComponent(http.signCookie(CREDENTIAL)),
    'x-csrf-token':'fixture-csrf',
  };
  return {http,identity,allocate,headers,
    post:(overrides:{headers?:Record<string,string>;payload?:unknown}={})=>http.inject({
      method:'POST',url:'/v1/pets/wave-a/arena8/native/allocate',
      headers:{...headers,...overrides.headers},
      payload:overrides.payload===undefined?BODY:overrides.payload as Record<string,unknown>,
    })};
}

describe('native Arena8 allocation route',()=>{
  it('returns only the ticket and server-owned allocation for an authenticated session',async()=>{
    const f=await fixture();
    try{
      const response=await f.post();
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json()).toEqual(VIEW);
      expect(Object.keys(response.json()).sort()).toEqual([
        'allocation','bootId','contentHash','expiresAt','httpsOrigin','matchId',
        'principal','ticket','wssUrl',
      ]);
      expect(f.allocate).toHaveBeenCalledTimes(1);
      expect(f.allocate).toHaveBeenCalledWith(ACCOUNT,CREDENTIAL,REQUEST,{
        petId:'ember-cub',mapId:'cinder-terraces',encounterId:'cinder-terraces-regular',
      });
      expect(f.identity.verifyCsrf).toHaveBeenCalledWith(CREDENTIAL,'fixture-csrf');
    }finally{await f.http.close();}
  });

  it('requires an authenticated session and CSRF before allocating',async()=>{
    const f=await fixture();
    try{
      const anonymous=await f.post({headers:{cookie:''}});
      expect(anonymous.statusCode).toBe(401);
      expect(f.allocate).not.toHaveBeenCalled();
      const forged=await f.post({headers:{'x-csrf-token':'wrong'}});
      expect(forged.statusCode).toBe(403);
      expect(f.allocate).not.toHaveBeenCalled();
    }finally{await f.http.close();}
  });

  it('rejects unknown allocation fields before reaching the provisioner',async()=>{
    const f=await fixture();
    try{
      const response=await f.post({payload:{...BODY,level:60}});
      expect(response.statusCode).toBe(422);
      expect(f.allocate).not.toHaveBeenCalled();
    }finally{await f.http.close();}
  });

  it('stays absent by default and refuses a production composition',async()=>{
    const f=await fixture(false);
    try{
      expect((await f.post()).statusCode).toBe(404);
      expect(f.allocate).not.toHaveBeenCalled();
    }finally{await f.http.close();}
    const config=readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://fixture@127.0.0.1/aetheria_soulbound_test',SESSION_SECRET:'native-arena8-route-test-only-secret-000001'});
    expect(()=>registerNativeArena8({} as FastifyInstance,{...config,NODE_ENV:'production'},
      {} as IdentityService,{} as NativeArena8Provisioner,{} as never,true)).toThrow(/local\/test only/);
  });
});
