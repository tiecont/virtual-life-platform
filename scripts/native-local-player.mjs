import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {access,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {toolEnvironment} from './test-environment.mjs';

export async function nativeLocalPlayer({directory,origin,scope,matchId,loginName,password,worker}){
 assert.equal(process.platform,'linux');
 const binary=resolve('apps/unity-client/Builds/Linux/VirtualLife');await access(binary);
 const scopeFile=resolve(directory,'player.scope.private.json'),credentials=resolve(directory,'player-login.private.txt');
 await writeFile(scopeFile,JSON.stringify({httpsOrigin:origin,wssOrigin:origin.replace('https:','wss:')+'/rt/v1',contentHash:scope.contentHash,bootId:scope.runtimeBootId,matchId,movement:true,ruleset:'pet-arena-pve',developmentCaFile:resolve(directory,'tls/ca.pem')}),{mode:0o600});
 await writeFile(credentials,'Account: '+loginName+'\nPassword: '+password+'\n',{mode:0o600});
 console.log('Linux Pet Arena ready. Private local login: '+credentials+'\nWASD: move; E: enter the purple Arena gate. Close the player to remove the disposable backend.');
 const child=spawn(binary,['-screen-width','1280','-screen-height','900','-screen-fullscreen','0','-logFile',resolve(directory,'player.log')],{env:{...toolEnvironment(process.env),VL_NATIVE_DEV_CONFIG:scopeFile},stdio:'ignore'});
 let done=false,workerError;
 const closed=new Promise((ok,no)=>{child.once('error',no);child.once('close',ok);}).finally(()=>{done=true;});
 const stop=()=>child.kill('SIGTERM');process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const rewards=(async()=>{while(!done){try{await worker();}catch(error){workerError=error;child.kill('SIGTERM');break;}if(!done)await new Promise(ok=>setTimeout(ok,1000));}})();
 try{
  const code=await closed;await rewards;if(workerError)throw workerError;
  assert.equal(code,0,'Linux player exited unexpectedly; inspect the local player log');
 }finally{
  child.kill('SIGTERM');await closed.catch(()=>{});await rewards;
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  await rm(scopeFile,{force:true});await rm(credentials,{force:true});
 }
}
