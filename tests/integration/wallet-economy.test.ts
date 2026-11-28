import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {
  EconomyPolicyOverviewSchema,
  FourResourceWalletSchema,
  WalletConvertReceiptSchema,
} from '@aetheria/contracts';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {OperatorService} from '../../apps/platform-api/src/features/identity/modules/operators/application/operator-service';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
import {adminConfig,createAdminHandler} from '../../apps/admin-web/server/proxy';

const playerOrigin='http://127.0.0.1:3300';
const adminOrigin='http://127.0.0.1:3400';
const totpSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const operatorPassword='synthetic-wallet-economy-operator-pw';

const initialPolicy={
  energyMax:180,energyRegenSeconds:300,activityEnergyCost:0,diamondToLuminousStoneRate:1 as const,
  firstClearLuminousStones:60,bossFirstClearLuminousStones:120,gachaSingleCostCoins:100,gachaSingleCostLuminousStones:160,
  gachaDisclosure:{
    featuredPetId:'pet-v3-fire-icarus',softPityAt:60,hardPityAt:80,baseSProbabilityPpm:8000,
    featuredProbabilityPpm:500000,guaranteedFeaturedAfterOffRate:true,duplicateExp:200,missExp:25,
    realMoneyPurchasesEnabled:false as const,summary:'Synthetic economy policy for wallet integration tests.',
  },
};

let admin:Pool;
const opened:{pool:Pool;schema:string;apps:Awaited<ReturnType<typeof createApp>>[]}[]=[];

beforeAll(()=>{
  const url=new URL(process.env.TEST_DATABASE_URL??'');
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1))){
    throw new Error('Disposable local test database required');
  }
  admin=new Pool({connectionString:url.toString()});
});

afterEach(async()=>{
  for(const item of opened.splice(0)){
    for(const app of item.apps)await app.app.close();
    await item.pool.end();
    await admin.query(`DROP SCHEMA "${item.schema}" CASCADE`);
  }
});

afterAll(async()=>{
  await admin?.end();
});

async function setupStack({enabled=true,published=true}={}){
  const schema='wallet_economy_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const address=new URL(process.env.TEST_DATABASE_URL!);
  address.searchParams.set('options','-c search_path='+schema);
  const pool=new Pool({connectionString:address.toString()});
  const item={pool,schema,apps:[] as Awaited<ReturnType<typeof createApp>>[]};
  opened.push(item);
  await migrate(pool);

  let nowOffsetMs=0;
  const now=()=>Date.now()+nowOffsetMs;
  const operatorKey=randomBytes(32).toString('hex');
  const readToken=randomBytes(32).toString('hex');
  await new OperatorService(pool,operatorKey,()=>now()-60_000).bootstrap({
    password:operatorPassword,
    totpSecret,
    code:totp(totpSecret,now()-60_000),
  });

  const config=readConfig({
    NODE_ENV:'test',
    DATABASE_URL:address.toString(),
    SESSION_SECRET:'wallet-economy-integration-test-secret-01',
    ADMIN_ORIGIN:adminOrigin,
    OPERATOR_AUTH_KEY:operatorKey,
    OPERATOR_TELEMETRY_TOKEN:readToken,
    ...(enabled?{LOCAL_PET_WALLET:'1'}:{}),
  });
  const server=await createApp(config,pool,false,{
    now,
    petArenaWave1:{enabled:true},
  });
  item.apps.push(server);
  await server.app.listen(0,'127.0.0.1');
  const apiUrl=await server.app.getUrl();
  const proxy=createAdminHandler(
    adminConfig({NODE_ENV:'test',ADMIN_ORIGIN:adminOrigin,ADMIN_API_ORIGIN:apiUrl,ADMIN_METRICS_READ_TOKEN:readToken}),
    fetch,
    now,
  );
  const login=await proxy(new Request(adminOrigin+'/api/admin/login',{
    method:'POST',headers:{origin:adminOrigin},body:JSON.stringify({password:operatorPassword,code:totp(totpSecret,now())}),
  }));
  expect(login.status).toBe(200);
  const opCookie=login.headers.get('set-cookie')!.split(';')[0]!;
  const {csrfToken}=await login.json() as {csrfToken:string};
  if(published){
    const initialized=await proxy(new Request(adminOrigin+'/api/admin/economy-policy-publish',{
      method:'POST',
      headers:{origin:adminOrigin,cookie:opCookie,'x-csrf-token':csrfToken},
      body:JSON.stringify({requestId:randomUUID(),expectedActiveRevision:0,reason:'SYNTHETIC_TEST_POLICY',policy:initialPolicy}),
    }));
    expect(initialized.status).toBe(200);
  }
  return {
    pool,
    server,
    proxy,
    opCookie,
    csrfToken,
    digest,
    contentHash,
    advanceTime:(deltaMs:number)=>{nowOffsetMs+=deltaMs;},
    now,
  };
}

