import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileNativePetRestore} from '../../scripts/native-pet-restore-privacy.mjs';

const sourceUrl='postgresql://fixture@127.0.0.1/virtual_city_test';
const targetUrl='postgresql://fixture@127.0.0.1:55432/virtual_city_restore_test';
const unavailable='Native Pet recovery requires the original, current disposable database';

function client(guard){
 const calls=[];
 return {
  calls,
  async query(sql){calls.push(sql);if(sql.startsWith('SELECT database_identity'))return {rows:[guard]};
   if(sql==='SELECT id FROM identity_accounts ORDER BY id')return {rows:[]};
   return {rows:[],rowCount:0};
  },
  release(){calls.push('RELEASE');},
 };
}

test('source loss fails closed before opening or mutating the restore target',async()=>{
 let targetConnections=0;
 const source={async connect(){throw Error('connect ECONNREFUSED') }};
 const target={async connect(){targetConnections++;throw Error('target must not be contacted')}};
 await assert.rejects(
  reconcileNativePetRestore({source,sourceUrl,target,targetUrl}),
  error=>error.message===unavailable,
 );
 assert.equal(targetConnections,0);
});

test('same database identity rejects in-place rollback before restore-side mutation',async()=>{
 const guard={database_identity:'system:123:virtual_city_test',actual:'system:123:virtual_city_test',database:'virtual_city_test'};
 const sourceClient=client(guard),targetClient=client({...guard,database:'virtual_city_restore_test'});
 let mutated=false;
 targetClient.query=async sql=>{
  targetClient.calls.push(sql);
  if(sql.startsWith('SELECT database_identity'))return {rows:[{...guard,database:'virtual_city_restore_test'}]};
  if(!['BEGIN','ROLLBACK','COMMIT'].includes(sql))mutated=true;
  return {rows:[],rowCount:0};
 };
 const source={async connect(){return sourceClient}};
 const target={async connect(){return targetClient}};
 await assert.rejects(
  reconcileNativePetRestore({source,sourceUrl,target,targetUrl}),
  error=>error.message===unavailable,
 );
 assert.equal(mutated,false);
 assert(sourceClient.calls.includes('BEGIN'));
 assert(targetClient.calls.includes('BEGIN'));
});
