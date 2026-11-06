import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdir,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

// Local debug artifact only. No signing credentials, device install, store action
// or environment download is performed by this build command.
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 assert.equal(process.argv.length,2,'No build overrides accepted');
 assert(process.env.JAVA_HOME,'JAVA_HOME is required');
 const sdk=process.env.ANDROID_SDK_ROOT??process.env.ANDROID_HOME;
 assert(sdk,'ANDROID_SDK_ROOT is required');
 const java=resolve(process.env.JAVA_HOME,'bin/java');
 const version=execFileSync(java,['-version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 // Java emits its version on stderr; use the release file to check the fixed major.
 const release=await readFile(resolve(process.env.JAVA_HOME,'release'),'utf8');
 assert(/^JAVA_VERSION="21\./m.test(release),'Pinned JDK21 required');
 for(const path of ['platforms/android-36/android.jar','build-tools/36.0.0/aapt2'])assert((await stat(resolve(sdk,path))).isFile(),'Required SDK36/build-tools36.0.0 absent');
 const startedAt=new Date().toISOString();
 const child=spawn('./gradlew',['--no-daemon','--max-workers=4','assembleDebug'],{cwd:resolve('apps/mobile/android'),env:process.env,stdio:'inherit'});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));
 const code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',code=>ok(code??1));});
 if(code!==0)process.exitCode=code;
 else{
  const apk=resolve('apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk'),bytes=await readFile(apk),directory=resolve('artifacts/mobile-android-build-'+randomUUID().slice(0,8));await mkdir(directory,{recursive:true});
  const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),diff=execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:32*1024*1024});
  const facts={schemaVersion:1,purpose:'LOCAL_DEBUG_APK_NOT_RELEASE_OR_DEVICE_ACCEPTANCE',sourceRevision:revision,trackedDiffSha256:hash(diff),startedAt,completedAt:new Date().toISOString(),command:'./gradlew --no-daemon --max-workers=4 assembleDebug',exitCode:0,javaMajor:21,sdk:36,buildTools:'36.0.0',gradle:'8.14.3',apk:{path:apk,sha256:hash(bytes),bytes:bytes.length},installedOnDevice:false,distributed:false,publicRelease:false};
  await writeFile(resolve(directory,'facts.json'),JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({...facts,artifactDirectory:directory,javaProbeStdoutEmpty:version.length===0}));
 }
}catch{console.error('Android debug build unavailable; check pinned JAVA_HOME, SDK36/build-tools and the private build log');process.exitCode=1;}
