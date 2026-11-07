import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const [mode]=process.argv.slice(2);assert(['storage','https'].includes(mode)&&process.argv.length===3);
const config=JSON.parse(await readFile('docs/mobile/ANDROID-EMULATOR.json')),instance=JSON.parse(await readFile('artifacts/vnext/n10-05/runtime/instance.json'));
const paths=JSON.parse(await readFile('artifacts/vnext/n10-02/android-native/local-env.json')),adb=paths.sdkRoot+'/platform-tools/adb',serial='emulator-'+config.port;
assert.equal(instance.serial,serial);assert.equal(instance.avdName,config.avdName);assert.equal(instance.sdk,paths.sdkRoot);
const ticks=(await readFile('/proc/'+instance.pid+'/stat','utf8')).split(') ').at(-1).split(' ')[19];assert.equal(ticks,instance.startTicks);
const argv=(await readFile('/proc/'+instance.pid+'/cmdline','utf8')).split('\0');assert(argv.includes(config.avdName)&&argv.includes(String(config.port)));
const directory=resolve('artifacts/vnext/n10-03/instrumentation-'+mode+'-'+randomUUID().slice(0,8));await mkdir(directory,{mode:0o700});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),commands=[];
const facts={mode,startedAt:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),commands,physicalDevice:false,distributed:false};
function adbRun(label,args,timeout=30000){try{const bytes=execFileSync(adb,['-s',serial,...args],{timeout,maxBuffer:4*1024*1024});commands.push({label,args,exitCode:0,outputSha256:hash(bytes)});return bytes.toString().trim();}catch(error){commands.push({label,args,exitCode:error.status??null,signal:error.signal??null});throw Error('Owned AVD command failed: '+label);}}
let reverse=false;
try{
 assert.equal(adbRun('qemu',['shell','getprop','ro.kernel.qemu']),'1');assert(adbRun('avd-name',['emu','avd','name']).split(/\r?\n/).includes(config.avdName));
 for(const [label,file] of [['application','apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk'],['instrumentation','apps/mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']]){
  const bytes=await readFile(file);facts[label]={sha256:hash(bytes),bytes:bytes.length};await writeFile(directory+'/'+label+'.apk',bytes,{mode:0o600});adbRun('install-'+label,['install','-r',resolve(file)]);
 }
 if(mode==='https'){
  assert.equal(JSON.parse(await readFile('artifacts/vnext/n10-03/tls/ready.json')).ready,true);
  assert(!adbRun('existing-reverses',['reverse','--list']).split('\n').some(line=>line.split(/\s+/).includes('tcp:18443')),'Refusing to replace an existing reverse');
  adbRun('own-tls-reverse',['reverse','tcp:18443','tcp:18443']);reverse=true;
 }
 adbRun('stop-own-app',['shell','am','force-stop','life.virtualcity.spike']);
 const testClass='life.virtualcity.spike.'+(mode==='storage'?'NativeSessionStoreTest':'NativeSessionHttpsTest');
 const output=adbRun('run-instrumentation',['shell','am','instrument','-w','-r','-e','class',testClass,'life.virtualcity.spike.test/androidx.test.runner.AndroidJUnitRunner'],240000);
 await writeFile(directory+'/instrumentation.log',output+'\n',{mode:0o600});
 assert(!/FAILURES|INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED|shortMsg=/.test(output),'Android instrumentation failed');
 const match=output.match(/OK \((\d+) tests?\)/);assert(match,'No complete JUnit result');facts.tests=Number(match[1]);facts.result='PASS';
}catch(error){facts.result='FAIL';facts.error=error.message;process.exitCode=1;}
finally{
 if(reverse){try{adbRun('remove-own-reverse',['reverse','--remove','tcp:18443']);}catch(error){facts.cleanupError=error.message;process.exitCode=1;}}
 facts.completedAt=new Date().toISOString();await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({result:facts.result,tests:facts.tests,error:facts.error,artifactDirectory:relative(process.cwd(),directory)}));
}
