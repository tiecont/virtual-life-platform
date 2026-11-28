import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyPetAssetBytes} from '../pet-asset-files.mjs';

const componentBytes = new Map([[5121, 1], [5123, 2], [5125, 4], [5126, 4]]);
const componentCounts = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4};
const budgets = {
  Icarus_Wings: {minimum: 10000, canonicalMaximum: 25000},
  Icarus_Bow: {minimum: 3000, canonicalMaximum: 12000},
};

function readGlbChunks(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  let offset = 12;
  let json;
  let binary;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    assert.ok(end <= bytes.length, 'GLB chunk exceeds file length');
    if (type === 0x4e4f534a) {
      assert.equal(json, undefined, 'GLB must contain one JSON chunk');
      json = JSON.parse(bytes.toString('utf8', start, end));
    } else if (type === 0x004e4942) {
      assert.equal(binary, undefined, 'GLB must contain one BIN chunk');
      binary = bytes.subarray(start, end);
    }
    offset = end + ((4 - (length % 4)) % 4);
  }
  assert.ok(json, 'GLB JSON chunk missing');
  assert.ok(binary, 'GLB BIN chunk missing');
  return {json, binary};
}

function readAccessor(document, binary, index) {
  const accessor = document.accessors[index];
  assert.ok(accessor, `Missing accessor ${index}`);
  const view = document.bufferViews[accessor.bufferView];
  assert.ok(view, `Missing bufferView for accessor ${index}`);
  assert.equal(view.buffer, 0, 'Accessors must use the embedded GLB buffer');
  const bytesPerComponent = componentBytes.get(accessor.componentType);
  const components = componentCounts[accessor.type];
  assert.ok(bytesPerComponent && components, `Unsupported accessor ${index}`);
  const stride = view.byteStride ?? bytesPerComponent * components;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  assert.ok(start >= 0 && start + (accessor.count - 1) * stride + bytesPerComponent * components <= binary.length,
    `Accessor ${index} exceeds BIN data`);
  const rows = [];
  for (let row = 0; row < accessor.count; row++) {
    const values = [];
    for (let component = 0; component < components; component++) {
      const at = start + row * stride + component * bytesPerComponent;
      if (accessor.componentType === 5126) values.push(binary.readFloatLE(at));
      else if (accessor.componentType === 5123) values.push(binary.readUInt16LE(at));
      else if (accessor.componentType === 5125) values.push(binary.readUInt32LE(at));
      else values.push(binary.readUInt8(at));
    }
    rows.push(values);
  }
  return rows;
}

function jpegDimensions(bytes) {
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    assert.ok(offset + 2 <= bytes.length, 'Truncated JPEG segment');
    const length = bytes.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= bytes.length, 'Invalid JPEG segment length');
    const isFrame = marker >= 0xc0 && marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      assert.ok(length >= 7, 'Invalid JPEG frame header');
      return {height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5)};
    }
    offset += length;
  }
  throw new Error('JPEG dimensions not found');
}

function bounds(rows) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const row of rows) {
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], row[axis]);
      maximum[axis] = Math.max(maximum[axis], row[axis]);
    }
  }
  return {minimum, maximum};
}

