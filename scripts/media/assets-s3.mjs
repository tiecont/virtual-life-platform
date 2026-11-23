import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import https from 'node:https';

function requiredEnvironment(env,name){
  assert(typeof env[name]==='string'&&env[name].length>0,`${name} is required in .env`);
  return env[name];
}

function validateEndpoint(value){
  const url=new URL(value);
  assert(url.protocol==='https:'&&url.origin===value&&!url.username&&!url.password&&!url.search&&!url.hash,'S3_ENDPOINT must be an HTTPS origin');
  return url.origin;
}

export function assetTargetFromEnvironment(env){
  const endpoint=validateEndpoint(requiredEnvironment(env,'S3_ENDPOINT'));
  const bucket=requiredEnvironment(env,'S3_BUCKET');
  const region=env.S3_REGION?.trim()||'auto';
  const accessKeyId=requiredEnvironment(env,'S3_ACCESS_KEY_ID');
  const secretAccessKey=requiredEnvironment(env,'S3_SECRET_ACCESS_KEY');
  assert(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket),'S3_BUCKET is invalid');
  assert(/^[a-z0-9-]{1,64}$/.test(region),'S3_REGION is invalid');
  assert(/^[A-Za-z0-9_-]{3,128}$/.test(accessKeyId),'S3_ACCESS_KEY_ID is invalid');
  assert(secretAccessKey.length>=16&&secretAccessKey.length<=256&&/^[\x21-\x7e]+$/.test(secretAccessKey),'S3_SECRET_ACCESS_KEY is invalid');
  return {endpoint,bucket,region,credentials:{accessKeyId,secretAccessKey}};
}

function encodePath(value){
  return value.split('/').map(segment=>encodeURIComponent(segment)).join('/');
}

const digest=(key,value)=>createHmac('sha256',key).update(value).digest();

export function signedAssetRequest({target,key,method,body,now=new Date(),headers={}}){
  assert(['GET','PUT'].includes(method),'Unsupported asset operation');
  assert(typeof key==='string'&&/^assets\/[A-Za-z0-9._/-]+$/.test(key)&&!key.split('/').some(part=>!part||part==='.'||part==='..'),'Unsafe S3 key');
  const url=new URL(`${target.endpoint}/${encodePath(target.bucket)}/${encodePath(key)}`);
  const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=stamp.slice(0,8),payloadHash=createHash('sha256').update(body??Buffer.alloc(0)).digest('hex');
  const signed={...headers,host:url.host,'x-amz-date':stamp,'x-amz-content-sha256':payloadHash};
  const names=Object.keys(signed).sort();
  const canonical=names.map(name=>`${name}:${String(signed[name]).trim().replace(/\s+/g,' ')}\n`).join('');
  const signedHeaders=names.join(';'),canonicalRequest=[method,url.pathname,'',canonical,signedHeaders,payloadHash].join('\n');
  const scope=`${date}/${target.region}/s3/aws4_request`;
  const signingKey=digest(digest(digest(digest(`AWS4${target.credentials.secretAccessKey}`,date),target.region),'s3'),'aws4_request');
  signed.authorization=`AWS4-HMAC-SHA256 Credential=${target.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${digest(signingKey,`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`).toString('hex')}`;
  return {url,method,headers:signed,body};
}

export function sendAssetRequest(request,maxBytes,requestFactory=https.request){
  return new Promise((resolve,reject)=>{
    let timer;
    const fail=()=>{clearTimeout(timer);reject(Error('S3 asset transport failed'));};
    const req=requestFactory(request.url,{method:request.method,headers:request.headers},response=>{
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>maxBytes){response.destroy(Error('S3 response is too large'));return;}
        chunks.push(chunk);
      });
      response.on('error',fail);
      response.on('end',()=>{clearTimeout(timer);resolve({status:response.statusCode,headers:response.headers,bytes,body:Buffer.concat(chunks,bytes)});});
    });
    timer=setTimeout(()=>req.destroy(Error('S3 request timed out')),60_000);
    req.on('error',fail);
    req.on('close',()=>clearTimeout(timer));
    req.end(request.body);
  });
}
