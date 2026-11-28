import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../../infra/northflank/worker.mjs';

function service(calls, response = new globalThis.Response('ok')) {
  return {
    async fetch(request) {
      calls.push(request);
      return response;
    },
  };
}

test('edge relay fails closed without Access authentication', async () => {
  const calls = [];
  const response = await worker.fetch(
    new globalThis.Request('https://portal.example.invalid/'),
    {SITE: 'portal', FRONTEND: service(calls), API: service(calls)},
    {},
  );
  assert.equal(response.status, 403);
  assert.equal(await response.text(), 'Access required');
  assert.equal(calls.length, 0);
});

test('edge relay accepts an Access-inserted identity header and strips access credentials', async () => {
  const calls = [];
  const response = await worker.fetch(
    new globalThis.Request('https://portal.example.invalid/', {
      headers: {
        'cf-access-authenticated-user-email': 'owner@example.invalid',
        'cf-access-jwt-assertion': 'signed',
        cookie: 'CF_Authorization=private; app=session',
      },
    }),
    {SITE: 'portal', FRONTEND: service(calls), API: service(calls)},
    {},
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get('cf-access-authenticated-user-email'), null);
  assert.equal(calls[0].headers.get('cf-access-jwt-assertion'), null);
  assert.equal(calls[0].headers.get('cookie'), 'app=session');
});

test('edge relay sends API and socket paths to the API VPC binding', async () => {
  for (const path of ['/v1/me', '/socket.io/?EIO=4']) {
    const frontend = [], api = [];
    const response = await worker.fetch(
      new globalThis.Request('https://portal.example.invalid' + path, {
        headers: {'cf-access-authenticated-user-email': 'owner@example.invalid'},
      }),
      {SITE: 'portal', FRONTEND: service(frontend), API: service(api)},
      {},
    );
    assert.equal(response.status, 200);
    assert.equal(frontend.length, 0);
    assert.equal(api.length, 1);
  }
});

test('edge relay returns a bounded error when a VPC origin fails', async () => {
  const failing = {fetch: async () => { throw new Error('private socket address'); }};
  const response = await worker.fetch(
    new globalThis.Request('https://portal.example.invalid/', {
      headers: {'cf-access-authenticated-user-email': 'owner@example.invalid'},
    }),
    {SITE: 'portal', FRONTEND: failing, API: service([])},
    {},
  );
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'Private origin unavailable');
});
