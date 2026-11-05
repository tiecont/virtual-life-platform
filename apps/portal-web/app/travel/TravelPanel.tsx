'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ApiErrorSchema, MeSchema, OwnRoomSchema, RoomAckSchema, RoomDeltaSchema, TravelAckSchema, TravelIntentReceiptSchema, WorldCatalogSchema, type Me, type RoomSnapshot, type TravelIntentInput, type WorldCard } from '@virtual-city/contracts';
import { announceVisitChange } from '../components/visit-hint';
import type { DestinationLink } from './destination-link';
type Pending = { createKey: string; requestId: string; input: TravelIntentInput; intentId?: string; capability?: string };
class TravelError extends Error { constructor(readonly code: string) { super(code); } }
const messageFor = (error: unknown) => error instanceof TravelError ? error.code === 'UNAUTHENTICATED' ? 'Your session ended. Open identity to continue.' : error.code === 'ROOM_FULL' ? 'The destination is full. Your current visit will be checked again.' : error.code === 'RATE_LIMITED' ? 'Please wait before trying again.' : error.code === 'NOT_IN_ROOM' || error.code === 'ALREADY_IN_ROOM' ? 'Your room changed. Refresh your visit before travelling.' : 'Travel could not be confirmed. Refresh your visit or retry the same request.' : 'Travel response was interrupted. Refresh your visit or retry the same request.';
export default function TravelPanel({ socketOrigin,preferred={kind:'none'} }: { socketOrigin: string;preferred?:DestinationLink }) {
  const [me, setMe] = useState<Me | null>(null), [worlds, setWorlds] = useState<WorldCard[]>([]), [current, setCurrent] = useState<RoomSnapshot | null>(null), [destination, setDestination] = useState(preferred.kind==='preferred'?preferred.worldSlug:''),[targetRoom,setTargetRoom]=useState<string|null>(preferred.kind==='preferred'?preferred.roomId??null:null),[linkTouched,setLinkTouched]=useState(false), [connection, setConnection] = useState<'connecting' | 'ready' | 'offline'>('connecting'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [hasPending, setHasPending] = useState(false), [identityRevision, setIdentityRevision] = useState(0);
  const client = useRef<Socket | null>(null), actor = useRef<Me | null>(null), snapshot = useRef<RoomSnapshot | null>(null), pending = useRef<Pending | null>(null), alive = useRef(true), operation = useRef(0), mutation = useRef(0), writing = useRef(false), lifetime = useRef<AbortController | null>(null), refresh = useRef<() => Promise<void>>(async () => {});
  const announcedVisit=useRef<string|null>(null);
  const publish = (state: RoomSnapshot | null) => { snapshot.current = state; if(state){const key=state.epoch+':'+state.membershipId;if(announcedVisit.current!==key){announcedVisit.current=key;announceVisitChange();}}if (alive.current) setCurrent(state); };
  function clearPending() { pending.current = null; if (alive.current) setHasPending(false); }
  async function api(path: string, options: RequestInit = {}) {
    const timeout=AbortSignal.timeout(8000),signal=lifetime.current?AbortSignal.any([lifetime.current.signal,timeout]):timeout;
    const response = await fetch('/v1' + path, { ...options, cache: 'no-store', credentials: 'same-origin', signal });
    if (!response.ok) { const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null)); throw new TravelError(parsed.success ? parsed.data.error.code : 'INTERNAL_ERROR'); } return response.json() as Promise<unknown>;
  }
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); lifetime.current = controller; let socket: Socket | null = null;
    async function hydrate() {
      if (!socket?.connected || controller.signal.aborted) return;
      const ticket = ++operation.current; setConnection('connecting'); publish(null);
      try {
        const [rawMe, rawWorlds, rawRoom] = await Promise.all([api('/me'), api('/worlds'), api('/me/room')]);
        const identity = MeSchema.parse(rawMe), catalog = WorldCatalogSchema.parse(rawWorlds), room = OwnRoomSchema.parse(rawRoom);
        if (controller.signal.aborted || ticket !== operation.current || !socket.connected) return;
        if (actor.current && actor.current.profile.id !== identity.profile.id) clearPending();
        actor.current = identity; setMe(identity); setWorlds(catalog.worlds.filter(world => world.availability === 'available' && world.accessHint === 'session-required'));
        let state = room.snapshot;
        if (state) {
          const ack = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: crypto.randomUUID(), worldSlug: state.worldSlug, worldVersion: room.worldVersion, sceneVersion: room.sceneVersion, roomId: state.roomId }));
          if (!ack.ok) throw new TravelError(ack.error.code); if (ack.result.type !== 'snapshot') throw new TravelError('NOT_IN_ROOM'); state = ack.result;
        }
        if (controller.signal.aborted || ticket !== operation.current || !socket.connected) return;
        const previous = pending.current;
        if (previous?.intentId) {
          const receipt = TravelIntentReceiptSchema.parse(await api('/travel-intents/' + previous.intentId));
          if (receipt.phase === 'COMMITTED' && previous.capability) {
            const result = TravelAckSchema.parse(await socket.timeout(5000).emitWithAck('travel.request', { schemaVersion: 1, requestId: previous.requestId, intentId: previous.intentId, capability: previous.capability }));
            if (!result.ok) throw new TravelError(result.error.code);
            if (result.result.snapshot) state = result.result.snapshot;
            setMessage(result.result.snapshot ? 'Travel recovered. Your destination is confirmed.' : 'Previous travel ended. Your current visit has been checked.'); clearPending();
          } else if (!['CREATED', 'READY'].includes(receipt.phase)) { setMessage('Previous travel ended. Your current visit has been checked.'); clearPending(); }
        }
        if (controller.signal.aborted || ticket !== operation.current || !socket.connected) return;
        publish(state); setConnection('ready');
      } catch (error) {
        if (!controller.signal.aborted && ticket === operation.current) { publish(null); setConnection('offline'); setMessage(messageFor(error)); if (error instanceof TravelError && error.code === 'UNAUTHENTICATED') { actor.current = null; setMe(null); clearPending(); } }
      }
    }
    refresh.current = hydrate;
    void api('/me').then(raw => {
      if (controller.signal.aborted) return;
      const identity = MeSchema.parse(raw); actor.current = identity; setMe(identity);
      socket = io(socketOrigin, { autoConnect: false, reconnection: true, reconnectionAttempts: 4, reconnectionDelay: 1000, transports: ['websocket'], withCredentials: true, auth: { schemaVersion: 1, csrfToken: identity.csrfToken } }); client.current = socket;
      socket.on('connect', () => { void hydrate(); });
      socket.on('disconnect', () => { if (!controller.signal.aborted) { operation.current++; mutation.current++; writing.current = false; setBusy(false); publish(null); setConnection('offline'); setMessage('Connection lost. Your place is unconfirmed.'); } });
      socket.on('connect_error', () => { if (!controller.signal.aborted) { publish(null); setConnection('offline'); setMessage('Connection unavailable. Refresh your visit to try again.'); } });
      socket.on('room.delta', raw => { const parsed = RoomDeltaSchema.safeParse(raw); if (!parsed.success || !snapshot.current) return; const next = parsed.data.state, old = snapshot.current; if (next.epoch === old.epoch && next.membershipId === old.membershipId && next.roomId === old.roomId && next.roomVersion >= old.roomVersion) publish(next); });
      socket.on('room.ended', () => { publish(null); if (!writing.current && !controller.signal.aborted) { setConnection('offline'); setMessage('Your room changed. Refresh your visit to confirm your place.'); } });
      socket.on('session.revoked', () => { if (!controller.signal.aborted) { operation.current++; publish(null); setConnection('offline'); setMe(null); actor.current = null; clearPending(); setMessage('Your session ended. Open identity to continue.'); socket?.close(); } });
      socket.connect();
    }).catch(error => { if (!controller.signal.aborted) { setConnection('offline'); setMessage(messageFor(error)); } });
    const bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('virtual-city-identity');
    if (bus) bus.onmessage = () => { clearPending(); publish(null); setMe(null); actor.current = null; setWorlds([]); setConnection('connecting'); setIdentityRevision(value => value + 1); };
    const timer = setInterval(() => { if (socket?.connected && !writing.current) void hydrate(); }, 15000);
    return () => { controller.abort(); clearInterval(timer); bus?.close(); operation.current++; mutation.current++; writing.current = false; alive.current = false; socket?.removeAllListeners(); socket?.close(); client.current = null; snapshot.current = null; };
    // Each lifetime owns its fetches, socket, timers and mutation callbacks.
  }, [socketOrigin, identityRevision]);
  async function travel(retry = false) {
    const socket = client.current, identity = actor.current, world = worlds.find(world => world.slug === destination);
    if (!socket?.connected || !identity || writing.current || connection !== 'ready' || (!retry && (!world||world.slug===snapshot.current?.worldSlug&&(!targetRoom||targetRoom===snapshot.current.roomId)))) return;
    if (!retry) {
      const source = snapshot.current;
      pending.current = { createKey: crypto.randomUUID(), requestId: crypto.randomUUID(), input: { schemaVersion: 1, source: source ? { epoch: source.epoch, roomId: source.roomId, membershipId: source.membershipId } : null, destination: { worldSlug: world!.slug, worldVersion: world!.version, sceneVersion: world!.sceneRef.version,...targetRoom?{roomId:targetRoom}:{} } } };
    }
    const request = pending.current; if (!request) return;
    writing.current = true; setBusy(true); setHasPending(true); setMessage('Confirming travel...'); const ticket = ++operation.current, writeId = ++mutation.current;
    try {
      if (!request.intentId || !request.capability) {
        const receipt = TravelIntentReceiptSchema.parse(await api('/travel-intents', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': identity.csrfToken, 'idempotency-key': request.createKey }, body: JSON.stringify(request.input) }));
        if (!receipt.capability) throw new TravelError('NOT_AVAILABLE'); request.intentId = receipt.intentId; request.capability = receipt.capability;
      }
      if (!alive.current || ticket !== operation.current || !socket.connected) return;
      const ack = TravelAckSchema.parse(await socket.timeout(5000).emitWithAck('travel.request', { schemaVersion: 1, requestId: request.requestId, intentId: request.intentId, capability: request.capability }));
      if (!alive.current || ticket !== operation.current || !socket.connected) return;
      if (!ack.ok) throw new TravelError(ack.error.code);
      clearPending(); publish(ack.result.snapshot); setConnection(ack.result.snapshot ? 'ready' : 'offline'); setMessage(ack.result.snapshot ? 'Destination confirmed.' : 'Travel ended without a confirmed destination. Refresh your visit.');
    } catch (error) {
      if (alive.current && ticket === operation.current) { setMessage(messageFor(error)); if (error instanceof TravelError && !['RATE_LIMITED', 'INTERNAL_ERROR', 'WORLD_UNAVAILABLE'].includes(error.code)) clearPending(); await refresh.current(); }
    } finally { if (alive.current && writeId === mutation.current) { writing.current = false; setBusy(false); } }
  }
  async function leave() {
    const socket = client.current, state = snapshot.current; if (!socket?.connected || !state || writing.current) return;
    writing.current = true; setBusy(true); const writeId = ++mutation.current;
    try { const ack = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.leave', { schemaVersion: 1, requestId: crypto.randomUUID(), epoch: state.epoch, roomId: state.roomId, membershipId: state.membershipId })); if (!alive.current || writeId !== mutation.current) return; if (!ack.ok) throw new TravelError(ack.error.code); publish(null);announcedVisit.current=null;announceVisitChange(); setConnection('ready'); setMessage('You returned to the lobby.'); clearPending(); }
    catch (error) { if (alive.current) { setMessage(messageFor(error)); await refresh.current(); } }
    finally { if (alive.current && writeId === mutation.current) { writing.current = false; setBusy(false); } }
  }
  async function cancelRequest() {
    const request = pending.current, identity = actor.current; if (!request || !identity || writing.current) return;
    writing.current = true; setBusy(true); const writeId = ++mutation.current;
    try {
      if (request.intentId) await api('/travel-intents/' + request.intentId + '/cancel', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': identity.csrfToken, 'idempotency-key': crypto.randomUUID() }, body: '{}' });
      if (!alive.current || writeId !== mutation.current) return;
      const known=!!request.intentId;clearPending(); setMessage(known?'Travel request closed.':'Interrupted request dismissed. Wait briefly before starting another trip.'); await refresh.current();
    } catch (error) { if (alive.current && writeId === mutation.current) setMessage(messageFor(error)); }
    finally { if (alive.current && writeId === mutation.current) { writing.current = false; setBusy(false); } }
  }
  return <div className="identity-panel travel-panel"><p role="status" aria-live="polite">{connection === 'connecting' ? 'Checking your visit...' : connection === 'offline' ? 'Your place is unconfirmed.' : current ? 'Visit confirmed.' : 'Lobby confirmed.'}</p><p className="travel-message" aria-live="polite">{message}</p>
    {!me ? <a href="/identity">Open identity</a> : <>
      <p className="travel-identity" data-account-id={me.profile.id}>{me.profile.displayName} · Avatar: {me.profile.avatarKey}</p>
      <section aria-labelledby="current-visit"><h2 id="current-visit">Your visit</h2><div data-world={current?.worldSlug ?? ''} data-membership-id={current?.membershipId ?? ''} className="travel-location">{connection !== 'ready' ? 'No confirmed place' : current ? worlds.find(world => world.slug === current.worldSlug)?.title ?? 'Private world' : 'City lobby'}</div>
        {current && <p className="muted">{current.occupancy} / {current.capacity} present · {current.self.seatId ? 'Your seat is retained.' : 'On the floor'}</p>}
        {connection==='ready'&&current?.worldSlug==='library'&&<Link href="/worlds/library">Open Library room</Link>}
        {connection==='ready'&&current?.worldSlug==='deadline'&&<Link href="/worlds/deadline">Open Deadline room</Link>}
        {connection==='ready'&&current?.worldSlug==='maid'&&<Link href="/worlds/maid">Open Maid room</Link>}
        {connection==='ready'&&current?.worldSlug==='park'&&<Link href="/worlds/park">Open Park room</Link>}
        {connection==='ready'&&current?.worldSlug==='restaurant'&&<Link href="/worlds/restaurant">Open Restaurant room</Link>}
        <button disabled={busy} onClick={() => { if (client.current?.connected) void refresh.current(); else client.current?.connect(); }}>Refresh your visit</button>{current && <button className="secondary" disabled={busy} onClick={() => void leave()}>Return to lobby</button>}
      </section>
      <form onSubmit={event => { event.preventDefault(); void travel(); }}><h2>Choose your destination</h2><label htmlFor="travel-destination">Destination</label><select id="travel-destination" value={destination} disabled={busy || hasPending || connection !== 'ready'} onChange={event => {setDestination(event.target.value);setTargetRoom(null);setLinkTouched(true);}} required><option value="">Choose a world</option>{worlds.filter(world => world.slug !== current?.worldSlug||world.slug===destination&&!!targetRoom&&targetRoom!==current.roomId).map(world => <option key={world.slug} value={world.slug}>{world.title}</option>)}</select>
      {!linkTouched&&preferred.kind==='invalid'?<p className="travel-link-notice" aria-live="polite">This destination link is invalid. Choose a listed place.</p>:connection==='ready'&&destination&&!worlds.some(world=>world.slug===destination)?<p className="travel-link-notice" aria-live="polite">That destination is unavailable. Choose a listed place.</p>:connection==='ready'&&current?.worldSlug===destination&&(!targetRoom||targetRoom===current.roomId)?<p className="travel-link-notice" aria-live="polite">You are already in the selected room or world.</p>:targetRoom?<p className="travel-link-notice">A specific room is selected. Confirmation checks its capacity and access again.</p>:null}
      <p className="muted">Your current place stays while the destination is checked. Confirm to leave it and enter the selected world.</p><button disabled={busy || connection !== 'ready' || hasPending || !worlds.some(world => world.slug === destination && (world.slug !== current?.worldSlug||!!targetRoom&&targetRoom!==current.roomId))}>Confirm travel</button>{hasPending && <><button className="secondary" type="button" disabled={busy || connection !== 'ready'} onClick={() => void travel(true)}>Retry last travel</button><button className="secondary" type="button" disabled={busy} onClick={() => void cancelRequest()}>{pending.current?.intentId?'Close travel request':'Dismiss interrupted request'}</button></>}</form>
    </>}
  </div>;
}
