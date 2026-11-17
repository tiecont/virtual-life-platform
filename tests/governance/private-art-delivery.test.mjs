import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash,createHmac} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {stage,verifyStage,validateManifest,verifyBytes,validateReview,MAX_FILE,MAX_TOTAL,sha256} from '../../scripts/media/private-art-manifest.mjs';
import {upload,validateTarget,signedRequest,sendRequest} from '../../scripts/media/private-art-s3.mjs';

const target={provider:'t3',endpoint:'https://t3.storage.dev',bucket:'owned-fixture',region:'auto'};
// Deliberately synthetic credentials, used only by the in-process loopback fixture.
const credentials={accessKeyId:'OWNEDFIXTUREKEY',secretAccessKey:'owned-local-fixture-secret-not-live'};
const now=Date.parse('2026-11-18T00:00:00.000Z');
function wav(){const b=Buffer.alloc(48);b.write('RIFF');b.writeUInt32LE(40,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4,40);return b;}
async function fixture(work){
 const root=await mkdtemp(path.join(tmpdir(),'aetheria-private-art-'));try{
 await mkdir(path.join(root,'artifacts/source'),{recursive:true});const bytes=wav();
 const file={path:'fixture.wav',bytes:bytes.length,sha256:sha256(bytes),mime:'audio/wav'},manifest={schemaVersion:1,characterId:'owned-fixture',designRevision:'fixture-v1',publication:'UNPUBLISHED',files:[file]};
 await writeFile(path.join(root,'artifacts/source/fixture.wav'),bytes);await writeFile(path.join(root,'artifacts/input.json'),JSON.stringify(manifest));
 const staging={root,source:'artifacts/source',manifestPath:'artifacts/input.json',output:'artifacts/stage'};
 const prepared=await stage(staging);
 const review={schemaVersion:1,manifestSha256:prepared.manifestSha256,artGate:'PASS',technicalGate:'PASS',rights:'PRIVATE_DELIVERY_APPROVED',reviewedBy:'owned-fixture-only',reviewedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+1000*60).toISOString(),target:{...target,publicAccess:'DISABLED'}};
 const reviewBytes=Buffer.from(JSON.stringify(review));await writeFile(path.join(root,'artifacts/review.json'),reviewBytes);
 const options={root,stagePath:'artifacts/stage',reviewPath:'artifacts/review.json',reviewSha256:sha256(reviewBytes),target,credentials:()=>credentials,now:()=>now};
 await work({root,bytes,file,manifest,staging,review,options});
 }finally{await rm(root,{recursive:true,force:true});}
}
function checkSignature(req,body){
 const match=/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/.exec(req.headers.authorization);assert.ok(match);assert.equal(match[1],credentials.accessKeyId);
 const [, ,date,region,names,signature]=match,scope=`${date}/${region}/s3/aws4_request`,hash=b=>createHash('sha256').update(b).digest('hex'),mac=(k,v)=>createHmac('sha256',k).update(v).digest();
 assert.equal(req.headers['x-amz-content-sha256'],hash(body));
 const canonical=[req.method,req.url,'',names.split(';').map(name=>`${name}:${req.headers[name]}\n`).join(''),names,hash(body)].join('\n');
 let key=Buffer.from('AWS4'+credentials.secretAccessKey);for(const part of [date,region,'s3','aws4_request'])key=mac(key,part);
 assert.equal(signature,mac(key,`AWS4-HMAC-SHA256\n${req.headers['x-amz-date']}\n${scope}\n${hash(canonical)}`).toString('hex'));
}
async function localS3(work,{corrupt=false,status=null,redirect=false,oversized=false,wrongMime=false}={}){
 const objects=new Map(),requests=[],errors=[];
 const server=http.createServer(async(req,res)=>{
 try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);checkSignature(req,body);requests.push({method:req.method,path:req.url,headers:req.headers});
 assert.ok(req.url.startsWith('/owned-fixture/private-art/v1/'));assert.equal(req.headers['x-amz-acl'],undefined);assert.ok(!req.url.includes('?'));
 if(status){res.writeHead(status,redirect?{location:'https://unowned.invalid/'}:{});res.end('untrusted provider error body');return;}
 if(req.method==='PUT'){
 assert.equal(req.headers['if-none-match'],'*');assert.equal(req.headers['cache-control'],'private, no-store');assert.equal(req.headers['x-amz-meta-sha256'],sha256(body));
 if(objects.has(req.url)){res.writeHead(412);res.end();return;}objects.set(req.url,{body,mime:req.headers['content-type']});res.writeHead(200);res.end();return;
 }
 assert.equal(req.method,'GET');const object=objects.get(req.url);assert.ok(object);res.writeHead(200,{'content-type':wrongMime?'text/html':object.mime,'cache-control':'private, no-store'});res.end(oversized?Buffer.concat([object.body,Buffer.from('overflow')]):corrupt?Buffer.alloc(object.body.length):object.body);
 }catch(e){errors.push(e);res.writeHead(500);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const transport=(request,limit)=>sendRequest(request,limit,(_url,options,cb)=>http.request(`http://127.0.0.1:${server.address().port}${request.url.pathname}`,options,cb));
 try{await work({transport,objects,requests});assert.deepEqual(errors,[]);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('private staging verifies bytes, preserves originals, uses restrictive modes and refuses reuse',()=>fixture(async({root,staging,bytes})=>{
 assert.equal((await verifyStage(root,'artifacts/stage')).manifest.files.length,1);
 assert.deepEqual(await readFile(path.join(root,'artifacts/source/fixture.wav')),bytes);
 assert.equal((await stat(path.join(root,'artifacts/stage'))).mode&0o777,0o700);
 assert.equal((await stat(path.join(root,'artifacts/stage/fixture.wav'))).mode&0o777,0o600);
 await assert.rejects(stage(staging),{code:'EEXIST'});
}));

test('strict manifest rejects traversal, URLs, hidden/ambiguous paths, MIME spoofing, duplicates and oversized batches',()=>fixture(async({manifest})=>{
 const mutations=[m=>m.schemaVersion=2,m=>m.publication='PUBLISHED',m=>m.credentials='no',m=>m.characterId=null,m=>m.files[0].bytes=MAX_FILE+1,m=>m.files[0].bytes=0,m=>m.files[0].sha256='invalid',m=>m.files[0].mime='text/html',m=>m.files[0].path='fixture.svg',m=>m.files.push({...m.files[0]})];
 for(const unsafe of ['../escape.wav','a/../escape.wav','/absolute.wav','https://invalid/file.wav','a\\b.wav','a//b.wav','a/%2e.wav','.secret.wav'])mutations.push(m=>m.files[0].path=unsafe);
 for(const mutate of mutations){const m=JSON.parse(JSON.stringify(manifest));mutate(m);assert.throws(()=>validateManifest(m));}
 const m=JSON.parse(JSON.stringify(manifest));m.files=Array.from({length:Math.ceil(MAX_TOTAL/MAX_FILE)},(_,i)=>({...m.files[0],path:`f${i}.wav`,bytes:MAX_FILE}));assert.throws(()=>validateManifest(m),/10 GB/);
}));

test('tampered bytes, spoofed content and source/stage symlinks fail closed',()=>fixture(async({root,file,staging,bytes})=>{
 const spoof=Buffer.from('<html>not audio</html>');assert.throws(()=>verifyBytes({...file,bytes:spoof.length,sha256:sha256(spoof)},spoof),/signature/);
 await writeFile(path.join(root,'artifacts/stage/fixture.wav'),Buffer.alloc(bytes.length));await assert.rejects(verifyStage(root,'artifacts/stage'),/hash/);
 await rm(path.join(root,'artifacts/source/fixture.wav'));await symlink(path.join(root,'artifacts/stage/fixture.wav'),path.join(root,'artifacts/source/fixture.wav'));
 await assert.rejects(stage({...staging,output:'artifacts/failed-stage'}),/Symlink/);await assert.rejects(readFile(path.join(root,'artifacts/failed-stage/manifest.json')),{code:'ENOENT'});
 await symlink(path.join(root,'artifacts/stage'),path.join(root,'artifacts/linked-stage'));await assert.rejects(verifyStage(root,'artifacts/linked-stage'),/Symlink/);
}));

test('draft/failed art, technical, rights, stale and mismatched reviews never invoke credentials or transport',()=>fixture(async({options,root,review})=>{
 for(const change of [r=>r.artGate='ART_REVISION_REQUIRED',r=>r.technicalGate='PENDING',r=>r.rights='UNREVIEWED',r=>r.manifestSha256='0'.repeat(64),r=>r.target.publicAccess='ENABLED',r=>r.target.bucket='different-bucket',r=>r.expiresAt=new Date(now).toISOString(),r=>r.reviewedAt=new Date(now+1).toISOString(),r=>r.expiresAt=new Date(now+8*86400_000).toISOString()]){
 const changed=JSON.parse(JSON.stringify(review));change(changed);const b=Buffer.from(JSON.stringify(changed));await writeFile(path.join(root,'artifacts/review.json'),b);
 await assert.rejects(upload({...options,reviewSha256:sha256(b),credentials:()=>assert.fail('credentials read'),transport:()=>assert.fail('network called')}));
 }
 await assert.rejects(upload({...options,reviewSha256:'0'.repeat(64),transport:()=>assert.fail('network called')}),/digest/);
}));

test('entire staged batch is verified before any network request',()=>fixture(async({options,root,manifest,review})=>{
 const broken={...manifest.files[0],path:'missing.wav'};manifest.files.push(broken);const b=Buffer.from(JSON.stringify(manifest));await writeFile(path.join(root,'artifacts/stage/manifest.json'),b);review.manifestSha256=sha256(b);const rb=Buffer.from(JSON.stringify(review));await writeFile(path.join(root,'artifacts/review.json'),rb);
 await assert.rejects(upload({...options,reviewSha256:sha256(rb),transport:()=>assert.fail('network called')}),{code:'ENOENT'});
}));

test('only exact HTTPS R2 and t3 endpoints pass; no local, MinIO, userinfo, query, custom port or lookalike',()=>{
 assert.equal(validateTarget(target),target);validateTarget({provider:'r2',endpoint:`https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,bucket:'owned-fixture',region:'auto'});
 for(const endpoint of ['http://t3.storage.dev','https://t3.storage.dev/','https://t3.storage.dev?x=1','https://user:secret@t3.storage.dev','https://t3.storage.dev:9443','https://t3.storage.dev.evil.invalid','http://127.0.0.1:9000','https://minio.local'])assert.throws(()=>validateTarget({...target,endpoint}));
 assert.throws(()=>validateTarget({...target,bucket:'a/b'}));assert.throws(()=>validateTarget({...target,provider:'minio'}));
});

test('owned HTTP fixture verifies SigV4, immutable private PUT/readback and safe idempotent retries',()=>fixture(async({options})=>localS3(async({transport,objects,requests})=>{
 const first=await upload({...options,transport});assert.equal(first.uploaded,1);assert.equal(first.reused,0);
 const second=await upload({...options,transport});assert.equal(second.uploaded,0);assert.equal(second.reused,1);assert.equal(objects.size,1);
 assert.deepEqual(requests.map(r=>r.method),['PUT','GET','PUT','GET']);assert.equal(requests[0].path,requests[2].path);
 assert.ok(requests[0].path.includes(first.manifestSha256));
})));

test('corrupt actual GET bytes fail despite correct declared content type',()=>fixture(async({options})=>localS3(async({transport})=>{
 await assert.rejects(upload({...options,transport}),/readback/);
},{corrupt:true})));

test('redirects, authorization denials and unsupported conditional PUT fail without following URLs or retrying',async()=>{
 for(const status of [301,307,403,409,501])await fixture(async({options})=>localS3(async({transport,requests})=>{
 await assert.rejects(upload({...options,transport}),/PUT rejected/);assert.equal(requests.length,1);
 },{status,redirect:true}));
});

test('expired gate is rechecked before every object',()=>fixture(async({options})=>{
 let clockCalls=0;await assert.rejects(upload({...options,now:()=>++clockCalls===1?now:now+86400_000,transport:()=>assert.fail('network called')}),/expired/);
}));

test('CLI failure prints neither input secrets nor raw error bodies',()=>fixture(async({root})=>{
 const cli=path.resolve('scripts/private-art-delivery.mjs'),sentinel='PRIVATE_SENTINEL_DO_NOT_PRINT';
 const result=spawnSync(process.execPath,[cli,'upload','--stage',`artifacts/${sentinel}`,'--review','artifacts/review.json','--review-sha256','0'.repeat(64)],{cwd:root,encoding:'utf8',env:{...process.env,ART_S3_ENDPOINT:`https://${sentinel}@t3.storage.dev`,ART_S3_SECRET_ACCESS_KEY:sentinel}});
 assert.equal(result.status,1);assert.ok(result.stderr.includes('Private art delivery refused'));assert.ok(!`${result.stdout}${result.stderr}`.includes(sentinel));
}));

test('signer supports session tokens, rejects non-object operations and binds condition and MIME into signature',()=>{
 const signed=signedRequest({target,key:`private-art/v1/fixture/v1/${'a'.repeat(64)}/${'b'.repeat(64)}.wav`,method:'PUT',body:wav(),credentials:{...credentials,sessionToken:'owned-fixture-token'},headers:{'if-none-match':'*','content-type':'audio/wav'},now:new Date(now)});
 assert.ok(signed.headers.authorization.includes('content-type;host;if-none-match;x-amz-content-sha256;x-amz-date;x-amz-security-token'));
 assert.throws(()=>signedRequest({target,key:'?list-type=2',method:'GET',credentials}));
 assert.throws(()=>validateReview({},'0'.repeat(64),target,now));
});


test('oversized readback is bounded and wrong MIME fails closed', {timeout:3000},async()=>{
 for(const behavior of [{oversized:true},{wrongMime:true}])await fixture(async({options})=>localS3(async({transport})=>{
  await assert.rejects(upload({...options,transport}),/transport failed|readback/);
 },behavior));
});


test('existing-key conflict never overwrites corrupted remote bytes',()=>fixture(async({options})=>localS3(async({transport,objects,requests})=>{
 await upload({...options,transport});const object=[...objects.values()][0];object.body=Buffer.alloc(object.body.length);
 await assert.rejects(upload({...options,transport}),/readback/);
 assert.deepEqual(object.body,Buffer.alloc(object.body.length));assert.deepEqual(requests.map(r=>r.method),['PUT','GET','PUT','GET']);
})));
