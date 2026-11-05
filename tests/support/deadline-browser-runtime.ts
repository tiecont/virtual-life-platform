import { openDeadlineLegacyFixture } from './deadline-legacy-fixture';
async function main(){
 const fixture=await openDeadlineLegacyFixture(4400);let stopping=false;
 async function stop(){if(stopping)return;stopping=true;try{await fixture.close();}catch{process.exitCode=1;}}
 process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
 console.log('Selected isolated Deadline browser fixture ready');
}
void main().catch(()=>{console.error('Selected Deadline browser fixture unavailable');process.exitCode=1;});
