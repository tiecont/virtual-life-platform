import {test} from 'node:test';
import assert from 'node:assert/strict';
import {containsCredential} from '../../scripts/inspect-api-image.mjs';

test('runtime scan catches synthetic credential bodies without flagging parser constants or secret field names', () => {
  const header = '-----BEGIN ' + 'PRIVATE KEY-----';
  for (const value of [header + '\n' + 'A'.repeat(64), header + '\\n' + 'A'.repeat(64), 'AKIA' + 'A'.repeat(16), 'ghp_' + 'a'.repeat(36)]) assert.equal(containsCredential(value), true);
  for (const value of [header, 'SESSION_SECRET', 'SAFETY_EVIDENCE_KEY', 'Private key parser; no key data']) assert.equal(containsCredential(value), false);
});
