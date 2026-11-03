import { randomUUID } from 'node:crypto';
import { RoomSnapshotSchema, RoomEndedSchema, type RoomJoin, type RoomOwnCommand, type RoomSnapshot, type RoomEnded, type SeatClaim, type SeatRelease, type PublicProfile } from '@virtual-city/contracts';
import type { WorldRegistry, WorldActor } from '@virtual-city/world-sdk';
import type { IdentityService } from '../identity/service';
import { DomainError } from '../common/errors';
import type { RoomAuthority } from './authority';

type Member = { id: string; accountId: string; worldVersion: string; sceneVersion: string; connections: Map<string, string>; sessions: Set<string>; disconnectedUntil: number | null; seatId: string | null };
type Room = { id: string; slug: string; capacity: number; version: number; members: Map<string, Member>; emptySince: number; seats: Map<string, string | null> };
type Receipt = { sessionId: string; fingerprint: string; until: number; roomId: string; membershipId: string; operation: 'join' | 'leave' | 'seat.claim' | 'seat.release' };
export const DISCONNECT_GRACE_MS = 15000;
export interface RoomProjection {
  relationships(viewerId: string, targetIds: string[]): Promise<Map<string, { blocked: boolean; friends: boolean }>>;
  profiles(viewerId: string, targetIds: string[], worldSlug: string, relationships: Map<string, { blocked: boolean; friends: boolean }>): Promise<PublicProfile[]>;
}
export type RoomUpdate = { connectionId: string; fromVersion: number; snapshot: RoomSnapshot };
export class RoomService {
  readonly epoch = randomUUID();
  #rooms = new Map<string, Room>();
  #accounts = new Map<string, string>();
  #connections = new Map<string, { roomId: string; accountId: string; sessionId: string }>();
  #receipts = new Map<string, Receipt>();
  #tail: Promise<void> = Promise.resolve();
  #pending = 0;
  #peakPending = 0;
  #closed = false;
  #ended = new Set<(connectionIds: string[], event: RoomEnded) => void>();
  #worldGenerations = new Map<string, number>();
  #unsubscribe: () => void;
  #unsubscribeRevocations: () => void;
  #changed = new Set<(updates: RoomUpdate[]) => void>();
  #controls = new Map<string, { promise: Promise<void>; again: boolean }>();
  #refresh = new Set<string>();
  #unsubscribeAuthority: () => void;
  constructor(private registry: WorldRegistry, private identity: IdentityService, private authority: RoomAuthority, private now = Date.now, private projection?: RoomProjection) {
    this.#unsubscribeAuthority = authority.onLost(() => { this.#abandon(); });
    this.#unsubscribe = registry.onUnavailable(slug => {
      this.#worldGenerations.set(slug, (this.#worldGenerations.get(slug) ?? 0) + 1);
      void this.#control('world:' + slug, async () => { for (const room of [...this.#rooms.values()]) if (room.slug === slug) this.#removeRoom(room, 'world-unavailable'); });
    });
    this.#unsubscribeRevocations = identity.onRevoked(event => { void this.endSessions(event.accountId, event.sessionIds); });
  }
  onChanged(listener: (updates: RoomUpdate[]) => void) { this.#changed.add(listener); return () => { this.#changed.delete(listener); }; }
  diagnostics() {
    const rooms = [...this.#rooms.values()]; const members = rooms.flatMap(room => [...room.members.values()]);
    return { rooms: rooms.length, memberships: this.#accounts.size, connections: this.#connections.size,
      occupiedSeats: members.filter(member => member.seatId !== null).length,
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
      for (const [id, ownerSession] of member.connections) if (ownerSession === sessionId) { member.connections.delete(id); this.#connections.delete(id); }
      member.sessions.delete(sessionId);
      if (member.sessions.size === 0) this.#removeMember(room, member, 'disconnected');
      else if (member.connections.size === 0 && member.disconnectedUntil === null) { member.disconnectedUntil = this.now() + DISCONNECT_GRACE_MS; room.version++; }
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
    for (const id of member.connections.keys()) this.#connections.delete(id);
    if (member.seatId) room.seats.set(member.seatId, null);
    room.members.delete(member.accountId); this.#accounts.delete(member.accountId); room.version++;
    if (room.members.size === 0) room.emptySince = this.now();
  }
  #removeRoom(room: Room, reason: RoomEnded['reason']) { for (const member of [...room.members.values()]) this.#removeMember(room, member, reason); this.#rooms.delete(room.id); }
  async #sweep() {
    const time = this.now();
    for (const room of [...this.#rooms.values()]) {
      const fromVersion = room.version;
      for (const member of [...room.members.values()]) if (member.disconnectedUntil !== null && member.disconnectedUntil <= time) this.#removeMember(room, member, 'disconnected');
      if (!room.members.size && time - room.emptySince >= 60000) this.#rooms.delete(room.id);
      if (room.version !== fromVersion) await this.#notifyChanged(room, fromVersion);
    }
    for (const [key, receipt] of this.#receipts) if (receipt.until <= time) this.#receipts.delete(key);
  }
  async #snapshot(room: Room, member: Member): Promise<RoomSnapshot> {
    const seats = [...room.seats].map(([seatId, ownerId]) => ({ seatId, state: ownerId ? room.members.get(ownerId)?.disconnectedUntil !== null ? 'held' : 'occupied' : 'available', mine: ownerId === member.accountId }));
    const ids = [...room.members.keys()];
    const relationships = this.projection ? await this.projection.relationships(member.accountId, ids) : new Map(ids.map(id => [id, { blocked: id !== member.accountId, friends: false }]));
    const profiles = this.projection ? await this.projection.profiles(member.accountId, ids, room.slug, relationships) : [];
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const participants = [...room.members.values()].filter(candidate => profileMap.has(candidate.accountId)).map(candidate => ({ profile: profileMap.get(candidate.accountId)!, seatId: candidate.seatId, state: candidate.disconnectedUntil === null ? 'active' as const : 'reconnecting' as const }));
    return RoomSnapshotSchema.parse({ schemaVersion: 1, type: 'snapshot', epoch: this.epoch, roomId: room.id, worldSlug: room.slug, roomVersion: room.version, capacity: room.capacity, occupancy: room.members.size, membershipId: member.id, self: { accountId: member.accountId, seatId: member.seatId }, seats, participants });
  }
  async #notifyChanged(room: Room, fromVersion: number) {
    if (this.#closed || !this.#changed.size || !room.members.size) return;
    const updates: RoomUpdate[] = [];
    for (const member of room.members.values()) {
      const snapshot = await this.#snapshot(room, member);
      for (const connectionId of member.connections.keys()) updates.push({ connectionId, fromVersion, snapshot });
    }
    await this.authority.assert();
    for (const listener of this.#changed) { try { listener(updates); } catch { /* The next snapshot remains authoritative. */ } }
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
      const request = this.#receipt(actor, input.requestId, 'join', input);
      const current = this.#rooms.get(this.#accounts.get(actor.accountId) ?? '');
      if (request.receipt && (!current || current.id !== request.receipt.roomId || current.members.get(actor.accountId)?.id !== request.receipt.membershipId)) throw new DomainError('NOT_IN_ROOM', 409, 'Previous membership ended');
      if (current) {
        if (current.slug !== input.worldSlug || (input.roomId && current.id !== input.roomId)) throw new DomainError('ALREADY_IN_ROOM', 409, 'Leave the current room before joining another');
        const member = current.members.get(actor.accountId)!;
        const fromVersion = current.version;
        if (member.disconnectedUntil !== null) { member.disconnectedUntil = null; current.version++; }
        member.sessions.add(actor.sessionId);
        member.connections.set(connectionId, actor.sessionId); this.#connections.set(connectionId, { roomId: current.id, accountId: actor.accountId, sessionId: actor.sessionId });
        this.#remember(actor, request, current, member, 'join'); if (current.version !== fromVersion) await this.#notifyChanged(current, fromVersion); return this.#snapshot(current, member);
      }
      let room = input.roomId ? this.#rooms.get(input.roomId) : [...this.#rooms.values()].filter(room => room.slug === input.worldSlug && room.members.size < room.capacity).sort((a, b) => b.members.size - a.members.size)[0];
      if (input.roomId && (!room || room.slug !== input.worldSlug)) throw new DomainError('NOT_FOUND', 404, 'Room not found');
      let created = false;
      if (!room) {
        const worldRooms = [...this.#rooms.values()].filter(room => room.slug === input.worldSlug);
        if (worldRooms.length >= 32 || this.#rooms.size >= 128) throw new DomainError('ROOM_FULL', 409, 'No room capacity available');
        room = { id: randomUUID(), slug: input.worldSlug, capacity: definition.capacity, version: 0, members: new Map(), emptySince: this.now(), seats: new Map(definition.seatIds.map(id => [id, null])) }; this.#rooms.set(room.id, room); created = true;
      }
      if (room.members.size >= room.capacity) throw new DomainError('ROOM_FULL', 409, 'Room is full');
      const member: Member = { id: randomUUID(), accountId: actor.accountId, worldVersion: input.worldVersion, sceneVersion: input.sceneVersion, connections: new Map([[connectionId, actor.sessionId]]), sessions: new Set([actor.sessionId]), disconnectedUntil: null, seatId: null };
      room.members.set(actor.accountId, member); this.#accounts.set(actor.accountId, room.id); this.#connections.set(connectionId, { roomId: room.id, accountId: actor.accountId, sessionId: actor.sessionId });
      try {
        await this.registry.dispatch(credential, room.slug, { schemaVersion: 1, worldVersion: input.worldVersion, sceneVersion: input.sceneVersion, membershipId: member.id, action: 'join' });
        if (generation !== (this.#worldGenerations.get(input.worldSlug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
        await this.authority.assert();
        if (!connected()) throw new DomainError('UNAUTHENTICATED', 401, 'Connection closed');
      } catch (error) { this.#removeMember(room, member, 'disconnected'); if (created) this.#rooms.delete(room.id); throw error; }
      room.version++; this.#remember(actor, request, room, member, 'join'); await this.#notifyChanged(room, room.version - 1); return this.#snapshot(room, member);
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
      await this.registry.authorizeWorld(credential, room.slug); return this.#snapshot(room, member);
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
      this.#connections.delete(connectionId); member?.connections.delete(connectionId);
      if (room && member && member.connections.size === 0) { member.disconnectedUntil = this.now() + DISCONNECT_GRACE_MS; const fromVersion = room.version; room.version++; await this.#notifyChanged(room, fromVersion); } await this.#sweep();
    });
  }
  seat(credential: string, connectionId: string, input: SeatClaim | SeatRelease, operation: 'seat.claim' | 'seat.release') {
    return this.#run(async () => {
      await this.#sweep(); const actor = await this.identity.authenticate(credential); const { room, member } = this.#own(actor, connectionId, input);
      const generation = this.#worldGenerations.get(room.slug) ?? 0; await this.registry.authorizeWorld(credential, room.slug);
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      const request = this.#receipt(actor, input.requestId, operation, input);
      if (request.receipt) {
        if (request.receipt.membershipId !== member.id) throw new DomainError('NOT_IN_ROOM', 409, 'Previous membership ended');
        return this.#snapshot(room, member);
      }
      if (!room.seats.has(input.seatId)) throw new DomainError('NOT_FOUND', 404, 'Seat not found');
      const owner = room.seats.get(input.seatId);
      const fromVersion = room.version;
      if (operation === 'seat.claim') {
        if (owner && owner !== actor.accountId) throw new DomainError('SEAT_TAKEN', 409, 'Seat unavailable');
        if (member.seatId && member.seatId !== input.seatId) throw new DomainError('ALREADY_SEATED', 409, 'Release your current seat first');
        if (!owner) { room.seats.set(input.seatId, actor.accountId); member.seatId = input.seatId; room.version++; }
      } else {
        if (owner && owner !== actor.accountId) throw new DomainError('FORBIDDEN', 403, 'Seat ownership required');
        if (owner === actor.accountId) { room.seats.set(input.seatId, null); member.seatId = null; room.version++; }
      }
      this.#remember(actor, request, room, member, operation); if (room.version !== fromVersion) await this.#notifyChanged(room, fromVersion); return this.#snapshot(room, member);
    });
  }
  list(credential: string, slug: string) {
    return this.#run(async () => {
      await this.#sweep(); await this.registry.authorizeWorld(credential, slug);
      return { schemaVersion: 1 as const, rooms: [...this.#rooms.values()].filter(room => room.slug === slug).map(room => ({ roomId: room.id, capacity: room.capacity, occupancy: room.members.size })) };
    });
  }
  async snapshotForConnection(connectionId: string): Promise<RoomSnapshot | null> {
    return this.#run(async () => {
      const connection = this.#connections.get(connectionId); if (!connection) return null;
      const room = this.#rooms.get(connection.roomId); const member = room?.members.get(connection.accountId);
      return room && member ? this.#snapshot(room, member) : null;
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
  #abandon() {
    this.#closed = true;
    for (const room of [...this.#rooms.values()]) this.#removeRoom(room, 'authority-lost');
    this.#receipts.clear();
  }
  async close() {
    this.#unsubscribe(); this.#unsubscribeRevocations(); this.#unsubscribeAuthority();
    if (this.#closed) return this.#tail;
    this.#closed = true; await this.#run(async () => { for (const room of [...this.#rooms.values()]) this.#removeRoom(room, 'server-stopping'); this.#receipts.clear(); this.#ended.clear(); }, true);
  }
}
