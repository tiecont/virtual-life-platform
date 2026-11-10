import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {containsCredential} from './inspect-api-image.mjs';
import {imageTestTools,sha256} from './image-test-tools.mjs';

const args=process.argv.slice(2);
assert(args[0]==='--target=admin'&&[1,3,5].includes(args.length));
if(args.length>=3)assert(args[1]==='--source-revision'&&/^[a-f0-9]{40}$/.test(args[2]));
if(args.length===5)assert(args[3]==='--api-facts'&&resolve(args[4]).startsWith(resolve('artifacts/image-api-'))&&args[4].endsWith('/facts.json'));
const directory=resolve('artifacts/image-admin-'+randomUUID().slice(0,8)),{run,save,commands,signal,dispose}=await imageTestTools(directory);
const facts={taskId:'N03-05',target:'admin',publicRelease:false,scope:'Local immutable admin artifact, private generated-certificate TLS/browser and disposable operator fixture; no hosted publishing, deployment or real operator'};
try{
 const revision=(await run('source','git',['rev-parse',args[2]??'HEAD'])).stdout.trim();assert(/^[a-f0-9]{40}$/.test(revision));facts.sourceRevision=revision;
 const context=resolve(directory,'source');await mkdir(context);
 await run('source','git',['archive','--format=tar','--output',resolve(directory,'source.tar'),revision]);await run('source','tar',['-xf',resolve(directory,'source.tar'),'-C',context]);
 const tag='vlp-admin:source-'+revision.slice(0,12)+'-'+randomUUID().slice(0,8);
 await run('build-admin','docker',['build','--pull=false','--build-arg','SOURCE_REVISION='+revision,'-f',resolve(context,'infra/docker/Dockerfile.admin'),'--target','runtime','-t',tag,context]);
 const image=JSON.parse((await run('metadata','docker',['image','inspect',tag])).stdout)[0];
 assert.equal(image.Config.User,'node');assert.equal(image.Config.Labels['org.opencontainers.image.revision'],revision);assert.equal(image.Config.Labels['org.opencontainers.image.title'],'vlp-admin');assert.deepEqual(image.Config.Cmd,['node','start-runtime.mjs']);
 for(const name of ['DATABASE_URL','SESSION_SECRET','OPERATOR_AUTH_KEY','ADMIN_ORIGIN','ADMIN_API_ORIGIN','ADMIN_METRICS_READ_TOKEN'])assert(!image.Config.Env.some(value=>value.startsWith(name+'=')),'Private configuration baked into image environment');
 facts.image={id:image.Id,tag,sourceRevision:revision,user:image.Config.User,workdir:image.Config.WorkingDir,sizeBytes:image.Size,identityScope:'Local Docker image ID, not a published registry digest'};
 for(const environment of [{},{ADMIN_ORIGIN:'http://admin.invalid',ADMIN_API_ORIGIN:'http://api:4300'},{ADMIN_ORIGIN:'https://admin.invalid',ADMIN_API_ORIGIN:'http://user:synthetic-secret@api:4300'},{ADMIN_ORIGIN:'https://admin.invalid',ADMIN_API_ORIGIN:'http://api:4300',ADMIN_METRICS_READ_TOKEN:'synthetic-invalid-token'}]){
  const result=await run('invalid-runtime-config','docker',['run','--rm','--network','none','--read-only',...Object.keys(environment).flatMap(key=>['--env',key]),image.Id],{env:environment,allowFailure:true});
  assert.equal(result.code,1);assert.equal(result.stderr.trim(),'Admin runtime configuration unavailable');assert(!result.stderr.includes('synthetic-secret'));
 }
 facts.invalidRuntimeConfigDenied=4;
 const inspector=await readFile(resolve(context,'scripts/inspect-admin-image.mjs'),'utf8'),script=inspector+'\nconsole.log(JSON.stringify(await inspectAdminImage('+containsCredential.toString()+')));';
 const inspected=JSON.parse((await run('inspection','docker',['run','--rm','--read-only','--network','none','--cap-drop=ALL','--security-opt','no-new-privileges','--entrypoint','node',image.Id,'--input-type=module','-e',script])).stdout);
 assert.equal(inspected.node,(await readFile(resolve(context,'.node-version'),'utf8')).trim());
 facts.inspection={uid:inspected.uid,node:inspected.node,filesystemWriteDenied:inspected.filesystemWriteDenied,buildId:inspected.buildId,files:inspected.inventory.length,inventorySha256:inspected.inventorySha256,clientJs:inspected.clientJs,clientCss:inspected.clientCss,scannedTextFiles:inspected.scannedTextFiles,definedCredentialFindings:0,syntheticBuildMarkersAndPrivateRouteAbsent:true};
 facts.inspectionCodeSha256=sha256(script);facts.fileInspection=await save('inspection.json',inspected);facts.applicationSbom=await save('application-sbom.cdx.json',inspected.sbom);
 const api=args.length===5?JSON.parse(await readFile(args[4],'utf8')):JSON.parse((await run('same-source-api','node',['scripts/check-image.mjs','--target=api','--source-revision',revision])).stdout);
 assert.equal(api.result,'PASS');assert.equal(api.sourceRevision,revision);assert.equal(api.runtime.scenarios.length,6);assert(api.runtime.cleanupComplete);facts.api={image:api.image,actualArtifactAndSixScenarioChecks:'PASS',artifacts:api.commandJournal};
 await run('tls-browser-smoke','node',['scripts/admin-image-smoke.mjs','--admin',image.Id,'--api',api.image.id,'--context',context,'--output',resolve(directory,'smoke')]);
 facts.runtime=JSON.parse(await readFile(resolve(directory,'smoke/result.json')));assert.equal(facts.runtime.result,'PASS');assert.equal(facts.runtime.scenarios.length,6);assert(facts.runtime.cleanupComplete&&facts.runtime.generatedSecretsRemoved);assert(!signal.aborted);facts.result='PASS';
}catch(error){facts.result='FAIL';facts.error=error.message;process.exitCode=1;}
finally{facts.commandJournal=await save('commands.json',commands);await save('facts.json',facts);dispose();console.log(JSON.stringify({...facts,artifactDirectory:directory},null,2));}
