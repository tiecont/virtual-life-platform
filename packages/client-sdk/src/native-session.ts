import type {ClientProtocolOffer,ProfileInput,Me,UpgradeInput,NativeDevices,NativeTicketResult,NativeAccountDeleteOutcome} from '@virtual-city/contracts';

// Custody is implemented by the native platform. There is deliberately no
// getToken/exportRefresh method and no browser-storage fallback. iOS stays
// unavailable until the N14 Keychain adapter is implemented and qualified.
export interface NativeSessionState {schemaVersion:1;authenticated:boolean;me:Me|null}
export interface NativeSessionCustodyPort {
 destination():Promise<{schemaVersion:1;origin:string}>;
 restore():Promise<NativeSessionState>;
 guest(input:{guest:ProfileInput&{requestId:string};deviceLabel:string}):Promise<NativeSessionState>;
 login(input:{login:UpgradeInput&{requestId:string};deviceLabel:string}):Promise<NativeSessionState>;
 upgrade(input:{upgrade:UpgradeInput;requestId:string}):Promise<NativeSessionState>;
 ticket(input:{protocol:ClientProtocolOffer}):Promise<NativeTicketResult>;
 request(input:{method:'GET'|'PATCH';path:'/v1/me'|'/v1/me/privacy';body?:unknown;requestId?:string}):Promise<{status:number;body:unknown}>;
 devices():Promise<NativeDevices>;
 revoke(input:{deviceId:string}):Promise<{schemaVersion:1;revoked:true}>;
 logout():Promise<{schemaVersion:1;authenticated:false;remoteRevoked:boolean}>;
 deleteAccount(input:{requestId:string;expectedAccountId:string;confirmDelete:true}):Promise<NativeAccountDeleteOutcome>;
}
