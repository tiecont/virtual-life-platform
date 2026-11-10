import { z } from 'zod';
import { AvatarKeySchema } from '@virtual-city/contracts';
import { DomainError } from '../../../../../shared/common/errors';
export const DeadlinePrincipalSchema=z.strictObject({subject:z.uuid(),expiresAt:z.iso.datetime()});
export type DeadlinePrincipal=z.infer<typeof DeadlinePrincipalSchema>;
export interface DeadlineIdentityPort { authenticate(token:string,signal:AbortSignal):Promise<DeadlinePrincipal> }
export function deadlineOrigin(value:string){const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash||Number(url.port)<1||Number(url.port)>65535)throw Error('Invalid local Deadline origin');return url.origin;}
const profile=z.strictObject({id:z.uuid(),displayName:z.string().min(1).max(24),avatarKey:AvatarKeySchema,csrfToken:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.iso.datetime()});
export class DeadlineHttpIdentityPort implements DeadlineIdentityPort {
 readonly origin:string;
 constructor(origin:string){this.origin=deadlineOrigin(origin);}
 async authenticate(token:string,signal:AbortSignal){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new DomainError('UNAUTHENTICATED',401,'An existing Deadline guest session is required');
  const response=await fetch(this.origin+'/api/v1/me',{headers:{cookie:'deadline_session='+token},redirect:'manual',signal});
  if(response.status===401)throw new DomainError('UNAUTHENTICATED',401,'The Deadline guest session is unavailable');
  if(!response.ok||!response.body)throw new DomainError('WORLD_UNAVAILABLE',503,'Deadline identity is unavailable');
  const reader=response.body.getReader();let text='',length=0;const decoder=new TextDecoder();
  try{while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>4096)throw Error('Oversized identity response');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const value=profile.parse(JSON.parse(text));return DeadlinePrincipalSchema.parse({subject:value.id,expiresAt:value.expiresAt});
 }
}
