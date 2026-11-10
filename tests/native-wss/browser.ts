import {create,toBinary} from '@bufbuild/protobuf';
import {ClientEnvelopeSchema,decodeServer,type ClientEnvelope} from '../../packages/native-protocol/src/index';

type Link={socket:WebSocket;messages:Uint8Array[];closed:boolean};
const links:Link[]=[];
const delay=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(test:()=>boolean){const deadline=Date.now()+8000;while(!test()){if(Date.now()>deadline)throw Error('Transport observation timeout');await delay();}}
const transport={
 async open(url:string){
  const socket=new WebSocket(url,'vl.native.v1');socket.binaryType='arraybuffer';
  const link={socket,messages:[],closed:false} as Link;links.push(link);
  socket.onmessage=event=>link.messages.push(new Uint8Array(event.data));
  socket.onclose=()=>{link.closed=true;};socket.onerror=()=>{};
  await until(()=>socket.readyState!==WebSocket.CONNECTING);
  return links.length-1;
 },
 send(index:number,id:number,sequence:number,kind:string,value:Record<string,unknown>){
  const body=kind==='resync'?{lastSeenEpoch:999n,lastSeenTick:18_446_744_073_709_551_615n}:kind==='hello'?{...value,contentHash:new Uint8Array(value.contentHash as number[])}:value;
  const frame=create(ClientEnvelopeSchema,{protocolVersion:1,commandId:new Uint8Array(16).fill(id),sequence:BigInt(sequence),body:{case:kind,value:body} as ClientEnvelope['body']});
  links[index].socket.send(toBinary(ClientEnvelopeSchema,frame));
 },
 async next(index:number){
  const link=links[index];await until(()=>link.messages.length>0||link.closed);
  if(!link.messages.length)return {closed:true};
  const bytes=link.messages.shift()!,frame=decodeServer(bytes);
  const snapshot=frame.body.case==='hello'?frame.body.value.snapshot:frame.body.case==='snapshot'?frame.body.value:undefined;
  return {closed:false,hex:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),kind:frame.body.case,version:frame.canonicalVersion.toString(),
   code:frame.body.case==='rejection'?frame.body.value.code:undefined,
   snapshot:snapshot?{epoch:snapshot.authorityEpoch.toString(),tick:snapshot.tick.toString(),own:snapshot.ownActor,keys:Object.keys(snapshot)}:undefined};
 },
 async closed(index:number){await until(()=>links[index].closed);return links[index].messages.length===0;},
 oversize(index:number){links[index].socket.send(new Uint8Array(65537));},
 text(index:number){links[index].socket.send('untrusted text');},
 close(index:number){links[index].socket.close();},
 async ticket(csrf:string){const response=await fetch('/v1/runtime-ticket',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'});return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};},
};
Object.assign(window,{transport});
