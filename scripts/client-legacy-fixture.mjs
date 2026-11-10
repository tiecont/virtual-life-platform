import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
export function deriveLegacyWire(revision) {
  assert(/^[a-f0-9]{40}$/.test(revision), 'Full pinned legacy source required');
  execFileSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], {stdio: 'pipe'});
  const paths = ['apps/portal-web/app/components/WorldRoomPanel.tsx', 'packages/contracts/src/index.ts', 'packages/contracts/src/rooms.ts'], sourceHashes = {}, objects = {};
  for (const path of paths) {
    const bytes = execFileSync('git', ['show', revision + ':' + path]); sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
    const source = ts.createSourceFile(path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS), lists = [];
    function walk(node) {
      if (ts.isObjectLiteralExpression(node) && node.properties.every(property => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name))) lists.push(node.properties.map(property => property.name.text).sort());
      ts.forEachChild(node, walk);
    }
    walk(source); objects[path] = lists;
  }
  const one = (lists, fields) => {const matches = lists.filter(keys => fields.every(field => keys.includes(field))); assert.equal(matches.length, 1, 'Ambiguous legacy wire shape'); return matches[0];};
  const handshakeKeys = one(objects[paths[0]], ['csrfToken', 'schemaVersion']); assert.deepEqual(handshakeKeys, one(objects[paths[1]], ['csrfToken', 'schemaVersion']));
  return {handshakeKeys, joinKeys: one(objects[paths[0]], ['motionVersion', 'worldSlug', 'worldVersion', 'sceneVersion', 'requestId']), snapshotKeys: one(objects[paths[2]], ['membershipId', 'occupancy', 'participants', 'seats', 'self']), sourceHashes};
}
export async function verifyLegacyWireFixture() {
  const fixture = JSON.parse(await readFile('tests/fixtures/client-legacy-wire.json', 'utf8')), derived = deriveLegacyWire(fixture.sourceRevision);
  for (const key of ['handshakeKeys', 'joinKeys', 'snapshotKeys', 'sourceHashes']) assert.deepEqual(fixture[key], derived[key], 'Pinned legacy fixture mismatch: ' + key);
  return {result: 'PASS', sourceRevision: fixture.sourceRevision, scope: fixture.scope, ...derived};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyLegacyWireFixture(), null, 2));
