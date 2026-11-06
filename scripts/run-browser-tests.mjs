import { spawn } from 'node:child_process';
import { readdir,mkdir,writeFile } from 'node:fs/promises';

// Full runs isolate each spec and device in its own API/DB lifetime. Otherwise
// unrelated loopback scenarios consume real guest/catalog/handshake IP budgets.
// Explicit filtered invocations keep their requested batch together.
const filters = process.argv.slice(2);
const reportPrefix=process.env.BROWSER_REPORT_SCOPE;
if(reportPrefix&&!/^ci\/[a-z][a-z0-9-]{0,39}\/[a-z][a-z0-9-]{0,79}$/.test(reportPrefix))throw Error('Invalid browser report scope');
const batches=filters.length?[filters]:(await readdir('tests/e2e')).filter(name=>name.endsWith('.spec.ts')).sort().map(name=>['tests/e2e/'+name]);
const legacy=batches.some(batch=>batch.some(value=>value.endsWith('/deadline-identity.spec.ts')));
if(legacy){const code=await new Promise((ok,no)=>{const child=spawn(process.execPath,['scripts/prepare-deadline-baseline.mjs'],{stdio:'inherit'});child.once('error',no);child.once('exit',code=>ok(code??1));});if(code!==0)throw Error('Selected Deadline baseline is not prepared');}
const results=[];
for (const project of ['desktop', 'mobile']) {
 for(const [index,batch] of batches.entries()){
  const baseScope=filters.length?project:`${project}/${batch[0].split('/').at(-1).replace('.spec.ts','')}`,scope=reportPrefix?reportPrefix+'/'+baseScope:baseScope;
  const code = await new Promise((resolve, reject) => {
    const adminConfig=batch.some(value=>value.endsWith('/admin.spec.ts'))?['--config','playwright.admin.config.ts']:[];
    const child = spawn(process.execPath, ['scripts/with-test-db.mjs', 'pnpm', 'exec', 'playwright', 'test', ...adminConfig, '--project', project, '--output', `test-results/${scope}`, ...batch], {
      stdio: 'inherit', env: { ...process.env, BROWSER_CITY_JOURNEY:batch.some(value=>value.endsWith('/travel.spec.ts'))?'1':'0',BROWSER_MAID_WORLD:batch.some(value=>value.endsWith('/maid.spec.ts')||value.endsWith('/maid-safety.spec.ts')||value.endsWith('/maid-travel.spec.ts')||value.endsWith('/maid-acceptance.spec.ts'))?'1':'0', BROWSER_DEADLINE_WORLD:batch.some(value=>(value.endsWith('/deadline.spec.ts')||value.endsWith('/deadline-safety.spec.ts')||value.endsWith('/deadline-acceptance.spec.ts')))?'1':'0', BROWSER_DEADLINE_IDENTITY:batch.some(value=>value.endsWith('/deadline-identity.spec.ts'))?'1':'0', BROWSER_PARK_WORLD:batch.some(value=>value.endsWith('/park.spec.ts')||value.endsWith('/park-safety.spec.ts'))?'1':'0', BROWSER_LIBRARY_WORLD:batch.some(value=>value.endsWith('/library.spec.ts'))?'1':'0', BROWSER_RESTAURANT_WORLD:batch.some(value=>value.endsWith('/restaurant.spec.ts'))?'1':'0', BROWSER_LOUNGE_WORLD:batch.some(value=>value.endsWith('/lounge.spec.ts'))?'1':'0',BROWSER_DATING_PROFILE:batch.some(value=>value.endsWith('/dating-profile.spec.ts')||value.endsWith('/dating-continuation.spec.ts'))?'1':'0', PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${scope}` },
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  results.push({project,batch:index+1,filters:batch,exitCode:code});await mkdir('artifacts',{recursive:true});await writeFile('artifacts/browser-batches.json',JSON.stringify(results,null,2)+'\n');
  if (code !== 0) { process.exitCode = code; break; }
 }
 if(process.exitCode)break;
}
