import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {link, mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {request} from 'node:https';
import {join, resolve} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {parseArgs, parseEnv} from 'node:util';
import {assetTargetFromEnvironment} from './assets-s3.mjs';

const R2_ORIGIN = /^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/;
const HANDOFF_KEY = /^owner-encrypted-handoff\/v1\/[a-z0-9-]{1,64}\/([a-f0-9]{64})\.tar\.zst\.age$/;
const CACHE_CONTROL = 'private, no-store';
const CONTENT_TYPE = 'application/octet-stream';
const MAX_BYTES = 4_900_000_000;
const AGE_HEADER = Buffer.from('age-encryption.org/v1\n', 'ascii');
const EMPTY_SHA256 = createHash('sha256').digest('hex');
const AUTH_FIELDS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];

async function readTarget(envFile) {
  // A dedicated R2 credential file can use active assignments. In the project
  // file, only an explicitly labeled R2 block may provide commented values.
  const source = await readFile(envFile, 'utf8');
  const projectEnv = parseEnv(source);
  if (R2_ORIGIN.test(projectEnv.S3_ENDPOINT ?? '')) return validateTarget(projectEnv);

  const blocks = [];
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!/^\s*#(?!\s*[A-Z_]+=).*\bR2\b/i.test(line)) continue;
    const assignments = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const assignment = lines[cursor].match(/^\s*#\s*(S3_[A-Z_]+\s*=.*)$/);
      if (!assignment) break;
      assignments.push(assignment[1]);
    }
    const env = parseEnv(assignments.join('\n'));
    if (!R2_ORIGIN.test(env.S3_ENDPOINT ?? '')) continue;
    const names = assignments.map(assignment => assignment.split('=')[0].trim());
    assert(names.length === new Set(names).size, 'Duplicate fields in R2 credential block');
    blocks.push(env);
  }
  assert.equal(blocks.length, 1, 'Expected one explicit Cloudflare R2 credential block');
  return validateTarget(blocks[0]);
}

function validateTarget(env) {
  assert(AUTH_FIELDS.every(name => env[name]), 'Incomplete R2 credential block');
  const target = assetTargetFromEnvironment(env);
  assert(R2_ORIGIN.test(target.endpoint) && target.region === 'auto', 'Unsupported Cloudflare R2 target');
  return target;
}

const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

function signedGet(target, key) {
  const url = new URL(`${target.endpoint}/${target.bucket}/${key}`);
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = stamp.slice(0, 8);
  const headers = {host: url.host, 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': stamp};
  const names = Object.keys(headers);
  const canonical = names.map(name => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = ['GET', url.pathname, '', canonical, signedHeaders, EMPTY_SHA256].join('\n');
  const requestSha256 = createHash('sha256').update(canonicalRequest).digest('hex');
  const scope = `${date}/auto/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${target.credentials.secretAccessKey}`, date), 'auto'), 's3'), 'aws4_request');
  const signature = hmac(signingKey, `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${requestSha256}`).toString('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${target.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolveResponse, reject) => {
    const outgoing = request(url, {method: 'GET', headers}, resolveResponse);
    outgoing.setTimeout(90_000, () => outgoing.destroy());
    outgoing.on('error', reject);
    outgoing.end();
  });
}

async function recover({key, envFile, output}) {
  const match = HANDOFF_KEY.exec(key ?? '');
  assert(match, 'Expected a version 1 owner handoff key');
  const expectedHash = match[1];
  const target = await readTarget(envFile);
  const destination = resolve(output);
  const partialDirectory = await mkdtemp(join(destination, '.handoff-partial-'));
  const temporary = join(partialDirectory, 'ciphertext');
  try {
    const response = await signedGet(target, key);
    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error(`R2 GET returned HTTP ${response.statusCode}`);
    }
    const length = Number(response.headers['content-length']);
    const metadataMatches = response.headers['content-type'] === CONTENT_TYPE
      && response.headers['cache-control'] === CACHE_CONTROL
      && Number.isSafeInteger(length) && length > AGE_HEADER.length && length <= MAX_BYTES;
    if (!metadataMatches) {
      response.destroy();
      throw new Error('R2 ciphertext metadata mismatch');
    }
    let bytes = 0;
    let prefix = Buffer.alloc(0);
    const hash = createHash('sha256');
    const validate = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        if (bytes > length) {
          done(new Error('R2 ciphertext length mismatch'));
          return;
        }
        if (prefix.length < AGE_HEADER.length) {
          prefix = Buffer.concat([prefix, chunk.subarray(0, AGE_HEADER.length - prefix.length)]);
        }
        hash.update(chunk);
        done(null, chunk);
      },
    });
    await pipeline(response, validate, createWriteStream(temporary, {mode: 0o600, flags: 'wx'}));
    assert(bytes === length && prefix.equals(AGE_HEADER) && hash.digest('hex') === expectedHash, 'R2 ciphertext hash, length or age header mismatch');
    const path = join(destination, `${expectedHash}.tar.zst.age`);
    await link(temporary, path);
    return {path, bytes, sha256: expectedHash};
  } finally {
    await rm(partialDirectory, {recursive: true, force: true});
  }
}

try {
  const {values} = parseArgs({
    options: {
      key: {type: 'string'},
      output: {type: 'string'},
      'env-file': {type: 'string', default: '.env'},
      help: {type: 'boolean', default: false},
    },
  });
  if (values.help) {
    console.log('pnpm exec node scripts/media/recover-owner-handoff.mjs --key <object-key> --output <directory> [--env-file <R2 credential file>]');
  } else {
    assert(values.output && HANDOFF_KEY.test(values.key ?? ''), 'A version 1 object key and output directory are required');
    await mkdir(values.output, {recursive: true, mode: 0o700});
    const result = await recover({key: values.key, envFile: values['env-file'], output: values.output});
    console.log(JSON.stringify(result));
  }
} catch (error) {
  const safe = /^(?:R2 GET returned HTTP [0-9]{3}|A version 1 object key and output directory are required|Expected (?:a version 1 owner handoff key|one explicit Cloudflare R2 credential block)|Duplicate fields in R2 credential block|Incomplete R2 credential block|Unsupported Cloudflare R2 target|R2 ciphertext (?:metadata mismatch|length mismatch|hash, length or age header mismatch))$/;
  if (error.code === 'EEXIST') console.error('Recovery destination already exists');
  else console.error(safe.test(error.message) ? error.message : 'R2 ciphertext recovery failed');
  process.exitCode = 1;
}
