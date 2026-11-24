#!/usr/bin/env node
/**
 * Upload the Wave 1 concept assets to the Cloudflare R2 CDN.
 *
 * Usage:
 *   pnpm cdn:upload            # upload missing or size-changed files, then write the manifest
 *   pnpm cdn:upload:dry        # HEAD only; report what would be uploaded
 *   pnpm cdn:upload --force    # re-upload every file
 *
 * Configuration uses the existing S3_* values in .env (the same keys as assets:push):
 *   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 *   S3_BUCKET=...
 *   S3_ACCESS_KEY_ID=...
 *   S3_SECRET_ACCESS_KEY=...
 *   S3_REGION=auto                          # optional
 *
 * The public base and prefix are read from specs/pet-arena/mvp-wave1-cdn-assets.json.
 * Override them with --public-base / --prefix when the CDN domain or prefix changes.
 *
 * The manifest is written to specs/pet-arena/mvp-wave1-cdn-assets.json.
 * No secrets are written to disk or printed.
 */
import {createHash,createHmac} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=fileURLToPath(new URL('..',import.meta.url));
const manifestPath=path.join(repoRoot,'specs','pet-arena','mvp-wave1-cdn-assets.json');
const defaultWorkspace=path.resolve(repoRoot,'..','Aetheria-Workspace','mvp-wave1');
const concepts=['concepts-v2','concepts-v3','concepts-v4'];
const docs=[
  'art-bible-mvp-wave1.md',
  'art-bible-families-dragon-bird.md',
  'power-tiers-mvp-wave1.md',
];

function option(name,fallback){
  const inline=process.argv.find(argument=>argument.startsWith(`--${name}=`));
  if(inline)return inline.slice(name.length+3);
  const index=process.argv.indexOf(`--${name}`);
  if(index>=0){
    const value=process.argv[index+1];
    if(value&&!value.startsWith('--'))return value;
  }
  return fallback;
}

const dryRun=process.argv.includes('--dry-run');
const force=process.argv.includes('--force');
const oldManifest=await readOldManifest();
const workspace=path.resolve(option('workspace',process.env.AETHERIA_WORKSPACE||defaultWorkspace));
const prefix=(option('prefix',oldManifest?.prefix||'')).replace(/^\/+|\/+$/g,'');
const endpointValue=option('endpoint',process.env.S3_ENDPOINT||'');
const bucketValue=option('bucket',process.env.S3_BUCKET||'');
const regionValue=option('region',process.env.S3_REGION||'auto');
const accessKeyId=process.env.S3_ACCESS_KEY_ID||'';
const secretAccessKey=process.env.S3_SECRET_ACCESS_KEY||'';

const missing=[];
if(!endpointValue)missing.push('S3_ENDPOINT/--endpoint');
if(!bucketValue)missing.push('S3_BUCKET/--bucket');
if(!accessKeyId)missing.push('S3_ACCESS_KEY_ID');
if(!secretAccessKey)missing.push('S3_SECRET_ACCESS_KEY');
if(missing.length>0){
  console.error(`Missing S3 configuration: ${missing.join(', ')}`);
  console.error('Set them in .env or export them before running pnpm cdn:upload.');
  process.exit(2);
}

function assert(condition,message){
  if(!condition)throw new Error(message);
}

function safePrefix(value){
  if(value==='')return '';
  const parts=value.split('/');
  assert(parts.length>0&&parts.every(part=>/^[A-Za-z0-9._-]+$/.test(part)),'The CDN prefix must contain only safe path segments');
  assert(!parts.some(part=>part==='.'||part==='..'),'The CDN prefix must not contain . or ..');
  return parts.join('/');
}

function validateEndpoint(value){
  const url=new URL(value);
  assert(url.protocol==='https:'&&url.origin===value&&!url.username&&!url.password&&!url.search&&!url.hash,'S3_ENDPOINT must be an HTTPS origin');
  return url.origin;
}

function validatePublicBase(value){
  if(!value)return '';
  const url=new URL(value);
  assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,'The public CDN base must be an HTTPS URL without credentials or query');
  return value.replace(/\/+$/,'');
}

const target={
  endpoint:validateEndpoint(endpointValue),
  bucket:bucketValue,
  region:regionValue.trim()||'auto',
  credentials:{accessKeyId,secretAccessKey},
};
assert(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(target.bucket),'S3_BUCKET is invalid');
assert(/^[a-z0-9-]{1,64}$/.test(target.region),'S3_REGION is invalid');
assert(/^[A-Za-z0-9_-]{3,128}$/.test(target.credentials.accessKeyId),'S3_ACCESS_KEY_ID is invalid');
assert(target.credentials.secretAccessKey.length>=16&&target.credentials.secretAccessKey.length<=256&&/^[\x21-\x7e]+$/.test(target.credentials.secretAccessKey),'S3_SECRET_ACCESS_KEY is invalid');