let ipCounter=1;
async function createGuest(server:Awaited<ReturnType<typeof createApp>>,displayName='Wallet Explorer'){
  const response=await server.http.inject({
    method:'POST',
    url:'/v1/session/guest',
    remoteAddress:'127.219.0.'+ipCounter++,
    headers:{origin:playerOrigin},
    payload:{requestId:randomUUID(),displayName,avatarKey:'mint'},
  });
  expect(response.statusCode).toBe(201);
  const body=response.json() as {csrfToken:string;profile:{id:string}};
  return {
    accountId:body.profile.id,
    cookie:String(response.headers['set-cookie']).split(';')[0]!,
    csrf:body.csrfToken,
  };
}

describe('Local four-resource wallet and economy policy',()=>{
  it('leaves player and operator wallet routes absent by default',async()=>{
    const {server,proxy,pool,opCookie}=await setupStack({enabled:false,published:false});
    const user=await createGuest(server,'Disabled Wallet');
    expect((await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:user.cookie}})).statusCode).toBe(404);
    expect((await proxy(new Request(adminOrigin+'/api/admin/economy-policy',{headers:{cookie:opCookie}}))).status).toBe(404);
    expect((await pool.query('SELECT 1 FROM pet_economy_policy_active')).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM pet_wallet_accounts')).rowCount).toBe(0);
  });

  it('enforces authentication, strict queries, CSRF, Origin, and conversion input bounds',async()=>{
    const {server}=await setupStack();
    const user=await createGuest(server,'Guard Visitor');

    expect((await server.http.inject({url:'/v1/pets/wallet'})).statusCode).toBe(401);
    expect((await server.http.inject({url:'/v1/pets/wallet?extra=1',headers:{cookie:user.cookie}})).statusCode).toBe(422);

    const validPayload={requestId:randomUUID(),premiumDiamonds:10};
    expect((await server.http.inject({
      method:'POST',url:'/v1/pets/wallet/convert',headers:{origin:playerOrigin},payload:validPayload,
    })).statusCode).toBe(401);
    expect((await server.http.inject({
      method:'POST',url:'/v1/pets/wallet/convert',headers:{origin:playerOrigin,cookie:user.cookie},payload:validPayload,
    })).statusCode).toBe(403);
    expect((await server.http.inject({
      method:'POST',url:'/v1/pets/wallet/convert',headers:{origin:'https://attacker.invalid',cookie:user.cookie,'x-csrf-token':user.csrf},payload:validPayload,
    })).statusCode).toBe(403);

    for(const bad of [
      {requestId:randomUUID(),premiumDiamonds:0},
      {requestId:randomUUID(),premiumDiamonds:-5},
      {requestId:randomUUID(),premiumDiamonds:1.5},
      {requestId:randomUUID(),premiumDiamonds:1_000_000_001},
      {requestId:randomUUID(),premiumDiamonds:10,extra:'rejected'},
    ]){
      const res=await server.http.inject({
        method:'POST',url:'/v1/pets/wallet/convert',
        headers:{origin:playerOrigin,cookie:user.cookie,'x-csrf-token':user.csrf},
        payload:bad,
      });
      expect(res.statusCode).toBe(422);
    }
  });

  it('serves the 4-resource wallet, shares canonical Coins with Wave 1, and computes lazy energy regen with remainder preservation',async()=>{
    const {pool,server,advanceTime,now}=await setupStack();
    const user=await createGuest(server,'Energy Explorer');

    const initial=await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:user.cookie}});
    expect(initial.statusCode).toBe(200);
    const parsedInitial=FourResourceWalletSchema.parse(initial.json());
    expect(parsedInitial).toEqual({
      schemaVersion:1,
      energy:{current:180,max:180,regenSeconds:300,nextRegenSeconds:0},
      premiumDiamonds:0,
      coins:0,
      luminousStones:0,
      conversionPolicy:{enabled:true,from:'premiumDiamonds',to:'luminousStones',inputUnit:1,outputUnit:1},
    });

    const wave1=await server.http.inject({url:'/v1/pets/wave1/state',headers:{cookie:user.cookie}});
    expect(wave1.statusCode).toBe(200);
    expect(wave1.json().wallet).toEqual({coins:8000});

    const synced=await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:user.cookie}});
    expect(synced.json().coins).toBe(8000);

    await pool.query(
      'UPDATE pet_wallet_accounts SET energy_current=$2, energy_updated_at=$3 WHERE account_id=$1',
      [user.accountId,175,new Date(now()-350_000)],
    );
    const afterOneTick=await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:user.cookie}});
    expect(afterOneTick.json().energy).toEqual({current:176,max:180,regenSeconds:300,nextRegenSeconds:250});

    advanceTime(250_000);
    const afterSecondTick=await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:user.cookie}});
    expect(afterSecondTick.json().energy).toEqual({current:177,max:180,regenSeconds:300,nextRegenSeconds:300});
  });

  it('executes atomic 1:1 diamond-to-stone conversions with idempotency, conflict, race protection, overflow guard, and immutable ledger',async()=>{
    const {pool,server}=await setupStack();
    const owner=await createGuest(server,'Converter');
    const stranger=await createGuest(server,'Other Player');

    await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:owner.cookie}});
    await pool.query('UPDATE pet_wallet_accounts SET premium_diamonds=100 WHERE account_id=$1',[owner.accountId]);

    const convert=(actor:typeof owner,requestId:string,premiumDiamonds:number)=>
      server.http.inject({
        method:'POST',
        url:'/v1/pets/wallet/convert',
        headers:{origin:playerOrigin,cookie:actor.cookie,'x-csrf-token':actor.csrf},
        payload:{requestId,premiumDiamonds},
      });

    const req1=randomUUID();
    const first=await convert(owner,req1,40);
    expect(first.statusCode).toBe(200);
    const receipt=WalletConvertReceiptSchema.parse(first.json());
    expect(receipt).toMatchObject({
      requestId:req1,
      debitedPremiumDiamonds:40,
      creditedLuminousStones:40,
      wallet:{premiumDiamonds:60,luminousStones:40},
    });

    const replay=await convert(owner,req1,40);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const conflicting=await convert(owner,req1,10);
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json().error.code).toBe('REQUEST_CONFLICT');

    const insufficient=await convert(owner,randomUUID(),61);
    expect(insufficient.statusCode).toBe(409);
    expect(insufficient.json().error.code).toBe('INSUFFICIENT_PREMIUM_DIAMONDS');

    // Reset to 100 diamonds and race two distinct 60-diamond conversions concurrently.
    await pool.query('UPDATE pet_wallet_accounts SET premium_diamonds=100 WHERE account_id=$1',[owner.accountId]);
    const race=await Promise.all([convert(owner,randomUUID(),60),convert(owner,randomUUID(),60)]);
    expect(race.map(r=>r.statusCode).sort()).toEqual([200,409]);
    const postRace=(await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:owner.cookie}})).json();
    expect(postRace).toMatchObject({premiumDiamonds:40,luminousStones:100});

    // Overflow guard protects Number.MAX_SAFE_INTEGER ceiling.
    await pool.query('UPDATE pet_wallet_accounts SET premium_diamonds=20, luminous_stones=$2 WHERE account_id=$1',[owner.accountId,Number.MAX_SAFE_INTEGER-5]);
    expect((await convert(owner,randomUUID(),6)).statusCode).toBe(409);
    expect((await convert(owner,randomUUID(),5)).statusCode).toBe(200);

    // Cross-account isolation & ledger immutability.
    expect((await convert(stranger,randomUUID(),1)).statusCode).toBe(409);
    await expect(pool.query('UPDATE pet_wallet_ledger SET delta_luminous_stones=999 WHERE account_id=$1',[owner.accountId])).rejects.toThrow('Wallet ledger entries are immutable');
    await expect(pool.query('DELETE FROM pet_wallet_ledger WHERE account_id=$1',[owner.accountId])).rejects.toThrow('Wallet ledger entries are retained for active accounts');
  });

  it('exports wallet custody and cascades pet_wallet_accounts and pet_wallet_ledger cleanly on owner erasure',async()=>{
    const {pool,server}=await setupStack();
    const doomed=await createGuest(server,'Doomed Owner');
    const survivor=await createGuest(server,'Survivor Owner');

    await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:doomed.cookie}});
    await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:survivor.cookie}});
    await pool.query('UPDATE pet_wallet_accounts SET premium_diamonds=50 WHERE account_id=ANY($1::uuid[])',[[doomed.accountId,survivor.accountId]]);
    for(const user of [doomed,survivor]){
      const conv=await server.http.inject({
        method:'POST',url:'/v1/pets/wallet/convert',
        headers:{origin:playerOrigin,cookie:user.cookie,'x-csrf-token':user.csrf},
        payload:{requestId:randomUUID(),premiumDiamonds:15},
      });
      expect(conv.statusCode).toBe(200);
    }

    const exported=await server.http.inject({url:'/v1/me/export',headers:{cookie:doomed.cookie}});
    expect(exported.statusCode).toBe(200);
    expect(exported.json().domains.petWallet).toMatchObject({
      initialized:true,
      wallet:{premiumDiamonds:35,luminousStones:15},
      recentLedger:[expect.objectContaining({kind:'diamond_to_stone_conversion',deltaPremiumDiamonds:-15,deltaLuminousStones:15})],
    });

    const del=await server.http.inject({
      method:'DELETE',url:'/v1/me',
      headers:{origin:playerOrigin,cookie:doomed.cookie,'x-csrf-token':doomed.csrf,'idempotency-key':randomUUID()},
    });
    expect(del.statusCode).toBe(200);
    expect((await pool.query('SELECT 1 FROM pet_wallet_accounts WHERE account_id=$1',[doomed.accountId])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM pet_wallet_ledger WHERE account_id=$1',[doomed.accountId])).rowCount).toBe(0);
    expect((await pool.query('SELECT premium_diamonds,luminous_stones FROM pet_wallet_accounts WHERE account_id=$1',[survivor.accountId])).rows).toEqual([{premium_diamonds:'35',luminous_stones:'15'}]);
  });

  it('publishes, rolls back, and hash-audits PostgreSQL Economy Authority through the admin proxy',async()=>{
    const {proxy,server,advanceTime,opCookie,csrfToken,pool}=await setupStack({published:false});
    const player=await createGuest(server,'Economy Observer');
    const walletRequest={url:'/v1/pets/wallet',headers:{cookie:player.cookie}};
    expect((await server.http.inject(walletRequest)).statusCode).toBe(503);
    expect((await pool.query('SELECT 1 FROM pet_wallet_accounts')).rowCount).toBe(0);

    const overviewRequest=()=>new Request(adminOrigin+'/api/admin/economy-policy',{headers:{cookie:opCookie}});
    const empty=EconomyPolicyOverviewSchema.parse(await (await proxy(overviewRequest())).json());
    expect(empty).toMatchObject({activeVersion:null,active:null,activeRevision:0,versions:[]});

    const firstPublish=await proxy(new Request(adminOrigin+'/api/admin/economy-policy-publish',{
      method:'POST',
      headers:{origin:adminOrigin,cookie:opCookie,'x-csrf-token':csrfToken},
      body:JSON.stringify({requestId:randomUUID(),expectedActiveRevision:0,reason:'SYNTHETIC_TEST_POLICY',policy:initialPolicy}),
    }));
    expect(firstPublish.status).toBe(200);
    expect((await server.http.inject(walletRequest)).json().energy.max).toBe(180);

    const initialOverview=EconomyPolicyOverviewSchema.parse(await (await proxy(new Request(adminOrigin+'/api/admin/economy-policy',{headers:{cookie:opCookie}}))).json());
    expect(initialOverview).toMatchObject({
      activeVersion:1,
      activeRevision:1,
      active:{energyMax:180,diamondToLuminousStoneRate:1,firstClearLuminousStones:60,bossFirstClearLuminousStones:120},
    });

    const nextPolicy={
      energyMax:240,
      energyRegenSeconds:180,
      activityEnergyCost:10,
      diamondToLuminousStoneRate:1 as const,
      firstClearLuminousStones:75,
      bossFirstClearLuminousStones:150,
      gachaSingleCostCoins:120,
      gachaSingleCostLuminousStones:180,
      gachaDisclosure:{...initialPolicy.gachaDisclosure,duplicateExp:250},
    };
    const publishReq=randomUUID();
    const pubRes=await proxy(new Request(adminOrigin+'/api/admin/economy-policy-publish',{
      method:'POST',
      headers:{origin:adminOrigin,cookie:opCookie,'x-csrf-token':csrfToken},
      body:JSON.stringify({requestId:publishReq,expectedActiveRevision:1,reason:'WAVE_D4_INCREASE',policy:nextPolicy}),
    }));
    expect(pubRes.status).toBe(200);
    const pubBody=await pubRes.json();
    expect(pubBody).toMatchObject({version:2,activeRevision:2,active:{energyMax:240,firstClearLuminousStones:75}});

    const pubReplay=await proxy(new Request(adminOrigin+'/api/admin/economy-policy-publish',{
      method:'POST',
      headers:{origin:adminOrigin,cookie:opCookie,'x-csrf-token':csrfToken},
      body:JSON.stringify({requestId:publishReq,expectedActiveRevision:1,reason:'WAVE_D4_INCREASE',policy:nextPolicy}),
    }));
    expect(pubReplay.status).toBe(200);
    expect(await pubReplay.json()).toEqual(pubBody);

    expect((await server.http.inject({url:'/v1/pets/wallet',headers:{cookie:player.cookie}})).json().energy.max).toBe(240);

    const stalePublish=await proxy(new Request(adminOrigin+'/api/admin/economy-policy-publish',{
      method:'POST',
      headers:{origin:adminOrigin,cookie:opCookie,'x-csrf-token':csrfToken},
      body:JSON.stringify({requestId:randomUUID(),expectedActiveRevision:1,reason:'STALE_REV',policy:nextPolicy}),
    }));
    expect(stalePublish.status).toBe(409);

    const rbRes=await proxy(new Request(adminOrigin+'/api/admin/economy-policy-rollback',{
      method:'POST',
      headers:{origin:adminOrigin,cookie:opCookie,'x-csrf-token':csrfToken},
      body:JSON.stringify({requestId:randomUUID(),version:1,expectedActiveRevision:2,reason:'ROLLBACK_TO_V1'}),
    }));
    expect(rbRes.status).toBe(200);
    expect(await rbRes.json()).toMatchObject({version:1,activeRevision:3});

    const audit=await (await proxy(new Request(adminOrigin+'/api/admin/economy-policy-audit',{headers:{cookie:opCookie}}))).json();
    expect(audit.events.map((e:{action:string})=>e.action)).toEqual(['rollback','publish','publish']);
    expect(audit.events[0].previousHash).toBe(audit.events[1].eventHash);
    expect(audit.events[1].previousHash).toBe(audit.events[2].eventHash);
    expect(audit.events[2].beforeVersion).toBeNull();

    advanceTime(300_001);
    expect((await proxy(new Request(adminOrigin+'/api/admin/economy-policy',{headers:{cookie:opCookie}}))).status).toBe(403);
  });
});
