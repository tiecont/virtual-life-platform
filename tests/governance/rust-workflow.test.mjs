import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertRustWorkflow} from '../../scripts/verify-artifact-workflows.mjs';

test('Rust foundation CI retains read-only Ubuntu checks without privileged/GPU claims',async()=>{
  const workflow=await readFile('.github/workflows/rust-runtime.yml','utf8'),pins=JSON.parse(await readFile('config/ci-actions.json','utf8'));
  assert.doesNotThrow(()=>assertRustWorkflow(workflow,pins));
  assert.match(workflow,/fetch-depth: 0/,'Pinned archived API compatibility needs Git history');
  for(const extra of ['\n  packages: write','\n  token: $'+'{{ secrets.PRIVATE_TOKEN }}','\n  run: docker push image','\n  runs-on: self-hosted'])assert.throws(()=>assertRustWorkflow(workflow+extra,pins));
  for(const mutation of [
    text=>text.replace('  cancel-in-progress: true','  cancel-in-progress: false'),
    text=>text.replace("CARGO_BUILD_JOBS: '4'","CARGO_BUILD_JOBS: '2'"),
    text=>text.replace('NODE_OPTIONS: --max-old-space-size=12288','NODE_OPTIONS: --max-old-space-size=4096'),
    text=>text.replace('uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0\n',''),
    text=>text.replace('cache-on-failure: true','cache-on-failure: false'),
    text=>text.replace('uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830\n',''),
    text=>text.replace('          cache: pnpm\n',''),
  ])assert.throws(()=>assertRustWorkflow(mutation(workflow),pins));
  for(const text of ['cargo" test --workspace --locked','sha256sum --check','python3 apps/game-runtime/tools/oci-smoke.py aetheria-runtime-ci',
    'CARGO_TARGET_DIR: artifacts/rust/target','build --locked --package aetheria-security --bin durable-check','scripts/runtime-admission-durable-check.mjs',
    'tests/integration/runtime-admission.test.ts','scripts/native-game-migration-compat.mjs','scripts/runtime-admission-migration-compat.mjs',
    '--package aetheria-world --example zone-probe','node scripts/prepare-ci-browser.mjs',
    'build --locked --package aetheria-gateway --example interop','scripts/native-wss-interop.mjs',
    'build --locked --package aetheria-game-runtime','scripts/native-wss-interop.mjs --runtime-gameplay',
    'build --locked --package aetheria-persistence --example orchestration','scripts/native-game-orchestration.mjs'])assert.throws(()=>assertRustWorkflow(workflow.replaceAll(text,'removed required gate'),pins));
  const foundation='node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs\n';
  const runtime='node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay\n';
  const petModes=['--pet-arena','--pet-arena-loss'].map(mode=>'node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs '+mode+'\n');
  for(const command of [foundation,runtime,...petModes])assert.throws(()=>assertRustWorkflow(workflow.replace(command,'removed interop mode\n'),pins));
});
