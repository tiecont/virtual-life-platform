import type { Pool,PoolClient,QueryResultRow } from 'pg';
import { SCHEMA_VERSION } from '@virtual-city/contracts';
import type { RoomAuthority } from '../rooms/authority';

export class ReadinessProbe {
  private work?:Promise<boolean>;
  private checkoutPending=false;
  constructor(private db:Pick<Pool,'connect'>,private manifest:Readonly<Record<string,string>>,private authority:RoomAuthority,private draining:()=>boolean){}

  private checkout():Promise<PoolClient> {
    if(this.checkoutPending)return Promise.reject(Error('Checkout already pending'));
    this.checkoutPending=true;
    return new Promise((resolve,reject)=>{
      let expired=false;
      const timer=setTimeout(()=>{expired=true;reject(Error('Readiness checkout timeout'));},1000);
      Promise.resolve().then(()=>this.db.connect()).then(client=>{
        clearTimeout(timer);this.checkoutPending=false;
        if(expired||this.draining()){client.release(true);reject(Error('Readiness no longer current'));}
        else resolve(client);
      },error=>{clearTimeout(timer);this.checkoutPending=false;reject(error);});
    });
  }

  private query<Row extends QueryResultRow>(client:PoolClient,text:string):Promise<Row[]> {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Readiness query timeout')),750);
      client.query<Row>(text).then(result=>{clearTimeout(timer);resolve(result.rows);},error=>{clearTimeout(timer);reject(error);});
    });
  }

  private async run():Promise<boolean> {
    if(this.draining())return false;
    const client=await this.checkout();let healthy=false,reusable=false;
    try{
      await this.query(client,'BEGIN READ ONLY');
      await this.query(client,"SET LOCAL statement_timeout='500ms'");
      await this.query(client,"SET LOCAL lock_timeout='200ms'");
      const rows=await this.query<{schema_version:number;migrations:Record<string,string>}>(client,'SELECT schema_version,(SELECT jsonb_object_agg(name,checksum) FROM city_schema_migrations) AS migrations FROM platform_metadata WHERE singleton=true');
      const row=rows[0],actual=row?.migrations;
      healthy=rows.length===1&&row.schema_version===SCHEMA_VERSION&&!!actual&&Object.keys(actual).length===Object.keys(this.manifest).length&&Object.entries(this.manifest).every(([name,checksum])=>actual[name]===checksum);
      if(healthy){await this.query(client,'COMMIT');reusable=true;}
    }finally{
      // Destroy a timed-out/failed read, rather than returning a still-running
      // query to a shared client. A successful read releases before owner check.
      client.release(!reusable);
    }
    if(!healthy||this.draining())return false;
    await this.authority.assert();return !this.draining();
  }

  check():Promise<boolean> {
    if(this.draining())return Promise.resolve(false);
    const work=this.work??=this.run().catch(()=>false).finally(()=>{this.work=undefined;});
    // Coalesce the underlying work even if this caller's response deadline
    // expires;authority has its own bounded connection/heartbeat waits.
    return new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(false),1500);
      work.then(ready=>{clearTimeout(timer);resolve(ready&&!this.draining());});
    });
  }
}
