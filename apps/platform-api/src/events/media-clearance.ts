import { readFile,realpath,stat } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
const key=z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),stamp=z.iso.datetime({offset:true});
const reference=z.string().regex(/^docs\/media-clearance\/[a-z0-9-]+\.md$/);
const httpsOrigin=z.url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&u.origin===value&&!u.username&&!u.password;});
const ClearanceSchema=z.strictObject({id:key,worldSlug:z.literal('lounge'),eventId:z.uuid(),state:z.enum(['APPROVED','REVOKED']),basis:z.enum(['original','licensed','public-domain']),sourceHash:hash,rightsEvidence:reference,rightsEvidenceHash:hash,reviewedBy:key,reviewedAt:stamp,validFrom:stamp,expiresAt:stamp,adapterId:key,transport:z.literal('external-https-hls'),deliveryOrigin:httpsOrigin}).refine(value=>Date.parse(value.reviewedAt)<=Date.parse(value.validFrom)&&Date.parse(value.validFrom)<Date.parse(value.expiresAt));
const CatalogSchema=z.strictObject({schemaVersion:z.literal(1),revision:z.number().int().positive(),clearances:z.array(ClearanceSchema).max(100)}).refine(value=>new Set(value.clearances.map(entry=>entry.id)).size===value.clearances.length&&new Set(value.clearances.map(entry=>entry.eventId)).size===value.clearances.length);
// Optional adapters are trusted server-code registrations,never browser URLs or
// Socket.IO message handlers. The declaration establishes readiness only;actual
// provider delivery and its revocation contract need a separate operated review.
const AdapterSchema=z.strictObject({id:key,transport:z.literal('external-https-hls'),deliveryOrigin:httpsOrigin,reviewReference:reference,reviewEvidenceHash:hash,reviewedAt:stamp,expiresAt:stamp}).refine(value=>Date.parse(value.reviewedAt)<Date.parse(value.expiresAt));
export type MediaAdapterRegistration=z.infer<typeof AdapterSchema>;
export type MediaAuthority={worldSlug:string;eventId:string;permitted:boolean;expiresAt:number};
type EvidenceReader=(reference:string)=>Promise<Uint8Array>;
const readEvidence:EvidenceReader=async reference=>{const workspace=resolve(__dirname,'../../../..'),root=await realpath(resolve(workspace,'docs/media-clearance')),path=await realpath(resolve(workspace,reference));if(!path.startsWith(root+sep)||(await stat(path)).size>65536)throw Error('Invalid media evidence');return readFile(path);};
async function documented(catalog:z.infer<typeof CatalogSchema>,adapters:MediaAdapterRegistration[],reader:EvidenceReader){for(const [reference,hash]of [...catalog.clearances.map(c=>[c.rightsEvidence,c.rightsEvidenceHash]),...adapters.map(a=>[a.reviewReference,a.reviewEvidenceHash])]){const bytes=await reader(reference);if(bytes.byteLength===0||bytes.byteLength>65536||createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Media evidence does not match review');}}
export class MediaClearanceGate{
 private catalog:z.infer<typeof CatalogSchema>;private adapters:Map<string,MediaAdapterRegistration>;private observedAt=0;
 private constructor(catalog:z.infer<typeof CatalogSchema>,adapters:MediaAdapterRegistration[],private now:()=>number,private evidence:EvidenceReader){this.catalog=catalog;this.adapters=new Map(adapters.map(value=>[value.id,value]));}
 static async create(catalog:unknown,adapters:readonly unknown[]=[],now=Date.now,evidence:EvidenceReader=readEvidence){const parsed=CatalogSchema.parse(catalog),registered=adapters.map(value=>AdapterSchema.parse(value));if(registered.length>8||new Set(registered.map(value=>value.id)).size!==registered.length)throw Error('Invalid media adapter registry');await documented(parsed,registered,evidence);return new MediaClearanceGate(parsed,registered,now,evidence);}
 async replace(catalog:unknown){const next=CatalogSchema.parse(catalog);await documented(next,[],this.evidence);if(next.revision<=this.catalog.revision)throw Error('Media catalog revision must advance');this.catalog=next;}
 inspect(authority:MediaAuthority){const at=this.now(),backwards=at<this.observedAt;this.observedAt=Math.max(at,this.observedAt);const c=this.catalog.clearances.find(value=>value.eventId===authority.eventId&&value.worldSlug===authority.worldSlug),adapter=c&&this.adapters.get(c.adapterId);
  const reviewed=!backwards&&authority.permitted&&Number.isSafeInteger(at)&&at>=0&&authority.expiresAt>at&&!!c&&c.state==='APPROVED'&&Date.parse(c.reviewedAt)<=at&&Date.parse(c.validFrom)<=at&&Date.parse(c.expiresAt)>at&&!!adapter&&adapter.transport===c.transport&&adapter.deliveryOrigin===c.deliveryOrigin&&Date.parse(adapter.reviewedAt)<=at&&Date.parse(adapter.expiresAt)>at;
  return {schemaVersion:1 as const,mode:'SILENT' as const,playbackEnabled:false as const,clearance:reviewed?'REVIEWED' as const:'UNAVAILABLE' as const,serverTime:at,expiresAt:Math.max(at,Math.min(at+3000,authority.expiresAt,...reviewed?[Date.parse(c!.expiresAt),Date.parse(adapter!.expiresAt)]:[]))};
 }
}
export async function loadMediaClearance(){const bytes=await readFile(resolve(__dirname,'default-media-clearance.json'),'utf8').catch(()=>readFile(resolve(__dirname,'../../../../config/lounge-media-clearance.json'),'utf8'));return JSON.parse(bytes) as unknown;}
