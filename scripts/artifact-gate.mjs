import {artifactCiResult} from './artifact-policy.mjs';
let passed = false;
try {passed = artifactCiResult(JSON.parse(process.env.CI_NEEDS_JSON ?? ''));} catch { /* Fail closed. */ }
console.log(passed ? 'quality passed: all required jobs and planned image outcome verified' : 'quality blocked: missing/failed/unplanned skipped job');
if (!passed) process.exitCode = 1;
