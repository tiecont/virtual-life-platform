import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
assert.equal(JSON.parse(await readFile('package.json','utf8')).name,'@virtual-city/platform-api');
await rm('dist',{recursive:true,force:true});
