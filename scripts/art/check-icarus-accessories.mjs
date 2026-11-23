import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyPetAssetBytes} from '../pet-asset-files.mjs';

export async function verifyIcarusAccessories(root = process.cwd()) {
  const contract = JSON.parse(await readFile(join(root, 'apps/unity-client/icarus-accessories.json'), 'utf8'));
  assert.deepEqual(contract.accessories.map(asset => asset.name).sort(), ['Icarus_Bow', 'Icarus_Wings']);
  const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
  const results = [];
  for (const asset of contract.accessories) {
    const stem = join(contract.directory, asset.name);
    const glb = `${stem}.glb`;
    const roles = ['base_color', 'metallic_roughness', 'normal'];
    assert.deepEqual(Object.keys(asset.maps).sort(), roles);
    const maps = roles.map(role => ({
      path: `${stem}_textures/${asset.name}_${role}.png`,
      sha256: asset.maps[role],
    }));
    await verifyPetAssetBytes([{path: glb, sha256: asset.sha256}, ...maps], root);
    const bytes = await readFile(join(root, glb));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
    const scene = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    let triangles = 0;
    for (const mesh of scene.meshes) {
      for (const primitive of mesh.primitives) {
        assert.equal(primitive.mode ?? 4, 4, 'Expected glTF TRIANGLES');
        const indices = scene.accessors[primitive.indices];
        assert.equal(indices.type, 'SCALAR');
        assert.equal(indices.count % 3, 0);
        triangles += indices.count / 3;
      }
    }
    assert.equal(triangles, asset.triangles, glb);
    for (const map of maps) {
      const png = await readFile(join(root, map.path));
      assert.deepEqual(png.subarray(0, 8), pngSignature);
      assert.equal(png.toString('ascii', 12, 16), 'IHDR');
      assert.equal(png.readUInt32BE(16), 2048, map.path);
      assert.equal(png.readUInt32BE(20), 2048, map.path);
    }
    results.push({name: asset.name, triangles, mapsVerified: maps.length, sha256: asset.sha256});
  }
  return results;
}
