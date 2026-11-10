import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {artifactPolicy, imageChanges, shaPattern} from './artifact-policy.mjs';

const policy = await artifactPolicy(), event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
assert(['pull_request', 'push'].includes(process.env.GITHUB_EVENT_NAME));
const base = process.env.GITHUB_EVENT_NAME === 'pull_request' ? event.pull_request?.base?.sha : event.before;
const head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
assert(shaPattern.test(head));
// A new branch/unknown base receives full image verification rather than an empty diff.
let files = ['unknown-source'];
if (shaPattern.test(base ?? '') && !/^0{40}$/.test(base)) files = execFileSync('git', ['diff', '--name-only', '-z', base, head], {encoding: 'utf8'}).split('\0').filter(Boolean);
console.log('images=' + (files.length === 0 || imageChanges(files)));
console.log('publish=' + policy.publishEnabled);
