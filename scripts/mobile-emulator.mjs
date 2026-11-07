import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat,statfs,open} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {resolve,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const [action,...args]=process.argv.slice(2);assert(['start','stop','status','smoke','scene3d','workload'].includes(action),'Expected start,stop,status,smoke,scene3d,workload');
assert(args.length===0||['smoke','scene3d','workload'].includes(action)&&args.length===2&&args[0]==='--apk','Only smoke/scene3d/workload --apk accepts a file');
const root=resolve('.'),config=JSON.parse(await readFile('docs/mobile/ANDROID-EMULATOR.json','utf8')),base=resolve('artifacts/vnext/n10-05/runtime');await mkdir(base,{recursive:true,mode:0o700});
const runtimeFile=base+'/instance.json',serial='emulator-'+config.port,local='artifacts/vnext/n10-02/android-native/local-env.json',paths=existsSync(local)?JSON.parse(await readFile(local,'utf8')):{};
const sdk=process.env.ANDROID_SDK_ROOT??process.env.ANDROID_HOME??paths.sdkRoot,jdk=process.env.JAVA_HOME??paths.javaHome;
assert(sdk&&jdk,'Prepare reviewed SDK/JDK or set ANDROID_SDK_ROOT and JAVA_HOME');
const adb=sdk+'/platform-tools/adb',emulator=sdk+'/emulator/emulator',avdHome=base+'/avd',avdPath=avdHome+'/'+config.avdName+'.avd';
for(const p of [avdHome,base+'/android-user',base+'/emulator-home'])await mkdir(p,{recursive:true,mode:0o700});
const env={...process.env,JAVA_HOME:jdk,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,ANDROID_AVD_HOME:avdHome,ANDROID_USER_HOME:base+'/android-user',ANDROID_EMULATOR_HOME:base+'/emulator-home'};
const output=resolve('artifacts/vnext/n10-05',action+'-'+randomUUID().slice(0,8));await mkdir(output,{mode:0o700});const commands=[];
function run(label,command,argv,timeout=15000,input){const r=spawnSync(command,argv,{env,encoding:'utf8',timeout,input,maxBuffer:8*1024*1024});const log=output+'/'+commands.length+'-'+label+'.log';return writeFile(log,(r.stdout??'')+(r.stderr??'')+(r.error?'Process unavailable or timed out\n':''),{mode:0o600}).then(()=>{commands.push({label,command:relative(root,command),argv,exitCode:r.status??1,log:relative(root,log)});assert(r.status===0,label+' failed; see private log');return r.stdout;});}
const ticks=pid=>{try{return readFileSync('/proc/'+pid+'/stat','utf8').split(') ').at(-1).split(' ')[19];}catch{return null;}};
function owned(instance){if(!instance||instance.avdName!==config.avdName||instance.serial!==serial||instance.sdk!==sdk||ticks(instance.pid)!==instance.startTicks)return false;try{const command=readFileSync('/proc/'+instance.pid+'/cmdline','utf8').split('\0');return command.includes(config.avdName)&&command.includes(String(config.port));}catch{return false;}}
let instance=existsSync(runtimeFile)?JSON.parse(await readFile(runtimeFile,'utf8')):null,result='FAIL',error=null;
try{
 if(action==='status'){result=owned(instance)?'RUNNING':'STOPPED';}
 if(action==='start'){
  assert(!owned(instance),'Owned emulator is already running');
  const memory=await readFile('/proc/meminfo','utf8'),available=Number(memory.match(/MemAvailable:\s+(\d+)/)[1])/1024,disk=await statfs(base);assert(available>=config.minimumAvailableMemoryMiB,'Insufficient available memory');assert(Number(disk.bavail)*Number(disk.bsize)>=config.minimumFreeDiskGiB*1024**3,'Insufficient free disk');
  const version=await run('emulator-version',emulator,['-version']);assert(version.includes(config.emulatorVersion),'Unexpected emulator version');await run('acceleration',emulator,['-accel-check']);
  const image=sdk+'/system-images/android-'+config.api+'/google_apis/x86_64',properties=await readFile(image+'/source.properties','utf8');assert(new RegExp('Pkg.Revision\\s*=\\s*'+config.systemImageRevision+'\\s*(?:\\n|$)').test(properties),'Unexpected system image revision');
  const devices=spawnSync(adb,['devices'],{env,encoding:'utf8',timeout:10000});assert(devices.status===0&&!devices.stdout.split('\n').some(line=>line.startsWith(serial+'\t')),'Emulator serial is already in use; no unowned instance will be controlled');
  if(!existsSync(avdPath+'/config.ini'))await run('create-avd',sdk+'/cmdline-tools/pinned/bin/avdmanager',['create','avd','--name',config.avdName,'--package',config.systemImage,'--path',avdPath,'--device','pixel_5'],60000,'no\n');
  let ini=await readFile(avdPath+'/config.ini','utf8');const values={'hw.ramSize':config.memoryMiB,'hw.cpu.ncore':config.cpuCores,'disk.dataPartition.size':config.dataPartitionGiB+'G','hw.lcd.width':config.width,'hw.lcd.height':config.height,'hw.lcd.density':config.density,'hw.keyboard':'no','hw.gpu.enabled':'yes','hw.gpu.mode':config.gpu,'showDeviceFrame':'no'};for(const [key,value]of Object.entries(values)){ini=ini.split('\n').filter(line=>!line.startsWith(key+'=')&&!line.startsWith(key+' =')).join('\n');ini+='\n'+key+'='+value;}await writeFile(avdPath+'/config.ini',ini+'\n',{mode:0o600});
  const log=await open(output+'/emulator.log','wx',0o600),argv=['-avd',config.avdName,'-port',String(config.port),'-no-window','-no-audio','-no-boot-anim','-no-snapshot','-accel','on','-gpu',config.gpu,'-memory',String(config.memoryMiB),'-cores',String(config.cpuCores)];
  const child=spawn(emulator,argv,{env,detached:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();assert(child.pid,'Emulator failed to start');instance={pid:child.pid,startTicks:ticks(child.pid),avdName:config.avdName,serial,sdk,startedAt:new Date().toISOString(),log:relative(root,output+'/emulator.log'),argv};await writeFile(runtimeFile,JSON.stringify(instance,null,2)+'\n',{mode:0o600});
  const deadline=Date.now()+config.bootTimeoutSeconds*1000;let booted=false;
  while(Date.now()<deadline){assert(owned(instance),'Owned emulator exited before boot');const p=spawnSync(adb,['-s',serial,'shell','getprop','sys.boot_completed'],{env,encoding:'utf8',timeout:3000});if(p.status===0&&p.stdout.trim()==='1'){booted=true;break;}await new Promise(ok=>setTimeout(ok,1000));}
  assert(booted,'Emulator boot deadline exceeded');assert((await run('emulated-device',adb,['-s',serial,'shell','getprop','ro.kernel.qemu'])).trim()==='1');await run('graphics',adb,['-s',serial,'shell','dumpsys','SurfaceFlinger']);await run('webview',adb,['-s',serial,'shell','dumpsys','webviewupdate']);result='PASS';
 }
 if(['smoke','scene3d','workload'].includes(action)){
  assert(owned(instance),'No task-owned emulator; start it first');const apk=resolve(args[1]??'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk');assert((apk.startsWith(root+'/artifacts/')||apk.startsWith(root+'/apps/mobile/android/app/build/outputs/apk/'))&&apk.endsWith('.apk')&&(await stat(apk)).isFile(),'Expected a local development APK');
  const native=action!=='smoke',script=action==='workload'?'scripts/mobile-emulator-workload.mjs':action==='scene3d'?'scripts/mobile-emulator-scene3d.mjs':'scripts/mobile-emulator-smoke.py';const child=spawn(native?process.execPath:'python3',[script],{env:{...env,ADB_PATH:adb,VLP_EMULATOR_SERIAL:serial,VLP_EMULATOR_APK:apk},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);const code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',ok);});await writeFile(output+'/smoke.log',logs,{mode:0o600});assert(code===0,'Emulator own-app smoke/workload failed; see private log');result='PASS';
 }
 if(action==='stop'){
  assert(owned(instance),'Refusing to stop an unknown/reused emulator PID');await run('stop-own-emulator',adb,['-s',serial,'emu','kill']);for(let i=0;i<30&&owned(instance);i++)await new Promise(ok=>setTimeout(ok,500));if(owned(instance)){process.kill(instance.pid,'SIGTERM');for(let i=0;i<10&&owned(instance);i++)await new Promise(ok=>setTimeout(ok,500));}assert(!owned(instance),'Owned emulator did not exit');result='PASS';
 }
}catch(e){error=e.message;if(action==='start'&&owned(instance))process.kill(instance.pid,'SIGTERM');process.exitCode=1;}
finally{const facts={scope:config.scope,action,result,error,observedAt:new Date().toISOString(),sourceRevision:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),configSHA256:createHash('sha256').update(await readFile('docs/mobile/ANDROID-EMULATOR.json')).digest('hex'),serial,avdName:config.avdName,commands,artifactDirectory:relative(root,output)};await writeFile(output+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({action,result,error,artifactDirectory:facts.artifactDirectory}));}
