import assert from 'node:assert/strict';
import test from 'node:test';
import {navigateImagePage} from '../../scripts/image-browser-navigation.mjs';

const changed = () => Error('page.goto: net::ERR_NETWORK_CHANGED at https://localhost:1234/\nCall log:');
function fixture(outcomes) {
  const calls = [], pages = [];
  const context = {async newPage() {
    const id = pages.length;
    calls.push({operation: 'newPage', id});
    const page = {
      closed: false, failed: false,
      context: () => context,
      async close() {calls.push({operation: 'close', id}); this.closed = true;},
      async goto(path, options) {
        assert(!this.closed);
        // Reusing the failed page reproduces the delayed chrome-error navigation.
        if (this.failed) throw Error('Navigation interrupted by chrome-error://chromewebdata/');
        calls.push({operation: 'goto', id, path, options});
        const outcome = outcomes.shift();
        if (outcome instanceof Error) {this.failed = true; throw outcome;}
        return outcome;
      },
    };
    pages.push(page);
    return page;
  }};
  return {context, calls, pages};
}

test('retires a network-error page before retrying in the same context', async () => {
  const attempts = [], response = {status: 200}, f = fixture([changed(), response]);
  const first = await f.context.newPage();
  const result = await navigateImagePage(first, '/identity', attempts);
  assert.equal(result.response, response);
  assert.equal(result.page, f.pages[1]);
  assert.equal(result.page.context(), first.context());
  assert.deepEqual(f.calls, [
    {operation: 'newPage', id: 0},
    {operation: 'goto', id: 0, path: '/identity', options: {timeout: 10000}},
    {operation: 'close', id: 0},
    {operation: 'newPage', id: 1},
    {operation: 'goto', id: 1, path: '/identity', options: {timeout: 10000}},
  ]);
  assert.deepEqual(attempts, [{path: '/identity', attempt: 1, result: 'ERR_NETWORK_CHANGED'}, {path: '/identity', attempt: 2, result: 'LOADED'}]);
});
test('persistent network change fails after three requests and retires every failed page', async () => {
  const attempts = [], error = changed(), f = fixture([error, error, error]);
  await assert.rejects(navigateImagePage(await f.context.newPage(), '/', attempts), value => value === error);
  assert.equal(f.pages.length, 3);
  assert(f.pages.every(page => page.closed));
  assert.equal(f.calls.filter(call => call.operation === 'goto').length, 3);
  assert.equal(attempts.length, 3);
});
test('certificate, refused connection, timeout, cancellation and unrelated navigation errors fail immediately', async () => {
  for (const message of ['page.goto: net::ERR_CERT_AUTHORITY_INVALID', 'page.goto: net::ERR_CONNECTION_REFUSED', 'page.goto: Timeout 10000ms exceeded', 'page.goto: Target page, context or browser has been closed', 'page.goto: Navigation interrupted by chrome-error://chromewebdata/', 'expected net::ERR_NETWORK_CHANGED but received a failure']) {
    const error = Error(message), attempts = [], f = fixture([error]);
    await assert.rejects(navigateImagePage(await f.context.newPage(), '/', attempts), value => value === error);
    assert.equal(f.calls.filter(call => call.operation === 'goto').length, 1);
    assert.deepEqual(attempts, []);
  }
});
test('page retirement or context cancellation cannot be hidden by another request', async () => {
  for (const operation of ['close', 'newPage']) {
    const error = Error('Target closed'), f = fixture([changed()]), page = await f.context.newPage();
    if (operation === 'close') page.close = async () => {throw error;};
    else f.context.newPage = async () => {throw error;};
    await assert.rejects(navigateImagePage(page, '/', []), value => value === error);
    assert.equal(f.calls.filter(call => call.operation === 'goto').length, 1);
  }
});
test('unreviewed paths cannot issue a request and HTTP failures reach the normal assertions', async () => {
  const response = {status: 503}, f = fixture([response]), page = await f.context.newPage();
  await assert.rejects(navigateImagePage(page, '/v1/session/guest', []));
  assert.equal(f.calls.filter(call => call.operation === 'goto').length, 0);
  assert.deepEqual(await navigateImagePage(page, '/', []), {page, response});
});
