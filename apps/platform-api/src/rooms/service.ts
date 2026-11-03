import { randomUUID } from 'node:crypto';
import { RoomSnapshotSchema, RoomEndedSchema, type TravelSource, type TravelDestination, type RoomMotion, type RoomMove, type RoomJoin, type RoomOwnCommand, type RoomSnapshot, type RoomEnded, type SeatClaim, type SeatRelease, type PublicProfile } from '@virtual-city/contracts';
import { findScenePath, motionPosition, type WorldRegistry, type WorldActor } from '@virtual-city/world-sdk';
import type { IdentityService } from '../identity/service';
import { DomainError } from '../common/errors';
import type { RoomAuthority } from './authority';

type Member = { id: string; accountId: string; worldVersion: string; sceneVersion: string; connections: Map<string, string>; sessions: Set<string>; disconnectedUntil: number | null; seatId: string | null; motion?: RoomMotion };
type Room = { id: string; slug: string; capacity: number; version: number; members: Map<string, Member>; emptySince: number; seats: Map<string, string | null> };
type Receipt = { sessionId: string; fingerprint: string; until: number; roomId: string; membershipId: string; operation: 'join' | 'leave' | 'seat.claim' | 'seat.release' | 'room.move' };
export type TravelAuthorization = Readonly<{ intentId: string; accountId: string; sessionId: string; ownerEpoch: string; source: TravelSource | null; destination: TravelDestination; expiresAt: number }>;
type TravelHold = { authorization: TravelAuthorization; room: Room; member: Member; generation: number; connectionId: string; admission?: Awaited<ReturnType<WorldRegistry['prepareAdmission']>>; departure?: () => Promise<void> };
export const DISCONNECT_GRACE_MS = 15000;
export interface RoomProjection {
  relationships(viewerId: string, targetIds: string[]): Promise<Map<string, { blocked: boolean; friends: boolean }>>;
  profiles(viewerId: string, targetIds: string[], worldSlug: string, relationships: Map<string, { blocked: boolean; friends: boolean }>): Promise<PublicProfile[]>;
}
export type RoomUpdate = { connectionId: string; fromVersion: number; snapshot: RoomSnapshot };
export interface RoomSafetyPort { assert(accountId: string, worldSlug: string, roomId?: string, chat?: boolean): Promise<void> }
export class RoomService {
  readonly epoch = randomUUID();
  #rooms = new Map<string, Room>();
  #travelHolds = new Map<string, TravelHold>();
  #accounts = new Map<string, string>();
  #connections = new Map<string, { roomId: string; accountId: string; sessionId: string }>();
  #motionConnections = new Set<string>();
  #receipts = new Map<string, Receipt>();
  #tail: Promise<void> = Promise.resolve();
  #pending = 0;
  #peakPending = 0;
  #closed = false;
  #ended = new Set<(connectionIds: string[], event: RoomEnded) => void>();
  #worldGenerations = new Map<string, number>();
  #unsubscribe: () => void;
  #unsubscribeRevocations: () => void;
  #changed = new Map<(updates: RoomUpdate[]) => void, (connectionId: string) => boolean>();
  #controls = new Map<string, { promise: Promise<void>; again: boolean }>();
  #refresh = new Set<string>();
  #unsubscribeAuthority: () => void;
  constructor(private registry: WorldRegistry, private identity: IdentityService, private authority: RoomAuthority, private now = Date.now, private projection?: RoomProjection, private safety?: RoomSafetyPort) {
    this.#unsubscribeAuthority = authority.onLost(() => { this.#abandon(); });
    this.#unsubscribe = registry.onUnavailable(slug => {
      this.#worldGenerations.set(slug, (this.#worldGenerations.get(slug) ?? 0) + 1);
      void this.#control('world:' + slug, async () => { for (const room of [...this.#rooms.values()]) if (room.slug === slug) this.#removeRoom(room, 'world-unavailable'); });
    });
    this.#unsubscribeRevocations = identity.onRevoked(event => { void this.endSessions(event.accountId, event.sessionIds); });
  }
  onChanged(listener: (updates: RoomUpdate[]) => void, accepts: (connectionId: string) => boolean = () => true) { this.#changed.set(listener, accepts); return () => { this.#changed.delete(listener); }; }
  // Serialize committed restrictions with joins, delayed chat publication and room commands.
  safetyMutation<T>(work: () => Promise<{ result: T; closeWorld?: string; interruption?: { accountId: string; worldSlug: string | null; roomId: string | null } }>): Promise<T> {
    return this.#run(async () => {
      const { result, interruption, closeWorld } = await work();
      if (closeWorld) for (const room of [...this.#rooms.values()]) if (room.slug === closeWorld) this.#removeRoom(room, 'world-unavailable');
      if (interruption) {
        const room = this.#rooms.get(this.#accounts.get(interruption.accountId) ?? ''); const member = room?.members.get(interruption.accountId);
        if (room && member && (!interruption.worldSlug || room.slug === interruption.worldSlug) && (!interruption.roomId || room.id === interruption.roomId)) {
          const from = room.version; this.#removeMember(room, member, 'world-unavailable'); await this.#notifyChanged(room, from);
        }
      }
      return result;
    });
  }
  diagnostics() {
    const rooms = [...this.#rooms.values()]; const members = rooms.flatMap(room => [...room.members.values()]);
    return { rooms: rooms.length, memberships: this.#accounts.size, connections: this.#connections.size,
      occupiedSeats: members.filter(member => member.seatId !== null).length, travelHolds: this.#travelHolds.size,
      graceMemberships: members.filter(member => member.disconnectedUntil !== null).length,
      receipts: this.#receipts.size, pending: this.#pending, peakPending: this.#peakPending, controlKeys: this.#controls.size };
  }
  endSessions(accountId: string, sessionIds: string[]) {
    const currentRoom = this.#rooms.get(this.#accounts.get(accountId) ?? ''); const current = currentRoom?.members.get(accountId);
    if (!current) return Promise.resolve();
    return Promise.all([...new Set(sessionIds)].filter(id => current.sessions.has(id)).map(sessionId => this.#control('session:' + sessionId, async () => {
      const room = this.#rooms.get(this.#accounts.get(accountId) ?? ''); const member = room?.members.get(accountId);
      if (!room || !member) return;
      const fromVersion = room.version;
      for (const [id, ownerSession] of member.connections) if (ownerSession === sessionId) { member.connections.delete(id); this.#connections.delete(id); this.#motionConnections.delete(id); }
      member.sessions.delete(sessionId);
      if (member.sessions.size === 0) this.#removeMember(room, member, 'disconnected');
      else if (member.connections.size === 0 && member.disconnectedUntil === null) { this.#freezeMotion(member); member.disconnectedUntil = this.now() + DISCONNECT_GRACE_MS; room.version++; }
      if (room.version !== fromVersion) await this.#notifyChanged(room, fromVersion);
    }))).then(() => {});
  }
  onEnded(listener: (connections: string[], event: RoomEnded) => void) { this.#ended.add(listener); return () => { this.#ended.delete(listener); }; }
  #run<T>(work: () => Promise<T>, control = false): Promise<T> {
    if (!control && this.#closed) return Promise.reject(new DomainError('WORLD_UNAVAILABLE', 503, 'Room authority unavailable'));
    if (!control && this.#pending >= 256) return Promise.reject(new DomainError('RATE_LIMITED', 429, 'Room service busy'));
    this.#pending++;
    this.#peakPending = Math.max(this.#peakPending, this.#pending);
    const result = this.#tail.then(async () => {
      if (!control) await this.authority.assert();
      try {
        const value = await work();
        if (!control) await this.authority.assert();
        return value;
      } catch (error) { if (this.authority.state === 'lost') this.#abandon(); throw error; }
    }).finally(() => { this.#pending--; }); this.#tail = result.then(() => {}, () => {}); return result;
  }
  #control(key: string, work: () => Promise<void>): Promise<void> {
    const pending = this.#controls.get(key); if (pending) { pending.again = true; return pending.promise; }
    const entry = { promise: Promise.resolve(), again: false };
    entry.promise = this.#run(async () => {
      try { do { entry.again = false; await work(); } while (entry.again); }
      finally { this.#controls.delete(key); }
    }, true);
    this.#controls.set(key, entry); return entry.promise;
  }
  hasMembership(actor: WorldActor, slug: string, membershipId: string): boolean {
    if (this.#closed || this.authority.state !== 'held') return false;
    const room = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''); const member = room?.members.get(actor.accountId);
    return Boolean(room?.slug === slug && member?.id === membershipId && [...member.connections.values()].includes(actor.sessionId));
  }
  async permits(actor: WorldActor, slug: string, membershipId: string): Promise<boolean> {
    try { await this.authority.assert(); return this.hasMembership(actor, slug, membershipId); } catch { return false; }
  }
  #emitEnded(room: Room, member: Member, reason: RoomEnded['reason']) {
    const event = RoomEndedSchema.parse({ schemaVersion: 1, epoch: this.epoch, roomId: room.id, reason });
    for (const listener of this.#ended) { try { listener([...member.connections.keys()], event); } catch { /* Removal remains authoritative. */ } }
  }
  #removeMember(room: Room, member: Member, reason: RoomEnded['reason']) {
    this.#emitEnded(room, member, reason);
    for (const id of member.connections.keys()) { this.#connections.delete(id); this.#motionConnections.delete(id); }
    if (member.seatId) room.seats.set(member.seatId, null);
    room.members.delete(member.accountId); this.#accounts.delete(member.accountId); room.version++;
    if (room.members.size === 0) room.emptySince = this.now();
  }
  #removeRoom(room: Room, reason: RoomEnded['reason']) { for (const member of [...room.members.values()]) this.#removeMember(room, member, reason); this.#rooms.delete(room.id); }
  async #sweep() {
    const time = this.now();
    for (const [id, hold] of this.#travelHolds) if (hold.authorization.expiresAt <= time) { this.#travelHolds.delete(id); void hold.admission?.abort().catch(() => {}); }
    for (const room of [...this.#rooms.values()]) {
      const fromVersion = room.version;
      for (const member of [...room.members.values()]) if (member.disconnectedUntil !== null && member.disconnectedUntil <= time) this.#removeMember(room, member, 'disconnected');
      if (!room.members.size && !this.#holds(room) && time - room.emptySince >= 60000) this.#rooms.delete(room.id);
      if (room.version !== fromVersion) await this.#notifyChanged(room, fromVersion);
    }
    for (const [key, receipt] of this.#receipts) if (receipt.until <= time) this.#receipts.delete(key);
  }
  #holds(room: Room) { return [...this.#travelHolds.values()].filter(hold => hold.room.id === room.id).length; }
  async #snapshot(room: Room, member: Member, withMotion = false): Promise<RoomSnapshot> {
    const seats = [...room.seats].map(([seatId, ownerId]) => ({ seatId, state: ownerId ? room.members.get(ownerId)?.disconnectedUntil !== null ? 'held' : 'occupied' : 'available', mine: ownerId === member.accountId }));
    const ids = [...room.members.keys()];
    const relationships = this.projection ? await this.projection.relationships(member.accountId, ids) : new Map(ids.map(id => [id, { blocked: id !== member.accountId, friends: false }]));
    const profiles = this.projection ? await this.projection.profiles(member.accountId, ids, room.slug, relationships) : [];
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const participants = [...room.members.values()].filter(candidate => profileMap.has(candidate.accountId)).map(candidate => ({ profile: profileMap.get(candidate.accountId)!, seatId: candidate.seatId, state: candidate.disconnectedUntil === null ? 'active' as const : 'reconnecting' as const, ...(withMotion && candidate.motion ? { motion: candidate.motion } : {}) }));
    return RoomSnapshotSchema.parse({ schemaVersion: 1, type: 'snapshot', epoch: this.epoch, roomId: room.id, worldSlug: room.slug, roomVersion: room.version, capacity: room.capacity, occupancy: room.members.size, membershipId: member.id, self: { accountId: member.accountId, seatId: member.seatId, ...(withMotion && member.motion ? { motion: member.motion } : {}) }, ...(withMotion ? { serverTime: this.now() } : {}), seats, participants });
  }
  async #notifyChanged(room: Room, fromVersion: number) {
    if (this.#closed || !this.#changed.size || !room.members.size) return;
    const updates: RoomUpdate[] = [];
    for (const member of room.members.values()) {
      const snapshots = new Map<boolean, RoomSnapshot>();
      for (const connectionId of member.connections.keys()) {
        if (![...this.#changed.values()].some(accepts => accepts(connectionId))) continue;
        const motion = this.#motionConnections.has(connectionId);
        if (!snapshots.has(motion)) snapshots.set(motion, await this.#snapshot(room, member, motion));
        updates.push({ connectionId, fromVersion, snapshot: snapshots.get(motion)! });
      }
    }
    await this.authority.assert();
    for (const [listener, accepts] of this.#changed) { try { listener(updates.filter(update => accepts(update.connectionId))); } catch { /* The next snapshot remains authoritative. */ } }
  }
  #receipt(actor: WorldActor, requestId: string, operation: Receipt['operation'], input: unknown) {
    const key = actor.accountId + ':' + requestId; const fingerprint = this.identity.fingerprint({ operation, input }); const receipt = this.#receipts.get(key);
    if (receipt && (receipt.sessionId !== actor.sessionId || receipt.fingerprint !== fingerprint)) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    if (!receipt && this.#receipts.size >= 10000) throw new DomainError('RATE_LIMITED', 429, 'Room receipt limit reached');
    return { key, fingerprint, receipt };
  }
  #remember(actor: WorldActor, request: { key: string; fingerprint: string }, room: Room, member: Member, operation: Receipt['operation']) {
    this.#receipts.set(request.key, { sessionId: actor.sessionId, fingerprint: request.fingerprint, until: this.now() + 300000, roomId: room.id, membershipId: member.id, operation });
  }
  join(credential: string, connectionId: string, input: RoomJoin, connected: () => boolean) {
    return this.#run(async () => {
      await this.#sweep();
      const generation = this.#worldGenerations.get(input.worldSlug) ?? 0;
      const { actor, definition } = await this.registry.authorizeWorld(credential, input.worldSlug);
      if (generation !== (this.#worldGenerations.get(input.worldSlug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      if (!connected()) throw new DomainError('UNAUTHENTICATED', 401, 'Connection closed');
      if (input.worldVersion !== definition.version || input.sceneVersion !== definition.sceneRef.version) throw new DomainError('WORLD_VERSION_MISMATCH', 409, 'Refresh world assets');
      if (input.motionVersion && !definition.scene) throw new DomainError('WORLD_VERSION_MISMATCH', 409, 'Movement unavailable for this scene');
      const request = this.#receipt(actor, input.requestId, 'join', input);
      const current = this.#rooms.get(this.#accounts.get(actor.accountId) ?? '');
      if (request.receipt && (!current || current.id !== request.receipt.roomId || current.members.get(actor.accountId)?.id !== request.receipt.membershipId)) throw new DomainError('NOT_IN_ROOM', 409, 'Previous membership ended');
      if (current) {
        await this.safety?.assert(actor.accountId, current.slug, current.id);
        if (current.slug !== input.worldSlug || (input.roomId && current.id !== input.roomId)) throw new DomainError('ALREADY_IN_ROOM', 409, 'Leave the current room before joining another');
        const member = current.members.get(actor.accountId)!;
        const fromVersion = current.version;
        if (member.disconnectedUntil !== null) { member.disconnectedUntil = null; current.version++; }
        member.sessions.add(actor.sessionId);
        member.connections.set(connectionId, actor.sessionId); this.#connections.set(connectionId, { roomId: current.id, accountId: actor.accountId, sessionId: actor.sessionId });
        if (input.motionVersion) this.#motionConnections.add(connectionId); else this.#motionConnections.delete(connectionId);
        this.#remember(actor, request, current, member, 'join'); if (current.version !== fromVersion) await this.#notifyChanged(current, fromVersion); return this.#snapshot(current, member, this.#motionConnections.has(connectionId));
      }
      let room = input.roomId ? this.#rooms.get(input.roomId) : [...this.#rooms.values()].filter(room => room.slug === input.worldSlug && room.members.size + this.#holds(room) < room.capacity).sort((a, b) => b.members.size - a.members.size)[0];
      if (input.roomId && (!room || room.slug !== input.worldSlug)) throw new DomainError('NOT_FOUND', 404, 'Room not found');
      let created = false;
      if (!room) {
        const worldRooms = [...this.#rooms.values()].filter(room => room.slug === input.worldSlug);
        if (worldRooms.length >= 32 || this.#rooms.size >= 128) throw new DomainError('ROOM_FULL', 409, 'No room capacity available');
        room = { id: randomUUID(), slug: input.worldSlug, capacity: definition.capacity, version: 0, members: new Map(), emptySince: this.now(), seats: new Map(definition.seatIds.map(id => [id, null])) }; this.#rooms.set(room.id, room); created = true;
      }
      if (room.members.size + this.#holds(room) >= room.capacity) throw new DomainError('ROOM_FULL', 409, 'Room is full');
      await this.safety?.assert(actor.accountId, room.slug, room.id);
      const member: Member = { id: randomUUID(), accountId: actor.accountId, worldVersion: input.worldVersion, sceneVersion: input.sceneVersion, connections: new Map([[connectionId, actor.sessionId]]), sessions: new Set([actor.sessionId]), disconnectedUntil: null, seatId: null, ...(definition.scene ? { motion: { path: [definition.scene.spawn], startedAt: this.now(), stepMs: 150 } as RoomMotion } : {}) };
      room.members.set(actor.accountId, member); this.#accounts.set(actor.accountId, room.id); this.#connections.set(connectionId, { roomId: room.id, accountId: actor.accountId, sessionId: actor.sessionId });
      if (input.motionVersion) this.#motionConnections.add(connectionId);
      try {
        await this.registry.dispatch(credential, room.slug, { schemaVersion: 1, worldVersion: input.worldVersion, sceneVersion: input.sceneVersion, membershipId: member.id, action: 'join' });
        if (generation !== (this.#worldGenerations.get(input.worldSlug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
        await this.authority.assert();
        if (!connected()) throw new DomainError('UNAUTHENTICATED', 401, 'Connection closed');
      } catch (error) { this.#removeMember(room, member, 'disconnected'); if (created) this.#rooms.delete(room.id); throw error; }
      room.version++; this.#remember(actor, request, room, member, 'join'); await this.#notifyChanged(room, room.version - 1); return this.#snapshot(room, member, this.#motionConnections.has(connectionId));
    });
  }
  #own(actor: WorldActor, connectionId: string, input: RoomOwnCommand) {
    const connection = this.#connections.get(connectionId); const room = this.#rooms.get(input.roomId); const member = room?.members.get(actor.accountId);
    if (input.epoch !== this.epoch || !room || !member || member.id !== input.membershipId || connection?.roomId !== room.id || connection.accountId !== actor.accountId || connection.sessionId !== actor.sessionId) throw new DomainError('NOT_IN_ROOM', 409, 'Room membership unavailable; rejoin');
    return { room, member };
  }
  snapshot(credential: string, connectionId: string, input: RoomOwnCommand) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential); const { room, member } = this.#own(actor, connectionId, input);
      await this.registry.authorizeWorld(credential, room.slug); return this.#snapshot(room, member, this.#motionConnections.has(connectionId));
    });
  }
  leave(credential: string, connectionId: string, input: RoomOwnCommand) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential); const request = this.#receipt(actor, input.requestId, 'leave', input);
      if (request.receipt) return { schemaVersion: 1 as const, type: 'left' as const, epoch: this.epoch, roomId: request.receipt.roomId };
      const { room, member } = this.#own(actor, connectionId, input);
      try { await this.registry.dispatch(credential, room.slug, { schemaVersion: 1, worldVersion: member.worldVersion, sceneVersion: member.sceneVersion, membershipId: member.id, action: 'leave' }); }
      catch { /* Leaving remains possible even if world access or lifecycle was revoked. */ }
      const fromVersion = room.version; this.#removeMember(room, member, 'left'); this.#remember(actor, request, room, member, 'leave'); await this.#notifyChanged(room, fromVersion);
      return { schemaVersion: 1 as const, type: 'left' as const, epoch: this.epoch, roomId: room.id };
    });
  }
  detach(connectionId: string) {
    if (!this.#connections.has(connectionId)) return Promise.resolve();
    return this.#control('detach:' + connectionId, async () => {
      const connection = this.#connections.get(connectionId); if (!connection) return;
      const room = this.#rooms.get(connection.roomId); const member = room?.members.get(connection.accountId);
      this.#connections.delete(connectionId); this.#motionConnections.delete(connectionId); member?.connections.delete(connectionId);
      if (room && member && member.connections.size === 0) { this.#freezeMotion(member); member.disconnectedUntil = this.now() + DISCONNECT_GRACE_MS; const fromVersion = room.version; room.version++; await this.#notifyChanged(room, fromVersion); } await this.#sweep();
    });
  }
  seat(credential: string, connectionId: string, input: SeatClaim | SeatRelease, operation: 'seat.claim' | 'seat.release') {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential); const { room, member } = this.#own(actor, connectionId, input);
      const generation = this.#worldGenerations.get(room.slug) ?? 0; const { definition } = await this.registry.authorizeWorld(credential, room.slug);
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      const request = this.#receipt(actor, input.requestId, operation, input);
      if (request.receipt) {
        if (request.receipt.membershipId !== member.id) throw new DomainError('NOT_IN_ROOM', 409, 'Previous membership ended');
        return this.#snapshot(room, member, this.#motionConnections.has(connectionId));
      }
      if (!room.seats.has(input.seatId)) throw new DomainError('NOT_FOUND', 404, 'Seat not found');
      const owner = room.seats.get(input.seatId);
      const fromVersion = room.version;
      if (operation === 'seat.claim') {
        if (owner && owner !== actor.accountId) throw new DomainError('SEAT_TAKEN', 409, 'Seat unavailable');
        if (member.seatId && member.seatId !== input.seatId) throw new DomainError('ALREADY_SEATED', 409, 'Release your current seat first');
        if (!owner) {
          if (definition.scene) {
            const point = definition.scene.seats.find(seat => seat.seatId === input.seatId);
            const from = member.motion ? motionPosition(member.motion, this.now(), false) : definition.scene.spawn;
            const path = point && findScenePath(definition.scene, from, point);
            if (!path) throw new DomainError('INVALID_REQUEST', 422, 'Seat interaction point unreachable');
            member.motion = { path, startedAt: this.now(), stepMs: 150 };
          }
          room.seats.set(input.seatId, actor.accountId); member.seatId = input.seatId; room.version++;
        }
      } else {
        if (owner && owner !== actor.accountId) throw new DomainError('FORBIDDEN', 403, 'Seat ownership required');
        if (owner === actor.accountId) { this.#freezeMotion(member); room.seats.set(input.seatId, null); member.seatId = null; room.version++; }
      }
      this.#remember(actor, request, room, member, operation); if (room.version !== fromVersion) await this.#notifyChanged(room, fromVersion); return this.#snapshot(room, member, this.#motionConnections.has(connectionId));
    });
  }
  list(credential: string, slug: string) {
    return this.#run(async () => {
      await this.#sweep(); await this.registry.authorizeWorld(credential, slug);
      return { schemaVersion: 1 as const, rooms: [...this.#rooms.values()].filter(room => room.slug === slug).map(room => ({ roomId: room.id, capacity: room.capacity, occupancy: room.members.size })) };
    });
  }
  current(credential: string) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential), room = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), member = room?.members.get(actor.accountId);
      if (!room || !member) return { schemaVersion: 1 as const, snapshot: null, worldVersion: null, sceneVersion: null };
      await this.registry.authorizeWorld(credential, room.slug); await this.safety?.assert(actor.accountId, room.slug, room.id);
      return { schemaVersion: 1 as const, snapshot: await this.#snapshot(room, member), worldVersion: member.worldVersion, sceneVersion: member.sceneVersion };
    });
  }
  focusStart<T>(credential: string, source: TravelSource, work: (actor: WorldActor, context: { worldSlug: string; roomId: string; seatId: string; epoch: string; membershipId: string; canPause: boolean }, valid: () => boolean) => Promise<T>) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential), room = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), member = room?.members.get(actor.accountId);
      if (!room || !member || source.epoch !== this.epoch || source.roomId !== room.id || source.membershipId !== member.id || !member.seatId || ![...member.connections.values()].includes(actor.sessionId)) throw new DomainError('NOT_IN_ROOM', 409, 'An active seat is required');
      const generation = this.#worldGenerations.get(room.slug) ?? 0, { definition } = await this.registry.authorizeWorld(credential, room.slug);
      if (!definition.capabilities.includes('focus') || !definition.focusPolicy) throw new DomainError('NOT_AVAILABLE', 404, 'Focus is unavailable in this world');
      await this.safety?.assert(actor.accountId, room.slug, room.id);
      const seatId = member.seatId, valid = () => !this.#closed && this.authority.state === 'held' && this.#rooms.get(room.id)?.members.get(actor.accountId) === member && member.seatId === seatId && [...member.connections.values()].includes(actor.sessionId) && generation === (this.#worldGenerations.get(room.slug) ?? 0);
      return work(actor, { worldSlug: room.slug, roomId: room.id, seatId, epoch: this.epoch, membershipId: member.id, canPause: definition.focusPolicy.pauseAllowed }, valid);
    });
  }
  reservationCheckIn<T>(credential: string, source: TravelSource, worldSlug: string, work: (valid: () => boolean) => Promise<T>) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential), room = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), member = room?.members.get(actor.accountId);
      if (!room || !member || room.slug !== worldSlug || source.epoch !== this.epoch || source.roomId !== room.id || source.membershipId !== member.id || ![...member.connections.values()].includes(actor.sessionId)) throw new DomainError('NOT_IN_ROOM', 409, 'Join the event world before checking in');
      const generation = this.#worldGenerations.get(worldSlug) ?? 0; await this.registry.authorizeWorld(credential, worldSlug); await this.safety?.assert(actor.accountId, worldSlug, room.id);
      const valid = () => !this.#closed && this.authority.state === 'held' && this.#rooms.get(room.id)?.members.get(actor.accountId) === member && [...member.connections.values()].includes(actor.sessionId) && generation === (this.#worldGenerations.get(worldSlug) ?? 0);
      const result = await work(valid); if (!valid()) throw new DomainError('NOT_IN_ROOM', 409, 'Your visit changed'); return result;
    });
  }
  hospitalityContext<T>(credential: string, source: TravelSource, seated: boolean, work: (actor: WorldActor, context: { worldSlug: string; roomId: string; seatId: string | null; epoch: string; membershipId: string; policy: NonNullable<import('@virtual-city/contracts').WorldDefinition['hospitalityPolicy']> }, valid: () => boolean) => Promise<T>) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential), room = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), member = room?.members.get(actor.accountId);
      if (!room || !member || source.epoch !== this.epoch || source.roomId !== room.id || source.membershipId !== member.id || (seated && !member.seatId) || ![...member.connections.values()].includes(actor.sessionId)) throw new DomainError('NOT_IN_ROOM', 409, 'Your current visit could not be confirmed');
      const generation = this.#worldGenerations.get(room.slug) ?? 0, { definition } = await this.registry.authorizeWorld(credential, room.slug);
      if (!definition.capabilities.includes('hospitality') || !definition.hospitalityPolicy) throw new DomainError('NOT_AVAILABLE', 404, 'Service is unavailable');
      await this.safety?.assert(actor.accountId, room.slug, room.id); const seatId = member.seatId;
      const valid = () => !this.#closed && this.authority.state === 'held' && this.#rooms.get(room.id)?.members.get(actor.accountId) === member && (!seated || member.seatId === seatId) && [...member.connections.values()].includes(actor.sessionId) && generation === (this.#worldGenerations.get(room.slug) ?? 0);
      return work(actor, { worldSlug: room.slug, roomId: room.id, seatId, epoch: this.epoch, membershipId: member.id, policy: definition.hospitalityPolicy }, valid);
    });
  }
  // Internal, called only inside a hospitality owner callback; must not enqueue recursively.
  async hospitalityCustomer(accountId: string, source: TravelSource) {
    const room = this.#rooms.get(source.roomId), member = room?.members.get(accountId);
    if (source.epoch !== this.epoch || !room || !member || member.id !== source.membershipId || !member.seatId || !member.connections.size) throw new DomainError('NOT_AVAILABLE', 404, 'This order is unavailable');
    if (!await this.identity.hasConnectedSession(accountId, [...member.connections.values()])) throw new DomainError('NOT_AVAILABLE', 404, 'This order is unavailable');
    await this.safety?.assert(accountId, room.slug, room.id);
  }
  async hospitalityAllowed(accountId: string, world: string, room: string) {
    try { await this.safety?.assert(accountId, world, room); return true; }
    catch (error) { if (error instanceof DomainError && [403, 404].includes(error.status)) return false; throw error; }
  }
  hospitalityRecovery<T>(work: (visit: (accountId: string, source: TravelSource) => { state: 'connected' | 'grace' | 'gone' | 'restart'; disconnectedAt: number | null; seated: boolean; sessionIds: string[] }) => Promise<T>) {
    return this.#run(async () => work((accountId, source) => {
      if (source.epoch !== this.epoch) return { state: 'restart', disconnectedAt: null, seated: false, sessionIds: [] };
      const room = this.#rooms.get(source.roomId), member = room?.members.get(accountId);
      if (!member || member.id !== source.membershipId) return { state: 'gone', disconnectedAt: null, seated: false, sessionIds: [] };
      if (!member.connections.size) return { state: 'grace', disconnectedAt: member.disconnectedUntil === null ? this.now() : member.disconnectedUntil - DISCONNECT_GRACE_MS, seated: Boolean(member.seatId), sessionIds: [] };
      return { state: 'connected', disconnectedAt: null, seated: Boolean(member.seatId), sessionIds: [...member.connections.values()] };
    }));
  }
  travelContext(credential: string, source: TravelSource | null, destination: TravelDestination) {
    return this.#run(async () => {
      await this.#sweep();
      const generation = this.#worldGenerations.get(destination.worldSlug) ?? 0;
      const { actor, definition } = await this.registry.authorizeWorld(credential, destination.worldSlug);
      if (destination.worldVersion !== definition.version || destination.sceneVersion !== definition.sceneRef.version) throw new DomainError('WORLD_VERSION_MISMATCH', 409, 'Refresh world assets');
      const current = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), member = current?.members.get(actor.accountId);
      if (!source && current) throw new DomainError('ALREADY_IN_ROOM', 409, 'Current room context is required');
      if (source) {
        if (source.epoch !== this.epoch || !current || !member || current.id !== source.roomId || member.id !== source.membershipId || ![...member.connections.values()].includes(actor.sessionId)) throw new DomainError('NOT_IN_ROOM', 409, 'Source membership changed');
        await this.registry.authorizeWorld(credential, current.slug);
        if (current.slug === destination.worldSlug && (!destination.roomId || destination.roomId === current.id)) throw new DomainError('INVALID_REQUEST', 422, 'Destination must differ from source');
      }
      const target = destination.roomId ? this.#rooms.get(destination.roomId) : undefined;
      if (destination.roomId && (!target || target.slug !== destination.worldSlug)) throw new DomainError('NOT_FOUND', 404, 'Destination unavailable');
      if (target && target.members.size + this.#holds(target) >= target.capacity) throw new DomainError('ROOM_FULL', 409, 'Destination unavailable');
      if (!destination.roomId) {
        const candidates = [...this.#rooms.values()].filter(room => room.slug === destination.worldSlug);
        if (!candidates.some(room => room.members.size + this.#holds(room) < room.capacity) && (candidates.length >= 32 || this.#rooms.size >= 128)) throw new DomainError('ROOM_FULL', 409, 'Destination unavailable');
      }
      await this.safety?.assert(actor.accountId, destination.worldSlug, target?.id);
      if (generation !== (this.#worldGenerations.get(destination.worldSlug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Destination unavailable');
      return { actor, epoch: this.epoch };
    });
  }
  async prepareTravel(credential: string, connectionId: string, authorization: TravelAuthorization, connected: () => boolean) {
    await this.travelContext(credential, authorization.source, authorization.destination);
    const hold = await this.#run(async () => {
      const { actor, definition } = await this.registry.authorizeWorld(credential, authorization.destination.worldSlug);
      if (actor.accountId !== authorization.accountId || actor.sessionId !== authorization.sessionId || authorization.ownerEpoch !== this.epoch || authorization.expiresAt <= this.now() || !connected()) throw new DomainError('NOT_IN_ROOM', 409, 'Travel source changed');
      this.#assertTravelSource(actor, connectionId, authorization.source);
      if (this.#travelHolds.has(authorization.intentId) || this.#travelHolds.size >= 64) throw new DomainError('RATE_LIMITED', 429, 'Travel preparation busy');
      const target = authorization.destination;
      let room = target.roomId ? this.#rooms.get(target.roomId) : [...this.#rooms.values()].find(room => room.slug === target.worldSlug && room.members.size + this.#holds(room) < room.capacity);
      if (target.roomId && (!room || room.slug !== target.worldSlug)) throw new DomainError('NOT_FOUND', 404, 'Destination unavailable');
      if (!room) {
        if (this.#rooms.size >= 128 || [...this.#rooms.values()].filter(room => room.slug === target.worldSlug).length >= 32) throw new DomainError('ROOM_FULL', 409, 'Destination unavailable');
        room = { id: randomUUID(), slug: target.worldSlug, capacity: definition.capacity, version: 0, members: new Map(), emptySince: this.now(), seats: new Map(definition.seatIds.map(id => [id, null])) }; this.#rooms.set(room.id, room);
      }
      if (room.members.size + this.#holds(room) >= room.capacity) throw new DomainError('ROOM_FULL', 409, 'Destination unavailable');
      const current = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), sourceMember = current?.members.get(actor.accountId);
      const departure = current && sourceMember ? await this.registry.prepareDeparture(credential, current.slug, sourceMember.id, this.now) : undefined;
      const member: Member = { id: randomUUID(), accountId: actor.accountId, worldVersion: target.worldVersion, sceneVersion: target.sceneVersion, connections: new Map([[connectionId, actor.sessionId]]), sessions: new Set([actor.sessionId]), disconnectedUntil: null, seatId: null, ...(definition.scene ? { motion: { path: [definition.scene.spawn], startedAt: this.now(), stepMs: 150 } as RoomMotion } : {}) };
      const hold: TravelHold = { authorization, room, member, connectionId, generation: this.#worldGenerations.get(target.worldSlug) ?? 0, departure };
      this.#travelHolds.set(authorization.intentId, hold); return hold;
    });
    try { hold.admission = await this.registry.prepareAdmission(credential, hold.room.slug, hold.member.id, authorization.expiresAt, this.now); }
    catch (error) { await this.abortTravel(authorization.intentId); throw error; }
    if (this.#travelHolds.get(authorization.intentId) !== hold || !connected()) { await hold.admission.abort(); throw new DomainError('WORLD_UNAVAILABLE', 503, 'Preparation ended'); }
    return { roomId: hold.room.id, membershipId: hold.member.id };
  }
  #assertTravelSource(actor: WorldActor, connectionId: string, source: TravelSource | null) {
    const room = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), member = room?.members.get(actor.accountId);
    if (!source) { if (room) throw new DomainError('ALREADY_IN_ROOM', 409, 'Travel source changed'); return; }
    if (!room || !member || source.epoch !== this.epoch || source.roomId !== room.id || source.membershipId !== member.id || member.connections.get(connectionId) !== actor.sessionId) throw new DomainError('NOT_IN_ROOM', 409, 'Travel source changed');
  }
  async abortTravel(id: string) {
    const hold = this.#travelHolds.get(id); if (!hold) return;
    this.#travelHolds.delete(id); await hold.admission?.abort();
  }
  commitTravel(credential: string, id: string, connected: () => boolean, persist: (target: { roomId: string; membershipId: string }, apply: () => void) => Promise<void>) {
    return this.#run(async () => {
      const hold = this.#travelHolds.get(id); if (!hold?.admission) throw new DomainError('NOT_AVAILABLE', 404, 'Preparation unavailable');
      const actor = await this.identity.authenticate(credential), { authorization, room: target, member, connectionId } = hold;
      if (actor.accountId !== authorization.accountId || actor.sessionId !== authorization.sessionId) throw new DomainError('FORBIDDEN', 403, 'Travel session changed');
      this.#assertTravelSource(actor, connectionId, authorization.source);
      await this.registry.authorizeWorld(credential, target.slug); await this.safety?.assert(actor.accountId, target.slug, target.id);
      const source = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''), sourceMember = source?.members.get(actor.accountId), sourceGeneration = source ? this.#worldGenerations.get(source.slug) ?? 0 : 0;
      if (source) await this.registry.authorizeWorld(credential, source.slug);
      await this.authority.assert();
      const valid = () => !this.#closed && this.authority.state === 'held' && connected() && authorization.expiresAt > this.now() && hold.admission!.valid() && this.#rooms.get(target.id) === target && hold.generation === (this.#worldGenerations.get(target.slug) ?? 0) && (!source || sourceGeneration === (this.#worldGenerations.get(source.slug) ?? 0));
      if (!valid()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Preparation ended');
      let applied = false; const motion = new Set(this.#motionConnections), sourceFrom = source?.version ?? 0, targetFrom = target.version;
      const undo = () => {
        if (!applied) return; target.members.delete(actor.accountId); this.#connections.delete(connectionId); this.#motionConnections.delete(connectionId);
        if (source && sourceMember) { source.members.set(actor.accountId, sourceMember); this.#accounts.set(actor.accountId, source.id); if (sourceMember.seatId) source.seats.set(sourceMember.seatId, actor.accountId); for (const [id, sessionId] of sourceMember.connections) { this.#connections.set(id, { roomId: source.id, accountId: actor.accountId, sessionId }); if (motion.has(id)) this.#motionConnections.add(id); } }
        else this.#accounts.delete(actor.accountId);
        applied = false;
      };
      try {
        await persist({ roomId: target.id, membershipId: member.id }, () => {
          if (applied || !valid()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Preparation ended');
          if (source && sourceMember) { source.members.delete(actor.accountId); if (sourceMember.seatId) source.seats.set(sourceMember.seatId, null); for (const id of sourceMember.connections.keys()) { this.#connections.delete(id); this.#motionConnections.delete(id); } }
          target.members.set(actor.accountId, member); this.#accounts.set(actor.accountId, target.id); this.#connections.set(connectionId, { roomId: target.id, accountId: actor.accountId, sessionId: actor.sessionId }); applied = true;
        });
        if (!applied) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Admission unconfirmed');
      } catch (error) { if (!this.#closed && this.authority.state === 'held') undo(); throw error; }
      this.#travelHolds.delete(id);
      if (source && sourceMember) { this.#emitEnded(source, sourceMember, 'left'); source.version++; if (!source.members.size) source.emptySince = this.now(); }
      target.version++;
      if (!valid()) { this.#removeMember(target, member, 'world-unavailable'); await hold.admission.abort(); return null; }
      hold.admission.complete();
      // Departure has no active membership grant; failure quarantines its world.
      try { await hold.departure?.(); } catch { /* Registry quarantines failed cleanup; committed target is independently checked below. */ }
      try {
        await this.registry.authorizeWorld(credential, target.slug); await this.safety?.assert(actor.accountId, target.slug, target.id); await this.authority.assert();
        if (source) await this.#notifyChanged(source, sourceFrom);
        await this.#notifyChanged(target, targetFrom);
        return await this.#snapshot(target, member);
      } catch {
        // A committed receipt is history after current authorization is lost.
        // Its source resources have been released; return truthful lobby state.
        if (target.members.get(actor.accountId) === member) this.#removeMember(target, member, 'world-unavailable');
        return null;
      }
    });
  }
  travelResult(credential: string, connectionId: string, targetRoomId: string, targetMemberId: string) {
    return this.#run(async () => {
      const actor = await this.identity.authenticate(credential), room = this.#rooms.get(targetRoomId), member = room?.members.get(actor.accountId);
      if (!room || !member || member.id !== targetMemberId || member.connections.get(connectionId) !== actor.sessionId) return null;
      await this.registry.authorizeWorld(credential, room.slug); await this.safety?.assert(actor.accountId, room.slug, room.id); return this.#snapshot(room, member);
    });
  }
  async snapshotForConnection(connectionId: string): Promise<RoomSnapshot | null> {
    return this.#run(async () => {
      const connection = this.#connections.get(connectionId); if (!connection) return null;
      const room = this.#rooms.get(connection.roomId); const member = room?.members.get(connection.accountId);
      return room && member ? this.#snapshot(room, member, this.#motionConnections.has(connectionId)) : null;
    });
  }
  refreshAccounts(accountIds: string[]) {
    for (const id of accountIds) if (this.#accounts.has(id)) this.#refresh.add(id);
    if (!this.#refresh.size) return Promise.resolve();
    return this.#control('refresh', async () => {
      while (this.#refresh.size) {
        const targets = new Set(this.#refresh); this.#refresh.clear();
        for (const room of this.#rooms.values()) {
          if (![...room.members.keys()].some(id => targets.has(id))) continue;
          const fromVersion = room.version; room.version++;
          await this.#notifyChanged(room, fromVersion);
        }
      }
    });
  }
  maintain() { return this.#control('maintenance', async () => { await this.#sweep(); }); }
  reportContext(credential: string, input: { epoch: string; roomId: string; membershipId: string; targetId: string }) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential);
      const room = this.#rooms.get(input.roomId); const member = room?.members.get(actor.accountId);
      if (input.epoch !== this.epoch || !room || !member || member.id !== input.membershipId || ![...member.connections.values()].includes(actor.sessionId) || input.targetId === actor.accountId) throw new DomainError('NOT_AVAILABLE', 404, 'Report context is unavailable');
      const generation = this.#worldGenerations.get(room.slug) ?? 0; await this.registry.authorizeWorld(credential, room.slug);
      const snapshot = await this.#snapshot(room, member);
      if (!snapshot.participants.some(person => person.profile.id === input.targetId)) throw new DomainError('NOT_AVAILABLE', 404, 'Report context is unavailable');
      await this.authority.assert();
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      return { worldSlug: room.slug, subjectId: input.targetId };
    });
  }
  authorizeChat(credential: string, connectionId: string, input: RoomOwnCommand) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential); const { room } = this.#own(actor, connectionId, input);
      const generation = this.#worldGenerations.get(room.slug) ?? 0; const { definition } = await this.registry.authorizeWorld(credential, room.slug);
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      if (!definition.capabilities.includes('chat')) throw new DomainError('FORBIDDEN', 403, 'Chat capability unavailable');
      await this.safety?.assert(actor.accountId, room.slug, room.id, true);
      return { actor, worldSlug: room.slug };
    });
  }
  publishChat(credential: string, connectionId: string, input: RoomOwnCommand, emit: (recipient: { connectionId: string; accountId: string; worldSlug: string; profile: PublicProfile }) => void) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential); const { room } = this.#own(actor, connectionId, input);
      const generation = this.#worldGenerations.get(room.slug) ?? 0; const { definition } = await this.registry.authorizeWorld(credential, room.slug);
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      if (!definition.capabilities.includes('chat')) throw new DomainError('FORBIDDEN', 403, 'Chat capability unavailable');
      const recipients: { connectionId: string; accountId: string; worldSlug: string; profile: PublicProfile }[] = [];
      for (const member of room.members.values()) {
        if (!member.connections.size) continue;
        const snapshot = await this.#snapshot(room, member); const sender = snapshot.participants.find(person => person.profile.id === actor.accountId);
        if (sender) for (const id of member.connections.keys()) recipients.push({ connectionId: id, accountId: member.accountId, worldSlug: room.slug, profile: sender.profile });
      }
      await this.identity.authenticate(credential); await this.authority.assert();
      await this.safety?.assert(actor.accountId, room.slug, room.id, true);
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      for (const recipient of recipients) emit(recipient);
    });
  }
  #freezeMotion(member: Member) {
    if (!member.motion) return;
    const point = motionPosition(member.motion, this.now(), false);
    member.motion = { path: [{ x: point.x, y: point.y }], startedAt: this.now(), stepMs: 150 };
  }
  move(credential: string, connectionId: string, input: RoomMove) {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential); const { room, member } = this.#own(actor, connectionId, input);
      const generation = this.#worldGenerations.get(room.slug) ?? 0; const { definition } = await this.registry.authorizeWorld(credential, room.slug);
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      if (!this.#motionConnections.has(connectionId) || !definition.scene || !member.motion) throw new DomainError('FORBIDDEN', 403, 'Movement protocol not negotiated');
      const request = this.#receipt(actor, input.requestId, 'room.move', input);
      if (request.receipt) {
        if (request.receipt.membershipId !== member.id) throw new DomainError('NOT_IN_ROOM', 409, 'Previous membership ended');
        return this.#snapshot(room, member, true);
      }
      if (member.seatId) throw new DomainError('ALREADY_SEATED', 409, 'Stand up before walking');
      const from = motionPosition(member.motion, this.now(), false);
      if (from.moving) throw new DomainError('RATE_LIMITED', 429, 'Wait until your current walk finishes');
      const path = findScenePath(definition.scene, from, input.destination);
      if (!path) throw new DomainError('INVALID_REQUEST', 422, 'Destination unreachable');
      const fromVersion = room.version;
      member.motion = { path, startedAt: this.now(), stepMs: 150 }; room.version++;
      this.#remember(actor, request, room, member, 'room.move'); await this.#notifyChanged(room, fromVersion);
      return this.#snapshot(room, member, true);
    });
  }
  #abandon() {
    this.#closed = true;
    for (const id of this.#travelHolds.keys()) void this.abortTravel(id).catch(() => {});
    for (const room of [...this.#rooms.values()]) this.#removeRoom(room, 'authority-lost');
    this.#receipts.clear();
  }
  async close() {
    this.#unsubscribe(); this.#unsubscribeRevocations(); this.#unsubscribeAuthority();
    if (this.#closed) return this.#tail;
    this.#closed = true; await this.#run(async () => { for (const room of [...this.#rooms.values()]) this.#removeRoom(room, 'server-stopping'); this.#receipts.clear(); this.#ended.clear(); }, true);
    await Promise.allSettled([...this.#travelHolds.keys()].map(id => this.abortTravel(id)));
  }
}
