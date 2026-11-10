import {androidSession} from '../../apps/mobile/src/native-session';
import {io,type Socket} from 'socket.io-client';
import {RoomAckSchema} from '@virtual-city/contracts';
const session=androidSession();let socket:Socket|undefined,messages=0;
const probe={
 async reset(){socket?.close();socket=undefined;return session.logout();},
 async join(){const me=(await session.restore()).me;if(!me)throw Error('Create a synthetic account');const update=await session.request({method:'PATCH',path:'/v1/me/privacy',requestId:crypto.randomUUID(),body:{presence:'public',analyticsConsent:false,worldVisibility:{dating:'hidden'}}});if(update.status!==200)throw Error('Synthetic visibility unavailable');const {origin}=await session.destination(),protocol={nonce:crypto.randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]},grant=await session.ticket({protocol});socket?.close();messages=0;socket=io(origin,{autoConnect:false,forceNew:true,reconnection:false,timeout:3000,transports:['websocket'],auth:{schemaVersion:1,nativeTicket:grant.ticket,protocol}});socket.on('chat.message',()=>{messages++;});await new Promise<void>((ok,no)=>{socket!.once('connect',ok);socket!.once('connect_error',()=>no(Error('Synthetic WSS unavailable')));socket!.connect();});const ack=RoomAckSchema.parse(await socket.timeout(3000).emitWithAck('room.join',{schemaVersion:1,requestId:crypto.randomUUID(),worldSlug:'maid',worldVersion:'1.0.0',sceneVersion:'1.0.0'}));return ack.ok;},
 async identity(){return(await session.restore()).me?.profile.id??null;},
 async switchAccount(){socket?.close();await session.logout();return session.guest({deviceLabel:'Synthetic safety AVD',guest:{requestId:crypto.randomUUID(),displayName:'Other Safety Account',avatarKey:'fern'}}).then(value=>value.me?.profile.id??null);},
 async invalidBlock(){try{await window.Capacitor.nativePromise('NativeSession','setBlock',{expectedAccountId:await this.identity(),requestId:crypto.randomUUID(),targetId:crypto.randomUUID(),blocked:'true'});return false;}catch(error){return (error as {code:string}).code==='CONFIRMATION_REQUIRED';}},
 async arbitraryRequestDenied(){try{await window.Capacitor.nativePromise('NativeSession','request',{method:'POST',path:'/v1/blocks',requestId:crypto.randomUUID(),body:{targetId:crypto.randomUUID(),blocked:true}});return false;}catch{return true;}},
 async barrier(){if(!socket?.connected)return false;const result=await socket.timeout(3000).emitWithAck('session.check',{schemaVersion:1,requestId:crypto.randomUUID()});return result.ok===true;},
 messageCount(){return messages;},
 async credentialSurfaceEmpty(){const state=await session.restore();return !/(?:na1\.|nr1\.|ni1\.)/.test(JSON.stringify(state)+Object.values(localStorage).join(' ')+Object.values(sessionStorage).join(' ')+document.cookie);},
};
declare global{interface Window{nativeSafetyQualification:typeof probe}}
export function startNativeSafetyQualification(){window.nativeSafetyQualification=probe;}
