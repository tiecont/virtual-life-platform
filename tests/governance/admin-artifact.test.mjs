import {test} from 'node:test';
import assert from 'node:assert/strict';
import {releaseTargets,releasePayloadFiles} from '../../scripts/artifact-targets.mjs';
import {validateManifest} from '../../scripts/release-manifest.mjs';
test('release schema1 retains the API/web pair and schema2 requires the exact admin trio',()=>{
 assert.deepEqual(releaseTargets(1),['api','web']);assert.deepEqual(releaseTargets(2),['api','web','admin']);assert.equal(releasePayloadFiles(1).length,7);assert.equal(releasePayloadFiles(2).length,9);for(const value of [0,3,'2',null])assert.throws(()=>releaseTargets(value));
});
test('admin release source/digest fields are mandatory, strict and separate from unchanged legacy manifest shape',()=>{
 const sha='a'.repeat(40),digest='b'.repeat(64),descriptor=file=>({file,sha256:digest});
 const manifest={schemaVersion:2,kind:'vlp-release-candidate',source:{repository:'tiecont/virtual-life-platform',revision:sha},quality:{runId:123,runAttempt:1,workflow:'.github/workflows/quality.yml',event:'push',branch:'main'},artifacts:{},compatibility:{protocol:{minimum:1,current:1,maximum:1},schema:{metadataVersion:1,minimumMigrations:39,maximumMigrations:39,manifestSha256:digest,policySha256:digest},assets:{manifestSha256:digest}},promotion:{autoMerge:false,productionAutoPromotion:false,ownerRequired:true,publicRelease:false},evidence:{quality:descriptor('quality-proof.json'),imageChecks:descriptor('image-checks.json')},vulnerabilities:{status:'NOT_RUN',promotionRequiresReview:true}};
 for(const target of releaseTargets(2))manifest.artifacts[target]={image:'ghcr.io/tiecont/vlp-'+target+'@sha256:'+digest,sourceRevision:sha,localImageId:'sha256:'+digest,sbom:descriptor(target+'-sbom.cdx.json'),provenance:descriptor(target+'-provenance.json')};
 assert.equal(validateManifest(manifest),manifest);
 for(const mutate of [m=>delete m.artifacts.admin,m=>m.artifacts.admin.sourceRevision='c'.repeat(40),m=>m.artifacts.admin.image='ghcr.io/tiecont/vlp-admin:latest',m=>m.schemaVersion=1,m=>m.artifacts.extra=m.artifacts.admin]){const value=globalThis.structuredClone(manifest);mutate(value);assert.throws(()=>validateManifest(value));}
 const legacy=globalThis.structuredClone(manifest);legacy.schemaVersion=1;delete legacy.artifacts.admin;for(const target of releaseTargets(1))delete legacy.artifacts[target].sourceRevision;assert.equal(validateManifest(legacy),legacy);
});
