import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('Aurora collision export is tied to maintained Unity geometry and stays default-off',async()=>{
 const manifest=JSON.parse(await readFile('config/aurora-blockout-collision.json','utf8'));
 assert.equal(manifest.schemaVersion,1);assert.equal(manifest.units,'millimeters');
 assert.equal(manifest.developerOnly,true);assert.equal(manifest.nativeMovementEnabled,false);
 const source='apps/unity-client/Assets/VirtualLife/Features/Blockout/Domain/BlockoutGeometry.cs';
 assert.equal(manifest.geometrySourceSha256,createHash('sha256').update(await readFile(source)).digest('hex'),'Re-export after changing geometry');
 for(const [field,path]of [
  ['geometrySourceGuid',source],
  ['sceneAssetGuid','apps/unity-client/Assets/VirtualLife/Scenes/AuroraBlockout.unity'],
  ['materialAssetGuid','apps/unity-client/Assets/VirtualLife/Resources/BlockoutLit.mat']
 ])assert.equal(manifest[field],/^guid: ([a-f0-9]{32})$/m.exec(await readFile(path+'.meta','utf8'))?.[1]);
 assert.equal(manifest.boxes.length,4);assert.equal(new Set(manifest.boxes.map(box=>box.geometryGuid)).size,4);
 for(const box of manifest.boxes){
  assert.match(box.geometryGuid,/^[a-f0-9]{32}$/);
  assert.equal(box.minMm.length,3);assert.equal(box.maxMm.length,3);
  for(let axis=0;axis<3;axis++)assert(Number.isSafeInteger(box.minMm[axis])&&Number.isSafeInteger(box.maxMm[axis])&&box.minMm[axis]<box.maxMm[axis]);
 }
 assert.deepEqual(manifest.allowedCenterMinXZ,[-15500,-15500]);assert.deepEqual(manifest.allowedCenterMaxXZ,[15500,15500]);
 assert.equal(manifest.capsuleRadiusMm,400);assert.equal(manifest.capsuleSkinMm,80);
 assert.deepEqual(manifest.anchors.map(anchor=>anchor.id),['spawn','cafe-approach','arena-approach','terminal-approach']);
 for(const anchor of manifest.anchors){
  const [x,y,z]=anchor.positionMm;assert.equal(y,1100);
  assert(x>=-15500&&x<=15500&&z>=-15500&&z<=15500);
  for(const box of manifest.boxes.filter(box=>!box.walkableSurface)){
   const clearance=manifest.capsuleRadiusMm+manifest.capsuleSkinMm;
   assert(x<box.minMm[0]-clearance||x>box.maxMm[0]+clearance||z<box.minMm[2]-clearance||z>box.maxMm[2]+clearance,'Anchor intersects solid geometry: '+anchor.id);
  }
 }
});
