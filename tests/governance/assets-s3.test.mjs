import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import {createHash,createHmac} from 'node:crypto';
import {MAX_ASSET_BYTES,sha256,validateManifest} from '../../scripts/media/assets-manifest.mjs';
import {pullAssets,pushAssets} from '../../scripts/media/assets-command.mjs';
import {sendAssetRequest} from '../../scripts/media/assets-s3.mjs';

const assetBytes=Buffer.from('glTF-test-asset');
const baseManifest=Object.freeze({
  id:'icarus-wing',
  version:'1.2.3',
  stage:'review',
  s3Key:'assets/icarus-wing/1.2.3/wing.glb',
  sha256:sha256(assetBytes),
  sizeBytes:assetBytes.length,
  contentType:'model/gltf-binary',
  localCachePath:'.cache/assets/icarus-wing/1.2.3/wing.glb',
});
const liveEnv=Object.freeze({
  S3_ENDPOINT:'https://t3.storage.dev',
  S3_BUCKET:'owned-private-fixture',
  AWS_REGION:'auto',
  AWS_ACCESS_KEY_ID:'tid_OWNED_fixture-01',
  AWS_SECRET_ACCESS_KEY:'owned-local-synthetic-secret',
});

async function fixture(work){
  const root=await mkdtemp(path.join(tmpdir(),'aetheria-assets-s3-'));
  try{
    await mkdir(path.join(root,'assets/manifests'),{recursive:true});
    await mkdir(path.join(root,path.posix.dirname(baseManifest.localCachePath)),{recursive:true});
    await writeFile(path.join(root,baseManifest.localCachePath),assetBytes);
    await writeFile(path.join(root,`assets/manifests/${baseManifest.id}.manifest.json`),JSON.stringify(baseManifest));
    await work(root);
  }finally{await rm(root,{recursive:true,force:true});}
}

test('manifest schema is strict and enforces immutable key/cache relationships',()=>{
  assert.equal(validateManifest({...baseManifest},{fileName:'icarus-wing.manifest.json'}).id,'icarus-wing');
  const rejected=[
    value=>value.extra=true,
    value=>value.id='OTHER',
    value=>value.version='v1',
    value=>value.stage='published',
    value=>value.sha256=value.sha256.toUpperCase(),
    value=>value.sizeBytes=0,
    value=>value.sizeBytes=MAX_ASSET_BYTES+1,
    value=>value.contentType='text/html',
    value=>value.s3Key='other/icarus-wing/1.2.3/wing.glb',
    value=>value.s3Key='assets/icarus-wing/1.2.3/../wing.glb',
    value=>value.s3Key='assets/icarus-wing/1.2.3/wing.png',
    value=>value.localCachePath='assets/wing.glb',
    value=>value.localCachePath='.cache/assets/icarus-wing/1.2.3/other.glb',
  ];
  for(const mutate of rejected){
    const manifest={...baseManifest};
    mutate(manifest);
    assert.throws(()=>validateManifest(manifest),undefined,`accepted ${JSON.stringify(manifest)}`);
  }
  assert.throws(()=>validateManifest({...baseManifest},{fileName:'wrong.manifest.json'}),/filename/);
});

test('checked-in JSON schema describes the runtime fields and no secret-bearing extensions',async()=>{
  const schema=JSON.parse(await readFile('assets/manifests/asset-manifest.schema.json','utf8'));
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schema.required.sort(),Object.keys(baseManifest).sort());
  assert.deepEqual(schema.properties.stage.enum,['reference','blockout','candidate','review','delivery']);
  assert.equal(schema.properties.sizeBytes.maximum,MAX_ASSET_BYTES);
  assert.equal(schema.properties.sha256.pattern,'^[a-f0-9]{64}$');
});

test('.env.example advertises only empty S3/Tigris placeholders',async()=>{
  const env=await readFile('.env.example','utf8');
  for(const name of ['S3_ENDPOINT','S3_BUCKET','AWS_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY']){
    assert.match(env,new RegExp(`^${name}=$`,'m'));
  }
  assert.doesNotMatch(env,/AKIA[0-9A-Z]{16}|tid_[A-Za-z0-9_-]{16,}/);
});

