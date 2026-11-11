import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Validate each known native application before excluding it from the Node graph.
export async function readNodeWorkspace(root,path) {
  try {return JSON.parse(await readFile(resolve(root,path,'package.json'),'utf8'));}
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    if(path==='apps/unity-client'){
      const version=await readFile(resolve(root,path,'ProjectSettings/ProjectVersion.txt'),'utf8');
      assert(/^m_EditorVersion: \d+\.\d+\.\d+f\d+$/m.test(version),'Unity application needs exact stable Editor pin');
      const manifest=JSON.parse(await readFile(resolve(root,path,'Packages/manifest.json'),'utf8'));
      assert(Object.keys(manifest.dependencies??{}).length>0,'Unity package manifest required');
      for(const pin of Object.values(manifest.dependencies))assert(/^\d+\.\d+\.\d+$/.test(pin),'Unity packages need exact pins');
      return null;
    }
    if(path!=='apps/game-runtime')throw error;
    const cargo=await readFile(resolve(root,path,'Cargo.toml'),'utf8');
    const workspace=await readFile(resolve(root,'Cargo.toml'),'utf8');
    assert(/^\[package\]$/m.test(cargo)&&/^name\s*=\s*"vl-game-runtime"\s*$/m.test(cargo),'Unknown non-Node application');
    const members=/^members\s*=\s*\[([^\]]*)\]/m.exec(workspace)?.[1];
    assert(/^\[workspace\]$/m.test(workspace)&&members&&[...members.matchAll(/"([^"]+)"/g)].some(row=>row[1]===path),'Rust application missing workspace registration');
    return null;
  }
}
