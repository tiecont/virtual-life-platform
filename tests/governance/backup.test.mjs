import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { sealArchive,openArchive,validateTarget,validateDockerEndpoint,diskObservation } from '../../scripts/postgres-backup.mjs';
test('archive is authenticated and versioned before any restore,with independent random nonces',()=>{
 const key=randomBytes(32),body=Buffer.from('synthetic private durable data'),a=sealArchive(body,key),b=sealArchive(body,key);
 assert(!a.includes(body));assert(!a.equals(b));assert.deepEqual(openArchive(a,key),body);assert.throws(()=>openArchive(a,randomBytes(32)));
 for(const index of [0,6,18,a.length-1]){const damaged=Buffer.from(a);damaged[index]^=1;assert.throws(()=>openArchive(damaged,key));}
 assert.throws(()=>openArchive(Buffer.from('truncated'),key));
});
test('restore targets are disposable exact DB/service only,and disk observations reject invalid data',()=>{
 assert.doesNotThrow(()=>validateTarget('virtual-city-backup-test-a1b2c3d4','restore',true));
 for(const [project,service]of [['virtual-life-production','db'],['virtual-city-backup-test-a1b2c3d4','source'],['unrelated','restore']])assert.throws(()=>validateTarget(project,service,true));
 assert.throws(()=>validateTarget('virtual-city-backup-test-a1b2c3d4;echo bad','restore',true));
 assert.deepEqual(diskObservation('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 10000 3000 7000 30% /var/lib/postgresql/data\n'),{totalBytes:10240000,availableBytes:7168000,usedRatio:.3});assert.throws(()=>diskObservation('invalid output'));
});
test('offline backup tools accept local Unix Docker sockets and reject remote TCP/SSH/named-pipe contexts',()=>{
 assert.doesNotThrow(()=>validateDockerEndpoint('unix:///var/run/docker.sock'));
 for(const host of ['tcp://127.0.0.1:2375','ssh://operator@host','npipe:////./pipe/docker_engine',undefined])assert.throws(()=>validateDockerEndpoint(host));
});
