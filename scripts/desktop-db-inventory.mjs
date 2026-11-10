import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from './test-environment.mjs';

// Run only through with-test-db; never inspect inherited production configuration.
const require=createRequire(import.meta.url),{migrate,migrationManifest}=require('../apps/platform-api/src/db/migrations.ts');
const directory=new URL('../apps/platform-api/src/db/migrations/',import.meta.url).pathname;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=await migrationManifest(directory),names=Object.keys(manifest).sort();
const reservation=JSON.parse(await readFile('docs/execution/desktop-first/migration-reservations/0048.json','utf8'));
assert.equal(names.length,47);assert.equal(names.at(-1),'0047_game_journal.sql');
assert.equal(reservation.number,'0048');assert.equal(reservation.previousMigration,names.at(-1));
assert(!names.some(name=>name.startsWith(reservation.number)),'Reserved number already has source SQL');
const admin=new Pool({connectionString:validateTestDatabaseURL(process.env.TEST_DATABASE_URL)});
const schema='desktop_inventory_'+randomUUID().replaceAll('-','');
const sourceRefs=['apps/platform-api/src/app.ts','apps/platform-api/src/worker.ts','apps/platform-api/src/db/migrations.ts','apps/platform-api/src/identity/service.ts','apps/platform-api/src/identity/http.ts','apps/platform-api/src/identity/socket.ts','apps/platform-api/src/identity/native-service.ts','apps/platform-api/src/identity/native-http.ts','apps/platform-api/src/games/journal.ts','apps/platform-api/src/games/journal-host.ts','apps/platform-api/src/rooms/authority.ts','apps/platform-api/src/progression/ledger.ts','packages/contracts/src/native-auth.ts'];
const sources=await Promise.all(sourceRefs.map(async ref=>({ref,sha256:sha(await readFile(ref))})));
const facts={schemaVersion:1,taskId:'VL-003',scope:'Disposable local PostgreSQL only; not production inventory or Rust authorization',sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scriptSha256:sha(await readFile('scripts/desktop-db-inventory.mjs')),sources,startedAt:new Date().toISOString()};
let pool,created=false;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);created=true;
  const target=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));target.searchParams.set('options','-c search_path='+schema);
  pool=new Pool({connectionString:target.toString()});
  // Two concurrent requests exercise the real journal lock and idempotent rerun.
  await Promise.all([migrate(pool,directory),migrate(pool,directory)]);
  const rows=(await pool.query('SELECT name,checksum FROM city_schema_migrations ORDER BY name')).rows;
  assert.deepEqual(Object.fromEntries(rows.map(row=>[row.name,row.checksum])),manifest);
  assert.deepEqual(await migrationManifest(directory),manifest,'Source migrations changed during inventory');
  const metadata=(await pool.query('SELECT schema_version FROM platform_metadata WHERE singleton=true')).rows;
  assert.deepEqual(metadata,[{schema_version:1}]);
  const tables=(await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map(row=>row.tablename);
  for(const table of ['identity_accounts','identity_sessions','native_device_sessions','native_socket_tickets','engine_game_matches','engine_game_receipts','engine_game_outbox','city_schema_migrations'])assert(tables.includes(table),'Missing existing contract table '+table);
  facts.journal={name:'city_schema_migrations',count:rows.length,metadataVersion:1,migrations:rows,concurrentMigrators:2,exactChecksums:true};
  facts.tables=tables;facts.reservedNumber={number:reservation.number,sqlCreated:false,productionJournalInspected:false,recheckRequiredBeforeDDL:true};
  const {NativeClientSchema}=require('../packages/contracts/src/native-auth.ts');
  assert.equal(NativeClientSchema.shape.platform.safeParse('windows').success,false);
  assert.equal(NativeClientSchema.shape.platform.safeParse('android').success,true);
  facts.nativeContract={existingPlatform:'android',windowsAccepted:false,rustTicketCompatible:false};
  facts.result='PASS';
}catch(error){facts.result='FAIL';facts.failureKind=error.name;process.exitCode=1;}
finally {
  try {await pool?.end();if(created)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);facts.schemaCleanupComplete=true;}
  catch {facts.schemaCleanupComplete=false;facts.result='FAIL';process.exitCode=1;}
  await admin.end();facts.completedAt=new Date().toISOString();console.log(JSON.stringify(facts,null,2));
}
