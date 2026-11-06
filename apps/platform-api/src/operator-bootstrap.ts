import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {readConfig} from './config';
import {OperatorService} from './identity/operator-service';
// Out-of-band only. No HTTP bootstrap, env password, command-line secret or printout.
async function main(){
 const [input,output,...extra]=process.argv.slice(2);if(!input||!output||extra.length||resolve(input)===resolve(output))throw Error('Explicit separate private input/output paths required');
 const config=readConfig();if(!config.OPERATOR_AUTH_KEY||!config.ADMIN_ORIGIN)throw Error('Operator configuration required');
 const source=await open(input,constants.O_RDONLY|constants.O_NOFOLLOW);let value:unknown;
 try{const stat=await source.stat();if(!stat.isFile()||stat.size>4096||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid?.())throw Error('Private owner-only bootstrap file required');value=JSON.parse(await source.readFile('utf8'));}finally{await source.close();}
 const destination=await open(output,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const pool=new Pool({connectionString:config.DATABASE_URL,connectionTimeoutMillis:3000});
 try{const result=await new OperatorService(pool,config.OPERATOR_AUTH_KEY).bootstrap(value);await destination.writeFile(JSON.stringify(result,null,2)+'\n');await destination.sync();console.log('Operator provisioned; private recovery material saved. No session created.');}
 finally{await destination.close();await pool.end();}
}
void main().catch(()=>{console.error('Operator bootstrap rejected; check private input/output, explicit configuration, schema and singleton state. No credentials emitted.');process.exitCode=1;});
