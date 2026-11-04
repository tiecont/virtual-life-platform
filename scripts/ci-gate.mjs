import { ciResult } from './ci-policy.mjs';
let success=false;
try{success=ciResult(JSON.parse(process.env.CI_NEEDS_JSON??''));}catch{ /* Missing/malformed job metadata fails closed. */ }
if(success)console.log('quality passed: core and every browser group succeeded');
else{console.error('quality blocked: core/browser results must both be success');process.exitCode=1;}
