import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {artifactPolicy} from './artifact-policy.mjs';
import {validatePromotionPolicy} from './promotion-bot.mjs';

export function assertArtifactWorkflows(quality, publish, pins) {
  for (const workflow of [quality, publish]) {
    assert(!/pull_request_target|continue-on-error|\|\|\s*true|secrets\.|write-all|paths-ignore:|\[skip ci\]/.test(workflow));
    for (const match of workflow.matchAll(/uses:\s*([^\s#]+)/g)) {
      const [name, revision] = match[1].split('@'); assert(/^[a-f0-9]{40}$/.test(revision ?? '')); assert.equal(revision, pins[name]);
    }
  }
  assert(!/^\s+paths:/m.test(quality), 'Required workflow cannot be path-filtered');
  assert(quality.includes('node scripts/artifact-plan.mjs >> "$GITHUB_OUTPUT"'));
  const imageJob = quality.split('\n  images:')[1]?.split('\n  quality:')[0];
  assert(imageJob?.includes("if: ${{ needs.plan.outputs.images == 'true' }}"));
  assert(imageJob.includes('node scripts/release-bundle.mjs --output artifacts/release-bundle'));
  const hostPackages=imageJob.indexOf('run: pnpm build:packages');
  assert(hostPackages>=0&&hostPackages<imageJob.indexOf('node scripts/release-bundle.mjs'), 'Build host shared contracts before production image smoke drivers');
  assert(imageJob.includes('if: ${{ failure() }}')&&imageJob.includes('artifacts/image-*/smoke/result.json'), 'Preserve bounded failure-stage summaries');
  assert(imageJob.indexOf('name: Preserve image failure summaries')>imageJob.indexOf('node scripts/local-compose-smoke.mjs'), 'Capture failures after all image and Compose checks');
  assert(imageJob.includes('node scripts/local-compose-smoke.mjs --bundle artifacts/release-bundle/bundle.json'), 'Test the shipped local Compose against verified artifacts');
  assert(imageJob.includes('runtime-images-${{ github.sha }}-${{ github.run_attempt }}'));
  assert(publish.startsWith('name: Publish verified artifacts\non:\n  workflow_run:\n    workflows: [Quality]\n    types: [completed]\n    branches: [main]\npermissions:\n  contents: read\n'));
  assert.equal((publish.match(/: write\b/g) ?? []).length, 1);
  assert(publish.includes('    permissions:\n      contents: read\n      actions: read\n      packages: write\n'));
  assert.equal((publish.split('\njobs:\n')[1]?.match(/^ {2}[a-z][a-z-]*:\s*$/gm) ?? []).length, 1, 'Only one privileged publish job expected');
  for (const condition of ["github.event.workflow_run.event == 'push'", "github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.head_branch == 'main'", 'github.event.workflow_run.head_repository.full_name == github.repository', "github.repository == 'tiecont/virtual-life-platform'", "vars.VLP_PUBLISH_ENABLED == 'true'"]) assert(publish.includes(condition));
  assert(publish.includes('ref: ${{ github.event.workflow_run.head_sha }}'));
  assert(publish.includes('persist-credentials: false') && publish.includes('node-version-file: .node-version'));
  const authorization = publish.indexOf('node scripts/release-publish.mjs authorize');
  assert(authorization >= 0 && authorization < publish.indexOf('uses: actions/download-artifact@'));
  assert(publish.includes('run-id: ${{ github.event.workflow_run.id }}') && publish.includes('runtime-images-${{ steps.authorize.outputs.source }}-${{ steps.authorize.outputs.attempt }}'));
  assert(!/docker (?:build|compose)|pnpm install|workflow_dispatch|pull_request:|contents: write|id-token: write|attestations: write/.test(publish));
  assert(publish.includes('node scripts/release-publish.mjs publish artifacts/verified-bundle artifacts/release-candidate ghcr.io/tiecont'));
  assert(publish.includes('docker logout ghcr.io'));
}
export async function verifyArtifactWorkflows() {
  assert.deepEqual((await readdir('.github/workflows')).sort(), ['promote.yml', 'publish.yml', 'quality.yml', 'rust-runtime.yml'], 'Review new workflow trust boundary');
  await artifactPolicy();
  const pins = JSON.parse(await readFile('config/ci-actions.json', 'utf8'));
  assertArtifactWorkflows(await readFile('.github/workflows/quality.yml', 'utf8'), await readFile('.github/workflows/publish.yml', 'utf8'), pins);
  assertPromotionWorkflow(await readFile('.github/workflows/promote.yml', 'utf8'), pins);
  assertRustWorkflow(await readFile('.github/workflows/rust-runtime.yml', 'utf8'),pins);
  validatePromotionPolicy(JSON.parse(await readFile('config/digest-promotion.json', 'utf8')));
}
export function assertRustWorkflow(workflow,pins) {
  assert(!/pull_request_target|secrets\.|continue-on-error|\|\|\s*true|write-all|: write\b|persist-credentials: true|self-hosted|docker push|gh pr merge|kubectl|argocd/.test(workflow),'Rust CI is untrusted read-only build/test only');
  assert(workflow.includes('permissions:\n  contents: read')&&workflow.includes('persist-credentials: false'),'Rust CI must not retain credentials');
  assert.deepEqual([...workflow.matchAll(/^\s*runs-on:\s*(.+)$/gm)].map(row=>row[1]),['ubuntu-24.04'],'Rust foundation uses the declared Ubuntu runner');
  assert.equal((workflow.split('\njobs:\n')[1]?.match(/^ {2}[a-z][a-z-]*:\s*$/gm)??[]).length,1,'Unexpected Rust CI job');
  for(const match of workflow.matchAll(/uses:\s*([^\s#]+)/g)){const [name,revision]=match[1].split('@');assert(/^[a-f0-9]{40}$/.test(revision??'')&&revision===pins[name],'Unpinned Rust action');}
  for(const gate of ['sha256sum --check','--default-toolchain 1.99.1','fmt --all -- --check','check --workspace --all-targets --locked','clippy --workspace --all-targets --locked -- -D warnings','test --workspace --locked','-f apps/game-runtime/Dockerfile','python3 apps/game-runtime/tools/oci-smoke.py vl-runtime-ci',
    'pnpm install --frozen-lockfile','--package vl-protocol --bin native-codegen -- --check','pnpm --filter @virtual-city/native-protocol typecheck','packages/native-protocol/test/wire.test.ts',
    'CARGO_TARGET_DIR: artifacts/rust/target','build --locked --package vl-security --bin durable-check','scripts/runtime-admission-durable-check.mjs',
    'tests/integration/runtime-admission.test.ts','tests/integration/native-game-schema.test.ts','tests/integration/schema-compatibility.test.ts',
    'scripts/native-game-migration-compat.mjs','scripts/runtime-admission-migration-compat.mjs',
    '--package vl-world --example zone-probe','node scripts/prepare-ci-browser.mjs',
    'build --locked --package vl-gateway --example interop',
    'node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs\n',
    'node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay\n',
    'node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena\n',
    'node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena-loss\n',
    'build --locked --package vl-game-runtime',
    'build --locked --package vl-persistence --example orchestration','scripts/native-game-orchestration.mjs'])assert(workflow.includes(gate),'Missing Rust gate '+gate);
}
export function assertPromotionWorkflow(workflow, pins) {
  assert(workflow.startsWith('name: Propose verified digest promotion\non:\n  workflow_dispatch:\n'));
  assert(!/pull_request_target|continue-on-error|\|\|\s*true|write-all|\[skip ci\]|paths-ignore:|skip-token-revoke|persist-credentials: true/.test(workflow));
  assert(!/^\s+(?:push|pull_request|workflow_run|schedule):/m.test(workflow));
  assert(!/^\s+(?:contents|packages|actions|id-token): write\b/m.test(workflow));
  assert(!/docker (?:build|push)|git push|gh pr merge|kubectl|argocd/.test(workflow));
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map(match => match[1]), ['VLP_PROMOTION_APP_PRIVATE_KEY']);
  for (const match of workflow.matchAll(/uses:\s*([^\s#]+)/g)) {const [name, revision] = match[1].split('@'); assert(/^[a-f0-9]{40}$/.test(revision ?? '')); assert.equal(revision, pins[name]);}
  assert.equal((workflow.match(/: write\b/g) ?? []).length, 2);
  assert.equal((workflow.split('\njobs:\n')[1]?.match(/^ {2}[a-z][a-z-]*:\s*$/gm) ?? []).length, 1);
  for (const condition of ["github.repository == 'tiecont/virtual-life-platform'", "github.ref == 'refs/heads/main'", "vars.VLP_PROMOTION_ENABLED == 'true'"]) assert(workflow.includes(condition));
  assert(workflow.includes('    permissions:\n      contents: read\n      actions: read\n      packages: read\n'));
  assert(workflow.includes('ref: ${{ github.sha }}') && workflow.includes('persist-credentials: false') && workflow.includes('fetch-depth: 0') && workflow.includes('node-version-file: .node-version'));
  const authorize = workflow.indexOf('node scripts/promotion-bot.mjs authorize'), download = workflow.indexOf('uses: actions/download-artifact@'), prepare = workflow.indexOf('node scripts/promotion-bot.mjs prepare'), app = workflow.indexOf('uses: actions/create-github-app-token@'), publish = workflow.indexOf('node scripts/promotion-bot.mjs publish');
  assert(authorize >= 0 && authorize < download && download < prepare && prepare < app && app < publish);
  for (const text of ['name: ${{ steps.authorize.outputs.artifact }}', 'run-id: ${{ steps.authorize.outputs.publisher_run }}', 'owner: tiecont', 'repositories: virtual-life-platform', 'permission-contents: write', 'permission-pull-requests: write', 'PROMOTION_APP_TOKEN: ${{ steps.app.outputs.token }}', 'PROMOTION_PROPOSAL_SHA: ${{ steps.prepare.outputs.sha }}', 'docker logout ghcr.io']) assert(workflow.includes(text));
  assert.equal((workflow.match(/if: \$\{\{ steps.prepare.outputs.changed == 'true' \}\}/g) ?? []).length, 2);
  for (const line of workflow.split('\n').filter(line => /^\s+run:/.test(line))) assert(!line.includes('inputs.'));
}