test('push and pull dry runs need no credentials and make no transport calls',async()=>fixture(async root=>{
  let transportCalls=0;
  const transport=()=>{transportCalls++;throw Error('network must not run');};
  const pushed=await pushAssets({root,args:['--dry-run'],env:{},transport});
  assert.deepEqual(pushed,{command:'push',mode:'dry-run',network:false,manifests:1,verified:1,bytes:assetBytes.length});
  await rm(path.join(root,baseManifest.localCachePath));
  const pulled=await pullAssets({root,args:['--offline'],env:{},transport});
  assert.deepEqual(pulled,{command:'pull',mode:'dry-run',network:false,manifests:1,cached:0,pending:1});
  assert.equal(transportCalls,0);
}));

test('empty dry runs pass in a checkout without private binaries or credentials',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'aetheria-empty-assets-'));
  try{
    const pull=spawnSync(process.execPath,[path.resolve('scripts/media/assets-pull.mjs'),'--dry-run'],{cwd:root,encoding:'utf8',env:{}});
    assert.equal(pull.status,0,pull.stderr);
    assert.deepEqual(JSON.parse(pull.stdout),{command:'pull',mode:'dry-run',network:false,manifests:0,cached:0,pending:0});
    const push=spawnSync(process.execPath,[path.resolve('scripts/media/assets-push.mjs'),'--offline'],{cwd:root,encoding:'utf8',env:{}});
    assert.equal(push.status,0,push.stderr);
    assert.deepEqual(JSON.parse(push.stdout),{command:'push',mode:'dry-run',network:false,manifests:0,verified:0,bytes:0});
  }finally{await rm(root,{recursive:true,force:true});}
});

test('live push fails before network when .env credentials are absent',()=>fixture(async root=>{
  let transportCalls=0;
  await assert.rejects(pushAssets({root,args:[],env:{},transport:()=>{transportCalls++;throw Error('network must not run');}}),/S3_ENDPOINT/);
  assert.equal(transportCalls,0);
}));

test('push dry run rejects changed bytes with the declared size or hash',()=>fixture(async root=>{
  const changed=Buffer.from(assetBytes);
  changed[0]^=1;
  await writeFile(path.join(root,baseManifest.localCachePath),changed);
  await assert.rejects(pushAssets({root,args:['--dry-run'],env:{},transport:()=>assert.fail('network called')}),/SHA-256/);
  await writeFile(path.join(root,baseManifest.localCachePath),Buffer.concat([assetBytes,Buffer.from('!')]));
  await assert.rejects(pushAssets({root,args:['--dry-run'],env:{},transport:()=>assert.fail('network called')}),/size/);
}));

test('live push conditionally uploads and verifies actual private readback',()=>fixture(async root=>{
  const requests=[];
  const transport=async(request,maxBytes)=>{
    requests.push({method:request.method,headers:request.headers,url:request.url.toString(),maxBytes});
    if(request.method==='PUT')return {status:204,headers:{},bytes:0,body:Buffer.alloc(0)};
    return {status:200,headers:{'content-type':baseManifest.contentType},bytes:assetBytes.length,body:assetBytes};
  };
  const result=await pushAssets({root,env:liveEnv,transport,now:new Date('2026-11-23T00:00:00.000Z')});
  assert.deepEqual(result,{command:'push',mode:'live',network:true,manifests:1,uploaded:1,reused:0,verified:1});
  assert.deepEqual(requests.map(request=>request.method),['PUT','GET']);
  assert.equal(requests[0].headers['if-none-match'],'*');
  assert.equal(requests[0].headers['cache-control'],'private, no-store');
  assert.equal(requests[0].headers['x-amz-meta-sha256'],baseManifest.sha256);
  assert.ok(requests[0].url.includes('/owned-private-fixture/assets/icarus-wing/1.2.3/wing.glb'));
}));

