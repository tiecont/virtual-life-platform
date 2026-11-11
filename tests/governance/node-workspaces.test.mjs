import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readNodeWorkspace} from '../../scripts/node-workspaces.mjs';

test('mixed Rust/Node discovery accepts only the registered native exception and preserves missing/corrupt Node failures',async t=>{
  const root=await mkdtemp(join(tmpdir(),'vl-mixed-workspaces-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const ref of ['apps/game-runtime','apps/web','apps/unknown'])await mkdir(join(root,ref),{recursive:true});
  await writeFile(join(root,'apps/web/package.json'),JSON.stringify({name:'web'}));
  assert.equal((await readNodeWorkspace(root,'apps/web')).name,'web');
  await assert.rejects(readNodeWorkspace(root,'apps/unknown'),{code:'ENOENT'});
  await writeFile(join(root,'apps/web/package.json'),'{');await assert.rejects(readNodeWorkspace(root,'apps/web'),SyntaxError);
  await writeFile(join(root,'apps/game-runtime/Cargo.toml'),'[package]\nname = "vl-game-runtime"\n');
  await writeFile(join(root,'Cargo.toml'),'[workspace]\nmembers = []\n');
  await assert.rejects(readNodeWorkspace(root,'apps/game-runtime'),/registration/);
  await writeFile(join(root,'Cargo.toml'),'[workspace]\nmembers = ["apps/game-runtime"]\n');
  assert.equal(await readNodeWorkspace(root,'apps/game-runtime'),null);
  await writeFile(join(root,'apps/game-runtime/Cargo.toml'),'[package]\nname = "unexpected"\n');
  await assert.rejects(readNodeWorkspace(root,'apps/game-runtime'),/Unknown/);
});

test('Unity has an explicit pinned native project boundary',async()=>{
  const root=await mkdtemp(join(tmpdir(),'unity-workspace-'));
  try{
    const project=join(root,'apps/unity-client');
    await mkdir(join(project,'ProjectSettings'),{recursive:true});
    await mkdir(join(project,'Packages'),{recursive:true});
    await writeFile(join(project,'ProjectSettings/ProjectVersion.txt'),'m_EditorVersion: 6000.3.14f1\n');
    await writeFile(join(project,'Packages/manifest.json'),JSON.stringify({dependencies:{'com.unity.render-pipelines.universal':'17.3.0'}}));
    assert.equal(await readNodeWorkspace(root,'apps/unity-client'),null);
    await writeFile(join(project,'Packages/manifest.json'),JSON.stringify({dependencies:{test:'latest'}}));
    await assert.rejects(readNodeWorkspace(root,'apps/unity-client'),/exact pins/);
  }finally{await rm(root,{recursive:true,force:true});}
});
