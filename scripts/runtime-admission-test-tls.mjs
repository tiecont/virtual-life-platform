import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const execute=promisify(execFile);

export async function prepareAdmissionTestTls(directory,pool){
 const project=process.env.CITY_TEST_DB_PROJECT;
 assert.match(project??'',/^virtual-city-test-[a-f0-9]{8}$/,'TLS requires wrapper-owned Docker PG');
 const root=resolve(directory,'tls');await mkdir(root,{recursive:true,mode:0o700});
 async function openssl(args){await execute('openssl',args,{cwd:root,timeout:15000,maxBuffer:1024**2});}
 await openssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','1','-subj','/CN=VL013 disposable CA']);
 await openssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','wrong-ca.key','-out','wrong-ca.pem','-days','1','-subj','/CN=VL013 untrusted CA']);
 await openssl(['req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=127.0.0.1']);
 await writeFile(root+'/server.ext','subjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',{mode:0o600});
 await openssl(['x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','server.pem','-days','1','-extfile','server.ext']);
 for(const name of ['ca.key','wrong-ca.key','server.key'])await chmod(root+'/'+name,0o600);
 const container=(await execute('docker',['ps','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=db','--format','{{.ID}}','--no-trunc'])).stdout.trim();
 assert.match(container,/^[a-f0-9]{64}$/);
 const hash=async name=>createHash('sha256').update(await readFile(root+'/'+name)).digest('hex');
 return{caFile:root+'/ca.pem',wrongCaFile:root+'/wrong-ca.pem',publicFacts:{scope:'Ephemeral disposable PostgreSQL TLS; no production CA',caSha256:await hash('ca.pem'),serverSha256:await hash('server.pem'),privateKeysExcluded:true},enable:async()=>{
  for(const name of ['server.pem','server.key'])await execute('docker',['cp',root+'/'+name,container+':/tmp/vl013-'+name]);
  await execute('docker',['exec','--user','0',container,'chown','postgres:postgres','/tmp/vl013-server.key','/tmp/vl013-server.pem']);
  await execute('docker',['exec','--user','0',container,'chmod','600','/tmp/vl013-server.key']);
  await pool.query("ALTER SYSTEM SET ssl_cert_file='/tmp/vl013-server.pem'");
  await pool.query("ALTER SYSTEM SET ssl_key_file='/tmp/vl013-server.key'");
  await pool.query("ALTER SYSTEM SET ssl_min_protocol_version='TLSv1.2'");
  await pool.query("ALTER SYSTEM SET ssl='on'");await pool.query('SELECT pg_reload_conf()');
 }};
}