test('live pull verifies remote content before atomically installing it',()=>fixture(async root=>{
  await rm(path.join(root,baseManifest.localCachePath));
  const transport=async()=>({status:200,headers:{'content-type':baseManifest.contentType},bytes:assetBytes.length,body:assetBytes});
  const result=await pullAssets({root,env:liveEnv,transport});
  assert.deepEqual(result,{command:'pull',mode:'live',network:true,manifests:1,downloaded:1,reused:0});
  assert.deepEqual(await readFile(path.join(root,baseManifest.localCachePath)),assetBytes);
  assert.equal((await stat(path.join(root,baseManifest.localCachePath))).mode&0o777,0o600);
}));

test('owned loopback S3 fixture verifies signed PUT/GET and push-pull round trip',()=>fixture(async root=>{
  const objects=new Map(),requests=[];
  function verifySignature(request,body){
    const match=/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/.exec(request.headers.authorization);
    assert.ok(match);
    const [,accessKey,date,region,names,signature]=match;
    assert.equal(accessKey,liveEnv.AWS_ACCESS_KEY_ID);
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
    const canonical=[request.method,request.url,'',names.split(';').map(name=>`${name}:${request.headers[name]}\n`).join(''),names,hash(body)].join('\n');
    const scope=`${date}/${region}/s3/aws4_request`;
    let key=Buffer.from(`AWS4${liveEnv.AWS_SECRET_ACCESS_KEY}`);
    for(const value of [date,region,'s3','aws4_request'])key=hmac(key,value);
    assert.equal(signature,hmac(key,`AWS4-HMAC-SHA256\n${request.headers['x-amz-date']}\n${scope}\n${hash(canonical)}`).toString('hex'));
  }
  const server=http.createServer(async(request,response)=>{
    const chunks=[];
    for await(const chunk of request)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    try{
      verifySignature(request,body);
      requests.push({method:request.method,path:request.url,headers:request.headers});
      assert.equal(request.url,'/owned-private-fixture/assets/icarus-wing/1.2.3/wing.glb');
      if(request.method==='PUT'){
        objects.set(request.url,{body,contentType:request.headers['content-type']});
        response.writeHead(200);
        response.end();
        return;
      }
      const object=objects.get(request.url);
      assert.ok(object);
      response.writeHead(200,{'content-type':object.contentType});
      response.end(object.body);
    }catch(error){
      response.writeHead(500);
      response.end(error.message);
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const factory=(url,options,callback)=>http.request(`http://127.0.0.1:${server.address().port}${url.pathname}`,options,callback);
  const transport=(request,maxBytes)=>sendAssetRequest(request,maxBytes,factory);
  try{
    assert.equal((await pushAssets({root,env:liveEnv,transport})).uploaded,1);
    await rm(path.join(root,baseManifest.localCachePath));
    assert.equal((await pullAssets({root,env:liveEnv,transport})).downloaded,1);
    assert.deepEqual(await readFile(path.join(root,baseManifest.localCachePath)),assetBytes);
    assert.deepEqual(requests.map(request=>request.method),['PUT','GET','GET']);
  }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('live pull rejects corrupt or MIME-mismatched bytes without installing a cache file',async()=>fixture(async root=>{
  await rm(path.join(root,baseManifest.localCachePath));
  const corrupt=Buffer.from(assetBytes);
  corrupt[0]^=1;
  for(const response of [
    {status:200,headers:{'content-type':baseManifest.contentType},bytes:corrupt.length,body:corrupt},
    {status:200,headers:{'content-type':'text/html'},bytes:assetBytes.length,body:assetBytes},
  ]){
    await assert.rejects(pullAssets({root,env:liveEnv,transport:async()=>response}));
    await assert.rejects(readFile(path.join(root,baseManifest.localCachePath)),{code:'ENOENT'});
  }
}));

test('CLI failures do not print credential or endpoint secrets',()=>fixture(async root=>{
  const sentinel='PRIVATE_SENTINEL_DO_NOT_PRINT';
  const result=spawnSync(process.execPath,[path.resolve('scripts/media/assets-push.mjs')],{cwd:root,encoding:'utf8',env:{
    S3_ENDPOINT:`https://${sentinel}@t3.storage.dev`,
    S3_BUCKET:'owned-private-fixture',
    AWS_REGION:'auto',
    AWS_ACCESS_KEY_ID:sentinel,
    AWS_SECRET_ACCESS_KEY:sentinel,
  }});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Asset push refused/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(sentinel));
}));