const explicitPublicBase=option('public-base',null);
const targetChanged=Boolean(oldManifest&&((oldManifest.endpoint&&oldManifest.endpoint!==target.endpoint)||(oldManifest.bucket&&oldManifest.bucket!==target.bucket)));
const publicBase=validatePublicBase(explicitPublicBase??(targetChanged?'':oldManifest?.publicBase||''));
if(targetChanged&&explicitPublicBase===null){
  console.warn('CDN target changed from the manifest; public URLs are cleared until --public-base is provided.');
}

safePrefix(prefix);

const sha256=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const encodeSegment=value=>encodeURIComponent(value).replace(/[!'()*]/g,character=>`%${character.charCodeAt(0).toString(16).toUpperCase()}`);
function keyFor(...parts){return [prefix,...parts].filter(Boolean).join('/');}
function cdnUrlFor(key){if(!publicBase)return null;const relative=prefix?key.slice(prefix.length+1):key;return `${publicBase}/${relative}`;}

function sign(method,key,{body=Buffer.alloc(0),headers={}}={}){
  const pathname=`/${encodeSegment(target.bucket)}/${key.split('/').map(encodeSegment).join('/')}`;
  const url=new URL(`${target.endpoint}${pathname}`);
  const stamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
  const date=stamp.slice(0,8);
  const payloadHash=sha256(body);
  const input={
    ...headers,
    host:url.host,
    'x-amz-content-sha256':payloadHash,
    'x-amz-date':stamp,
  };
  const entries=Object.entries(input)
    .map(([name,value])=>[name.toLowerCase(),String(value).trim().replace(/\s+/g,' ')])
    .sort(([left],[right])=>left.localeCompare(right));
  const canonicalHeaders=entries.map(([name,value])=>`${name}:${value}\n`).join('');
  const signedHeaders=entries.map(([name])=>name).join(';');
  const canonicalRequest=[method,pathname,'',canonicalHeaders,signedHeaders,payloadHash].join('\n');
  const scope=`${date}/${target.region}/s3/aws4_request`;
  const signingKey=hmac(hmac(hmac(hmac(`AWS4${target.credentials.secretAccessKey}`,date),target.region),'s3'),'aws4_request');
  const signature=hmac(signingKey,`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha256(canonicalRequest)}`).toString('hex');
  return {
    url,
    method,
    body,
    headers:{
      ...Object.fromEntries(entries),
      authorization:`AWS4-HMAC-SHA256 Credential=${target.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

const agent=new https.Agent({keepAlive:true,maxSockets:4});

function send(request){
  return new Promise((resolve,reject)=>{
    const client=https.request(request.url,{method:request.method,headers:request.headers,agent,timeout:120_000},response=>{
      const chunks=[];
      let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>1_048_576){response.destroy(new Error('S3 response is too large'));return;}
        chunks.push(chunk);
      });
      response.on('error',reject);
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks,bytes)}));
    });
    client.on('timeout',()=>client.destroy(new Error('S3 request timed out')));
    client.on('error',reject);
    client.end(request.body);
  });
}

async function head(key){
  const response=await send(sign('HEAD',key));
  if(response.status===200)return {exists:true,bytes:Number(response.headers['content-length']||0),etag:response.headers.etag||null};
  if(response.status===404)return {exists:false,bytes:0,etag:null};
  throw new Error(`HEAD ${key} failed with HTTP ${response.status}`);
}

async function put(key,body,contentType,cacheControl){
  const response=await send(sign('PUT',key,{
    body,
    headers:{'content-type':contentType,'cache-control':cacheControl},
  }));
  if(response.status!==200&&response.status!==201)throw new Error(`PUT ${key} failed with HTTP ${response.status}`);
  return {etag:response.headers.etag||null};
}

function add(plan,absolutePath,key,contentType,cacheControl){
  assert(existsSync(absolutePath),`Missing asset: ${absolutePath}`);
  assert(!plan.some(entry=>entry.key===key),`Duplicate CDN key: ${key}`);
  plan.push({absolutePath,key,contentType,cacheControl});
}

async function buildPlan(){
  assert(existsSync(workspace),`Workspace not found: ${workspace}`);
  const plan=[];
  for(const directory of concepts){
    const root=path.join(workspace,directory);
    assert(existsSync(root),`Missing concept directory: ${root}`);
    const names=await readdir(root);
    for(const name of names.sort()){
      if(name.endsWith('.png'))add(plan,path.join(root,name),keyFor(directory,name),'image/png','public, max-age=604800');
    }
    for(const name of names.sort()){
      if(name.startsWith('contact-')&&name.endsWith('.jpg'))add(plan,path.join(root,name),keyFor('review/contact',directory,name),'image/jpeg','public, max-age=604800');
    }
    for(const name of ['prompts.json','ledger.json']){
      if(existsSync(path.join(root,name)))add(plan,path.join(root,name),keyFor('ledgers',directory,name),'application/json','public, max-age=300');
    }
  }
  add(plan,path.join(workspace,'icarus','icarus-s-limited.png'),keyFor('icarus','icarus-s-limited.png'),'image/png','public, max-age=604800');
  add(plan,path.join(workspace,'review-all.html'),keyFor('review-all.html'),'text/html; charset=utf-8','public, max-age=300');
  add(plan,path.join(workspace,'concepts-v2','review.html'),keyFor('concepts-v2','review.html'),'text/html; charset=utf-8','public, max-age=300');
  add(plan,path.join(workspace,'concepts-v3','review.html'),keyFor('concepts-v3','review.html'),'text/html; charset=utf-8','public, max-age=300');
  for(const name of docs)add(plan,path.join(repoRoot,'specs','pet-arena',name),keyFor('docs',name),'text/markdown; charset=utf-8','public, max-age=300');
  return plan;
}

function countsFor(files){
  return {
    total:files.length,
    images:files.filter(file=>file.contentType==='image/png').length,
    reviewHtml:files.filter(file=>file.contentType.startsWith('text/html')).length,
    ledgers:files.filter(file=>file.contentType==='application/json').length,
    contactSheets:files.filter(file=>file.contentType==='image/jpeg').length,
    docs:files.filter(file=>file.contentType.startsWith('text/markdown')).length,
  };
}

async function readOldManifest(){
  if(!existsSync(manifestPath))return null;
  try{
    return JSON.parse(await readFile(manifestPath,'utf8'));
  }catch{
    return null;
  }
}

async function main(){
  const plan=await buildPlan();
  const oldFiles=new Map((oldManifest?.files||[]).map(file=>[file.key,file]));
  const files=[];
  const uploaded=[];
  const failures=[];
  let existing=0;
  const now=new Date().toISOString();

  for(const entry of plan){
    const body=await readFile(entry.absolutePath);
    const hash=sha256(body);
    try{
      const remote=await head(entry.key);
      const unchanged=remote.exists&&!force&&remote.bytes===body.length;
      if(unchanged){
        existing+=1;
        const previous=oldFiles.get(entry.key);
        files.push({
          key:entry.key,
          cdnUrl:cdnUrlFor(entry.key),
          bytes:body.length,
          sha256:hash,
          contentType:entry.contentType,
          status:'existing',
          etag:remote.etag,
          uploadedAtUtc:previous?.uploadedAtUtc||null,
        });
        continue;
      }
      if(dryRun){
        uploaded.push(entry.key);
        files.push({key:entry.key,cdnUrl:cdnUrlFor(entry.key),bytes:body.length,sha256:hash,contentType:entry.contentType,status:remote.exists?'size-mismatch':'missing',etag:remote.etag,uploadedAtUtc:oldFiles.get(entry.key)?.uploadedAtUtc||null});
        continue;
      }
      const result=await put(entry.key,body,entry.contentType,entry.cacheControl);
      uploaded.push(entry.key);
      files.push({key:entry.key,cdnUrl:cdnUrlFor(entry.key),bytes:body.length,sha256:hash,contentType:entry.contentType,status:force?'forced':remote.exists?'size-mismatch':'uploaded',etag:result.etag,uploadedAtUtc:now});
    }catch(error){
      failures.push({key:entry.key,message:error.message});
    }
  }

  const summary=`${dryRun?'CDN dry-run':'CDN upload'}: ${uploaded.length} ${dryRun?'missing':'uploaded'}, ${existing} existing, ${failures.length} failed`;
  console.log(summary);
  for(const key of uploaded)console.log(`  + ${key}`);
  for(const failure of failures)console.error(`  ! ${failure.key}: ${failure.message}`);

  if(dryRun){
    if(failures.length>0)process.exitCode=1;
    return;
  }

  if(failures.length>0){
    console.error('Manifest not written because one or more CDN requests failed. Re-run the command after fixing the errors.');
    process.exitCode=1;
    return;
  }

  const manifest={
    schemaVersion:1,
    provider:'Cloudflare R2',
    bucket:target.bucket,
    endpoint:target.endpoint,
    publicBase,
    prefix,
    manifestCdnUrl:publicBase?`${publicBase}/ledgers/mvp-wave1-cdn-assets.json`:null,
    uploadedAtUtc:now,
    access:oldManifest?.access||{mode:'r2.dev public development URL',warning:'Rate-limited and not recommended for production. Connect a custom domain to the bucket for production workloads.',cors:'none set'},
    counts:countsFor(files),
    totalBytes:files.reduce((sum,file)=>sum+file.bytes,0),
    reviewSheets:publicBase?{unified:`${publicBase}/review-all.html`,v2:`${publicBase}/concepts-v2/review.html`,v3:`${publicBase}/concepts-v3/review.html`}:null,
    unityBuild:oldManifest?.unityBuild||{status:'NOT_UPLOADED',reason:'No production-ready player build exists; ProjectBuild.Linux builds a Development player only.'},
    files:files.sort((left,right)=>left.key.localeCompare(right.key)),
  };
  await mkdir(path.dirname(manifestPath),{recursive:true});
  const temporary=`${manifestPath}.tmp`;
  await writeFile(temporary,`${JSON.stringify(manifest,null,2)}\n`);
  await rename(temporary,manifestPath);
  console.log(`Manifest: ${path.relative(repoRoot,manifestPath)}`);
  if(failures.length>0)process.exitCode=1;
}

main().catch(error=>{
  console.error(`CDN upload failed: ${error.message}`);
  process.exitCode=1;
});