function uvFacts(uvs, indices) {
  let totalTriangleArea = 0;
  let zeroAreaTriangles = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = uvs[indices[index][0]];
    const b = uvs[indices[index + 1][0]];
    const c = uvs[indices[index + 2][0]];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    totalTriangleArea += area;
    if (area <= 1e-12) zeroAreaTriangles++;
  }
  return {totalTriangleArea, zeroAreaTriangles};
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} +/- ${tolerance}`);
}

export function inspectIcarusAccessory(bytes) {
  const {json: document, binary} = readGlbChunks(bytes);
  assert.equal(document.asset?.version, '2.0');
  assert.equal(document.scenes?.length, 1);
  assert.equal(document.nodes?.length, 1);
  assert.equal(document.meshes?.length, 1);
  assert.equal(document.nodes[0].mesh, 0);
  assert.equal(document.materials?.length, 1);
  assert.equal(document.textures?.length, 1);
  assert.equal(document.images?.length, 1);

  const primitive = document.meshes[0].primitives?.length === 1
    ? document.meshes[0].primitives[0] : null;
  assert.ok(primitive, 'Expected one primitive');
  assert.equal(primitive.mode ?? 4, 4);
  assert.equal(primitive.material, 0);
  for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
    assert.ok(Number.isInteger(primitive.attributes?.[attribute]), `Missing ${attribute}`);
  }
  assert.ok(Number.isInteger(primitive.indices), 'Missing triangle indices');

  const positions = readAccessor(document, binary, primitive.attributes.POSITION);
  const normals = readAccessor(document, binary, primitive.attributes.NORMAL);
  const uvs = readAccessor(document, binary, primitive.attributes.TEXCOORD_0);
  const indices = readAccessor(document, binary, primitive.indices);
  assert.equal(normals.length, positions.length);
  assert.equal(uvs.length, positions.length);
  assert.equal(document.accessors[primitive.indices].type, 'SCALAR');
  assert.equal(indices.length % 3, 0);
  assert.ok(indices.every(row => row[0] >= 0 && row[0] < positions.length),
    'Triangle index outside the vertex range');
  assert.ok(positions.flat().every(Number.isFinite), 'Non-finite position');
  assert.ok(normals.flat().every(Number.isFinite), 'Non-finite normal');
  assert.ok(uvs.flat().every(Number.isFinite), 'Non-finite UV');
  assert.ok(uvs.flat().every(value => value >= -1e-6 && value <= 1 + 1e-6), 'UV outside [0,1]');

  const material = document.materials[0];
  assert.ok(material.pbrMetallicRoughness?.baseColorTexture, 'Embedded base-color texture is not assigned');
  assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
  assert.equal(material.normalTexture, undefined);
  assert.equal(material.occlusionTexture, undefined);
  assert.equal(material.emissiveTexture, undefined);
  const image = document.images[0];
  assert.equal(image.uri, undefined);
  assert.equal(image.mimeType, 'image/jpeg');
  const imageView = document.bufferViews[image.bufferView];
  assert.ok(imageView && imageView.buffer === 0, 'Texture is not embedded in the GLB');
  const imageBytes = binary.subarray(imageView.byteOffset ?? 0,
    (imageView.byteOffset ?? 0) + imageView.byteLength);
  const texture = jpegDimensions(imageBytes);

  return {
    nodes: document.nodes.map(node => node.name),
    vertices: positions.length,
    triangles: indices.length / 3,
    materials: document.materials.map(item => item.name),
    textures: [{...texture, mimeType: image.mimeType, embedded: true}],
    uvSets: ['TEXCOORD_0'],
    bounds: bounds(positions),
    uvs: uvFacts(uvs, indices),
  };
}

export function assertIcarusAccessoryContract(asset, facts, waiver) {
  const budget = budgets[asset.name];
  assert.ok(budget, `Unknown accessory ${asset.name}`);
  assert.equal(facts.vertices, asset.vertices, `${asset.name} vertex count changed`);
  assert.equal(facts.triangles, asset.triangles, `${asset.name} triangle count changed`);
  assert.ok(facts.triangles >= budget.minimum,
    `${asset.name} has fewer than ${budget.minimum} triangles`);

  const waived = asset.name === 'Icarus_Wings' &&
    asset.sha256 === waiver?.sha256 &&
    asset.triangles === waiver?.triangles &&
    waiver?.ceilingTriangles === 28000 &&
    facts.triangles <= waiver.ceilingTriangles;
  assert.ok(facts.triangles <= budget.canonicalMaximum || waived,
    `${asset.name} exceeds ${budget.canonicalMaximum} triangles without its exact owner waiver`);
  if (asset.name === 'Icarus_Bow') assert.equal(waived, false, 'Bow cannot use the Wings waiver');

  assert.deepEqual(facts.uvSets, ['TEXCOORD_0']);
  assert.deepEqual(facts.materials, asset.materials);
  assert.equal(facts.textures.length, 1);
  assert.equal(facts.textures[0].width, 4096);
  assert.equal(facts.textures[0].height, 4096);
  assert.equal(facts.textures[0].mimeType, 'image/jpeg');
  assert.equal(facts.textures[0].embedded, true);
  close(facts.uvs.zeroAreaTriangles, asset.uv.zeroAreaTriangles, 0, `${asset.name} zero-area UV triangles`);
  close(facts.uvs.totalTriangleArea, asset.uv.totalTriangleArea, 1e-6, `${asset.name} UV triangle area`);
  assert.ok(facts.uvs.totalTriangleArea > 0 && facts.uvs.totalTriangleArea <= 1.000001,
    `${asset.name} UV triangle area is not a bounded atlas`);
  for (let axis = 0; axis < 3; axis++) {
    close(facts.bounds.minimum[axis], asset.bounds.minimum[axis], 1e-5, `${asset.name} minimum ${axis}`);
    close(facts.bounds.maximum[axis], asset.bounds.maximum[axis], 1e-5, `${asset.name} maximum ${axis}`);
    close((facts.bounds.minimum[axis] + facts.bounds.maximum[axis]) / 2,
      asset.pivot[axis], 1e-5, `${asset.name} pivot ${axis}`);
  }
  return {name: asset.name, triangles: facts.triangles, waiverApplied: waived,
    sha256: asset.sha256, texture: 'embedded 4096x4096 JPEG'};
}

export async function verifyIcarusAccessories(root = process.cwd()) {
  const contract = JSON.parse(await readFile(join(root, 'apps/unity-client/icarus-accessories.json'), 'utf8'));
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.release, 'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC');
  assert.deepEqual(contract.accessories.map(asset => asset.name).sort(), ['Icarus_Bow', 'Icarus_Wings']);
  assert.deepEqual(Object.keys(contract.ownerWaiver).sort(),
    ['asset', 'authorizedAt', 'ceilingTriangles', 'reason', 'scope', 'sha256', 'triangles']);
  assert.equal(contract.ownerWaiver.asset, 'Icarus_Wings');
  assert.equal(contract.ownerWaiver.scope, 'Aetheria Hero/Limited-S Icarus Wings');
  assert.equal(contract.ownerWaiver.ceilingTriangles, 28000);
  const results = [];
  for (const asset of contract.accessories) {
    const path = join(contract.directory, asset.file);
    await verifyPetAssetBytes([{path, sha256: asset.sha256}], root);
    const facts = inspectIcarusAccessory(await readFile(join(root, path)));
    results.push(assertIcarusAccessoryContract(asset, facts, contract.ownerWaiver));
  }
  return {release: contract.release, accessories: results};
}
