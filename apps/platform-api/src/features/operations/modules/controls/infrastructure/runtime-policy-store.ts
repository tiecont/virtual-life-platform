import type {Pool,PoolClient} from 'pg';
import {RuntimeControlSnapshotSchema,type RuntimeControlSnapshot} from '@virtual-city/contracts';
export type RuntimeControlReader={read(environment:string,releaseHash:string):Promise<RuntimeControlSnapshot>};
export type RuntimeControlPort={context():unknown;fence():()=>void;reconcile():Promise<void>;maintain():Promise<void>};
export class RuntimePolicyStore implements RuntimeControlReader {
 constructor(private pool:Pick<Pool,'query'|'connect'>){}
 async read(environment:string,releaseHash:string,tx?:PoolClient):Promise<RuntimeControlSnapshot>{
  if(!tx){const client=await this.pool.connect();try{await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='2000ms'");await client.query("SET LOCAL lock_timeout='1000ms'");const result=await this.read(environment,releaseHash,client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
  const row=(await tx.query('SELECT revision,release_hash,maintenance,paused FROM operator_runtime_controls WHERE environment=$1',[environment])).rows[0];
  return RuntimeControlSnapshotSchema.parse(row?{revision:row.revision,releaseHash:row.release_hash,maintenance:row.maintenance,paused:row.paused}:{revision:0,releaseHash,maintenance:false,paused:{deadline:false,maid:false,library:false,restaurant:false,park:false,lounge:false,dating:false}});
 }
}
