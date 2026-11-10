import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// An explicit native exception, not a blanket ignore for missing Node manifests.
export async function readNodeWorkspace(root,path) {
  try {return JSON.parse(await readFile(resolve(root,path,'package.json'),'utf8'));}
  catch(error) {
    if(error.code!=='ENOENT'||path!=='apps/game-runtime')throw error;
    const cargo=await readFile(resolve(root,path,'Cargo.toml'),'utf8');
    const workspace=await readFile(resolve(root,'Cargo.toml'),'utf8');
    assert(/^\[package\]$/m.test(cargo)&&/^name\s*=\s*"vl-game-runtime"\s*$/m.test(cargo),'Unknown non-Node application');
    const members=/^members\s*=\s*\[([^\]]*)\]/m.exec(workspace)?.[1];
    assert(/^\[workspace\]$/m.test(workspace)&&members&&[...members.matchAll(/"([^"]+)"/g)].some(row=>row[1]===path),'Rust application missing workspace registration');
    return null;
  }
}
