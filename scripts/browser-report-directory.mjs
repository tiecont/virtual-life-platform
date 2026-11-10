import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// HTML reporters clear their output directory,including during --list. A bare
// invocation must never target the report root or another run's evidence.
export function browserReportDirectory(explicit){
 if(explicit===undefined)return 'playwright-report/local/run-'+randomUUID();
 assert(typeof explicit==='string'&&/^playwright-report\/[a-z0-9-]+(?:\/[a-z0-9-]+){0,7}$/.test(explicit),'HTML report output requires an isolated repository-relative directory');
 return explicit;
}
