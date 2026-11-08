'use client';
import { useEffect, useRef, useState,type ReactNode,type ComponentType,type RefObject } from 'react';
import { io, type Socket } from 'socket.io-client';
import { MeSchema,AvatarOwnStateSchema, RoomAckSchema, WorldCatalogSchema, sceneManifestHash, type ClientProtocolOffer, type NegotiatedSession, type SceneIdentity, type Me, type RoomSnapshot,type SceneManifest,type TravelSource,type AvatarAppearance,type TravelDestination } from '@virtual-city/contracts';
import { RoomRecovery, resolveClientCompatibility, createClientProtocolOffer, acceptSessionCompatibility, type ResolvedClientCompatibility, type RoomRecoveryView } from '@virtual-city/world-sdk';
import { sandboxScene } from '@virtual-city/pixi-scene';
import {rendererFactory} from './renderer';
import type {ClientPlatform,RoomSceneHandle} from '@virtual-city/client-sdk';

const idle: RoomRecoveryView = { status: 'idle', snapshot: null, reason: null };
type SceneView = RoomSceneHandle;
const messages: Record<string, string> = {
  RATE_LIMITED: 'Please wait before trying again.', ROOM_FULL: 'This room is full. Try again shortly.',
  ALREADY_IN_ROOM: 'Leave your other room or use the travel desk.', WORLD_UNAVAILABLE: 'This place is closed.',
  WORLD_VERSION_MISMATCH: 'This place changed. Reload before entering.', UNAUTHENTICATED: 'Your session ended. Open identity to continue.',
  SEAT_TAKEN: 'That seat is no longer available.', ALREADY_SEATED: 'Stand up before choosing another seat.',
  INVALID_REQUEST: 'That destination or interaction is unavailable. Choose an open floor tile.',
};
const ownInput = (state: RoomSnapshot, clientSeq?: number) => ({ schemaVersion: 1, requestId: crypto.randomUUID(), epoch: state.epoch, roomId: state.roomId, membershipId: state.membershipId, ...(clientSeq === undefined ? {} : {clientSeq}) });
export interface RoomExperience {
 slug:string;worldVersion:string;scene:SceneManifest;title:string;eyebrow:string;badge:string;noun:'cafe'|'library'|'restaurant'|'lounge'|'park';theme:'cafe'|'reading-room'|'dining-room'|'lounge'|'park'|'deadline'|'maid';sceneLabel:string;caption:string;capacity?:number;movementHint?:string;portalReturn?:boolean;
 destinations:{label:string;x:number;y:number}[];areas?:readonly {key:string;title:string;description:string;seatIds:readonly string[]}[];areaLabel?:string;areaHeading?:string;areaDescription?:string;provenance?:string;focus:boolean;wardrobe:boolean;events?:boolean;roomInvites?:boolean;
}
const sandboxExperience:RoomExperience={slug:'sdk-sandbox',worldVersion:'1.0.0',scene:sandboxScene,title:'Local Test Cafe',eyebrow:'SDK Sandbox',badge:'LOCAL TEST WORLD',noun:'cafe',theme:'cafe',sceneLabel:'Cafe floor plan. Two shared tables, eight seats, an entrance and a counter. Movement and seat controls follow below.',caption:'WINDOW & GARDEN TABLES',destinations:[{label:'Entrance',x:10,y:11},{label:'Window aisle',x:2,y:4},{label:'Garden aisle',x:11,y:4},{label:'Counter front',x:15,y:9}],focus:true,wardrobe:true};
export interface RoomChildContext {me:Me|null;source:TravelSource|null;retainedSource?:TravelSource|null;active?:boolean;seated:boolean;transport:Socket|null;participants:RoomSnapshot['participants']}
export interface RoomWidgets {
 Link:ComponentType<{href:string;children:ReactNode}>;
 FocusPanel:ComponentType<{me:Me;source:TravelSource|null}>;
 Wardrobe:ComponentType<{me:Me;source:TravelSource|null;effective:AvatarAppearance['outfit']|null}>;
 WorldEvents:ComponentType<{me:Me;worldSlug:string;source?:TravelSource|null}>;
 RoomInvitation:ComponentType<{me:Me;destination:TravelDestination;place?:'study'|'cafe';active?:boolean;purpose?:'focus'|'social'}>;
 RoomSafety:ComponentType<{me:Me;room:RoomSnapshot;active:boolean}>;
}
function RoomDrawer({enabled,title,drawerRef,onClosed,children}:{enabled:boolean;title:string;drawerRef:RefObject<HTMLDialogElement|null>;onClosed:()=>void;children:ReactNode}){
 if(!enabled)return <>{children}</>;
 return <dialog ref={drawerRef} className="cafe-drawer" aria-label={title} onClose={onClosed}><div className="cafe-drawer-heading"><h2>{title}</h2><button onClick={()=>drawerRef.current?.close()}>Close {title.toLowerCase()}</button></div>{children}</dialog>;
}
const defaultRenderer=()=>import('@virtual-city/pixi-scene/renderer');
export interface WorldRoomPanelProps {modularAppearance?:boolean;sceneFirst?:boolean;rendererLoader?:()=>Promise<unknown>;artLabel?:string;socketOrigin:string;platform:ClientPlatform;widgets:RoomWidgets;experience?:RoomExperience;children?:ReactNode|((context:RoomChildContext)=>ReactNode)}
export default function WorldRoomPanel({socketOrigin,platform,widgets,modularAppearance=false,sceneFirst=false,rendererLoader=defaultRenderer,artLabel='Original starter art',experience=sandboxExperience,children}:WorldRoomPanelProps) {
 const {Link,FocusPanel,Wardrobe,WorldEvents,RoomInvitation,RoomSafety}=widgets;
 const foreground=useRef(true);
 const actionsDialog=useRef<HTMLDialogElement>(null),visitsDialog=useRef<HTMLDialogElement>(null);
 const actionsButton=useRef<HTMLButtonElement>(null),actionsOpener=useRef<HTMLElement|null>(null),visitsOpener=useRef<HTMLElement|null>(null);
 const [panel,setPanel]=useState<'actions'|'visit'|null>(null),[seatFilter,setSeatFilter]=useState('');
 function showPanel(kind:'actions'|'visit',opener:HTMLElement|null){const dialog=kind==='actions'?actionsDialog.current:visitsDialog.current;if(!dialog)return;(kind==='actions'?actionsOpener:visitsOpener).current=opener;if(!dialog.open)dialog.showModal();setPanel(kind);}
 function closedPanel(kind:'actions'|'visit'){setPanel(visitsDialog.current?.open?'visit':actionsDialog.current?.open?'actions':null);(kind==='actions'?actionsOpener:visitsOpener).current?.focus();}

  const manifest=experience.scene;
  const [me, setMe] = useState<Me | null>(null); const [available, setAvailable] = useState(false); const [loading, setLoading] = useState(true);
  const [view, setView] = useState(idle); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [lowMotion, setLowMotion] = useState(false); const lowMotionRef = useRef(false); const userMotion = useRef<boolean | null>(null);
  const [walking, setWalking] = useState(false);
  const [safetyRoom, setSafetyRoom] = useState<RoomSnapshot | null>(null);
  const focusIntent = useRef<'actions' | 'entry' | null>(null); const entryButton = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null); const scene = useRef<SceneView | null>(null);
  const socket = useRef<Socket | null>(null); const recovery = useRef(new RoomRecovery()); const latest = useRef<RoomSnapshot | null>(null);
  const alive = useRef(true); const desired = useRef(false); const inFlight = useRef(false); const sequence = useRef(0);
  const compatibility = useRef<ResolvedClientCompatibility | null>(null), sceneIdentity = useRef<SceneIdentity | undefined>(undefined);
  const negotiated = useRef<NegotiatedSession | null>(null), clientSequence = useRef(0);
  const appearanceVersion=useRef<2|undefined>(undefined);
  const compatibilityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announcedVisit=useRef<string|null>(null);
  const claimRef = useRef<(seatId: string) => void>(() => {});
  const moveRef = useRef<(point: { x: number; y: number }) => void>(() => {});
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { const value = userMotion.current ?? media.matches; lowMotionRef.current = value; setLowMotion(value); scene.current?.setReducedMotion(value); };
    update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (view.status === 'active' && focusIntent.current === 'actions') { if(sceneFirst)showPanel('actions',actionsButton.current);document.getElementById('cafe-action-title')?.focus(); focusIntent.current = null; }
    if (view.status === 'idle' && focusIntent.current === 'entry' && !busy) {
      const button = entryButton.current;
      if (button && !button.disabled) { button.focus(); if (document.activeElement === button) focusIntent.current = null; }
    }
  }, [view, busy,sceneFirst]);
  useEffect(() => {
    const motion = view.snapshot?.self.motion; const serverTime = view.snapshot?.serverTime;
    const remaining = motion && serverTime !== undefined ? motion.startedAt + (motion.path.length - 1) * motion.stepMs - serverTime : 0;
    setWalking(remaining > 0);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setWalking(false), remaining); return () => clearTimeout(timer);
  }, [view.snapshot]);
  function publish() {
    if (!alive.current) return;
    const next = recovery.current.view; latest.current = next.snapshot; setView(next);
    if(next.snapshot){const key=next.snapshot.epoch+':'+next.snapshot.membershipId;if(announcedVisit.current!==key){announcedVisit.current=key;platform.visitChanged();}}else if(['idle','interrupted'].includes(next.status)&&announcedVisit.current){announcedVisit.current=null;platform.visitChanged();}
    if (next.snapshot) setSafetyRoom(next.snapshot); else if (next.status !== 'syncing') setSafetyRoom(null);
    if (next.status === 'syncing') scene.current?.suspend(); else scene.current?.update(next.snapshot);
  }
  function closeConnection() {
    clearTimeout(compatibilityTimer.current); compatibilityTimer.current = undefined; negotiated.current = null; clientSequence.current = 0;
    desired.current = false; sequence.current++; inFlight.current = false;
    const client = socket.current; socket.current = null; client?.removeAllListeners(); client?.close();
    recovery.current = new RoomRecovery(); latest.current = null;
    if (alive.current) { setBusy(false); setMessage(''); publish(); }
  }
  useEffect(() => {
    alive.current = true; let disposed = false; let pending: AbortController | null = null;
    async function load() {
      pending?.abort(); const controller = new AbortController(); pending = controller;
      setLoading(true); setMe(null); setAvailable(false); setMessage('');
      compatibility.current = null; sceneIdentity.current = undefined;
      appearanceVersion.current=undefined;
      try {
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]);
        const [identity, catalog, discovery] = await Promise.all([platform.request('/v1/me', { cache: 'no-store', signal }), platform.request('/v1/worlds', { cache: 'no-store', signal }), platform.request('/v1/client-compatibility', {cache: 'no-store', signal})]);
        if (!identity.ok) throw new Error('Open identity to create a guest or sign in.');
        const nextMe = MeSchema.parse(await identity.json());
        let partsVersion:2|undefined;
        if(modularAppearance){try{const response=await platform.request('/v1/me/avatar',{cache:'no-store',signal});if(response.ok){const own=AvatarOwnStateSchema.safeParse(await response.json());if(own.success&&own.data.accountId===nextMe.profile.id)partsVersion=2;}}catch{/* N-1 server or unavailable optional presentation endpoint:keep v1 projection. */}}
        if (!catalog.ok) throw new Error('The city is unavailable. Try again shortly.');
        const worlds = WorldCatalogSchema.parse(await catalog.json()); const world = worlds.worlds.find(world => world.slug === experience.slug);
        const selected = resolveClientCompatibility(discovery.status, discovery.status === 200 ? await discovery.json() : undefined);
        let digest: SceneIdentity | undefined;
        if (selected.mode === 'negotiated') {try {digest = {schemaVersion: manifest.schemaVersion, sha256: await sceneManifestHash(manifest)};} catch {throw new Error('This place changed. Reload before entering.');}}
        if (!disposed && !controller.signal.aborted) { appearanceVersion.current=partsVersion;compatibility.current = selected; sceneIdentity.current = digest; setMe(nextMe); setAvailable(world?.availability === 'available'&&world.version===experience.worldVersion&&world.sceneRef.version===manifest.version); }
      } catch (error) { if (!disposed && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'The city is unavailable.'); }
      finally { if (!disposed && !controller.signal.aborted) setLoading(false); }
    }
    void load();
    const unwatch=platform.watchIdentity(()=>{closeConnection();void load();});
    const stopLifecycle=platform.lifecycle?.subscribe(active=>{foreground.current=active;closeConnection();if(!active){pending?.abort();scene.current?.suspend();}else void load();});
    return () => { disposed = true; pending?.abort(); alive.current = false; closeConnection(); unwatch();stopLifecycle?.(); };
  }, [experience,manifest,platform,modularAppearance]);
  useEffect(() => {
    const element = host.current; if (!element) return;
    let cancelled = false; let owned: SceneView | undefined; const controller = new AbortController();
    void rendererLoader().then(module => rendererFactory(module)(element, manifest, id => claimRef.current(id), { signal: controller.signal,theme:experience.theme, onMove: point => moveRef.current(point),onGraphicsState:available=>{if(!cancelled)setSceneState(available?'ready':'failed');} })).then(renderer => {
      owned = renderer;
      if (cancelled) { renderer.destroy(); return; }
      scene.current = renderer; renderer.setReducedMotion(lowMotionRef.current); if(foreground.current)renderer.update(recovery.current.view.snapshot);else renderer.suspend(); setSceneState('ready');
    }).catch(() => { if (!cancelled) setSceneState('failed'); });
    return () => { cancelled = true; controller.abort(); owned?.destroy(); if (scene.current === owned) scene.current = null; };
  }, [experience.theme,manifest,rendererLoader]);

  async function sync(joining: boolean) {
    const client = socket.current; if (!foreground.current || !client?.connected || inFlight.current || !desired.current) return;
    if (compatibility.current?.mode === 'negotiated' && !negotiated.current) return;
    const previous = latest.current; if (!joining && !previous) return;
    inFlight.current = true; if (alive.current) setBusy(true);
    const operation = ++sequence.current; const ticket = recovery.current.beginSync(); publish();
    try {
      const input = joining ? { schemaVersion: 1, requestId: crypto.randomUUID(), worldSlug: experience.slug, worldVersion: experience.worldVersion, sceneVersion: manifest.version, motionVersion: 1,...(appearanceVersion.current?{appearanceVersion:appearanceVersion.current}:{}), ...(sceneIdentity.current ? {sceneIdentity: sceneIdentity.current} : {}) } : commandInput(previous!);
      const ack = RoomAckSchema.parse(await client.timeout(5000).emitWithAck(joining ? 'room.join' : 'room.snapshot', input));
      if (socket.current !== client || !client.connected || !desired.current || sequence.current !== operation) return;
      if (!ack.ok) throw new Error(messages[ack.error.code] ?? 'Your room could not be confirmed. Rejoin to continue.');
      if (ack.result.type !== 'snapshot') throw new Error('Your room could not be confirmed.');
      recovery.current.acceptSnapshot(ticket, ack.result); publish(); if (alive.current) setMessage('');
    } catch (error) {
      if (alive.current && socket.current === client && sequence.current === operation) { recovery.current.disconnect(); publish(); setMessage(error instanceof Error ? error.message : 'Connection interrupted. Rejoin to continue.'); }
    } finally { if (sequence.current === operation) { inFlight.current = false; if (alive.current) setBusy(false); } }
  }
  // Periodic authoritative refresh also reconciles a final dropped delta with no later sequence.
  const syncRef = useRef(sync); syncRef.current = sync;
  useEffect(() => {
    const timer = setInterval(() => { if (recovery.current.view.status === 'active') void syncRef.current(false); }, 15000);
    return () => clearInterval(timer);
  }, []);
  function enter() {
    if (!foreground.current || !me || !available || !compatibility.current || busy || loading || inFlight.current) return;
    closeConnection(); focusIntent.current = 'actions'; desired.current = true;
    setBusy(true);
    let offer: ClientProtocolOffer | null = null;
    const client = io(socketOrigin, { forceNew: true, autoConnect: false, reconnection: true, reconnectionAttempts: 3, reconnectionDelay: 1000, transports: ['websocket'], withCredentials: true, auth: complete => {
      const protocol = compatibility.current?.mode === 'negotiated' ? createClientProtocolOffer(crypto.randomUUID()) : undefined;
      offer = protocol ?? null; complete({schemaVersion: 1, csrfToken: me.csrfToken, ...(protocol ? {protocol} : {})});
    } });
    socket.current = client;
    client.on('connect', () => {
      if (socket.current !== client) return; clientSequence.current = 0; negotiated.current = null;
      if (compatibility.current?.mode === 'legacy') void syncRef.current(true);
      else {clearTimeout(compatibilityTimer.current); compatibilityTimer.current = setTimeout(() => {if (socket.current === client && alive.current && !negotiated.current) {client.close(); setBusy(false); setMessage('Connection changed. Reload before rejoining.');}}, 5000);}
    });
    client.on('session.compatibility', input => {
      if (socket.current !== client || !client.connected || !alive.current || !offer || negotiated.current) return;
      try {
        const selected = acceptSessionCompatibility(offer, input); if (!selected) return;
        negotiated.current = selected; clearTimeout(compatibilityTimer.current); compatibilityTimer.current = undefined; void syncRef.current(true);
      } catch {client.close(); setBusy(false); setMessage('Update this app before entering the city.');}
    });
    client.on('disconnect', () => { if (socket.current === client && alive.current) { clearTimeout(compatibilityTimer.current); compatibilityTimer.current = undefined; negotiated.current = null; sequence.current++; inFlight.current = false; setBusy(false); setMessage(''); recovery.current.disconnect(); publish(); } });
    client.on('connect_error', error => { if (socket.current === client && alive.current) {clearTimeout(compatibilityTimer.current); compatibilityTimer.current = undefined; negotiated.current = null; setBusy(false); recovery.current.disconnect(); publish(); setMessage(error.message === 'UPGRADE_REQUIRED' ? 'Update this app before entering the city.' : 'Connection unavailable. Reload or rejoin to try again.'); } });
    client.on('room.delta', event => {
      if (socket.current !== client || !alive.current) return;
      try {
        const state = latest.current;
        const gap = recovery.current.delta(event);
        if (gap) { scene.current?.suspend(); latest.current = state; void syncRef.current(false); } else publish();
      } catch { recovery.current.disconnect(); publish(); setMessage('Room state changed. Rejoin to confirm your place.'); }
    });
    client.on('room.ended', event => {
      if (socket.current !== client || !alive.current) return;
      try { recovery.current.ended(event); } catch { recovery.current.disconnect(); }
      desired.current = false; setMessage(''); publish(); if (recovery.current.view.status !== 'idle') client.close();
    });
    client.on('session.revoked', () => {
      if (socket.current !== client || !alive.current) return;
      desired.current = false; recovery.current.disconnect(); publish(); setMe(null); setMessage('Your session ended. Open identity to continue.'); client.close();
    });
    client.connect();
  }
  function commandInput(state: RoomSnapshot) {return ownInput(state, negotiated.current?.capabilities.includes('room-client-sequence-v1') ? clientSequence.current++ : undefined);}
  async function mutate(name: 'seat.claim' | 'seat.release' | 'room.leave' | 'room.move', seatId?: string, destination?: { x: number; y: number }) {
    const current = latest.current; const client = socket.current;
    if (!foreground.current || !current || !client?.connected || inFlight.current) return;
    inFlight.current = true; setBusy(true); const run = ++sequence.current;
    const ticket = recovery.current.beginSync(); publish();
    try {
      const ack = RoomAckSchema.parse(await client.timeout(5000).emitWithAck(name, { ...commandInput(current), ...(seatId ? { seatId } : {}), ...(destination ? { destination } : {}) }));
      if (!alive.current || socket.current !== client || run !== sequence.current) return;
      if (!ack.ok) {
        const explanation = messages[ack.error.code] ?? 'That change could not be confirmed. Rejoin to check your place.';
        const refreshed = RoomAckSchema.parse(await client.timeout(5000).emitWithAck('room.snapshot', commandInput(current)));
        if (!alive.current || socket.current !== client || run !== sequence.current) return;
        if (!refreshed.ok || refreshed.result.type !== 'snapshot') throw new Error(explanation);
        recovery.current.acceptSnapshot(ticket, refreshed.result); publish(); setMessage(explanation); return;
      }
      if (name === 'room.leave') { focusIntent.current = 'entry'; desired.current = false; client.close(); recovery.current = new RoomRecovery(); publish(); setMessage('You left the '+experience.noun+'.'); }
      else if (ack.result.type === 'snapshot') { recovery.current.acceptSnapshot(ticket, ack.result); publish(); setMessage(name === 'seat.claim' ? 'Your seat is confirmed.' : name === 'room.move' ? 'Your walk is confirmed.' : 'You stood up.'); }
    } catch (error) {
      if (alive.current && socket.current === client && run === sequence.current) { recovery.current.disconnect(); publish(); setMessage(error instanceof Error ? error.message : 'Change unconfirmed. Rejoin to check your place.'); }
    } finally { if (sequence.current === run) { inFlight.current = false; if (alive.current) setBusy(false); } }
  }
  claimRef.current = id => { void mutate('seat.claim', id); };
  async function returnToCity(){
    if(busy||loading)return;
    if(recovery.current.view.status==='active')await mutate('room.leave');
    if(desired.current||inFlight.current){if(alive.current)setMessage('Your departure is unconfirmed. Rejoin to check your place before returning.');return;}
    if(alive.current)platform.navigate('/');
  }
  moveRef.current = point => { if (!walking) void mutate('room.move', undefined, point); };
  const active = view.status === 'active' && view.snapshot !== null;
  const status = view.status === 'active' ? view.reason === 'membership-reset' ? 'Rejoined. Your previous place was interrupted.' : 'Connected' : view.status === 'syncing' ? 'Confirming your place...' : view.status === 'reconnecting' ? 'Connection lost. Your place is unconfirmed.' : view.status === 'interrupted' ? view.reason === 'authority-lost' || view.reason === 'server-stopping' ? 'The room was interrupted. Rejoin when it reopens.' : 'This room ended.' : available ? 'Ready to enter' : `${experience.noun[0].toUpperCase()+experience.noun.slice(1)} closed`;
  const connection=<p className="cafe-connection" role="status" aria-live="polite">{loading ? 'Checking your session...' : status}</p>;
  const feedback=message&&<p className="cafe-message" aria-live="polite">{message}</p>;
  const visitControls=<>{me || loading ? <>{me && <><p className="cafe-identity">{me.profile.displayName}</p><p className="cafe-note" aria-live="polite">{active ? walking ? view.snapshot?.self.seatId ? 'Walking to your reserved seat.' : 'Walking across the '+experience.noun+' floor.' : view.snapshot?.self.seatId ? 'Seated at ' + manifest.seats.find(seat => seat.seatId === view.snapshot?.self.seatId)?.label : 'On the '+experience.noun+' floor' : 'No confirmed place'}</p></>}
    {active ? <button className="cafe-primary" disabled={busy} onClick={() => void mutate('room.leave')}>Leave {experience.noun}</button> : <button ref={entryButton} className="cafe-primary" aria-disabled={!available || loading} disabled={busy || view.status === 'syncing'} onClick={enter}>{(view.status === 'idle' ? 'Enter ' : 'Rejoin ')+experience.noun}</button>}
  </> : !loading && <Link href="/identity">Open identity</Link>}
  {experience.portalReturn&&<button disabled={busy||loading||view.status==='syncing'||view.status==='reconnecting'} onClick={()=>void returnToCity()}>{active?'Leave and return to city':'Return to city'}</button>}</>;
  return <main className={'cafe-shell'+(sceneFirst?' scene-first':'')} data-shell={sceneFirst?'scene-first':'classic'} data-world={experience.slug}>
    <a className="cafe-skip" href="#cafe-room-controls">Skip to room controls</a>
    <header className="cafe-nav"><Link href="/">Virtual Life Platform</Link><nav aria-label="Room navigation"><Link href="/identity">Identity</Link><Link href="/social">Your circle</Link></nav><span className="cafe-local">{experience.badge}</span></header>
    <div className="cafe-heading"><div><p className="cafe-eyebrow">{experience.eyebrow}</p><h1>{experience.title}</h1></div><div className="cafe-occupancy" aria-label={view.snapshot ? 'Room occupancy' : 'Room occupancy unconfirmed'}><strong>{view.snapshot?.occupancy ?? '—'}</strong><span>/ {view.snapshot?.capacity??experience.capacity??manifest.seats.length} present</span></div></div>
    {sceneFirst&&<><div className="cafe-game-hud"><div className="cafe-game-status">{panel===null&&<>{connection}{feedback}</>}</div><div className="cafe-game-entry">{visitControls}</div></div>
      <nav className="cafe-game-nav" aria-label="Activity shortcuts"><button ref={actionsButton} onClick={event=>showPanel('actions',event.currentTarget)}>Room actions</button><button onClick={event=>showPanel('visit',event.currentTarget)}>People, safety &amp; options</button><Link href="/travel">Travel</Link></nav><p className="cafe-portrait-hint">Turn sideways for a wider view. All controls remain available.</p>
      </>}
    <div className="cafe-main"><div className="cafe-scene-column">
      <div className="cafe-scene" ref={host} role="img" aria-busy={sceneState === 'loading'} aria-label={experience.sceneLabel}/>
      <div className="cafe-scene-caption"><span>{experience.caption}</span><span>{sceneState === 'loading' ? 'Loading scene...' : sceneState === 'failed' ? 'Scene unavailable. Seat controls remain available.' : artLabel}</span></div>
      <RoomDrawer enabled={sceneFirst} title="Room actions" drawerRef={actionsDialog} onClosed={()=>closedPanel('actions')}>
      {sceneFirst&&<div className="cafe-seat-search"><label>Find a seat<input type="search" value={seatFilter} onChange={event=>setSeatFilter(event.target.value)} autoComplete="off"/></label></div>}
      {sceneFirst&&<><div className="cafe-drawer-status">{panel==='actions'&&<>{connection}{feedback}</>}</div><button className="cafe-drawer-safety" onClick={event=>showPanel('visit',event.currentTarget)}>People and safety</button></>}
      {experience.areas&&<section className="room-areas" aria-label={experience.areaLabel??'Library desk areas'}><h2>{experience.areaHeading??'A quiet place to read'}</h2><p>{experience.areaDescription??'Both desk areas share the same quiet room. No audio, book files or automatic social sharing.'}</p>{experience.areas.map(area=><div key={area.key}><h3>{area.title}</h3><p>{area.description}</p></div>)}<a href={experience.provenance??'/assets/library/provenance.json'}>Original {experience.noun} art provenance</a></section>}
      {typeof children==='function'?children({me,active,retainedSource:safetyRoom?{epoch:safetyRoom.epoch,roomId:safetyRoom.roomId,membershipId:safetyRoom.membershipId}:null,source:active&&view.snapshot?{epoch:view.snapshot.epoch,roomId:view.snapshot.roomId,membershipId:view.snapshot.membershipId}:null,seated:active&&!!view.snapshot?.self.seatId,transport:active?socket.current:null,participants:active&&view.snapshot?view.snapshot.participants:[]}):children}
      <section aria-label="Walk around"><h2 id="cafe-action-title" tabIndex={-1}>Walk around</h2><p className="cafe-note">{experience.movementHint??'Choose an open floor tile, or use a destination below. Tables and walls are solid.'}</p><div className="cafe-seat-grid">{experience.destinations.map(point => <button key={point.label} disabled={!active || busy || walking || !!view.snapshot?.self.seatId} onClick={() => moveRef.current({ x: point.x, y: point.y })}>Walk to {point.label.toLowerCase()}</button>)}</div></section>
      <section className="cafe-seats" aria-labelledby="cafe-seat-title"><div className="cafe-section-heading"><h2 id="cafe-seat-title">Choose a seat</h2>{view.snapshot?.self.seatId && <button disabled={busy} onClick={() => void mutate('seat.release', view.snapshot!.self.seatId!)}>Stand up</button>}</div>
        <div className="cafe-seat-grid">{manifest.seats.filter(point=>!sceneFirst||point.label.toLocaleLowerCase().includes(seatFilter.toLocaleLowerCase())).map(point => {
          const seat = view.snapshot?.seats.find(seat => seat.seatId === point.seatId);
          return <button key={point.seatId} className={seat?.mine ? 'mine' : ''} disabled={!active || busy || seat?.state !== 'available' || !!view.snapshot?.self.seatId} aria-label={point.label + (seat?.mine ? ', your seat' : '')} onClick={() => void mutate('seat.claim', point.seatId)}><span>{point.seatId.slice(5).padStart(2, '0')}</span><span>{point.label.split(' ').slice(0, 2).join(' ')}<small>{seat?.mine ? 'Your seat' : !active ? 'Not connected' : seat?.state === 'held' ? 'Reconnecting' : seat?.state === 'occupied' ? 'Occupied' : 'Available'}</small></span></button>;
        })}</div>
      </section>{me && <>{experience.focus&&<FocusPanel key={me.profile.id + ':' + me.csrfToken} me={me} source={active && view.snapshot?.self.seatId ? { epoch: view.snapshot.epoch, roomId: view.snapshot.roomId, membershipId: view.snapshot.membershipId } : null}/ >}{experience.wardrobe&&<Wardrobe key={'wardrobe:'+me.profile.id+':'+me.csrfToken} me={me} source={active&&view.snapshot?{epoch:view.snapshot.epoch,roomId:view.snapshot.roomId,membershipId:view.snapshot.membershipId}:null} effective={active?view.snapshot?.participants.find(person=>person.profile.id===me.profile.id)?.outfit??'casual':null}/ >}{experience.events&&available&&<WorldEvents key={'events:'+me.profile.id+':'+me.csrfToken} me={me} worldSlug={experience.slug} source={active&&view.snapshot?{epoch:view.snapshot.epoch,roomId:view.snapshot.roomId,membershipId:view.snapshot.membershipId}:null}/>}</>}{!sceneFirst&&<a className="cafe-action-back" href="#cafe-room-controls">Back to visit controls</a>}</RoomDrawer></div>
      <RoomDrawer enabled={sceneFirst} title="People and safety" drawerRef={visitsDialog} onClosed={()=>closedPanel('visit')}>
      {sceneFirst&&<div className="cafe-drawer-status">{panel==='visit'&&<>{connection}{feedback}</>}</div>}
      {sceneFirst&&<><nav className="cafe-drawer-links" aria-label="City and identity"><Link href="/">City</Link><Link href="/identity">Identity</Link><Link href="/social">Your circle</Link></nav><details className="cafe-onboarding"><summary>New here?</summary><p>Enter when a place is available, then choose an open seat or activity. Your place is confirmed when the room responds. You can leave or open safety controls independently.</p><p>If a room is full, try another available place. Only confirmed room information is shown.</p></details></>}
      <aside className="cafe-sidebar" id="cafe-room-controls" tabIndex={-1} aria-label="Your room"><h2>Your visit</h2>{!sceneFirst&&<>{connection}{feedback}{visitControls}</>}
        <label className="cafe-motion"><input type="checkbox" checked={lowMotion} onChange={event => { const value = event.target.checked; userMotion.current = value; lowMotionRef.current = value; setLowMotion(value); scene.current?.setReducedMotion(value); }}/>Reduce room motion</label>
        <div className="cafe-present"><h2>Visible here</h2>{view.snapshot?.participants.length ? <ul>{view.snapshot.participants.map(person => <li key={person.profile.id}><span>{person.profile.displayName}</span><small>{person.state === 'reconnecting' ? 'Reconnecting' : person.seatId ? 'Seated' : 'Standing'}</small></li>)}</ul> : <p className="cafe-note">No confirmed visible visitors.</p>}</div><Link href="/worlds/sdk-sandbox/avatar-lab">Preview avatar styles</Link>
        <Link href="/travel">Travel to another world</Link>{me&&safetyRoom&&(experience.slug==='library'||experience.roomInvites)&&<RoomInvitation active={active} place={experience.noun==='cafe'?'cafe':'study'} purpose={experience.slug==='maid'?'social':'focus'} key={safetyRoom.membershipId} me={me} destination={{worldSlug:experience.slug,worldVersion:experience.worldVersion,sceneVersion:manifest.version,roomId:safetyRoom.roomId}}/>}{me && safetyRoom && <RoomSafety key={me.profile.id + ':' + safetyRoom.membershipId} me={me} room={safetyRoom} active={active}/>}
      </aside></RoomDrawer></div>
  </main>;
}
