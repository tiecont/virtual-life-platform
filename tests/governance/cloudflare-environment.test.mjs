import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {parseEnv} from 'node:util';

test('local environment uses Docker Redis with Tigris-compatible S3 placeholders', async () => {
  const env = parseEnv(await readFile('.env.example', 'utf8'));
  assert.equal(env.REDIS_URL, 'redis://127.0.0.1:6379/0');
  assert.equal(env.REDIS_PORT, '6379');
  assert.match(env.S3_ENDPOINT, /^https:\/\//u);
  for (const name of [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_BUCKET',
  ]) {
    assert.match(env[name], /^REPLACE_/u);
  }
  assert.equal(env.S3_REGION, 'auto');

  const compose = await readFile('infra/compose/dev.yml', 'utf8');
  assert.match(compose, /^ {2}redis:$/mu);
  assert.match(compose, /127\.0\.0\.1:\$\{REDIS_PORT:-6379\}:6379/u);
  assert.match(compose, /--appendonly", "no"/u);
});

test('production example selects Upstash REST and Cloudflare R2 through placeholders only', async () => {
  const env = parseEnv(await readFile('.env.production.example', 'utf8'));
  assert.equal(env.NODE_ENV, 'production');
  assert.match(env.DATABASE_URL, /^postgresql:\/\//u);
  assert.match(env.UPSTASH_REDIS_REST_URL, /^https:\/\//u);
  for (const name of [
    'DATABASE_URL',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
  ]) {
    assert.match(env[name], /REPLACE_/u, `${name} must remain a placeholder`);
  }
  assert.equal(env.S3_REGION, 'auto');
  assert.equal(env.NATIVE_AUTH_ENABLED, '0');
  assert.doesNotMatch(
    Object.values(env).join('\n'),
    /(?:AKIA[0-9A-Z]{16}|tid_[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{20,})/u,
  );
});

test('Cloudflare targets cannot publish, route or embed a live tunnel identity', async () => {
  for (const app of ['portal-web', 'admin-web']) {
    const config = await readFile(`infra/cloudflare/${app}/wrangler.jsonc`, 'utf8');
    assert.match(config, new RegExp(`"name": "aetheria-soulbound-${app}"`, 'u'));
    assert.match(config, /"workers_dev": false/u);
    assert.match(config, /"preview_urls": false/u);
    assert.match(config, new RegExp(`"directory": "\\.\\./\\.\\./\\.\\./artifacts/cloudflare/${app}"`, 'u'));
    assert.doesNotMatch(config, /^\s*"routes?":/mu);
    assert.doesNotMatch(config, /[a-f0-9]{32}\.r2\.cloudflarestorage\.com/u);
  }
  const tunnel = await readFile('infra/cloudflare/cloudflared/config.yml', 'utf8');
  assert.match(tunnel, /^tunnel: REPLACE_WITH_PRIVATE_TUNNEL_UUID$/mu);
  assert.match(tunnel, /credentials-file: \/absolute\/private\//u);
  assert.match(tunnel, /\.example\.invalid$/mu);
  assert.doesNotMatch(tunnel, /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/iu);
});
