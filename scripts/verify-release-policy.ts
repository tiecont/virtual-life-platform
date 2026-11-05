import {readFile} from 'node:fs/promises';
import {ReleaseEnvironmentSchema,evaluateReleasePolicy,assertReleaseSafety} from '../apps/platform-api/src/config/release-policy';

async function main(){
 const args=process.argv.slice(2),flags=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!['--release','--runtime','--safety','--environment'].includes(args[i])||!args[i+1]||flags.has(args[i]))throw Error('Invalid release policy options');flags.set(args[i],args[i+1]);}
 const read=async(file:string)=>{const bytes=await readFile(file);if(bytes.length>65536)throw Error('Policy bounds');return JSON.parse(bytes.toString('utf8')) as unknown;};
 const release=await read(flags.get('--release')??'config/release-policy.json'),runtime=await read(flags.get('--runtime')??'config/runtime-world-policy.json'),safety=await read(flags.get('--safety')??'config/safety-policy.json');
 const environment=ReleaseEnvironmentSchema.parse(flags.get('--environment')??'production'),result=evaluateReleasePolicy(release,runtime,environment);assertReleaseSafety(result.release,safety);
 console.log(JSON.stringify({result:'PASS',scope:'Versioned configuration validation only; no deployment,real approval,operator provisioning or live policy change',environment,releaseVersion:result.release.version,runtimeVersion:result.runtime.version,installedWorlds:result.installedWorlds,enabledWorlds:result.enabledWorlds,humanOperatorLimit:result.release.operator.maxPrincipals,operatorReferenceConfigured:result.release.operator.subjectRef!==null,maintenance:result.runtime.maintenance,textChat:false,liveMedia:false,realDating:false}));
}
void main().catch(()=>{console.error('Release/runtime/safety policy validation failed closed');process.exitCode=1;});
