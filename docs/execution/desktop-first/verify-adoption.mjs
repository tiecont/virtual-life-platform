import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {sha256,schedulerStore,planRoot} from '../../../scripts/desktop-scheduler.mjs';

const json=async ref=>JSON.parse(await readFile(ref,'utf8'));
const counts=state=>Object.values(state.tasks).reduce((all,row)=>(all[row.status]=(all[row.status]||0)+1,all),{});
export async function inspectAdoption() {
  const index=await json('docs/execution/desktop-first/LEGACY-INDEX.json');
  assert.equal(index.files.length,209);
  for(const file of index.files) {
    assert.equal(sha256(await readFile(file.ref)),file.sha256,file.ref);
    assert.equal(sha256(execFileSync('git',['show',index.sourceRevision+':'+file.originalRef],{maxBuffer:16*1024**2})),file.sha256,file.originalRef);
  }
  const input=await json('docs/execution/desktop-first/INPUT-MANIFEST.json');
  for(const file of input.files)assert.equal(sha256(await readFile(file.ref)),file.sha256,file.ref);
  const root=index.archiveRoot;
  const vnext=await json(root+'/platform-vnext/state/task-state.json'),lodge=await json(root+'/LANTERN-LODGE-PHASE-2/state/task-state.json'),arena=await json(root+'/vlp-pet-arena-plan-v0.1/execution/state.json');
  assert.deepEqual(counts(vnext),{VERIFIED:44,BLOCKED_EXTERNAL:2,TODO:18,IN_PROGRESS:1,DEFERRED_APPROVED:12});
  assert.deepEqual(counts(lodge),{VERIFIED:4,TODO:20,DEFERRED_APPROVED:1});
  assert.deepEqual(counts(arena),{TODO:20});
  const evidence=await json(root+'/platform-vnext/state/evidence-index.json');assert.equal(evidence.records.length,75);
  const sqlRoot='apps/platform-api/src/db/migrations',sql=[];
  const baselineNames=execFileSync('git',['ls-tree','--name-only',index.sourceRevision+':'+sqlRoot],{encoding:'utf8'}).trim().split('\n').filter(name=>name.endsWith('.sql'));
  assert.equal(baselineNames.length,47);
  const currentNames=(await readdir(sqlRoot)).filter(name=>name.endsWith('.sql')).sort();
  for(const name of baselineNames) {
    const ref=sqlRoot+'/'+name,bytes=await readFile(ref);
    assert(bytes.equals(execFileSync('git',['show',index.sourceRevision+':'+ref])),'Migration changed '+ref);
    sql.push({ref,sha256:sha256(bytes)});
  }
  assert.equal(sql.length,47);
  for(const name of currentNames.filter(name=>!baselineNames.includes(name))) {
    assert.equal(name,'0048_native_game_storage.sql','Unregistered additive migration');
    const record=await json('docs/execution/desktop-first/migration-reservations/0048-implementation.json');
    const ref=sqlRoot+'/'+name;assert.equal(record.sourceRef,ref);assert.equal(record.taskId,'VL-016');
    sql.push({ref,sha256:sha256(await readFile(ref)),qualification:'NEW_MIGRATION_NOT_QUALIFIED_BY_PRESERVATION'});
  }
  const sourceRefs=['apps/platform-api/src/app.ts','apps/platform-api/src/worker.ts','apps/platform-api/src/db/migrations.ts','apps/platform-api/src/rooms/authority.ts','apps/platform-api/src/rooms/service.ts','apps/platform-api/src/identity/service.ts','apps/platform-api/src/identity/native-service.ts','apps/platform-api/src/identity/http.ts','apps/platform-api/src/identity/socket.ts','apps/platform-api/src/identity/native-http.ts','apps/platform-api/src/games/journal.ts','apps/platform-api/src/games/journal-crypto.ts','apps/platform-api/src/games/journal-host.ts','apps/platform-api/src/progression/ledger.ts','packages/contracts/src/compatibility.ts','packages/contracts/src/native-auth.ts','packages/scene3d/src/animal.ts','packages/scene3d/src/renderer.ts','packages/scene3d/test/animal-variants-cache.test.ts','pnpm-lock.yaml'];
  const sources=[];
  for(const ref of sourceRefs){
    const bytes=await readFile(ref),baseline=execFileSync('git',['show',index.sourceRevision+':'+ref]);
    const matchesBaseline=bytes.equals(baseline);
    if(ref!=='pnpm-lock.yaml')assert(matchesBaseline,'Baseline source changed '+ref);
    sources.push({ref,sha256:sha256(bytes),baselineSha256:sha256(baseline),matchesBaseline,
      ...ref==='pnpm-lock.yaml'?{evolutionScope:'Current exact dependency graph may evolve under reviewed task reservations;historical baseline hash is retained,not overwritten'}:{}});
  }
  const allSource=execFileSync('git',['ls-files','--','apps','packages'],{encoding:'utf8'}).trim().split('\n');
  const roomConstructors=[];
  for(const ref of allSource.filter(ref=>ref.endsWith('.ts')&&!ref.endsWith('.test.ts')&&ref.startsWith('apps/platform-api/src/')))if(/new RoomAuthority\(/.test(await readFile(ref,'utf8')))roomConstructors.push(ref);
  assert.deepEqual(roomConstructors,['apps/platform-api/src/app.ts']);
  const nativeSources=allSource.filter(ref=>/\.rs$|Cargo\.toml$|\.cs$|ProjectVersion\.txt$/.test(ref));
  // New native source is expected after VL-001. Preserve its inventory separately;
  // this historical audit cannot qualify it as gameplay or Windows evidence.
  const nativeAdditions=[];
  for(const ref of nativeSources)nativeAdditions.push({ref,sha256:sha256(await readFile(ref)),qualification:'NOT_PROVIDED_BY_PRESERVATION_AUDIT'});
  const addendum=await json('docs/execution/desktop-first/LEGACY-EVIDENCE-ADDENDUM.json');assert.equal(addendum.legacyLedgerRecordsUnchanged,75);assert.equal(addendum.record.acceptance_met,false);
  const audit=await json('docs/execution/desktop-first/N06-04-LOD-LEASE-CHECKPOINT.json');
  assert.equal(audit.sourceRevision,index.sourceRevision);assert.equal(audit.actualOutcomes.workload.result,'OBSERVED_SYNTHETIC_LIMITS_EXCEEDED');
  let privateIndexAvailable=true;
  try {assert.equal(sha256(await readFile(audit.rawIndex.ref)),audit.rawIndex.sha256);}catch(error){if(error.code!=='ENOENT')throw error;privateIndexAvailable=false;}
  const {state}=await schedulerStore().load();
  return {result:'PASS',scope:'SOURCE_LEDGER_HANDOFF_NOT_GAMEPLAY_OR_RELEASE_ACCEPTANCE',sourceRevision:index.sourceRevision,observedHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),legacy:{files:index.files.length,vnext:counts(vnext),lodge:counts(lodge),arena:counts(arena),vnextRecords:75,newN06Addendum:1,unchangedLedgerBytes:true},ownerInputFiles:input.files.length,sql,sources,roomConstructors,nativeSources,nativeAdditions,privateIndexAvailable,planRoot,liveCounts:counts(state),limitations:['Historical statuses are preserved claims, not recertified source behavior.','Current source authority/config regressions are separate commands in the VL-001 handoff.','Preservation does not qualify new Rust/Unity behavior, Windows GPU/runner/license/signing or public deployment.','Two known historical auxiliary Lounge HTML losses remain recorded;private local artifacts are not an off-host archive.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await inspectAdoption(),null,2));
