import {androidSession} from '../../apps/mobile/src/native-session';
import {io,type Socket} from 'socket.io-client';
const session=androidSession();let socket:Socket|undefined,closed=false;
const probe={
 async reset(){socket?.close();socket=undefined;return session.logout();},
 async identity(){return(await session.restore()).me?.profile.id??null;},
 async invalidConfirmation(){const state=await session.restore();try{await window.Capacitor.nativePromise('NativeSession','deleteAccount',{requestId:crypto.randomUUID(),expectedAccountId:state.me?.profile.id,confirmDelete:'true'});return false;}catch{return (await session.restore()).me?.profile.id===state.me?.profile.id;}},
 async switchAccount(){await session.logout();return session.guest({deviceLabel:'Synthetic policy AVD',guest:{requestId:crypto.randomUUID(),displayName:'Other AVD Account',avatarKey:'fern'}}).then(value=>value.me?.profile.id??null);},
 async connect(){const {origin}=await session.destination(),protocol={nonce:crypto.randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]},ticket=await session.ticket({protocol});closed=false;socket=io(origin,{autoConnect:false,forceNew:true,reconnection:false,timeout:3000,transports:['websocket'],auth:{schemaVersion:1,nativeTicket:ticket.ticket,protocol}});socket.on('disconnect',()=>{closed=true;});return new Promise<boolean>((ok,no)=>{socket!.once('connect',()=>ok(true));socket!.once('connect_error',()=>{socket?.close();no(Error('Policy socket unavailable'));});socket!.connect();});},
 disconnected(){return closed;},
 async localClear(){const value=await session.restore();return !value.authenticated&&!value.me&&!/(?:na1\.|nr1\.|ni1\.)/.test(Object.values(localStorage).join(' ')+Object.values(sessionStorage).join(' ')+JSON.stringify(value));}
 ,async deletedLoginDenied(loginName:string){try{await session.login({deviceLabel:'Synthetic policy AVD',login:{requestId:crypto.randomUUID(),loginName,password:'Native policy fixture password only'}});await session.logout();return false;}catch{return true;}}
};
declare global{interface Window{nativePolicyQualification:typeof probe;Capacitor:{nativePromise:(plugin:string,method:string,input:unknown)=>Promise<unknown>}}}
export function startNativePolicyQualification(){window.nativePolicyQualification=probe;}
