import { spawn } from 'node:child_process';
import { readdir,mkdir,writeFile } from 'node:fs/promises';

// Full runs isolate each spec and device in its own API/DB lifetime. Otherwise
// unrelated loopback scenarios consume real guest/catalog/handshake IP budgets.
// Explicit filtered invocations keep their requested batch together.
const filters = process.argv.slice(2);
const batches=filters.length?[filters]:(await readdir('tests/e2e')).filter(name=>name.endsWith('.spec.ts')).sort().map(name=>['tests/e2e/'+name]);
const results=[];
for (const project of ['desktop', 'mobile']) {
 for(const [index,batch] of batches.entries()){
  const scope=filters.length?project:`${project}/${batch[0].split('/').at(-1).replace('.spec.ts','')}`;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/with-test-db.mjs', 'pnpm', 'exec', 'playwright', 'test', '--project', project, '--output', `test-results/${scope}`, ...batch], {
      stdio: 'inherit', env: { ...process.env, BROWSER_LIBRARY_WORLD:batch.some(value=>value.endsWith('/library.spec.ts'))?'1':'0', BROWSER_RESTAURANT_WORLD:batch.some(value=>value.endsWith('/restaurant.spec.ts'))?'1':'0', BROWSER_LOUNGE_WORLD:batch.some(value=>value.endsWith('/lounge.spec.ts'))?'1':'0', PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${scope}` },
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  results.push({project,batch:index+1,filters:batch,exitCode:code});await mkdir('artifacts',{recursive:true});await writeFile('artifacts/browser-batches.json',JSON.stringify(results,null,2)+'\n');
  if (code !== 0) { process.exitCode = code; break; }
 }
 if(process.exitCode)break;
}
