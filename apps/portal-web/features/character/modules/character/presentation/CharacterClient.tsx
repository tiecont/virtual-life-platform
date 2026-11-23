'use client';
import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {MeSchema,type Me} from '@aetheria/contracts';
import {browserPlatform} from '@aetheria/client-sdk';
import {AvatarCreator,browserAvatarStore} from '@aetheria/game-client';
import '@aetheria/game-client/styles.css';
const loadCreator=()=>import('@aetheria/scene3d');
export default function CharacterClient(){
 const router=useRouter(),platform=useMemo(()=>browserPlatform(()=>{},path=>router.push(path)),[router]),[me,setMe]=useState<Me|null>(null),[loaded,setLoaded]=useState(false);
 useEffect(()=>{const abort=new AbortController();void platform.request('/v1/me',{cache:'no-store',signal:abort.signal}).then(async response=>{if(!response.ok)throw Error('Session unavailable');return MeSchema.parse(await response.json());}).then(value=>{if(!abort.signal.aborted)setMe(value);}).catch(()=>{}).finally(()=>{if(!abort.signal.aborted)setLoaded(true);});return()=>abort.abort();},[platform]);
 const store=useMemo(()=>me?browserAvatarStore(platform,me.profile.id,me.csrfToken):null,[me,platform]);
 if(!me||!store)return <main className="avatar-creator"><h1>Your character</h1><p role="status">{loaded?'Open identity in the city before creating your character.':'Opening your wardrobe…'}</p><button onClick={()=>router.push('/')}>Return to city</button></main>;
 return <AvatarCreator key={me.profile.id} me={me} platform={platform} store={store} loadCreator={loadCreator} onClose={()=>router.push('/')}/>;
}
