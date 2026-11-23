import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  MAX_NEW_BINARY_BYTES,
  evaluateOversizedAddedFiles,
  validateBinaryHygienePolicy,
} from '../../scripts/verify-binary-hygiene.mjs';

const roots=[
  'assets/characters/icarus/',
  'integrations/legacy-snapshots/',
  'specs/pet-arena/references/',
  'apps/unity-client/Assets/VirtualLife/ArtStudies/',
];
const allowlistPath='config/binary-hygiene-allowlist.json';
const migrationPath='assets/manifests/legacy-migration-plan.json';
const verifier=fileURLToPath(new URL('../../scripts/verify-binary-hygiene.mjs',import.meta.url));

const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

test('legacy migration inventory covers every audited PNG, GLB and FBX with immutable destination metadata',async()=>{
  const plan=JSON.parse(await readFile(migrationPath,'utf8'));
  const policy=validateBinaryHygienePolicy(JSON.parse(await readFile(allowlistPath,'utf8')));
  assert.equal(plan.schemaVersion,1);
  assert.equal(plan.kind,'legacy-binary-s3-migration');
  assert.equal(plan.status,'QUEUED_CREDENTIALS_REQUIRED');
  assert.equal(plan.destination,'S3_TIGRIS_PRIVATE');
  assert.deepEqual([...plan.roots].sort(),[...roots].sort());
  assert.deepEqual(plan.allowedExtensions,['.blend','.fbx','.glb','.mp4','.tar','.png']);
  const expected=git('.',['ls-files','-z','--',...roots]).split('\0')
    .filter(file=>/\.(png|glb|fbx|blend|mp4|tar)$/i.test(file)).sort();
  assert.deepEqual(plan.files.map(row=>row.path).sort(),expected);
  assert.equal(new Set(plan.files.map(row=>row.s3Key)).size,plan.files.length);
  for(const row of plan.files){
    const bytes=await readFile(row.path);
    assert.equal(row.sizeBytes,(await stat(row.path)).size);
    assert.equal(row.sha256,sha256(bytes));
    assert.equal(row.s3Key,`assets/legacy/v1/${row.sha256}/${path.basename(row.path)}`);
    assert.equal(row.status,'QUEUED');
    assert.equal(row.migrationWave,1);
    const extension=path.extname(row.path);
    assert.equal(row.contentType,{
      '.png':'image/png',
      '.glb':'model/gltf-binary',
      '.fbx':'application/vnd.autodesk.fbx',
      '.blend':'application/x-blender',
      '.mp4':'video/mp4',
      '.tar':'application/x-tar',
    }[extension]);
    assert.equal(row.class,{
      '.png':'PNG_IMAGE',
      '.glb':'GLTF_BINARY',
      '.fbx':'FBX_BINARY',
      '.blend':'BLEND_BINARY',
      '.mp4':'MP4_VIDEO',
      '.tar':'TAR_ARCHIVE',
    }[extension]);
  }
  assert.deepEqual(
    policy.legacy,
    plan.files.filter(row=>row.sizeBytes>MAX_NEW_BINARY_BYTES).map(({path,sha256})=>({path,sha256})),
  );
});

test('ignore policy covers heavy media and local synchronized folders while leaving manifests trackable',()=>{
  for(const file of [
    'new.vrm','new.glb','new.fbx','new.blend','new.wav','new.mp4','new.zip',
    '.cache/assets/new.glb','assets/local/new.glb','assets/synced/new.glb','assets/downloads/new.glb',
  ])assert.doesNotThrow(()=>git('.',['check-ignore','--no-index','-q','--',file]),file+' must be ignored');
  assert.throws(()=>git('.',['check-ignore','--no-index','-q','--','assets/manifests/example.manifest.json']));
});

