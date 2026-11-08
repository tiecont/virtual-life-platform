import {useEffect,useMemo} from 'react';
import {AvatarOwnStateSchema,AvatarSaveResultSchema,type Me} from '@virtual-city/contracts';
import {AvatarCreator,AvatarStoreError,type AvatarStorePort} from '@virtual-city/game-client';
import {androidSession} from './native-session';
import {mobilePlatform} from './platform';
import {bindLandscape} from './orientation';
const loadCreator=()=>import('@virtual-city/scene3d');
export function NativeAvatarCreator({me,onClose}:{me:Me;onClose:()=>void}){
 const platform=useMemo(()=>mobilePlatform(()=>{}),[]),accountId=me.profile.id;
 const store=useMemo<AvatarStorePort>(()=>({read:async()=>AvatarOwnStateSchema.parse(await androidSession().avatarState({expectedAccountId:accountId})),save:async(save,requestId)=>{const reply=await androidSession().saveAvatar({expectedAccountId:accountId,requestId,save});if(reply.status!==200){const code=(reply.body as {error?:{code?:unknown}})?.error?.code;throw new AvatarStoreError(reply.status,typeof code==='string'?code:'INTERNAL_ERROR');}return AvatarSaveResultSchema.parse(reply.body);}}),[accountId]);
 useEffect(()=>bindLandscape('sensor'),[]);
 return <AvatarCreator me={me} platform={platform} store={store} loadCreator={loadCreator} onClose={onClose}/>;
}
