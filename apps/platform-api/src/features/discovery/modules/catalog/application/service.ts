import { EventCatalogSchema } from '@virtual-city/contracts';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import type { EventService } from '../../../../events/modules/calendar/application/service';
import { DomainError } from '../../../../../shared/common/errors';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { rankDiscovery } from '../domain/policy';
export class DiscoveryService{
 #active=0;#accounts=new Map<string,number>();#closed=false;#limits:WindowLimiter;
 constructor(private identity:IdentityService,private rooms:Pick<RoomService,'discovery'>,private events:Pick<EventService,'catalog'>,private now=Date.now){this.#limits=new WindowLimiter(now);}
 close(){this.#closed=true;}
 async observe(token:string){
  if(this.#closed)throw new DomainError('WORLD_UNAVAILABLE',503,'Discovery unavailable');if(this.#active>=8)throw new DomainError('RATE_LIMITED',429,'Discovery is busy. Please try again shortly.',1);this.#active++;let account:string|undefined;
  try{const actor=await this.identity.authenticate(token);if((this.#accounts.get(actor.accountId)??0)>=2)throw new DomainError('RATE_LIMITED',429,'Discovery is busy. Please try again shortly.',1);if(!this.#limits.take(actor.accountId,30))throw new DomainError('RATE_LIMITED',429,'Please wait before refreshing discovery');account=actor.accountId;this.#accounts.set(account,(this.#accounts.get(account)??0)+1);
   const observation=await this.rooms.discovery(token);let events:ReturnType<typeof EventCatalogSchema.parse>|null={schemaVersion:1,items:[],truncated:false};
   if(observation.worlds.some(world=>world.capabilities.includes('events')))try{events=EventCatalogSchema.parse(await this.events.catalog(token,{}));}catch(error){if(error instanceof DomainError&&[401,403].includes(error.status))throw error;events=null;}
   if(this.#closed)throw new DomainError('WORLD_UNAVAILABLE',503,'Discovery unavailable');return rankDiscovery(observation,events,this.now());
  }finally{this.#active--;if(account){const count=(this.#accounts.get(account)??1)-1;if(count)this.#accounts.set(account,count);else this.#accounts.delete(account);}}
 }
}
