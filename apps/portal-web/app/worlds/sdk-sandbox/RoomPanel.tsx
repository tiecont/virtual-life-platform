'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { MeSchema, RoomAckSchema, WorldCatalogSchema, type Me, type RoomSnapshot } from '@virtual-city/contracts';
import { RoomRecovery, type RoomRecoveryView } from '@virtual-city/world-sdk';
import { sandboxScene } from '@virtual-city/pixi-scene';
import type { createCafeScene } from '@virtual-city/pixi-scene';
import './room.css';

const idle: RoomRecoveryView = { status: 'idle', snapshot: null, reason: null };
type SceneView = Awaited<ReturnType<typeof createCafeScene>>;
const messages: Record<string, string> = {
  RATE_LIMITED: 'Please wait before trying again.', ROOM_FULL: 'This room is full. Try again shortly.',
  ALREADY_IN_ROOM: 'Leave your other room before entering this cafe.', WORLD_UNAVAILABLE: 'This cafe is closed.',
  WORLD_VERSION_MISMATCH: 'The cafe changed. Reload before entering.', UNAUTHENTICATED: 'Your session ended. Open identity to continue.',
  SEAT_TAKEN: 'That seat is no longer available.', ALREADY_SEATED: 'Stand up before choosing another seat.',
};
const ownInput = (state: RoomSnapshot) => ({ schemaVersion: 1, requestId: crypto.randomUUID(), epoch: state.epoch, roomId: state.roomId, membershipId: state.membershipId });
export default function RoomPanel({ socketOrigin }: { socketOrigin: string }) {
  const [me, setMe] = useState<Me | null>(null); const [available, setAvailable] = useState(false); const [loading, setLoading] = useState(true);
  const [view, setView] = useState(idle); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const host = useRef<HTMLDivElement>(null); const scene = useRef<SceneView | null>(null);
  const socket = useRef<Socket | null>(null); const recovery = useRef(new RoomRecovery()); const latest = useRef<RoomSnapshot | null>(null);
  const alive = useRef(true); const desired = useRef(false); const inFlight = useRef(false); const sequence = useRef(0);
  const claimRef = useRef<(seatId: string) => void>(() => {});
  function publish() { if (alive.current) { const next = recovery.current.view; latest.current = next.snapshot; setView(next); } }
  useEffect(() => {
    alive.current = true; let disposed = false;
    async function load() {
      try {
        const [identity, catalog] = await Promise.all([fetch('/v1/me', { cache: 'no-store' }), fetch('/v1/worlds', { cache: 'no-store' })]);
        if (!identity.ok) throw new Error('Open identity to create a guest or sign in.');
        const nextMe = MeSchema.parse(await identity.json());
        if (!catalog.ok) throw new Error('The city is unavailable. Try again shortly.');
        const worlds = WorldCatalogSchema.parse(await catalog.json()); const world = worlds.worlds.find(world => world.slug === 'sdk-sandbox');
        if (!disposed) { setMe(nextMe); setAvailable(world?.availability === 'available'); }
      } catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : 'The city is unavailable.'); }
      finally { if (!disposed) setLoading(false); }
    }
    void load();
    const identityBus = new BroadcastChannel('virtual-city-identity');
    identityBus.onmessage = () => {
      desired.current = false; socket.current?.close(); socket.current = null; recovery.current = new RoomRecovery(); publish(); void load();
    };
    return () => { disposed = true; alive.current = false; desired.current = false; sequence.current++; socket.current?.close(); socket.current = null; identityBus.close(); };
  }, []);
  useEffect(() => {
    const element = host.current; if (!element) return;
    let cancelled = false; let owned: SceneView | undefined;
    void import('@virtual-city/pixi-scene').then(module => module.createCafeScene(element, sandboxScene, id => claimRef.current(id))).then(renderer => {
      owned = renderer;
      if (cancelled) { renderer.destroy(); return; }
      scene.current = renderer; renderer.update(recovery.current.view.snapshot); setSceneState('ready');
    }).catch(() => { if (!cancelled) setSceneState('failed'); });
    return () => { cancelled = true; owned?.destroy(); if (scene.current === owned) scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.update(view.snapshot); }, [view]);

  async function sync(joining: boolean) {
    const client = socket.current; if (!client?.connected || inFlight.current || !desired.current) return;
    const previous = latest.current; if (!joining && !previous) return;
    inFlight.current = true; if (alive.current) setBusy(true);
    const operation = ++sequence.current; const ticket = recovery.current.beginSync(); publish();
    try {
      const input = joining ? { schemaVersion: 1, requestId: crypto.randomUUID(), worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: sandboxScene.version } : ownInput(previous!);
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
    if (!me || !available || inFlight.current) return;
    desired.current = true; socket.current?.close(); recovery.current = new RoomRecovery(); publish();
    const client = io(socketOrigin, { autoConnect: false, reconnection: true, reconnectionAttempts: 3, reconnectionDelay: 1000, transports: ['websocket'], withCredentials: true, auth: { schemaVersion: 1, csrfToken: me.csrfToken } });
    socket.current = client;
    client.on('connect', () => { if (socket.current === client) void syncRef.current(true); });
    client.on('disconnect', () => { if (socket.current === client && alive.current) { sequence.current++; inFlight.current = false; setBusy(false); recovery.current.disconnect(); publish(); } });
    client.on('connect_error', () => { if (socket.current === client && alive.current) { recovery.current.disconnect(); publish(); setMessage('Connection unavailable. Rejoin to try again.'); } });
    client.on('room.delta', event => {
      if (socket.current !== client || !alive.current) return;
      try {
        const state = latest.current;
        const gap = recovery.current.delta(event);
        if (gap) { latest.current = state; void syncRef.current(false); } else publish();
      } catch { recovery.current.disconnect(); publish(); setMessage('Room state changed. Rejoin to confirm your place.'); }
    });
    client.on('room.ended', event => {
      if (socket.current !== client || !alive.current) return;
      try { recovery.current.ended(event); } catch { recovery.current.disconnect(); }
      desired.current = false; publish(); if (recovery.current.view.status !== 'idle') client.close();
    });
    client.on('session.revoked', () => {
      if (socket.current !== client || !alive.current) return;
      desired.current = false; recovery.current.disconnect(); publish(); setMe(null); setMessage('Your session ended. Open identity to continue.'); client.close();
    });
    client.connect();
  }
  async function mutate(name: 'seat.claim' | 'seat.release' | 'room.leave', seatId?: string) {
    const current = latest.current; const client = socket.current;
    if (!current || !client?.connected || inFlight.current) return;
    inFlight.current = true; setBusy(true); const run = ++sequence.current;
    const ticket = recovery.current.beginSync(); publish();
    try {
      const ack = RoomAckSchema.parse(await client.timeout(5000).emitWithAck(name, { ...ownInput(current), ...(seatId ? { seatId } : {}) }));
      if (!alive.current || socket.current !== client || run !== sequence.current) return;
      if (!ack.ok) throw new Error(messages[ack.error.code] ?? 'That change could not be confirmed. Rejoin to check your place.');
      if (name === 'room.leave') { desired.current = false; client.close(); recovery.current = new RoomRecovery(); publish(); setMessage('You left the cafe.'); }
      else if (ack.result.type === 'snapshot') { recovery.current.acceptSnapshot(ticket, ack.result); publish(); setMessage(name === 'seat.claim' ? 'Your seat is confirmed.' : 'You stood up.'); }
    } catch (error) {
      if (alive.current && socket.current === client) { recovery.current.disconnect(); publish(); setMessage(error instanceof Error ? error.message : 'Change unconfirmed. Rejoin to check your place.'); }
    } finally { if (sequence.current === run) { inFlight.current = false; if (alive.current) setBusy(false); } }
  }
  claimRef.current = id => { void mutate('seat.claim', id); };
  const active = view.status === 'active' && view.snapshot !== null;
  const status = view.status === 'active' ? view.reason === 'membership-reset' ? 'Rejoined. Your previous place was interrupted.' : 'Connected' : view.status === 'syncing' ? 'Confirming your place...' : view.status === 'reconnecting' ? 'Connection lost. Your place is unconfirmed.' : view.status === 'interrupted' ? view.reason === 'authority-lost' || view.reason === 'server-stopping' ? 'The room was interrupted. Rejoin when it reopens.' : 'This room ended.' : available ? 'Ready to enter' : 'Cafe closed';
  return <main className="cafe-shell">
    <header className="cafe-nav"><Link href="/">Virtual Life Platform</Link><nav aria-label="Cafe navigation"><Link href="/identity">Identity</Link><Link href="/social">Your circle</Link></nav><span className="cafe-local">LOCAL TEST WORLD</span></header>
    <div className="cafe-heading"><div><p className="cafe-eyebrow">SDK Sandbox</p><h1>Local Test Cafe</h1></div><div className="cafe-occupancy" aria-label="Room occupancy"><strong>{view.snapshot?.occupancy ?? 0}</strong><span>/ 8 present</span></div></div>
    <div className="cafe-main"><div className="cafe-scene-column">
      <div className="cafe-scene" ref={host} role="img" aria-label="Cafe floor plan. Two shared tables, eight seats, an entrance and a counter. Seat controls follow below."/>
      <div className="cafe-scene-caption"><span>WINDOW & GARDEN TABLES</span><span>{sceneState === 'loading' ? 'Loading scene...' : sceneState === 'failed' ? 'Scene unavailable. Seat controls remain available.' : 'Original fixture art'}</span></div>
      <section className="cafe-seats" aria-labelledby="cafe-seat-title"><div className="cafe-section-heading"><h2 id="cafe-seat-title">Choose a seat</h2>{view.snapshot?.self.seatId && <button disabled={busy} onClick={() => void mutate('seat.release', view.snapshot!.self.seatId!)}>Stand up</button>}</div>
        <div className="cafe-seat-grid">{sandboxScene.seats.map(point => {
          const seat = view.snapshot?.seats.find(seat => seat.seatId === point.seatId);
          return <button key={point.seatId} className={seat?.mine ? 'mine' : ''} disabled={!active || busy || seat?.state !== 'available' || !!view.snapshot?.self.seatId} aria-label={point.label + (seat?.mine ? ', your seat' : '')} onClick={() => void mutate('seat.claim', point.seatId)}><span>{point.seatId.slice(5).padStart(2, '0')}</span><span>{point.label.split(' ').slice(0, 2).join(' ')}<small>{seat?.mine ? 'Your seat' : !active ? 'Not connected' : seat?.state === 'held' ? 'Reconnecting' : seat?.state === 'occupied' ? 'Occupied' : 'Available'}</small></span></button>;
        })}</div>
      </section></div>
      <aside className="cafe-sidebar" aria-label="Your room"><h2>Your visit</h2><p className="cafe-connection" role="status" aria-live="polite">{loading ? 'Checking your session...' : status}</p>
        {message && <p className="cafe-message" role="alert">{message}</p>}
        {me ? <><p className="cafe-identity">{me.profile.displayName}</p><p className="cafe-note">{active ? view.snapshot?.self.seatId ? 'Seated at ' + sandboxScene.seats.find(seat => seat.seatId === view.snapshot?.self.seatId)?.label : 'Standing near the entrance' : 'No confirmed place'}</p>
          {active ? <button className="cafe-primary" disabled={busy} onClick={() => void mutate('room.leave')}>Leave cafe</button> : <button className="cafe-primary" disabled={!available || busy || loading || view.status === 'syncing'} onClick={enter}>{view.status === 'idle' ? 'Enter cafe' : 'Rejoin cafe'}</button>}
        </> : !loading && <Link href="/identity">Open identity</Link>}
        <div className="cafe-present"><h2>Visible here</h2>{view.snapshot?.participants.length ? <ul>{view.snapshot.participants.map(person => <li key={person.profile.id}><span>{person.profile.displayName}</span><small>{person.state === 'reconnecting' ? 'Reconnecting' : person.seatId ? 'Seated' : 'Standing'}</small></li>)}</ul> : <p className="cafe-note">No confirmed visible visitors.</p>}</div>
      </aside></div>
  </main>;
}
