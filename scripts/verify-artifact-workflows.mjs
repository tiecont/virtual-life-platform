import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {artifactPolicy} from './artifact-policy.mjs';

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
  assert.deepEqual((await readdir('.github/workflows')).sort(), ['publish.yml', 'quality.yml'], 'Review new workflow trust boundary');
  await artifactPolicy();
  assertArtifactWorkflows(await readFile('.github/workflows/quality.yml', 'utf8'), await readFile('.github/workflows/publish.yml', 'utf8'), JSON.parse(await readFile('config/ci-actions.json', 'utf8')));
}
