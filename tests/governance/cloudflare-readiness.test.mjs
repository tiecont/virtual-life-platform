import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {
  validateCloudflareReadiness,
  verifyCloudflareReadiness,
} from '../../scripts/verify-cloudflare-readiness.mjs';

async function fixture(){
  return {
    document:JSON.parse(await readFile('infra/cloudflare/readiness.json','utf8')),
    workers:{
      'aetheria-soulbound-portal-web':await readFile('infra/cloudflare/portal-web/wrangler.jsonc','utf8'),
      'aetheria-soulbound-admin-web':await readFile('infra/cloudflare/admin-web/wrangler.jsonc','utf8'),
    },
    localEnv:await readFile('.env.example','utf8'),
    productionEnv:await readFile('.env.production.example','utf8'),
  };
}

test('Cloudflare targets are deployable only as private owner-protected edge proxies',async()=>{
  const result=await verifyCloudflareReadiness();
  assert.deepEqual(result.assets,['aetheria-assets-local','aetheria-assets-prod']);
  assert.deepEqual(result.workers,['aetheria-soulbound-portal-web','aetheria-soulbound-admin-web']);
  assert.equal(result.deploymentAuthorized,true);
  assert.equal(result.mcpLiveAccountProbe,'VERIFIED_2026-11-24_PRIVATE_ACCESS_AND_VPC');
});

test('readiness rejects public previews/routes, missing VPC bindings and asset upload authorization',async()=>{
  const base=await fixture();
  for(const mutate of [
    value=>{value.document.deploymentAuthorized=false;},
    value=>{value.document.publicRoutesConfigured=true;},
    value=>{value.document.assetTargets[0].private=false;},
    value=>{value.document.assetTargets[1].uploadAuthorized=true;},
    value=>{value.document.mcp.liveAccountProbe='NOT_RUN';},
    value=>{value.workers['aetheria-soulbound-portal-web']=value.workers['aetheria-soulbound-portal-web'].replace('"workers_dev": true','"workers_dev": false');},
    value=>{value.workers['aetheria-soulbound-admin-web']=value.workers['aetheria-soulbound-admin-web'].replace('"preview_urls": false','"preview_urls": true');},
    value=>{value.workers['aetheria-soulbound-portal-web']=value.workers['aetheria-soulbound-portal-web'].replace('"observability"','"routes": [{"pattern": "example.com/*"}],\n  "observability"');},
    value=>{value.workers['aetheria-soulbound-portal-web']=value.workers['aetheria-soulbound-portal-web'].replace('"binding": "API"','"binding": "OTHER"');},
  ]){
    const tampered=globalThis.structuredClone(base);
    mutate(tampered);
    assert.throws(()=>validateCloudflareReadiness(tampered));
  }
});

test('production template requires Upstash HTTPS and forbids REDIS_URL or committed values',async()=>{
  const base=await fixture();
  const invalid=[
    base.productionEnv.replace(/^UPSTASH_REDIS_REST_URL=.*$/m,'UPSTASH_REDIS_REST_URL=http://private.invalid'),
    base.productionEnv+'\nREDIS_URL=redis://127.0.0.1:6379/0\n',
    base.productionEnv.replace(/^UPSTASH_REDIS_REST_TOKEN=.*$/m,'UPSTASH_REDIS_REST_TOKEN='),
    base.productionEnv.replace(/^S3_REGION=.*$/m,'S3_REGION=us-east-1'),
  ];
  for(const productionEnv of invalid)assert.throws(()=>validateCloudflareReadiness({...base,productionEnv}));
});
