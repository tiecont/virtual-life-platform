import { browserPlan } from './ci-policy.mjs';
try{console.log('groups='+JSON.stringify(Object.keys((await browserPlan()).groups)));}
catch{console.error('Browser plan is invalid or does not cover every spec');process.exitCode=1;}
