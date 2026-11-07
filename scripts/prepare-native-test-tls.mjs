import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// New task-owned test PKI only. Never consume owner/production CA or keys.
assert.equal(process.argv.length,2);
const root=resolve('artifacts/vnext/n10-03/tls');await mkdir(root,{recursive:true,mode:0o700});
const run=args=>execFileSync('openssl',args,{cwd:root,stdio:'ignore'});
run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=VLP private N10-03 test CA']);
run(['req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=localhost']);
await writeFile(root+'/server.ext','subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',{mode:0o600});
run(['x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','server.pem','-days','2','-extfile','server.ext']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await writeFile(root+'/public-cert-facts.json',JSON.stringify({scope:'Ephemeral local debug TLS; not release trust',host:'localhost',caSha256:sha(await readFile(root+'/ca.pem')),serverSha256:sha(await readFile(root+'/server.pem')),privateKeysExcludedFromEvidence:true},null,2)+'\n',{mode:0o600});
console.log('Task-owned localhost test certificates prepared; private keys excluded from evidence.');
