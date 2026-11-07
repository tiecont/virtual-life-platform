import {useEffect,useState} from 'react';
import type {NativeSessionState} from '@virtual-city/client-sdk';
import {androidSession} from './native-session';

// Account-only opt-in lane. It does not supply authenticated identity to the
// room preview while social safety/business widgets are still unavailable.
export function NativeAccountPanel({onLeave}:{onLeave:()=>void}){
 const [state,setState]=useState<NativeSessionState|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState('Checking your session…');
 const [mode,setMode]=useState<'guest'|'login'|'upgrade'>('guest');
 async function work(action:()=>Promise<NativeSessionState>){setBusy(true);try{setState(await action());setMode('guest');setMessage('');}catch{setState(null);setMessage('Sign-in is unavailable. Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>androidSession().restore()).then(value=>{if(active){setState(value);setMessage('');}}).catch(()=>{if(active)setMessage('Sign-in is unavailable.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[]);
 return <main className="mobile-account"><header><button onClick={onLeave}>Back to preview</button><h1>Your account</h1></header><p>Account preview · City visits are being prepared.</p><p role="status">{message}</p>
 {state?.authenticated&&<><h2>{state.me?.profile.displayName}</h2><p>{state.me?.kind==='guest'?'Guest account':'Registered account'}</p>{state.me?.kind==='guest'&&<button disabled={busy} onClick={()=>setMode('upgrade')}>Keep this character</button>}<button disabled={busy} onClick={()=>{setBusy(true);void androidSession().logout().then(value=>{setState({schemaVersion:1,authenticated:false,me:null});setMode('guest');setMessage(value.remoteRevoked?'Signed out.':'Signed out on this device. Connect again to revoke the remote session.');}).catch(()=>setMessage('Sign-out is unavailable.')).finally(()=>setBusy(false));}}>Sign out</button></>}
 {(!state?.authenticated||mode==='upgrade')&&<form onSubmit={event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form),requestId=crypto.randomUUID();const password=String(data.get('password')??'');form.reset();void work(()=>mode==='guest'?androidSession().guest({deviceLabel:'Android app',guest:{requestId,displayName:String(data.get('displayName')),avatarKey:'fern'}}):mode==='login'?androidSession().login({deviceLabel:'Android app',login:{requestId,loginName:String(data.get('loginName')),password}}):androidSession().upgrade({requestId,upgrade:{loginName:String(data.get('loginName')),password}}));}}>
 <h2>{mode==='guest'?'Create a guest':mode==='login'?'Sign in':'Keep your account'}</h2>
 {mode==='guest'?<label>Name<input name="displayName" required minLength={2} maxLength={24} autoComplete="nickname"/></label>:<><label>Login name<input name="loginName" required minLength={3} maxLength={32} autoComplete="username" autoCapitalize="none"/></label><label>Password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'}/></label></>}
 <button disabled={busy} type="submit">{busy?'Please wait…':'Continue'}</button>
 {!state?.authenticated&&<button type="button" disabled={busy} onClick={()=>setMode(mode==='guest'?'login':'guest')}>{mode==='guest'?'I have an account':'Create a guest instead'}</button>}
 </form>}</main>;
}
