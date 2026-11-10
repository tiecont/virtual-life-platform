import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyLegacyWireFixture, deriveLegacyWire} from '../../scripts/client-legacy-fixture.mjs';
test('legacy client fixture matches immutable pre-negotiation source rather than current response expectations', async () => {
  const report = await verifyLegacyWireFixture(); assert.equal(report.result, 'PASS'); assert(report.joinKeys.includes('worldVersion'));
  assert.equal(Object.keys(report.sourceHashes).length, 3); assert.throws(() => deriveLegacyWire('HEAD'));
});
