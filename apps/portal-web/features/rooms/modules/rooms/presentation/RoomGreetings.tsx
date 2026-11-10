'use client';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { ChatAckSchema,ChatMessageSchema,type ChatMessage,type ChatSend } from '@virtual-city/contracts';
import type { RoomChildContext } from './WorldRoomPanel';

const choices:{label:string;content:ChatSend['content']}[]=[
 {label:'Hello',content:{kind:'canned',id:'hello'}},{label:'Thanks',content:{kind:'canned',id:'thanks'}},
 {label:'Need help',content:{kind:'canned',id:'need-help'}},{label:'Bye',content:{kind:'canned',id:'bye'}},
 {label:'Wave',content:{kind:'emote',id:'wave'}},{label:'Smile',content:{kind:'emote',id:'smile'}},
 {label:'Clap',content:{kind:'emote',id:'clap'}},{label:'Nod',content:{kind:'emote',id:'nod'}},
];
const emotes={wave:'Wave',smile:'Smile',clap:'Clap',nod:'Nod'};
type Entry={message:ChatMessage;receivedAt:number};
export default function RoomGreetings({me,source,transport,participants,venue='Park'}:RoomChildContext&{venue?:'Park'|'Cafe'}){
 const [feed,setFeed]=useState<Entry[]>([]),[busy,setBusy]=useState(false),[retry,setRetry]=useState(false),[status,setStatus]=useState('');
 const pending=useRef<ChatSend|null>(null),alive=useRef(true),first=useRef<HTMLButtonElement>(null),restoreFocus=useRef(false);
 const visible=new Set(participants.map(person=>person.profile.id)),visibleRef=useRef(visible);visibleRef.current=visible;
 const ready=!!me&&!!source&&!!transport?.connected;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;pending.current=null;};},[]);
 useEffect(()=>{if(!source||!transport)return;
  function receive(raw:unknown){const parsed=ChatMessageSchema.safeParse(raw);if(!parsed.success)return;const message=parsed.data;
   if(message.epoch!==source!.epoch||message.roomId!==source!.roomId||!visibleRef.current.has(message.sender.id))return;
   setFeed(previous=>previous.some(row=>row.message.messageId===message.messageId)?previous:[...previous.filter(row=>performance.now()-row.receivedAt<60000),{message,receivedAt:performance.now()}].slice(-20));
  }
  transport.on('chat.message',receive);const timer=setInterval(()=>setFeed(previous=>previous.filter(row=>performance.now()-row.receivedAt<60000)),1000);
  return()=>{transport.off('chat.message',receive);clearInterval(timer);};
 },[source,transport]);
 const visibilityKey=[...visible].sort().join(':');
 useEffect(()=>{setFeed(previous=>previous.filter(row=>visibleRef.current.has(row.message.sender.id)));},[visibilityKey]);
 useEffect(()=>{if(restoreFocus.current&&!busy&&!retry){restoreFocus.current=false;first.current?.focus();}},[busy,retry]);
 async function send(content?:ChatSend['content']){
  if(!ready||busy||!source||!transport)return;
  if(content){if(pending.current)return;pending.current={schemaVersion:1,requestId:crypto.randomUUID(),...source,content};}
  const input=pending.current;if(!input)return;setBusy(true);setStatus('Sending greeting...');
  try{
   const ack=ChatAckSchema.parse(await transport.timeout(5000).emitWithAck('chat.send',input));if(!alive.current)return;
   if(ack.ok){pending.current=null;setRetry(false);setStatus('Greeting accepted. Visibility and connection rules decide who sees it.');}
   else{setRetry(ack.error.retryable);if(!ack.error.retryable)pending.current=null;setStatus(ack.error.code==='RATE_LIMITED'?'Please wait before trying the same greeting again.':ack.error.retryable?'Greeting unconfirmed. You can retry the same request.':'This greeting is unavailable under current room rules.');}
  }catch{if(alive.current){setRetry(true);setStatus('Greeting unconfirmed. You can retry the same request.');}}
  finally{if(alive.current)setBusy(false);}
 }
 const shown=feed.filter(row=>visible.has(row.message.sender.id)&&performance.now()-row.receivedAt<60000);
 return <section id={venue==='Park'?'park-quick-controls':'maid-greeting-controls'} tabIndex={-1} className={venue==='Park'?'park-quick':'room-events'} aria-label={venue+' quick greetings'}>
  <h2>A small hello</h2><p>Approved greetings and gestures only. Your {venue} visibility decides who can see you;no contact request or direct message is sent. <Link href="/identity">Manage visibility</Link></p>
  <div className="park-quick-actions room-greeting-actions">{choices.map((choice,index)=><button key={choice.label} ref={index===0?first:undefined} disabled={!ready||busy||retry} onClick={()=>void send(choice.content)}>{choice.label}</button>)}</div>
  {!ready&&<p>Enter the {venue.toLowerCase()} to send a greeting.</p>}{status&&<p aria-live="polite">{status}</p>}
  {retry&&<div className="park-quick-actions room-greeting-actions"><button disabled={!ready||busy} onClick={()=>{restoreFocus.current=true;void send();}}>Retry same greeting</button><button onClick={()=>{pending.current=null;restoreFocus.current=true;setRetry(false);setStatus('Unconfirmed outcome dismissed. It does not cancel an accepted greeting.');}}>Dismiss unconfirmed greeting</button></div>}
  <h3>Recent visible greetings</h3>{shown.length?<ul aria-label={'Recent visible '+venue.toLowerCase()+' greetings'} aria-live="polite">{shown.map(({message})=><li key={message.messageId}><strong>{message.sender.displayName}</strong>: {message.content.kind==='emote'?emotes[message.content.id]:message.content.text}</li>)}</ul>:<p>No recent greetings visible in this view.</p>}
  <p>Messages disappear from this view within a minute or when you leave. Acceptance is not a delivery or read receipt.</p>
 </section>;
}
