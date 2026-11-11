import assert from 'node:assert/strict';
import test from 'node:test';
import {navigateImagePage} from '../../scripts/image-browser-navigation.mjs';

const changed = () => Error('page.goto: net::ERR_NETWORK_CHANGED at https://localhost:1234/\nCall log:');
test('records one network-change recovery and returns the actual navigation response', async () => {
  const attempts = [], calls = [], response = {status: 200};
  const page = {async goto(path, options) {calls.push({path, options}); if (calls.length === 1) throw changed(); return response;}};
  assert.equal(await navigateImagePage(page, '/identity', attempts), response);
  assert.deepEqual(calls, [{path: '/identity', options: {timeout: 10000}}, {path: '/identity', options: {timeout: 10000}}]);
  assert.deepEqual(attempts, [{path: '/identity', attempt: 1, result: 'ERR_NETWORK_CHANGED'}, {path: '/identity', attempt: 2, result: 'LOADED'}]);
});
test('persistent network change fails at three requests and retains the original error', async () => {
  const attempts = [], error = changed(); let count = 0;
  await assert.rejects(navigateImagePage({async goto() {count++; throw error;}}, '/', attempts), value => value === error);
  assert.equal(count, 3); assert.equal(attempts.length, 3);
});
test('certificate, refused connection, timeout, cancellation and assertion errors fail immediately', async () => {
  for (const message of ['page.goto: net::ERR_CERT_AUTHORITY_INVALID', 'page.goto: net::ERR_CONNECTION_REFUSED', 'page.goto: Timeout 10000ms exceeded', 'page.goto: Target page, context or browser has been closed', 'expected net::ERR_NETWORK_CHANGED but received a failure']) {
    const error = Error(message), attempts = []; let count = 0;
    await assert.rejects(navigateImagePage({async goto() {count++; throw error;}}, '/', attempts), value => value === error);
    assert.equal(count, 1); assert.deepEqual(attempts, []);
  }
});
test('unreviewed paths cannot issue a request and HTTP failures are returned for normal assertions', async () => {
  let count = 0; const response = {status: 503}, page = {async goto() {count++; return response;}};
  await assert.rejects(navigateImagePage(page, '/v1/session/guest', [])); assert.equal(count, 0);
  assert.equal(await navigateImagePage(page, '/', []), response); assert.equal(count, 1);
});
