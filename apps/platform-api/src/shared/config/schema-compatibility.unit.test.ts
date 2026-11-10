import {it,expect} from 'vitest';
import {resolveSchemaCompatibility,migrationSetDigest,isSchemaCompatible,assertMigrationHistory} from './schema-compatibility';
const first={'0001_foundation.sql':'a'.repeat(64),'0002_expand.sql':'b'.repeat(64)},future={...first,'0003_expand.sql':'c'.repeat(64)};
function approved(){return {schemaVersion:1,policyVersion:1,mode:'expand-compatible',journal:'city_schema_migrations',metadataVersion:1,runtimeManifestSha256:migrationSetDigest(first),minimumDatabaseMigrations:2,maximumDatabaseMigrations:3,reviewRef:'evidence:synthetic-expand',migrations:Object.entries(future).map(([name,checksum])=>({name,checksum}))};}
it('defaults to exact image checksums and schema metadata, rejecting gaps,drift and unknown later migrations',()=>{
 const policy=resolveSchemaCompatibility(first);expect(isSchemaCompatible(policy,1,first)).toBe(true);
 for(const value of [future,{'0001_foundation.sql':first['0001_foundation.sql']},{...first,'0002_expand.sql':'0'.repeat(64)},null])expect(isSchemaCompatible(policy,1,value)).toBe(false);expect(isSchemaCompatible(policy,2,first)).toBe(false);
});
it('accepts only the declared checksum prefix inside the tested image-bound expansion window',()=>{
 const policy=resolveSchemaCompatibility(first,approved());expect(isSchemaCompatible(policy,1,first)).toBe(true);expect(isSchemaCompatible(policy,1,future)).toBe(true);
 expect(isSchemaCompatible(policy,1,{...first,'0003_unknown.sql':'c'.repeat(64)})).toBe(false);expect(isSchemaCompatible(policy,1,{...future,'0004_unknown.sql':'d'.repeat(64)})).toBe(false);expect(isSchemaCompatible(policy,1,{...future,'0003_expand.sql':'0'.repeat(64)})).toBe(false);
});
it('migration preflight permits known incomplete prefixes but never an unknown tail or a changed historical checksum',()=>{
 const policy=resolveSchemaCompatibility(future);expect(assertMigrationHistory(policy,{})).toBe(0);expect(assertMigrationHistory(policy,first)).toBe(2);
 expect(()=>assertMigrationHistory(policy,{...first,'0002_expand.sql':'0'.repeat(64)})).toThrow('checksum mismatch');expect(()=>assertMigrationHistory(policy,{'0002_expand.sql':first['0002_expand.sql']})).toThrow();
});
it('rejects unsupported policy versions,wrong image binding,unsafe bounds and inconsistent known migrations',()=>{
 const changes:((policy:ReturnType<typeof approved>)=>void)[]=[p=>{p.schemaVersion=2;},p=>{p.runtimeManifestSha256='0'.repeat(64);},p=>{p.minimumDatabaseMigrations=1;},p=>{p.maximumDatabaseMigrations=4;},p=>{p.migrations[0].checksum='0'.repeat(64);},p=>{p.migrations.reverse();},p=>{p.migrations.push({...p.migrations[0]});},p=>{p.mode='strict';},p=>{p.reviewRef='';}];
 for(const change of changes){const value=globalThis.structuredClone(approved());change(value);expect(()=>resolveSchemaCompatibility(first,value)).toThrow();}
});
it('resolved windows do not change when the caller mutates its input',()=>{
 const input=approved(),policy=resolveSchemaCompatibility(first,input);input.migrations[2].checksum='0'.repeat(64);input.maximumDatabaseMigrations=99;expect(isSchemaCompatible(policy,1,future)).toBe(true);expect(isSchemaCompatible(policy,1,{...future,'0004_other.sql':'d'.repeat(64)})).toBe(false);
});
