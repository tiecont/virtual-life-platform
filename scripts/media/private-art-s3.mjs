import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import https from 'node:https';
import {MAX_FILE,MAX_JSON,exact,sha256,readBounded,verifyBytes,verifyStage,validateReview,objectKey} from './private-art-manifest.mjs';

export function validateTarget(target){
 exact(target,['provider','endpoint','bucket','region']);const url=new URL(target.endpoint);
 assert(url.protocol==='https:'&&url.origin===target.endpoint&&!url.username&&!url.password&&!url.port,'HTTPS origin required');
 assert(target.provider==='r2'&&/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(url.hostname)&&target.region==='auto'||target.provider==='t3'&&url.hostname==='t3.storage.dev'&&/^[a-z0-9-]{1,32}$/.test(target.region),'Unsupported provider endpoint/region');
 assert(typeof target.bucket==='string'&&/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(target.bucket),'Invalid bucket');return target;
}
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
export function signedRequest({target,key,method,body,credentials,now=new Date(),headers={}}){
 validateTarget(target);assert(['PUT','GET'].includes(method)&&/^private-art\/v1\/[a-z0-9/-]+\.[a-z0-9]+$/.test(key),'Unsupported object operation');
 // T3 issues tid_ identifiers. Keep the alphabet safe for the SigV4 credential
 // component: never accept slashes, commas, whitespace or header controls.
 const accessKeyPattern=target.provider==='t3'?/^[A-Za-z0-9_-]{3,128}$/:/^[A-Za-z0-9]{3,128}$/;
 assert(typeof credentials.accessKeyId==='string'&&accessKeyPattern.test(credentials.accessKeyId)&&typeof credentials.secretAccessKey==='string'&&credentials.secretAccessKey.length>=16&&credentials.secretAccessKey.length<=256,'Missing/invalid credentials');
 assert(!credentials.sessionToken||typeof credentials.sessionToken==='string'&&/^[\x21-\x7e]{1,4096}$/.test(credentials.sessionToken),'Invalid session token');
 const url=new URL(`${target.endpoint}/${target.bucket}/${key}`),stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=stamp.slice(0,8),payloadHash=sha256(body??Buffer.alloc(0));
 const signed={...headers,host:url.host,'x-amz-date':stamp,'x-amz-content-sha256':payloadHash};if(credentials.sessionToken)signed['x-amz-security-token']=credentials.sessionToken;
 const names=Object.keys(signed).sort(),canonical=names.map(k=>`${k}:${String(signed[k]).trim().replace(/\s+/g,' ')}\n`).join(''),list=names.join(';');
 const request=[method,url.pathname,'',canonical,list,payloadHash].join('\n'),scope=`${date}/${target.region}/s3/aws4_request`;
 const signingKey=hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`,date),target.region),'s3'),'aws4_request');
 signed.authorization=`AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${list}, Signature=${hmac(signingKey,`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha256(request)}`).toString('hex')}`;
 return {url,method,headers:signed,body};
}
// No redirects, proxy environment, retries, ACLs, listing, deletes or bucket writes.
// Errors and provider response bodies are never returned to the CLI/logs.
export function sendRequest(request,maxBytes,requestFactory=https.request){
 return new Promise((resolve,reject)=>{
  let timer;const fail=()=>{clearTimeout(timer);reject(Error('Private object transport failed'));};
  const req=requestFactory(request.url,{method:request.method,headers:request.headers},res=>{
   const digest=createHash('sha256');let bytes=0;
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){res.destroy(Error('Response bounds rejected'));return;}digest.update(chunk);});
   res.on('error',fail);res.on('end',()=>{clearTimeout(timer);resolve({status:res.statusCode,headers:res.headers,bytes,sha256:digest.digest('hex')});});
  });
  timer=setTimeout(()=>req.destroy(Error('Request timeout')),60_000);req.on('error',fail);req.on('close',()=>clearTimeout(timer));req.end(request.body);
 });
}
export async function upload({root,stagePath,reviewPath,reviewSha256,target,credentials,transport=sendRequest,now=Date.now}){
 validateTarget(target);
 assert(typeof reviewSha256==='string'&&/^[a-f0-9]{64}$/.test(reviewSha256),'Independently pinned review digest required');
 const reviewBytes=await readBounded(root,reviewPath,MAX_JSON);assert(sha256(reviewBytes)===reviewSha256,'Review digest mismatch');const review=JSON.parse(reviewBytes);
 const loaded=await verifyStage(root,stagePath);validateReview(review,loaded.digest,target,now());
 // Validate credentials before sending anything, but only after all content and
 // art gates. The credential supplier is lazy so staging needs no secrets.
 const auth=credentials();let uploaded=0,reused=0;
 for(const file of loaded.manifest.files){
  validateReview(review,loaded.digest,target,now());
  const body=verifyBytes(file,await readBounded(root,`${stagePath}/${file.path}`,MAX_FILE)),key=objectKey(loaded.manifest,loaded.digest,file);
  const put=signedRequest({target,key,method:'PUT',body,credentials:auth,headers:{'content-type':file.mime,'content-length':String(file.bytes),'cache-control':'private, no-store','if-none-match':'*','x-amz-meta-sha256':file.sha256}});
  const response=await transport(put,65536);
  assert([200,201,204,412].includes(response.status),'Immutable PUT rejected');
  // A 412 is only an idempotent success if actual existing bytes match. ETags
 // and provider metadata alone are not evidence of content integrity.
  const readback=await transport(signedRequest({target,key,method:'GET',credentials:auth}),file.bytes);
  assert(readback.status===200&&readback.bytes===file.bytes&&readback.sha256===file.sha256&&readback.headers['content-type']===file.mime&&readback.headers['cache-control']==='private, no-store','Object readback rejected');
  if(response.status===412)reused++;else uploaded++;
 }
 return {manifestSha256:loaded.digest,uploaded,reused,verifiedFiles:loaded.manifest.files.length,publication:'UNPUBLISHED'};
}
