import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertRustWorkflow} from '../../scripts/verify-artifact-workflows.mjs';

test('Rust foundation CI retains read-only Ubuntu checks without privileged/GPU claims',async()=>{
  const workflow=await readFile('.github/workflows/rust-runtime.yml','utf8'),pins=JSON.parse(await readFile('config/ci-actions.json','utf8'));
  assert.doesNotThrow(()=>assertRustWorkflow(workflow,pins));
  assert.match(workflow,/fetch-depth: 0/,'Pinned archived API compatibility needs Git history');
  for(const extra of ['\n  packages: write','\n  token: $'+'{{ secrets.PRIVATE_TOKEN }}','\n  run: docker push image','\n  runs-on: self-hosted'])assert.throws(()=>assertRustWorkflow(workflow+extra,pins));
  for(const text of ['cargo" test --workspace --locked','sha256sum --check','python3 apps/game-runtime/tools/oci-smoke.py vl-runtime-ci',
    'CARGO_TARGET_DIR: artifacts/rust/target','build --locked --package vl-security --bin durable-check','scripts/runtime-admission-durable-check.mjs',
    'tests/integration/runtime-admission.test.ts','scripts/native-game-migration-compat.mjs','scripts/runtime-admission-migration-compat.mjs',
    '--package vl-world --example zone-probe','playwright install --with-deps chromium',
    'build --locked --package vl-gateway --example interop','scripts/native-wss-interop.mjs',
    'build --locked --package vl-persistence --example orchestration','scripts/native-game-orchestration.mjs'])assert.throws(()=>assertRustWorkflow(workflow.replace(text,'removed required gate'),pins));
});
