import type {RoomService} from '../rooms/service';
import type {GameLobbyService} from './lobby';
import type {GameJournalHost} from './journal-host';
export function createGameJournalHost(rooms:Pick<RoomService,'epoch'|'assertGameOwner'|'gameProjection'|'gameVisitPresent'>,lobby:Pick<GameLobbyService,'admit'>,enabled:GameJournalHost['enabled']):GameJournalHost{
 const host:GameJournalHost={epoch:rooms.epoch,assertOwner:()=>rooms.assertGameOwner(),enabled,visit:(token,source)=>rooms.gameProjection(token,source),present:(account,session,source)=>rooms.gameVisitPresent(account,session,source),admit:(token,input)=>lobby.admit(token,input)};return Object.freeze(host);
}