test('the gate rejects new large binaries, accepts only exact pinned legacy bytes and uses the committed base delta',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'vlp-binary-hygiene-'));
  const big=Buffer.alloc(MAX_NEW_BINARY_BYTES+1,0x5a);
  const different=Buffer.alloc(MAX_NEW_BINARY_BYTES+2,0x31);
  const allowed='assets/characters/icarus/allowlisted.png';
  const existing='apps/unity-client/Assets/VirtualLife/ArtStudies/existing.png';
  const policy={
    schemaVersion:1,
    maxTrackedBinaryBytes:MAX_NEW_BINARY_BYTES,
    legacy:[{path:allowed,sha256:sha256(big)}],
    androidMipmapIcons:{
      maxBytes:131072,
      pathPrefix:'apps/mobile/android/app/src/main/res/',
      relativePattern:'^mipmap-(?:mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)/ic_launcher(?:_round|_foreground)?\\.png$',
    },
  };
  const runGit=args=>git(root,args);
  const commit=message=>{
    runGit(['add','-A']);
    runGit(['commit','-q','-m',message]);
    return runGit(['rev-parse','HEAD']);
  };
  try{
    await mkdir(path.join(root,'config'),{recursive:true});
    await mkdir(path.dirname(path.join(root,existing)),{recursive:true});
    await writeFile(path.join(root,allowlistPath),JSON.stringify(policy,null,2)+'\n');
    await writeFile(path.join(root,existing),big);
    runGit(['init','-q']);
    runGit(['config','user.email','binary-hygiene@example.invalid']);
    runGit(['config','user.name','Binary Hygiene Test']);
    const base=commit('base');

    await writeFile(path.join(root,'new-large.png'),big);
    commit('add large binary');
    const rejected=spawnSync(process.execPath,[verifier,'--base',base],{cwd:root,encoding:'utf8'});
    assert.equal(rejected.status,1,rejected.stdout+rejected.stderr);
    assert.match(rejected.stderr,/new-large\.png/);

    runGit(['switch','-q','-c','allowlisted',base]);
    await mkdir(path.dirname(path.join(root,allowed)),{recursive:true});
    await writeFile(path.join(root,allowed),big);
    commit('add pinned legacy binary');
    const accepted=spawnSync(process.execPath,[verifier,'--base',base],{cwd:root,encoding:'utf8'});
    assert.equal(accepted.status,0,accepted.stdout+accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).examined,1);

    runGit(['switch','-q','-c','tampered',base]);
    await mkdir(path.dirname(path.join(root,allowed)),{recursive:true});
    await writeFile(path.join(root,allowed),different);
    commit('replace allowlisted bytes');
    const tampered=spawnSync(process.execPath,[verifier,'--base',base],{cwd:root,encoding:'utf8'});
    assert.equal(tampered.status,1,tampered.stdout+tampered.stderr);
    assert.match(tampered.stderr,/content does not match/);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('only add events are bounded and modified pre-existing binaries are outside the new-file gate',()=>{
  const policy={
    schemaVersion:1,
    maxTrackedBinaryBytes:MAX_NEW_BINARY_BYTES,
    legacy:[{path:'assets/characters/icarus/existing.png',sha256:'a'.repeat(64)}],
    androidMipmapIcons:{
      maxBytes:131072,
      pathPrefix:'apps/mobile/android/app/src/main/res/',
      relativePattern:'^mipmap-(?:mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)/ic_launcher(?:_round|_foreground)?\\.png$',
    },
  };
  assert.deepEqual(evaluateOversizedAddedFiles([],policy),[]);
  const rejected=evaluateOversizedAddedFiles(
    [{path:'new.png',sizeBytes:MAX_NEW_BINARY_BYTES+1,sha256:'b'.repeat(64)}],
    {...policy,legacy:[{path:'new.png',sha256:'c'.repeat(64)}]},
  );
  assert.equal(rejected.length,1);
  assert.match(rejected[0].reason,/content does not match/);
  assert.throws(()=>validateBinaryHygienePolicy({...policy,legacy:[{path:'new.png',sha256:'not-a-hash'}]}));
});
