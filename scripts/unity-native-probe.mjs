import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {toolEnvironment} from './test-environment.mjs';

export async function unityNativeProbe({directory,index,origin,boot,match,loginName,password,interactive=false,movement=false}){
 assert.equal(process.platform,'linux','This probe requires an actual Linux player');
 const editor=process.env.UNITY_EDITOR;
 assert(editor,'UNITY_EDITOR must identify the installed licensed pinned Editor');
 assert.equal(spawnSync(editor,['-version'],{encoding:'utf8'}).stdout.trim(),'6000.3.14f1');
 const prefix=resolve(directory,'unity-'+index),config=prefix+'.private.json',scope=prefix+'.scope.private.json',results=prefix+'.xml';
 await writeFile(config,JSON.stringify({origin,caCertificate:resolve(directory,'tls/ca.pem'),wrongCaCertificate:resolve(directory,'tls/wrong-ca.pem'),boot,match,loginName,password,movement,screenshot:prefix+'.png',result:prefix+'.json'}),{mode:0o600});
 if(interactive)await writeFile(scope,JSON.stringify({httpsOrigin:origin,wssOrigin:origin.replace('https:','wss:')+'/rt/v1',contentHash:'53'.repeat(32),bootId:boot,matchId:match,movement}),{mode:0o600});
 try{
  await rm(resolve('artifacts/unity-native-player'),{recursive:true,force:true});
  const child=spawn(editor,['-batchmode','-nographics','-projectPath',resolve('apps/unity-client'),'-logFile',prefix+'.log',
   '-runTests','-testPlatform','StandaloneLinux64','-testFilter','VirtualLife.Blockout.Tests.NativePlayerTests.'+(interactive?'LinuxPlayerPanelKeyboardAndTerminal':'LinuxPlayerLoginCommandAndReconnect'),
   '-buildPlayerPath',resolve('artifacts/unity-native-player'),'-testResults',results,'-playerHeartbeatTimeout','120'],
  {env:{...toolEnvironment(process.env),VL_UNITY_NATIVE_FIXTURE:config,...(interactive?{VL_NATIVE_DEV_CONFIG:scope}:{})},stdio:'ignore',detached:true});
  const cleanup=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};
  const timer=setTimeout(cleanup,300000);
  let code;try{code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',ok);});}finally{clearTimeout(timer);cleanup();}
  assert.equal(code,0,'Unity Linux test player failed; inspect private fixture logs');
  assert(!/^Unable to parse file (?:ProjectSettings|Assets)\//m.test(await readFile(prefix+'.log','utf8')),'Unity project asset parsing must succeed');
  const xml=await readFile(results,'utf8');
  assert(/<test-run\b[^>]*result="Passed"/.test(xml)&&/\bpassed="1"/.test(xml),'Actual Unity player test must pass, not skip');
  const facts=JSON.parse(await readFile(prefix+'.json','utf8'));
  assert.equal(facts.editor,'6000.3.14f1');assert.equal(facts.platform,'LinuxPlayer');assert.notEqual(facts.graphicsApi,'Null');
  assert(facts.committedReceipt&&(interactive?facts.panelKeyboardTerminal:facts.reconnectReplay&&facts.wrongCaRejected));
  if(movement)assert(facts.authoritativeMovement);
  const binary=resolve('artifacts/unity-native-player/PlayerWithTests/PlayerWithTests.x86_64');
  facts.playerSha256=createHash('sha256').update(await readFile(binary)).digest('hex');
  facts.tlsTrust='Test-only Mono TrustAnchors validates the disposable CA and hostname; system trust stores unchanged';
  await writeFile(prefix+'.json',JSON.stringify(facts,null,2));
  return facts;
 }finally{await rm(config,{force:true});await rm(scope,{force:true});}
}
