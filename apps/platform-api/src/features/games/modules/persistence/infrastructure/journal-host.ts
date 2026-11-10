import type {GameMode,TravelSource} from '@virtual-city/contracts';
import type {GameState} from '@virtual-city/boardgame-core';
import type {IdentityContext} from '../../../../identity/modules/accounts/application/service';
// Internal server ports only. No HTTP schema can mint a lease or consent proof.
export interface GameAdmission {
 tableId:string;generation:string;roomEpoch:string;roomId:string;mode:GameMode;
 members:{accountId:string;membershipId:string;sessionId:string;seatIndex:number}[];
 valid():boolean;
 consume():void;
}
export interface GameJournalHost {
 readonly epoch:string;
 assertOwner():Promise<void>;
 enabled(mode:GameMode):boolean;
 visit(token:string,source:TravelSource):Promise<{actor:IdentityContext;valid():boolean}>;
 present(accountId:string,sessionId:string,source:TravelSource):boolean;
 admit(token:string,input:unknown):Promise<GameAdmission>;
}
export interface GameInitialFactory {
 mode:GameMode;rulesetVersion:string;
 create(context:{admission:GameAdmission;matchId:string;seed:string;seedCommitment:string;clock:number}):GameState;
}
