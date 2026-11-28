import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadManifests,sha256} from './media/assets-manifest.mjs';

const contentTypes={
  '.blend':'application/x-blender',
  '.fbx':'application/vnd.autodesk.fbx',
  '.glb':'model/gltf-binary',
  '.mp4':'video/mp4',
  '.png':'image/png',
  '.tar':'application/x-tar',
  '.vrm':'model/gltf-binary',
};

export function validateLegacyAssetManifests(plan,entries){
  assert.equal(plan.schemaVersion,1);
  assert.equal(plan.kind,'legacy-binary-s3-migration');
  const matched=new Set();
  for(const file of plan.files){
    assert.equal(file.contentType,contentTypes[path.extname(file.path).toLowerCase()],`Unsupported legacy type for ${file.path}`);
    const candidates=entries.filter(entry=>
      entry.manifest.sha256===file.sha256
      &&entry.manifest.sizeBytes===file.sizeBytes
      &&entry.manifest.contentType===file.contentType
    );
    assert.equal(candidates.length,1,`Expected exactly one manifest for ${file.path}`);
    const {manifest}=candidates[0];
    assert.equal(path.posix.basename(manifest.s3Key),path.basename(file.path));
    assert.equal(path.posix.basename(manifest.localCachePath),path.basename(file.path));
    assert.equal(file.status,'QUEUED');
    assert(!matched.has(manifest.id),`Manifest reused for multiple source files: ${manifest.id}`);
    matched.add(manifest.id);
  }
  return {files:plan.files.length,manifests:entries.length,matched:[...matched].sort()};
}

export async function verifyLegacyAssetManifests(root=process.cwd()){
  const plan=JSON.parse(await readFile(path.join(root,'assets/manifests/legacy-migration-plan.json'),'utf8'));
  const entries=await loadManifests(root);
  const result=validateLegacyAssetManifests(plan,entries);
  let bytes=0;
  for(const file of plan.files){
    const source=await readFile(path.join(root,file.path));
    assert.equal(source.length,file.sizeBytes,`Source size mismatch: ${file.path}`);
    assert.equal(sha256(source),file.sha256,`Source SHA-256 mismatch: ${file.path}`);
    bytes+=source.length;
  }
  return {...result,sourceBytes:bytes,network:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await verifyLegacyAssetManifests()));}
  catch(error){console.error('Legacy asset manifest validation failed: '+error.message);process.exitCode=1;}
}
