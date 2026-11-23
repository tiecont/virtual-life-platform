import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { parseEnv } from 'node:util';
import { resolve,relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkResourceBudget } from './verify-resource-budget.mjs';
import { validateKubernetes } from './validate-kubernetes.mjs';

// Return only public configuration. Errors name fields,never secret values.
export function verifyStackEnv(env){
 const required=['AETHERIA_STACK_NAME','AETHERIA_APP_IMAGE','AETHERIA_NETWORK_SUBNET','AETHERIA_DYNAMIC_RANGE','AETHERIA_PROXY_IP','AETHERIA_TLS_PORT','WEB_ORIGIN','AETHERIA_TLS_CERT_FILE','AETHERIA_TLS_KEY_FILE','POSTGRES_USER','POSTGRES_DB','POSTGRES_PASSWORD','SESSION_SECRET'];
 for(const name of required)if(!env[name])throw Error('Missing stack field: '+name);
 if(!/^aetheria-soulbound-[a-z0-9-]{1,64}$/.test(env.AETHERIA_STACK_NAME))throw Error('Invalid AETHERIA_STACK_NAME');
 if(!/^aetheria-soulbound:[a-z0-9][a-z0-9._-]{0,127}$/.test(env.AETHERIA_APP_IMAGE)||env.AETHERIA_APP_IMAGE.endsWith(':latest'))throw Error('Invalid AETHERIA_APP_IMAGE');
 const origin=new URL(env.WEB_ORIGIN),port=Number(env.AETHERIA_TLS_PORT);
 if(origin.protocol!=='https:'||origin.origin!==env.WEB_ORIGIN||!Number.isInteger(port)||port<1||port>65535||Number(origin.port||443)!==port)throw Error('Invalid WEB_ORIGIN/AETHERIA_TLS_PORT');
 const [network,prefix]=env.AETHERIA_NETWORK_SUBNET.split('/'),parts=network.split('.').map(Number);
 if(isIP(network)!==4||prefix!=='24'||parts[3]!==0||!(parts[0]===10||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168))throw Error('Invalid AETHERIA_NETWORK_SUBNET');
 if(isIP(env.AETHERIA_PROXY_IP)!==4||env.AETHERIA_PROXY_IP.split('.').slice(0,3).join('.')!==parts.slice(0,3).join('.')||Number(env.AETHERIA_PROXY_IP.split('.')[3])<2||Number(env.AETHERIA_PROXY_IP.split('.')[3])>126)throw Error('Invalid AETHERIA_PROXY_IP');
 if(env.AETHERIA_DYNAMIC_RANGE!==parts.slice(0,3).join('.')+'.128/25')throw Error('Invalid AETHERIA_DYNAMIC_RANGE');
 if(![env.AETHERIA_TLS_CERT_FILE,env.AETHERIA_TLS_KEY_FILE].every(value=>{if(!value.startsWith('/'))return false;const path=relative(resolve('.'),resolve(value));return path.startsWith('../')||path.startsWith('artifacts/');}))throw Error('TLS paths must be absolute and outside build context or in excluded artifacts');
 if(!/^[A-Za-z0-9_-]{24,128}$/.test(env.POSTGRES_PASSWORD))throw Error('POSTGRES_PASSWORD must be independently generated URL-safe characters');
 if(env.SESSION_SECRET.length<32||/REPLACE|REVIEWED|EXAMPLE/i.test(env.SESSION_SECRET))throw Error('Invalid SESSION_SECRET');
 if(!/^[a-z][a-z0-9_]{1,62}$/.test(env.POSTGRES_USER)||!/^[a-z][a-z0-9_]{1,62}$/.test(env.POSTGRES_DB))throw Error('Invalid POSTGRES_USER/POSTGRES_DB');
 return {stack:env.AETHERIA_STACK_NAME,image:env.AETHERIA_APP_IMAGE,origin:origin.origin,proxy:env.AETHERIA_PROXY_IP,publicRelease:false};
}

async function main(){
 await checkResourceBudget();
 const matrix=JSON.parse(await readFile('infra/environments/matrix.json','utf8'));
 assert.deepEqual(matrix.environments.map(value=>value.name),['dev','test','staging','prod']);assert.equal(matrix.publicRelease,false);
 for(const value of matrix.environments.filter(value=>['staging','prod'].includes(value.name))){assert.equal(value.nodeEnv,'production');assert.equal(value.cookie,'__Host-city_session');}
 for(const name of ['staging','production']){const values=parseEnv(await readFile('infra/environments/'+name+'.env.example','utf8'));assert.equal(values.POSTGRES_PASSWORD,'');assert.equal(values.SESSION_SECRET,'');}
 const ignore=await readFile('.dockerignore','utf8');for(const pattern of ['**/.env','**/.env.*','**/.npmrc','**/*.pem','**/*.key','artifacts'])assert(ignore.split('\n').includes(pattern));
 if(process.argv[2])console.log(JSON.stringify(verifyStackEnv(parseEnv(await readFile(process.argv[2],'utf8')))));
 else console.log('Environment matrix/examples/build exclusions verified;not a deployment or secret scan certification');
 console.log(JSON.stringify(await validateKubernetes()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main().catch(()=>{console.error('Infrastructure validation failed;check required fields and private artifacts/k8s-validation reports without printing secrets');process.exitCode=1;});
