import {useEffect,useRef,useState} from 'react';
import type {NativeSessionState} from '@virtual-city/client-sdk';
import {androidSession} from './native-session';
import {NativeAccountDeletion} from './NativeAccountDeletion';
import {NativeSafetyPanel} from './NativeSafetyPanel';
import {AccountDeletionInfo} from '@virtual-city/game-client';
import {NativeAvatarCreator} from './NativeAvatarCreator';

// Account-only opt-in lane. It does not supply authenticated identity to the
// room preview while social safety/business widgets are still unavailable.
export function NativeAccountPanel({onLeave}:{onLeave:()=>void}){
 const [state,setState]=useState<NativeSessionState|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState('Checking your session…');
 const [mode,setMode]=useState<'guest'|'login'|'upgrade'>('guest');
 const [safetyOpen,setSafetyOpen]=useState(false);
 const [creatorOpen,setCreatorOpen]=useState(false);
 const account=useRef<string|null>(null);
 function applyState(value:NativeSessionState|null){account.current=value?.me?.profile.id??null;setState(value);}
 async function work(action:()=>Promise<NativeSessionState>){setBusy(true);try{applyState(await action());setMode('guest');setMessage('');}catch{applyState(null);setMessage('Sign-in is unavailable. Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>androidSession().restore()).then(value=>{if(active){applyState(value);setMessage('');}}).catch(()=>{if(active)setMessage('Sign-in is unavailable.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[]);
 if(creatorOpen&&state?.authenticated&&state.me)return <NativeAvatarCreator me={state.me} onClose={()=>setCreatorOpen(false)}/>;
 return <main className="mobile-account"><header><button onClick={onLeave}>Back to preview</button><h1>Your account</h1></header><p>Account preview · City visits are being prepared.</p><p role="status">{message}</p>
 {state?.authenticated&&<><h2>{state.me?.profile.displayName}</h2><p>{state.me?.kind==='guest'?'Guest account':'Registered account'}</p>{state.me?.kind==='guest'&&<button disabled={busy} onClick={()=>setMode('upgrade')}>Keep this character</button>}<button disabled={busy} onClick={()=>{setBusy(true);void androidSession().logout().then(value=>{applyState({schemaVersion:1,authenticated:false,me:null});setMode('guest');setMessage(value.remoteRevoked?'Signed out.':'Signed out on this device. Remote sign-out was not confirmed.');}).catch(()=>setMessage('Sign-out is unavailable.')).finally(()=>setBusy(false));}}>Sign out</button></>}
 {(!state?.authenticated||mode==='upgrade')&&<form onSubmit={event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form),requestId=crypto.randomUUID();const password=String(data.get('password')??'');form.reset();void work(()=>mode==='guest'?androidSession().guest({deviceLabel:'Android app',guest:{requestId,displayName:String(data.get('displayName')),avatarKey:'fern'}}):mode==='login'?androidSession().login({deviceLabel:'Android app',login:{requestId,loginName:String(data.get('loginName')),password}}):androidSession().upgrade({requestId,upgrade:{loginName:String(data.get('loginName')),password}}));}}>
 <h2>{mode==='guest'?'Create a guest':mode==='login'?'Sign in':'Keep your account'}</h2>
 {mode==='guest'?<label>Name<input name="displayName" required minLength={2} maxLength={24} autoComplete="nickname"/></label>:<><label>Login name<input name="loginName" required minLength={3} maxLength={32} autoComplete="username" autoCapitalize="none"/></label><label>Password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'}/></label></>}
 <button disabled={busy} type="submit">{busy?'Please wait…':'Continue'}</button>
 {!state?.authenticated&&<button type="button" disabled={busy} onClick={()=>setMode(mode==='guest'?'login':'guest')}>{mode==='guest'?'I have an account':'Create a guest instead'}</button>}
 </form>}
 {state?.authenticated&&state.me&&<><button type="button" disabled={busy} onClick={()=>setCreatorOpen(true)}>Create your character</button><button type="button" disabled={busy} onClick={()=>void work(()=>androidSession().restore())}>Refresh account</button><NativeAccountDeletion key={state.me.profile.id} accountId={state.me.profile.id} displayName={state.me.profile.displayName} busy={busy} onBusy={setBusy} onResult={(expected,result)=>{if(account.current!==expected)return;applyState({schemaVersion:1,authenticated:false,me:null});setMode('guest');setBusy(false);setMessage(result.outcome==='DELETED'?'Your account has been deleted.':'Deletion could not be confirmed. This device is signed out; use account deletion help to check your options.');}}/></>}
 {state?.authenticated&&state.me&&<><button type="button" disabled={busy} onClick={()=>setSafetyOpen(value=>!value)}>{safetyOpen?'Close safety controls':'Open safety controls'}</button>{safetyOpen&&<NativeSafetyPanel key={state.me.profile.id} accountId={state.me.profile.id} busy={busy} onBusy={setBusy}/>}</>}
 <details><summary>Account deletion help</summary><AccountDeletionInfo/></details></main>;
}
