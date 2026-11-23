import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import {
  assertIcarusAccessoryContract,
  inspectIcarusAccessory,
  verifyIcarusAccessories,
} from '../../scripts/art/check-icarus-accessories.mjs';

const root = process.cwd();
const contract = JSON.parse(await readFile(join(root, 'apps/unity-client/icarus-accessories.json'), 'utf8'));
const wings = contract.accessories.find(asset => asset.name === 'Icarus_Wings');

test('verified Tripo accessories meet exact hashes, embedded 4K textures and the pinned Wings waiver', async () => {
  const result = await verifyIcarusAccessories(root);
  assert.deepEqual(result.accessories.map(asset => asset.name), ['Icarus_Wings', 'Icarus_Bow']);
  assert.equal(result.accessories[0].triangles, 26133);
  assert.equal(result.accessories[0].waiverApplied, true);
  assert.equal(result.accessories[1].triangles, 10489);
  assert.equal(result.accessories[1].waiverApplied, false);
});

test('the 28K ceiling applies only to the exact owner-waived Wings hash and triangle count', async () => {
  const bytes = await readFile(join(root, contract.directory, wings.file));
  const facts = inspectIcarusAccessory(bytes);
  const alternative = JSON.parse(JSON.stringify(wings));
  alternative.sha256 = '0'.repeat(64);
  assert.throws(() => assertIcarusAccessoryContract(alternative, facts, contract.ownerWaiver),
    /exact owner waiver/);

  const expanded = JSON.parse(JSON.stringify(contract.ownerWaiver));
  expanded.ceilingTriangles = 28001;
  assert.throws(() => assertIcarusAccessoryContract(wings, facts, expanded),
    /exact owner waiver/);
});

test('GLB identity and range validation rejects corrupt bytes', async () => {
  const bytes = await readFile(join(root, contract.directory, wings.file));
  const corrupt = Buffer.from(bytes);
  corrupt[0] = 0;
  assert.throws(() => inspectIcarusAccessory(corrupt), /glTF/);
});
