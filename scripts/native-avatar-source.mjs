import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function avatarSourceFacts(){
 const paths=['apps/mobile/src','apps/mobile/android/app/src','apps/mobile/android/app/build.gradle','apps/platform-api/src','packages/contracts/src','packages/world-sdk/src','packages/client-sdk/src','packages/scene3d/src','packages/game-client/src','tests/native-android/main.ts','scripts/native-avatar-fixture.ts','scripts/verify-native-avatar-webview.mjs','scripts/native-avatar-source.mjs','scripts/verify-native-android-instrumentation.mjs'];
 paths.push('tests/native-world/main.ts','scripts/native-world-fixture.ts','scripts/verify-native-world-webview.mjs','apps/mobile/vite.config.ts','apps/mobile/package.json','pnpm-lock.yaml');
 const refs=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--',...paths],{encoding:'utf8'}).trim().split('\n').filter(Boolean),sourceFiles=[];
 for(const ref of refs){assert(!/(?:\.idea\/|botkeep-ca|\/node_modules\/|\/build\/|\/tls\/|\.(?:pem|key|jks|keystore|p12)$)/.test(ref));sourceFiles.push({ref,sha256:sha(await readFile(ref))});}
 return{sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),trackedDiffSha256:sha(execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:32*1024*1024})),sourceFiles};
}
export async function assertAvatarSourceUnchanged(sourceFiles){for(const file of sourceFiles)assert.equal(sha(await readFile(file.ref)),file.sha256,file.ref);}
