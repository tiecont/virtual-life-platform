import {AVATAR_CATALOG_VERSION,AvatarOwnStateSchema,AvatarSaveResultSchema,AvatarPartsSchema,AVATAR_COMPATIBILITY,starterAvatarParts,type AvatarParts,type AvatarOwnState,type AvatarSaveInput,type AvatarSaveResult} from '@virtual-city/contracts';
import type {ClientPlatform} from '@virtual-city/client-sdk';
export interface AvatarStorePort {read():Promise<AvatarOwnState>;save(input:AvatarSaveInput,requestId:string):Promise<AvatarSaveResult>}
export class AvatarStoreError extends Error {constructor(readonly status:number,readonly code:string){super('Character request unavailable');}}
export function browserAvatarStore(platform:ClientPlatform,accountId:string,csrf:string):AvatarStorePort{
 const read=async(path:string,init?:RequestInit)=>{const response=await platform.request(path,{credentials:'same-origin',cache:'no-store',...init});const body=await response.json();if(!response.ok)throw new AvatarStoreError(response.status,typeof body?.error?.code==='string'?body.error.code:'INTERNAL_ERROR');return body;};
 return{read:async()=>{const state=AvatarOwnStateSchema.parse(await read('/v1/me/avatar'));if(state.accountId!==accountId)throw new AvatarStoreError(409,'ACCOUNT_CHANGED');return state;},save:async(input,requestId)=>AvatarSaveResultSchema.parse(await read('/v1/me/avatar',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':requestId},body:JSON.stringify(input)}))};
}
export type AvatarEditorView={phase:'loading'|'ready'|'saving'|'uncertain'|'conflict'|'unavailable'|'closed';state:AvatarOwnState|null;draft:AvatarParts|null;message:string};
export class AvatarEditor {
 #generation=0;#listeners=new Set<()=>void>();#pending:{input:AvatarSaveInput;requestId:string}|null=null;
 #view:AvatarEditorView={phase:'loading',state:null,draft:null,message:'Opening your wardrobe…'};
 constructor(readonly accountId:string,private store:AvatarStorePort,private uuid=()=>crypto.randomUUID()){}
 get view(){return this.#view;}
 subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
 #set(patch:Partial<AvatarEditorView>){this.#view={...this.#view,...patch};for(const listener of this.#listeners)listener();}
 close(){this.#generation++;this.#pending=null;this.#set({phase:'closed',state:null,draft:null,message:''});}
 async load(){const generation=++this.#generation;this.#pending=null;this.#set({phase:'loading',state:null,draft:null,message:'Opening your wardrobe…'});try{const state=AvatarOwnStateSchema.parse(await this.store.read());if(generation!==this.#generation)return;if(state.accountId!==this.accountId)throw new AvatarStoreError(409,'ACCOUNT_CHANGED');this.#set({phase:'ready',state,draft:structuredClone(state.selected),message:'Make yourself at home.'});}catch{if(generation===this.#generation)this.#set({phase:'unavailable',message:'Your character is unavailable. Return to the city or try again.'});}}
 change(key:keyof AvatarParts,value:string){if(this.#view.phase!=='ready'||!this.#view.draft)return;const next={...this.#view.draft,[key]:value};if(key==='species'&&['cat','dog','rabbit'].includes(value)){const compatible=AVATAR_COMPATIBILITY[value as AvatarParts['species']];next.ears=compatible.ears[0];next.tail=compatible.tail[0];}const result=AvatarPartsSchema.safeParse(next);if(result.success){this.#pending=null;this.#set({draft:result.data,message:'Previewing your changes.'});}}
 preset(species:AvatarParts['species']){if(this.#view.phase!=='ready'||!this.#view.draft)return;this.#pending=null;this.#set({draft:starterAvatarParts(this.#view.draft.fur,species),message:'Previewing a new look.'});}
 reset(){if(this.#view.phase!=='ready'||!this.#view.state)return;this.#pending=null;this.#set({draft:structuredClone(this.#view.state.selected),message:'Your saved look is restored in the preview.'});}
 async save(){const view=this.#view;if(!view.state||!view.draft||!['ready','uncertain'].includes(view.phase))return;
  if(view.draft.outfit==='cafe-apron'&&!view.state.canEquipApron){this.#set({message:'You can preview this apron. Choose an owned outfit before saving.'});return;}
  const generation=this.#generation,pending=this.#pending??{input:{schemaVersion:2 as const,catalogVersion:AVATAR_CATALOG_VERSION,expectedAccountId:this.accountId,expectedRevision:view.state.revision,parts:structuredClone(view.draft)},requestId:this.uuid()};this.#pending=pending;this.#set({phase:'saving',message:'Saving your character…'});
  try{const result=AvatarSaveResultSchema.parse(await this.store.save(pending.input,pending.requestId));if(generation!==this.#generation)return;if(result.state.accountId!==this.accountId||result.requestId!==pending.requestId||result.savedRevision<=pending.input.expectedRevision)throw new AvatarStoreError(409,'ACCOUNT_CHANGED');this.#pending=null;this.#set({phase:'ready',state:result.state,draft:structuredClone(result.state.selected),message:result.state.revision===result.savedRevision?'Your character is saved.':'Your latest saved character is restored.'});}
  catch(error){if(generation!==this.#generation)return;const definitive=error instanceof AvatarStoreError&&error.status>=400&&error.status<500&&error.status!==408&&error.status!==429;
   if(definitive){this.#pending=null;this.#set({phase:'conflict',message:'Your account,wardrobe or saved character changed. Refresh before editing again.'});}
   else this.#set({phase:'uncertain',message:'We could not confirm the save. Retry to check your saved character.'});
  }
 }
}
