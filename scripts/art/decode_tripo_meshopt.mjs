// Expand provider buffer views for importers without EXT_meshopt_compression.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [source, output, decoder] = process.argv.slice(2);
const {MeshoptDecoder} = await import(decoder ? pathToFileURL(resolve(decoder)).href : 'meshoptimizer');
await MeshoptDecoder.ready;
const file = await fs.readFile(source);
const length = file.readUInt32LE(12);
const doc = JSON.parse(file.subarray(20, 20 + length));
const bin = file.subarray(28 + length);
const chunks = [];
let offset = 0;
for (const view of doc.bufferViews) {
  const ext = view.extensions?.EXT_meshopt_compression;
  let raw;
  if (ext) {
    if (ext.buffer !== 0 || ext.count * ext.byteStride !== view.byteLength) throw Error('Invalid compressed source');
    raw = Buffer.alloc(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(raw, ext.count, ext.byteStride,
      bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter ?? 'NONE');
    delete view.extensions.EXT_meshopt_compression;
    if (!Object.keys(view.extensions).length) delete view.extensions;
  } else {
    if (view.buffer !== 0) throw Error('Missing embedded buffer');
    raw = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  }
  if (raw.length !== view.byteLength) throw Error('Incomplete buffer view');
  view.buffer = 0;
  view.byteOffset = offset;
  const padding = (4 - raw.length % 4) % 4;
  chunks.push(raw, Buffer.alloc(padding));
  offset += raw.length + padding;
}
doc.buffers = [{byteLength: offset}];
for (const key of ['extensionsUsed', 'extensionsRequired']) {
  if (doc[key]) doc[key] = doc[key].filter(x => x !== 'EXT_meshopt_compression');
  if (doc[key]?.length === 0) delete doc[key];
}
const json = Buffer.from(JSON.stringify(doc));
const metadata = Buffer.concat([json, Buffer.alloc((4-json.length%4)%4, 32)]);
const header = Buffer.alloc(20);
header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28+metadata.length+offset, 8);
header.writeUInt32LE(metadata.length, 12); header.write('JSON', 16);
const binary = Buffer.alloc(8); binary.writeUInt32LE(offset); binary.write('BIN', 4);
await fs.writeFile(output, Buffer.concat([header, metadata, binary, ...chunks]), {flag:'wx'});
