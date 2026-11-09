import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {platform,arch} from 'node:os';
import {legacyVnextRoot} from './legacy-plan-paths.mjs';
const args=process.argv.slice(2),required=args.includes('--require-ready'),selected=args.find(a=>a.startsWith('--platform='))?.slice(11)??'all';
if(args.some(a=>a!=='--require-ready'&&!/^--platform=(android|ios|all)$/.test(a))||!['android','ios','all'].includes(selected)){console.error('Expected optional --platform=android|ios|all and --require-ready');process.exit(1);}
const declaration=JSON.parse(await readFile(new URL('../docs/mobile/ios-readiness.json',import.meta.url),'utf8'));
if(declaration.schemaVersion!==1||typeof declaration.ownerReported.macOSBuildAccess!=='boolean'||typeof declaration.ownerReported.physicalIPhonePath!=='boolean')throw Error('Invalid owner resource declaration');
const inspect=(command,args)=>{const result=spawnSync(command,args,{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,LANG:'C',LC_ALL:'C'},stdio:['ignore','pipe','pipe']});return {available:!result.error&&result.status===0,version:!result.error&&result.status===0?(result.stdout||result.stderr).trim().split('\n').slice(0,2).join(' ').slice(0,200):null};};
const host=platform(),java=inspect('java',['-version']),adb=inspect('adb',['version']),xcode=host==='darwin'?inspect('xcodebuild',['-version']):{available:false,version:null};
const state=JSON.parse(await readFile(legacyVnextRoot+'/state/task-state.json','utf8'));
const iosReady=host==='darwin'&&xcode.available&&declaration.ownerReported.macOSBuildAccess&&declaration.ownerReported.physicalIPhonePath;
const result={schemaVersion:1,observedAt:new Date().toISOString(),purpose:'READ_ONLY_RESOURCE_PREFLIGHT_NOT_NATIVE_VERIFICATION',host:{os:host,arch:arch(),node:process.version},tools:{java,adb,xcode},android:{ready:false,status:'DEVICE_SDK_AND_BUILD_NOT_QUALIFIED',physicalDevice:'NOT_PROBED'},ios:{ready:iosReady,status:iosReady?'RESOURCE_CANDIDATE_REQUIRES_N14_EVIDENCE':'NOT_READY',ownerDeclaration:declaration.ownerReported,localXcodeProbed:host==='darwin',nativeArchive:'NOT_RUN',physicalIPhone:'NOT_RUN',testFlight:'NOT_RUN',activationPerformed:false},distribution:state.runtime_context,releaseStatus:state.release_status};
console.log(JSON.stringify(result,null,2));if(required&&(selected==='ios'?!iosReady:selected==='android'?true:!iosReady||!result.android.ready))process.exitCode=2;
