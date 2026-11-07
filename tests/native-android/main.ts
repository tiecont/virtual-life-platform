import {io,type Socket} from 'socket.io-client';
import {androidSession} from '../../apps/mobile/src/native-session';

// Explicit qualification build only, removed from normal products. Exercises
// the installed bridge and real WSS without enabling rooms/social/gameplay.
const session=androidSession();
async function connect(auth:Record<string,unknown>,origin:string):Promise<Socket>{
 const socket=io(origin,{autoConnect:false,forceNew:true,reconnection:false,timeout:3000,transports:['websocket'],auth});
 return new Promise((resolve,reject)=>{socket.once('connect',()=>resolve(socket));socket.once('connect_error',()=>{socket.close();reject(Error('Native socket unavailable'));});socket.connect();});
}
const probe={
 async reset(){return session.logout();},
 async identity(){const state=await session.restore();return state.me?.profile.id??null;},
 async parallelRestore(){const states=await Promise.all(Array.from({length:20},()=>session.restore()));return states.every(state=>state.authenticated&&state.me?.profile.id===states[0].me?.profile.id);},
 async socket(){
  const {origin}=await session.destination(),protocol={nonce:crypto.randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]};
  const ticket=await session.ticket({protocol}),auth={schemaVersion:1,nativeTicket:ticket.ticket,protocol};
  const socket=await connect(auth,origin);
  try{
   const result=await socket.timeout(3000).emitWithAck('session.check',{schemaVersion:1,requestId:crypto.randomUUID()});
   let replayDenied=false;try{const replay=await connect(auth,origin);replay.close();}catch{replayDenied=true;}
   return{acknowledged:result.ok===true,replayDenied,nonceMatched:ticket.selection.nonce===protocol.nonce};
  }finally{socket.close();}
 },
 async credentialSurfaceEmpty(){
  const values=Object.keys(localStorage).map(key=>localStorage.getItem(key)).join(' ')+Object.keys(sessionStorage).map(key=>sessionStorage.getItem(key)).join(' ')+document.cookie;
  const state=await session.restore();return !/(?:na1\.|nr1\.|ni1\.)/.test(values+JSON.stringify(state));
 }
};
declare global{interface Window{nativeAccountQualification:typeof probe}}
export function startNativeAccountQualification(){window.nativeAccountQualification=probe;}
