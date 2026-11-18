import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

// This explicitly supports the static, single-primitive provider source. Reject
// other GLBs rather than dropping skins, node transforms or unknown attributes.
const { values } = parseArgs({ options: { source: { type: 'string' }, output: { type: 'string' } } });
if (!values.source || !values.output) throw new Error('Required: --source INPUT.glb --output OUTPUT.glb');
const input = await readFile(values.source);
if (input.readUInt32LE(0) !== 0x46546c67 || input.readUInt32LE(4) !== 2
  || input.readUInt32LE(8) !== input.length || input.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB2');
const jsonLength = input.readUInt32LE(12);
const data = JSON.parse(input.subarray(20, 20 + jsonLength).toString());
const binaryHeader = 20 + jsonLength;
if (input.readUInt32LE(binaryHeader + 4) !== 0x004e4942) throw new Error('Missing BIN chunk');
const binary = input.subarray(binaryHeader + 8, binaryHeader + 8 + input.readUInt32LE(binaryHeader));
if (data.meshes?.length !== 1 || data.meshes[0].primitives.length !== 1
  || data.nodes?.length !== 1 || data.nodes[0].mesh !== 0 || data.skins || data.animations
  || data.nodes[0].translation || data.nodes[0].rotation || data.nodes[0].scale
  || JSON.stringify(data.nodes[0].matrix) !== JSON.stringify([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])) {
  throw new Error('Expected the identity-transform static Icarus provider mesh');
}
const primitive = data.meshes[0].primitives[0];
if (primitive.mode !== 4 || primitive.targets
  || Object.keys(primitive.attributes).sort().join() !== 'NORMAL,POSITION,TEXCOORD_0') throw new Error('Unsupported primitive');
function accessor(id, componentType, type) {
  const a = data.accessors[id];
  const v = data.bufferViews[a.bufferView];
  if (a.componentType !== componentType || a.type !== type || a.sparse || a.normalized
    || v.buffer !== 0 || v.byteStride) throw new Error('Unsupported accessor layout');
  return { bytes: binary.subarray((v.byteOffset ?? 0) + (a.byteOffset ?? 0)), count: a.count };
}
const p = accessor(primitive.attributes.POSITION, 5126, 'VEC3');
const i = accessor(primitive.indices, 5125, 'SCALAR');
const positions = new Float32Array(p.bytes.buffer, p.bytes.byteOffset, p.count * 3);
const indices = new Uint32Array(i.bytes.buffer, i.bytes.byteOffset, i.count);
const remap = new Int32Array(p.count).fill(-1);
const vertices = [];
const selected = [];
for (let offset = 0; offset < indices.length; offset += 3) {
  const a = indices[offset] * 3, b = indices[offset + 1] * 3, c = indices[offset + 2] * 3;
  const x = (positions[a] + positions[b] + positions[c]) / 3;
  const y = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
  const z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
  // glTF Y-up converts to Blender (x, -z, y).
  if (Math.abs(x) >= .255 || y <= .495 || y >= .865 || z <= -.16) continue;
  // Exclude the peripheral rear wing fragments intersecting this study box.
  if (Math.abs(x) > .18 && y < .72 && z < -.04) continue;
  for (let corner = 0; corner < 3; corner++) {
    const old = indices[offset + corner];
    if (remap[old] === -1) {
      remap[old] = vertices.length;
      vertices.push(old);
    }
    selected.push(remap[old]);
  }
}
if (!selected.length) throw new Error('No focal triangles in source');
const views = [], accessors = [], chunks = [];
let binaryLength = 0;
function add(bytes, extra = {}) {
  const padded = Buffer.alloc((bytes.length + 3) & ~3);
  bytes.copy(padded);
  const id = views.length;
  views.push({ buffer: 0, byteOffset: binaryLength, byteLength: bytes.length, ...extra });
  chunks.push(padded);
  binaryLength += padded.length;
  return id;
}
const attributes = {};
for (const [name, count] of [['POSITION', 3], ['NORMAL', 3], ['TEXCOORD_0', 2]]) {
  const original = accessor(primitive.attributes[name], 5126, `VEC${count}`);
  if (original.count !== p.count) throw new Error('Mismatched attribute count');
  const bytes = Buffer.alloc(vertices.length * count * 4);
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index] * count * 4;
    original.bytes.copy(bytes, index * count * 4, start, start + count * 4);
  }
  attributes[name] = accessors.length;
  const a = { bufferView: add(bytes, { target: 34962 }), componentType: 5126, count: vertices.length, type: `VEC${count}` };
  if (name === 'POSITION') {
    a.min = [Infinity, Infinity, Infinity];
    a.max = [-Infinity, -Infinity, -Infinity];
    for (const vertex of vertices) for (let axis = 0; axis < 3; axis++) {
      a.min[axis] = Math.min(a.min[axis], positions[vertex * 3 + axis]);
      a.max[axis] = Math.max(a.max[axis], positions[vertex * 3 + axis]);
    }
  }
  accessors.push(a);
}
const indexAccessor = accessors.length;
const indexData = Uint32Array.from(selected);
accessors.push({ bufferView: add(Buffer.from(indexData.buffer), { target: 34963 }), componentType: 5125,
  count: selected.length, type: 'SCALAR' });
for (const image of data.images) {
  if (image.uri || image.bufferView === undefined) throw new Error('Expected embedded images');
  const old = data.bufferViews[image.bufferView];
  image.bufferView = add(binary.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength));
}
const report = { productionReady: false, source: path.resolve(values.source),
  sourceSha256: createHash('sha256').update(input).digest('hex'),
  method: 'Exact original GLB triangle subset; byte-preserved position, normal and UV attributes; unchanged embedded images',
  sourceTriangles: indices.length / 3, selectedTriangles: selected.length / 3, selectedVertices: vertices.length,
  limitations: ['Clipped head study, open boundary', 'Dense source exceeds game budget', 'No facial retopology or production acceptance'] };
data.meshes[0].primitives[0] = { ...primitive, attributes, indices: indexAccessor };
data.accessors = accessors;
data.bufferViews = views;
data.buffers = [{ byteLength: binaryLength }];
data.extras = report;
const json = Buffer.from(JSON.stringify(data));
const paddedJson = Buffer.alloc((json.length + 3) & ~3, 0x20);
json.copy(paddedJson);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + paddedJson.length + binaryLength, 8);
header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binaryLength, 0); binHeader.writeUInt32LE(0x004e4942, 4);
await mkdir(path.dirname(values.output), { recursive: true });
await writeFile(values.output, Buffer.concat([header, paddedJson, binHeader, ...chunks]));
await writeFile(`${values.output}.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
