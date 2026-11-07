import {useEffect,useRef,useState} from 'react';
import {NativeAccountDeleteOutcomeSchema,type NativeAccountDeleteOutcome} from '@virtual-city/contracts';
import {androidSession} from './native-session';

export function NativeAccountDeletion({accountId,displayName,busy,onBusy,onResult}:{accountId:string;displayName:string;busy:boolean;onBusy:(value:boolean)=>void;onResult:(accountId:string,result:NativeAccountDeleteOutcome)=>void}){
 const [open,setOpen]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 const pending=useRef(false),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function submit(){
  if(!confirmed||busy||pending.current)return;pending.current=true;onBusy(true);setError('');
  try{const result=NativeAccountDeleteOutcomeSchema.parse(await androidSession().deleteAccount({requestId:crypto.randomUUID(),expectedAccountId:accountId,confirmDelete:true}));if(active.current)onResult(accountId,result);}
  catch{if(active.current)setError('Deletion was not confirmed. Refresh your account before trying again.');}
  finally{pending.current=false;if(active.current)onBusy(false);}
 }
 return <section className="native-deletion"><button type="button" disabled={busy} onClick={()=>{setOpen(value=>!value);setConfirmed(false);setError('');}}>{open?'Cancel deletion':'Delete account'}</button>
 {open&&<><h3>Confirm deletion for {displayName}</h3><p>Your profile, sign-in details and associated account data will be deleted permanently, and your sessions will end. This cannot be undone. Check that this is the account you want to delete.</p><form onSubmit={event=>{event.preventDefault();void submit();}}><label className="delete-confirmation"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/> I understand that my account and associated data will be deleted permanently.</label><p role="alert">{error}</p><button className="delete-account-confirm" type="submit" disabled={busy||!confirmed}>{busy?'Confirming deletion…':'Permanently delete this account'}</button></form></>}
 </section>;
}
