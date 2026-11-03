'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiErrorSchema, AvatarOutfitSchema, CosmeticsInventorySchema, type AvatarAppearance, type Me, type TravelSource } from '@virtual-city/contracts';
import { avatarAtlasSpec, avatarFrame } from '@virtual-city/pixi-scene';
import './wardrobe.css';
type Inventory = ReturnType<typeof CosmeticsInventorySchema.parse>;
type Outfit = AvatarAppearance['outfit'];
type Pending = { key:string; body:{schemaVersion:1;source:TravelSource;outfit:Outfit} };
const label = (outfit:Outfit) => outfit === 'casual' ? 'City casual' : 'Cafe apron';
export default function Wardrobe({ me,source,effective }: { me:Me;source:TravelSource|null;effective:Outfit|null }) {
  const [open,setOpen]=useState(false);
  return <details className="wardrobe" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Your wardrobe</summary>{open&&<Inventory key={me.profile.id+':'+me.csrfToken} me={me} source={source} effective={effective}/>}</details>;
}
function Inventory({me,source,effective}:{me:Me;source:TravelSource|null;effective:Outfit|null}) {
  const [inventory,setInventory]=useState<Inventory|null>(null),[preview,setPreview]=useState<Outfit>('casual'),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading your wardrobe...'),[retry,setRetry]=useState(false),[failed,setFailed]=useState(false);
  const pending=useRef<Pending|null>(null),refresh=useRef<()=>Promise<void>>(async()=>{}),run=useRef<(request:Pending)=>Promise<void>>(async()=>{}),currentSource=useRef(source);currentSource.current=source;
  useEffect(()=>{
    const lifetime=new AbortController();let sequence=0,writing=false;
    async function request(path:string,options:RequestInit={}){const response=await fetch('/v1/'+path,{...options,cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(8000)])});const value=await response.json();if(!response.ok){const error=ApiErrorSchema.safeParse(value);throw new Error(error.success?error.data.error.code:'INTERNAL_ERROR');}return value;}
    refresh.current=async()=>{if(writing||lifetime.signal.aborted)return;const ticket=++sequence;try{const result=CosmeticsInventorySchema.parse(await request('me/cosmetics'));if(!lifetime.signal.aborted&&ticket===sequence){setInventory(result);if(!pending.current)setMessage('Your private wardrobe is up to date.');}}catch(error){if(!lifetime.signal.aborted&&ticket===sequence){setInventory(null);setMessage(error instanceof Error&&error.message==='UNAUTHENTICATED'?'Your session ended.':'Your wardrobe could not be confirmed. Refresh to try again.');}}};
    run.current=async mutation=>{if(writing||lifetime.signal.aborted)return;writing=true;const ticket=++sequence;setBusy(true);setRetry(false);setMessage('Confirming outfit...');try{
      const value=await request('me/appearance',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken,'idempotency-key':mutation.key},body:JSON.stringify(mutation.body)});
      const outfit=AvatarOutfitSchema.parse(value.outfit);if(lifetime.signal.aborted||ticket!==sequence)return;
      pending.current=null;setMessage(JSON.stringify(currentSource.current)===JSON.stringify(mutation.body.source)?'Outfit confirmed: '+label(outfit)+'.':'Request confirmed. Rejoin to confirm your current outfit.');
    }catch(error){if(lifetime.signal.aborted||ticket!==sequence)return;
      if(error instanceof Error&&['UNAUTHENTICATED','NOT_IN_ROOM','NOT_AVAILABLE','FORBIDDEN','INVALID_REQUEST','IDEMPOTENCY_CONFLICT'].includes(error.message)){pending.current=null;setMessage(error.message==='UNAUTHENTICATED'?'Your session ended.':'Outfit unavailable for this visit. Refresh your wardrobe and check the world or shift requirements.');setInventory(null);}
      else{setRetry(true);setMessage('Outfit response interrupted. Retry to confirm the same request.');}
    }finally{if(!lifetime.signal.aborted&&ticket===sequence){writing=false;setBusy(false);}}};
    const reload=()=>{if(document.visibilityState==='visible')void refresh.current();};document.addEventListener('visibilitychange',reload);window.addEventListener('online',reload);window.addEventListener('focus',reload);void refresh.current();
    return()=>{lifetime.abort();sequence++;pending.current=null;document.removeEventListener('visibilitychange',reload);window.removeEventListener('online',reload);window.removeEventListener('focus',reload);};
  },[me.profile.id,me.csrfToken]);
  const owned=inventory?.items.find(item=>item.key===preview)?.owned??false,frame=avatarFrame({schemaVersion:1,core:'starter-v1',palette:me.profile.avatarKey,outfit:preview},'idle',0);
  function equip(){if(!source||busy||pending.current||!owned)return;const mutation:Pending={key:crypto.randomUUID(),body:{schemaVersion:1,source,outfit:preview}};pending.current=mutation;void run.current(mutation);}
  return <section className="wardrobe-content" aria-label="Private wardrobe"><h2>Your styles</h2><p>Preview any style. Unlocks are personal and cannot be traded. Clothing grants no staff permissions.</p>
    <p aria-live="polite">{effective?`Wearing in this visit: ${label(effective)}.`:'Join or reconnect to confirm your current outfit.'}</p>
    <div className="wardrobe-workbench"><div className="wardrobe-stage">{failed?<p>Avatar art unavailable. Outfit controls remain usable.</p>:<div className="wardrobe-crop" role="img" aria-label={label(preview)+' preview'}><img src={avatarAtlasSpec.path} alt="" aria-hidden="true" width={avatarAtlasSpec.width*2} height={avatarAtlasSpec.height*2} style={{left:-frame.x*2,top:-frame.y*2}} onError={()=>setFailed(true)}/></div>}<span>Preview only</span></div>
    <div><fieldset><legend>Outfit preview</legend>{AvatarOutfitSchema.options.map(key=><label key={key}><input type="radio" name={'outfit-'+me.profile.id} value={key} checked={preview===key} onChange={()=>setPreview(key)}/><span>{label(key)}<small>{inventory?inventory.items.find(item=>item.key===key)?.owned?'Owned':`Locked · ${inventory.items.find(item=>item.key===key)?.requiredXp} lifetime XP`:'Ownership unconfirmed'}</small></span></label>)}</fieldset>
    {inventory&&!inventory.enabled&&<p>New progression rewards are currently disabled. Owned styles remain subject to world rules.</p>}
    {!source&&<p>Enter a room before equipping.</p>}<button disabled={!source||!owned||busy||retry} onClick={equip}>Equip {label(preview)}</button></div></div>
    <p className="wardrobe-message" aria-live="polite">{message}</p><div className="wardrobe-actions"><button disabled={busy} onClick={()=>void refresh.current()}>Refresh wardrobe</button>{retry&&<><button disabled={busy||!source} onClick={()=>{if(pending.current)void run.current(pending.current);}}>Retry outfit request</button><button disabled={busy} onClick={()=>{pending.current=null;setRetry(false);setMessage('Interrupted request dismissed. Current visit appearance comes from the server.');}}>Dismiss interrupted request</button></>}</div>
  </section>;
}
