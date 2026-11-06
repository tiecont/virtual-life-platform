// Executed only as gh/docker stand-ins in an isolated test PATH. No credential,
// registry, GitHub request, branch or PR exists outside the fixture state file.
export const promotionApiFixture = String.raw`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const file=process.env.PROMOTION_FIXTURE_STATE,state=JSON.parse(fs.readFileSync(file,'utf8')),args=process.argv.slice(2),tool=path.basename(process.argv[1]);
const role=process.env.GH_TOKEN==='synthetic-read'?'read':process.env.GH_TOKEN==='synthetic-write'?'write':'unknown';
function save(){fs.writeFileSync(file,JSON.stringify(state));}
function respond(value,code=0){save();if(value!==undefined)process.stdout.write(JSON.stringify(value));process.exit(code);}
function fail(status=403){respond({status:String(status),message:'Synthetic fixture rejection'},1);}
try{
 if(tool==='docker'){
  assert.equal(role,'read');state.calls.push({tool,role,args});
  const image=args.find(a=>a.startsWith('ghcr.io/tiecont/vlp-'));assert(image);const target=image.match(/\/vlp-(api|web|admin)@/)?.[1];assert(target);assert.equal(image,state.manifest.artifacts[target].image);
  if(args[0]==='buildx')respond({digest:image.split('@')[1]});
  if(args[0]==='pull')respond();
  if(args[0]==='image'&&args[1]==='inspect')respond([{Id:state.manifest.artifacts[target].localImageId,Config:{Labels:{'org.opencontainers.image.revision':state.revision}}}]);
  fail();
 }
 assert.equal(tool,'gh');
 if(args[0]==='run'&&args[1]==='download'){
  assert.equal(role,'read');state.calls.push({tool,role,operation:'metadata-download'});const dir=args[args.indexOf('--dir')+1];
  assert.equal(args[args.indexOf('--name')+1],'verified-image-metadata-'+state.revision+'-2');fs.mkdirSync(dir,{recursive:true});
  for(const name of ['image-checks.json',...Object.keys(state.manifest.artifacts).map(target=>target+'-sbom.cdx.json')])fs.copyFileSync(path.join(state.candidate,name),path.join(dir,name));
  fs.writeFileSync(path.join(dir,'bundle.json'),JSON.stringify(state.bundle));respond();
 }
 assert.equal(args[0],'api');const endpoint=args.slice(1).find(a=>a.startsWith('repos/')||a==='installation/repositories');assert(endpoint);
 const method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET',body=args.includes('--input')?JSON.parse(fs.readFileSync(args[args.indexOf('--input')+1],'utf8')):null;
 state.calls.push({tool,role,endpoint,method,body});const repo='repos/tiecont/virtual-life-platform/';
 if(endpoint==='installation/repositories'){assert.equal(role,'write');respond({total_count:state.installationCount??1,repositories:[{full_name:'tiecont/virtual-life-platform'}]});}
 if(endpoint===repo+'actions/runs/456'){assert.equal(role,'read');respond(state.publisher);}
 if(endpoint===repo+'actions/runs/456/artifacts?per_page=100'){assert.equal(role,'read');respond({total_count:1,artifacts:[{name:'release-candidate-'+state.revision+'-2',expired:false}]});}
 if(endpoint===repo+'actions/runs/123/attempts/2'){assert.equal(role,'read');respond(state.qualityRun);}
 if(endpoint===repo+'actions/runs/123/attempts/2/jobs?per_page=100'){assert.equal(role,'read');respond([{jobs:state.jobs}]);}
 if(endpoint===repo+'branches/main'){assert.equal(role,'read');respond({commit:{sha:state.mainOverride??state.revision}});}
 if(endpoint===repo+'git/commits/'+state.revision){assert.equal(role,'read');respond({sha:state.revision,tree:{sha:'e'.repeat(40)}});}
 assert.equal(role,'write');
 if(method==='POST'&&endpoint===repo+'git/trees'){
  assert.equal(body.base_tree,'e'.repeat(40));assert.deepEqual(body.tree.map(x=>x.path).sort(),state.allowedPaths);assert(body.tree.every(x=>x.mode==='100644'&&x.type==='blob'));state.tree='c'.repeat(40);respond({sha:state.tree});
 }
 if(method==='POST'&&endpoint===repo+'git/commits'){
  assert.equal(body.tree,state.tree);assert.deepEqual(body.parents,[state.revision]);assert.equal(state.commit,undefined);state.commit={sha:'d'.repeat(40),tree:{sha:state.tree},parents:[{sha:state.revision}],message:body.message};respond(state.commit);
 }
 if(method==='POST'&&endpoint===repo+'git/refs'){
  assert(body.ref.startsWith('refs/heads/promotion/staging/'));assert.equal(body.sha,state.commit.sha);assert.equal(state.ref,undefined);state.ref=body;respond({object:{sha:body.sha,type:'commit'}});
 }
 if(method==='GET'&&endpoint.startsWith(repo+'git/ref/heads/promotion/')){if(!state.ref)fail(404);assert.equal(endpoint,repo+'git/ref/'+state.ref.ref.slice('refs/'.length));respond({object:{sha:state.ref.sha,type:'commit'}});}
 if(method==='GET'&&state.commit&&endpoint===repo+'git/commits/'+state.commit.sha)respond(state.commit);
 if(method==='GET'&&endpoint.startsWith(repo+'pulls?'))respond(state.pr?[state.pr]:[]);
 if(method==='POST'&&endpoint===repo+'pulls'){
  assert.equal(body.draft,true);assert.equal(body.base,'main');assert.equal(body.head,state.ref.ref.slice('refs/heads/'.length));
  if(state.failPrOnce){state.failPrOnce=false;fail(503);}
  assert.equal(state.pr,undefined);state.pr={draft:true,user:{type:'Bot',login:'synthetic-promoter[bot]'},base:{ref:'main'},head:{ref:body.head,sha:state.ref.sha},html_url:'https://github.com/tiecont/virtual-life-platform/pull/999'};respond(state.pr);
 }
 fail();
}catch{fail();}
`;
