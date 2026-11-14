import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {toolEnvironment} from './test-environment.mjs';

export async function unityNativeProbe({directory,index,origin,boot,match,loginName,password,interactive=false,movement=false,pet=false,loss=false,contentHash='53'.repeat(32),onRestart,onSettle}){
 assert.equal(process.platform,'linux','This probe requires an actual Linux player');
 const editor=process.env.UNITY_EDITOR;
 assert(editor,'UNITY_EDITOR must identify the installed licensed pinned Editor');
 assert.equal(spawnSync(editor,['-version'],{encoding:'utf8'}).stdout.trim(),'6000.3.14f1');
 const prefix=resolve(directory,'unity-'+index),config=prefix+'.private.json',scope=prefix+'.scope.private.json',results=prefix+'.xml';
 await writeFile(config,JSON.stringify({origin,caCertificate:resolve(directory,'tls/ca.pem'),wrongCaCertificate:resolve(directory,'tls/wrong-ca.pem'),boot,match,loginName,password,movement,loss,ackGate:resolve(directory,'ack-gate'),ackObserved:resolve(directory,'ack-observed'),ticketReleased:resolve(directory,'ticket-released'),logoutGate:resolve(directory,'logout-gate'),logoutObserved:resolve(directory,'logout-observed'),restartRequested:prefix+'.restart-requested',restartReady:prefix+'.restart-ready',settleRequested:prefix+'.settle-requested',settleReady:prefix+'.settle-ready',screenshot:prefix+'.png',result:prefix+'.json'}),{mode:0o600});
 if(interactive)await writeFile(scope,JSON.stringify({httpsOrigin:origin,wssOrigin:origin.replace('https:','wss:')+'/rt/v1',contentHash,bootId:boot,matchId:match,movement,ruleset:pet?'pet-arena-pve':'headless-counter',...(pet?{developmentCaFile:resolve(directory,'tls/ca.pem')}:{})}),{mode:0o600});
 try{
  await rm(resolve('artifacts/unity-native-player'),{recursive:true,force:true});
  const child=spawn(editor,['-batchmode','-nographics','-projectPath',resolve('apps/unity-client'),'-logFile',prefix+'.log',
   '-runTests','-testPlatform','StandaloneLinux64','-testFilter','VirtualLife.Blockout.Tests.NativePlayerTests.'+(pet?'LinuxPlayerPetArenaFullMatch':interactive?'LinuxPlayerPanelKeyboardAndTerminal':'LinuxPlayerLoginCommandAndReconnect'),
   '-buildPlayerPath',resolve('artifacts/unity-native-player'),'-testResults',results,'-playerHeartbeatTimeout','120'],
  {env:{...toolEnvironment(process.env),VL_UNITY_NATIVE_FIXTURE:config,...(interactive?{VL_NATIVE_DEV_CONFIG:scope}:{})},stdio:'ignore',detached:true});
  const cleanup=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};
  const timer=setTimeout(cleanup,420000);
  let finished=false;
  const closed=new Promise((ok,no)=>{child.once('error',no);child.once('close',ok);}).finally(()=>{finished=true;});
  const controls=async()=>{
   if(!pet)return;
   const exists=async file=>{try{await access(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
   while(!finished){
    for(const [name,work]of [['restart',onRestart],['settle',onSettle]])if(await exists(prefix+'.'+name+'-requested')){
     await rm(prefix+'.'+name+'-requested');await work();await writeFile(prefix+'.'+name+'-ready','Completed isolated fixture control',{mode:0o600});
    }
    await new Promise(ok=>setTimeout(ok,25));
   }
  };
  let code;try{[code]=await Promise.all([closed,controls()]);}finally{clearTimeout(timer);cleanup();await closed;}
  assert.equal(code,0,'Unity Linux test player failed; inspect private fixture logs');
  assert(!/^Unable to parse file (?:ProjectSettings|Assets)\//m.test(await readFile(prefix+'.log','utf8')),'Unity project asset parsing must succeed');
  const xml=await readFile(results,'utf8');
  assert(/<test-run\b[^>]*result="Passed"/.test(xml)&&/\bpassed="1"/.test(xml),'Actual Unity player test must pass, not skip');
  const facts=JSON.parse(await readFile(prefix+'.json','utf8'));
  assert.equal(facts.editor,'6000.3.14f1');assert.equal(facts.platform,'LinuxPlayer');assert.notEqual(facts.graphicsApi,'Null');
  assert(facts.committedReceipt&&(pet?facts.petArenaComplete:interactive?facts.panelKeyboardTerminal:facts.reconnectReplay&&facts.wrongCaRejected));
  if(interactive&&!pet)assert(facts.ambiguousAckReplay&&facts.inflightSceneExit);
  if(pet)assert(facts.ambiguousAckReplay&&facts.reconnectReplay&&facts.rewardReconciled&&facts.returnedToRoam&&facts.reducedMotion);
  if(movement)assert(facts.authoritativeMovement);
  const binary=resolve('artifacts/unity-native-player/PlayerWithTests/PlayerWithTests.x86_64');
  facts.playerSha256=createHash('sha256').update(await readFile(binary)).digest('hex');
  facts.tlsTrust='Test-only Mono TrustAnchors validates the disposable CA and hostname; system trust stores unchanged';
  await writeFile(prefix+'.json',JSON.stringify(facts,null,2));
  return facts;
 }finally{await rm(config,{force:true});await rm(scope,{force:true});}
}
