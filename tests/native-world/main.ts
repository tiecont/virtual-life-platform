import {androidSession} from '../../apps/mobile/src/native-session';
const session=androidSession();
// Synthetic qualification bundle only;no token or generic HTTP escape hatch.
const probe={
 async reset(){await session.logout();},
 async identity(){return(await session.restore()).me?.profile.id??null;},
 async avatar(){const state=await session.restore();if(!state.me)throw Error('Account unavailable');return session.avatarState({expectedAccountId:state.me.profile.id});},
 async visit(){const state=await session.restore();if(!state.me)throw Error('Account unavailable');return session.world({expectedAccountId:state.me.profile.id,operation:'visit'});},
 async switchAccount(){await session.logout();const state=await session.guest({deviceLabel:'Synthetic world qualification',guest:{requestId:crypto.randomUUID(),displayName:'New City Companion',avatarKey:'cloud'}});return state.me?.profile.id;},
 async credentialSurfaceEmpty(){const values=Object.keys(localStorage).map(key=>localStorage.getItem(key)).join(' ')+Object.keys(sessionStorage).map(key=>sessionStorage.getItem(key)).join(' ')+document.cookie;return !/(?:na1\.|nr1\.|ni1\.)/.test(values+JSON.stringify(await session.restore()));},
};
declare global{interface Window{nativeWorldQualification:typeof probe}}
export function startNativeWorldQualification(){window.nativeWorldQualification=probe;}
