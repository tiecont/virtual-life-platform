import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// These scene manifests fingerprint code-authored geometry/art. Avatar atlas,
// schematic-city metadata and legal/operator approval are separate checks.
const scenes=['deadline','library','lounge','maid','park','restaurant'];
const mismatches=[];let sources=0,allReleaseApprovalsFalse=true;
for(const scene of scenes){
 const manifest=`apps/portal-web/public/assets/${scene}/provenance.json`,value=JSON.parse(await readFile(manifest,'utf8'));
 assert(value.schemaVersion===1&&typeof value.releaseApproved==='boolean'&&Array.isArray(value.sources)&&value.sources.length>0,'Invalid scene provenance manifest');
 allReleaseApprovalsFalse&&=value.releaseApproved===false;const seen=new Set();
 for(const row of value.sources){
  assert(typeof row.path==='string'&&/^packages\/[a-z0-9-]+\/src\/[A-Za-z0-9./-]+\.tsx?$/.test(row.path)&&!row.path.split('/').some(part=>part==='.'||part==='..')&&!seen.has(row.path)&&/^[a-f0-9]{64}$/.test(row.sha256),'Invalid scene source fingerprint');
  seen.add(row.path);sources++;const actual=createHash('sha256').update(await readFile(row.path)).digest('hex');
  if(actual!==row.sha256)mismatches.push({manifest,source:row.path});
 }
}
console.log(JSON.stringify({sceneManifests:scenes.length,sourceReferences:sources,allReleaseApprovalsFalse,mismatches,scope:'Code-source fingerprints only;not a media license or public release approval'}));
if(mismatches.length)process.exitCode=1;
