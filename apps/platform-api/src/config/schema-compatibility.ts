import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
const digest=z.string().regex(/^[a-f0-9]{64}$/),name=z.string().regex(/^\d+[a-zA-Z0-9._-]*\.sql$/).max(200);
const PolicySchema=z.object({schemaVersion:z.literal(1),policyVersion:z.literal(1),mode:z.enum(['strict','expand-compatible']),journal:z.literal('city_schema_migrations'),metadataVersion:z.literal(1),runtimeManifestSha256:digest,minimumDatabaseMigrations:z.number().int().min(1).max(2048),maximumDatabaseMigrations:z.number().int().min(1).max(2048),reviewRef:z.string().regex(/^evidence:[a-z0-9][a-z0-9._/-]{1,127}$/).nullable(),migrations:z.array(z.object({name,checksum:digest}).strict()).min(1).max(2048)}).strict();
export type SchemaCompatibility=z.infer<typeof PolicySchema>;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function entries(manifest:Readonly<Record<string,string>>){const rows=Object.entries(manifest).sort(([a],[b])=>a<b?-1:a>b?1:0);if(!rows.length||rows.length>2048||rows.some(([key,value])=>!name.safeParse(key).success||!digest.safeParse(value).success))throw Error('Invalid image migration manifest');return rows;}
export function migrationSetDigest(manifest:Readonly<Record<string,string>>){return sha(JSON.stringify(entries(manifest)));}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function resolveSchemaCompatibility(manifest:Readonly<Record<string,string>>,input?:unknown):SchemaCompatibility{
 const own=entries(manifest),runtimeManifestSha256=migrationSetDigest(manifest);
 const policy=PolicySchema.parse(input??{schemaVersion:1,policyVersion:1,mode:'strict',journal:'city_schema_migrations',metadataVersion:1,runtimeManifestSha256,minimumDatabaseMigrations:own.length,maximumDatabaseMigrations:own.length,reviewRef:null,migrations:own.map(([name,checksum])=>({name,checksum}))});
 if(policy.runtimeManifestSha256!==runtimeManifestSha256||policy.minimumDatabaseMigrations!==own.length||policy.maximumDatabaseMigrations<own.length||policy.maximumDatabaseMigrations!==policy.migrations.length)throw Error('Schema policy does not match image/bounds');
 const names=policy.migrations.map(row=>row.name),ordered=[...names].sort();if(new Set(names).size!==names.length||names.some((value,index)=>value!==ordered[index]))throw Error('Schema policy migration order/uniqueness mismatch');
 if(own.some(([name,checksum],index)=>policy.migrations[index]?.name!==name||policy.migrations[index]?.checksum!==checksum))throw Error('Schema policy changes image checksum prefix');
 if(policy.mode==='strict'&&(policy.maximumDatabaseMigrations!==own.length||policy.reviewRef!==null))throw Error('Strict schema policy cannot expand');
 if(policy.mode==='expand-compatible'&&!policy.reviewRef)throw Error('Expanded schema policy needs qualified review reference');
 return freeze(policy);
}
export async function loadSchemaCompatibility(file:string|undefined,manifest:Readonly<Record<string,string>>){
 if(!file)return resolveSchemaCompatibility(manifest);
 try{const bytes=await readFile(file);if(bytes.length>1024*1024)throw Error('Schema policy bounds');return resolveSchemaCompatibility(manifest,JSON.parse(bytes.toString('utf8')));}catch{throw Error('Schema compatibility policy unavailable or incompatible with image');}
}
export function assertMigrationHistory(policy:SchemaCompatibility,actual:unknown):number{
 if(!actual||typeof actual!=='object'||Array.isArray(actual))throw Error('Invalid migration history');
 const rows=Object.entries(actual).sort(([a],[b])=>a<b?-1:a>b?1:0),known=new Map(policy.migrations.map(row=>[row.name,row.checksum]));
 for(const [name,checksum] of rows)if(known.has(name)&&known.get(name)!==checksum)throw Error('Historical migration checksum mismatch: '+name);
 if(rows.length>policy.maximumDatabaseMigrations)throw Error('Migration history exceeds declared compatibility window');
 if(rows.some(([name,checksum],index)=>policy.migrations[index]?.name!==name||policy.migrations[index]?.checksum!==checksum))throw Error('Unknown or non-prefix migration history');
 return rows.length;
}
export function isSchemaCompatible(policy:SchemaCompatibility,metadataVersion:unknown,actual:unknown):boolean{
 try{return metadataVersion===policy.metadataVersion&&assertMigrationHistory(policy,actual)>=policy.minimumDatabaseMigrations;}catch{return false;}
}
