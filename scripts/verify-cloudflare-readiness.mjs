import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';

const expectedAssets=['aetheria-assets-local','aetheria-assets-prod'];
const expectedWorkers={
  'aetheria-soulbound-portal-web':{
    app:'apps/portal-web',
    config:'infra/cloudflare/portal-web/wrangler.jsonc',
  },
  'aetheria-soulbound-admin-web':{
    app:'apps/admin-web',
    config:'infra/cloudflare/admin-web/wrangler.jsonc',
  },
};

function jsonc(source,label){
  return JSON.parse(source.replace(/^\s*\/\/.*$/gm,''),label);
}

function exactSecretsFree(value,label='readiness'){
  if(Array.isArray(value)){
    for(const [index,item] of value.entries())if(item&&typeof item==='object')exactSecretsFree(item,`${label}[${index}]`);
    return;
  }
  assert(value&&typeof value==='object',`${label} must be an object`);
  for(const [key,item] of Object.entries(value)){
    assert(!/(?:secret|token|access[_-]?key|account[_-]?id)$/i.test(key),`${label}.${key} cannot contain a secret or account identifier`);
    if(item&&typeof item==='object')exactSecretsFree(item,`${label}.${key}`);
  }
}

export function validateCloudflareReadiness({document,workers,localEnv,productionEnv}){
  assert.equal(document.schemaVersion,1);
  assert.equal(document.release,'OFFLINE_ONLY / NO_GO_PUBLIC');
  assert.equal(document.deploymentAuthorized,true);
  assert.equal(document.accountIdentifiersIncluded,false);
  assert.equal(document.publicRoutesConfigured,false);
  exactSecretsFree(document);

  assert.deepEqual(document.assetTargets.map(value=>value.name).sort(),expectedAssets);
  for(const target of document.assetTargets){
    assert.equal(target.private,true,`${target.name} must stay private`);
    assert.equal(target.uploadAuthorized,false,`${target.name} upload authorization must stay explicitly off`);
    assert.equal(target.bucketVariable,'S3_BUCKET');
    assert.equal(target.accessKeyVariable,'S3_ACCESS_KEY_ID');
    assert.equal(target.secretKeyVariable,'S3_SECRET_ACCESS_KEY');
    assert.equal(target.regionVariable,'S3_REGION');
  }
  assert.equal(document.assetTargets.find(value=>value.name==='aetheria-assets-local').environmentFile,'.env');
  assert.equal(document.assetTargets.find(value=>value.name==='aetheria-assets-prod').environmentFile,'.env.production');
  assert.equal(document.assetTargets.find(value=>value.name==='aetheria-assets-prod').provider,'cloudflare-r2');

  assert.deepEqual(Object.keys(workers).sort(),Object.keys(expectedWorkers).sort());
  for(const [name,expected] of Object.entries(expectedWorkers)){
    const declared=document.workers.find(value=>value.name===name);
    assert(declared,`Missing Worker target ${name}`);
    assert.equal(declared.app,expected.app);
    assert.equal(declared.config,expected.config);
    assert.equal(declared.deployAuthorized,true);
    assert.equal(declared.accessPolicy,'Aetheria Production Owner');
    const config=jsonc(workers[name],expected.config);
    assert.equal(config.name,name);
    assert.match(config.main,/infra\/northflank\/worker\.mjs$/u);
    assert.equal(config.workers_dev,true);
    assert.equal(config.preview_urls,false);
    assert.equal(config.vars?.SITE,name.includes('admin')?'admin':'portal');
    const requiredBindings=name.includes('admin')?['FRONTEND']:['API','FRONTEND'];
    for(const binding of requiredBindings)assert(config.vpc_services?.some(value=>value.binding===binding&&/^[a-f0-9-]{36}$/.test(value.service_id)),`${name} is missing ${binding}`);
    assert.equal(config.routes,undefined);
    assert.equal(config.route,undefined);
    assert.equal(config.custom_domain,undefined);
    assert(!JSON.stringify(config).includes('REPLACE_WITH'));
  }

  const local=parseEnv(localEnv),production=parseEnv(productionEnv);
  for(const [name,value] of Object.entries(local)){
    if(!name.startsWith('S3_')||name==='S3_REGION')continue;
    assert(value.length>0||/^(?:S3_ENDPOINT|S3_BUCKET|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY)$/.test(name),`${name} is empty`);
  }
  for(const name of ['S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'])assert(production[name]?.length>0,`${name} is missing from production template`);
  assert.equal(production.S3_REGION,'auto');
  assert.match(production.S3_ENDPOINT,/^https:\/\/REPLACE_WITH_/);
  assert.equal(production.REDIS_URL,undefined);
  assert.match(production.UPSTASH_REDIS_REST_URL,/^https:\/\/REPLACE_WITH_/);
  assert.match(production.UPSTASH_REDIS_REST_TOKEN,/^REPLACE_WITH_/);
  assert.equal(document.redis.backend,'upstash-rest');
  assert.equal(document.redis.forbiddenVariable,'REDIS_URL');
  assert.equal(document.redis.authority,false);
  assert.equal(document.mcp.liveAccountProbe,'VERIFIED_2026-11-24_PRIVATE_ACCESS_AND_VPC');
  assert.deepEqual([...document.mcp.requiredAssetTargets].sort(),expectedAssets);
  assert.equal(document.mcp.server,'cloudflare');
  assert.equal(document.mcp.transport,'streamable_http');

  return {
    release:document.release,
    assets:expectedAssets,
    workers:Object.keys(expectedWorkers),
    redis:'upstash-rest fail-closed',
    mcpLiveAccountProbe:document.mcp.liveAccountProbe,
    deploymentAuthorized:document.deploymentAuthorized,
  };
}

export async function verifyCloudflareReadiness(root=process.cwd()){
  const document=JSON.parse(await readFile(path.join(root,'infra/cloudflare/readiness.json'),'utf8'));
  const workers=Object.fromEntries(await Promise.all(Object.values(expectedWorkers).map(async value=>[
    value.config,
    await readFile(path.join(root,value.config),'utf8'),
  ])));
  const byName=Object.fromEntries(Object.entries(workers).map(([config,source])=>[
    jsonc(source,config).name,
    source,
  ]));
  return validateCloudflareReadiness({
    document,
    workers:byName,
    localEnv:await readFile(path.join(root,'.env.example'),'utf8'),
    productionEnv:await readFile(path.join(root,'.env.production.example'),'utf8'),
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await verifyCloudflareReadiness()));}
  catch(error){console.error('Cloudflare readiness validation failed: '+error.message);process.exitCode=1;}
}
