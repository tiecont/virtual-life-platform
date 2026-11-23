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

test('Cloudflare targets are private, route-free and explicitly non-deployable',async()=>{
  const result=await verifyCloudflareReadiness();
  assert.deepEqual(result.assets,['aetheria-assets-local','aetheria-assets-prod']);
  assert.deepEqual(result.workers,['aetheria-soulbound-portal-web','aetheria-soulbound-admin-web']);
  assert.equal(result.deploymentAuthorized,false);
  assert.equal(result.mcpLiveAccountProbe,'NOT_RUN');
});

test('readiness rejects public Workers previews, routes and upload authorization',async()=>{
  const base=await fixture();
  for(const mutate of [
    value=>{value.document.deploymentAuthorized=true;},
    value=>{value.document.publicRoutesConfigured=true;},
    value=>{value.document.assetTargets[0].private=false;},
    value=>{value.document.assetTargets[1].uploadAuthorized=true;},
    value=>{value.document.mcp.liveAccountProbe='PASS';},
    value=>{value.workers['aetheria-soulbound-portal-web']=value.workers['aetheria-soulbound-portal-web'].replace('"workers_dev": false','"workers_dev": true');},
    value=>{value.workers['aetheria-soulbound-admin-web']=value.workers['aetheria-soulbound-admin-web'].replace('"preview_urls": false','"preview_urls": true');},
    value=>{value.workers['aetheria-soulbound-portal-web']=value.workers['aetheria-soulbound-portal-web'].replace('"observability"','"routes": [{"pattern": "example.com/*"}],\n  "observability"');},
  ]){
    const tampered=structuredClone(base);
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
