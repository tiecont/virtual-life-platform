import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,lstatSync} from 'node:fs';
import path from 'node:path';

const localScope='artifacts/evidence/local/'+randomUUID();
// New measurements must never overwrite pinned historical observations.
export function evidenceOutput(historicalPath){
 const prefix='docs/agent/evidence',scope=process.env.BROWSER_REPORT_SCOPE;
 assert(!scope||/^ci\/[a-z][a-z0-9-]{0,39}\/[a-z][a-z0-9-]{0,79}$/.test(scope),'Invalid evidence output scope');
 assert(historicalPath===prefix||historicalPath.startsWith(prefix+'/'),'Expected historical evidence output path');
 const suffix=historicalPath.slice(prefix.length);
 assert(!suffix||/^\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(suffix)&&!suffix.slice(1).split('/').some(part=>!part||part==='.'||part==='..'),'Invalid evidence output suffix');
 const target=(scope?'artifacts/'+scope+'/evidence':localScope)+suffix;
 // Make parents for direct screenshot/file producers as well as directory users.
 let current=process.cwd();
 for(const part of path.dirname(target).split('/')){current=path.join(current,part);try{mkdirSync(current,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}assert(lstatSync(current).isDirectory()&&!lstatSync(current).isSymbolicLink(),'Evidence output symlink refused');}
 return target;
}
