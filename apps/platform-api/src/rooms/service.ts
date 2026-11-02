import { randomUUID } from 'node:crypto';
import { RoomSnapshotSchema, RoomEndedSchema, type RoomJoin, type RoomOwnCommand, type RoomSnapshot, type RoomEnded, type SeatClaim, type SeatRelease } from '@virtual-city/contracts';
import type { WorldRegistry, WorldActor } from '@virtual-city/world-sdk';
import type { IdentityService } from '../identity/service';
import { DomainError } from '../common/errors';

type Member = { id: string; accountId: string; worldVersion: string; sceneVersion: string; connections: Map<string, string>; sessions: Set<string>; disconnectedUntil: number | null; seatId: string | null };
type Room = { id: string; slug: string; capacity: number; version: number; members: Map<string, Member>; emptySince: number; seats: Map<string, string | null> };
type Receipt = { sessionId: string; fingerprint: string; until: number; roomId: string; membershipId: string; operation: 'join' | 'leave' | 'seat.claim' | 'seat.release' };
export const DISCONNECT_GRACE_MS = 15000;
export class RoomService {
  readonly epoch = randomUUID();
  #rooms = new Map<string, Room>();
  #accounts = new Map<string, string>();
  #connections = new Map<string, { roomId: string; accountId: string; sessionId: string }>();
  #receipts = new Map<string, Receipt>();
  #tail: Promise<void> = Promise.resolve();
  #pending = 0;
  #closed = false;
  #ended = new Set<(connectionIds: string[], event: RoomEnded) => void>();
  #worldGenerations = new Map<string, number>();
  #unsubscribe: () => void;
  #unsubscribeRevocations: () => void;
  constructor(private registry: WorldRegistry, private identity: IdentityService, private now = Date.now) {
    this.#unsubscribe = registry.onUnavailable(slug => {
      this.#worldGenerations.set(slug, (this.#worldGenerations.get(slug) ?? 0) + 1);
      void this.#run(async () => { for (const room of [...this.#rooms.values()]) if (room.slug === slug) this.#removeRoom(room, 'world-unavailable'); }, true);
    });
    this.#unsubscribeRevocations = identity.onRevoked(event => { void this.endSessions(event.accountId, event.sessionIds); });
  }
  endSessions(accountId: string, sessionIds: string[]) {
    return this.#run(async () => {
      const revoked = new Set(sessionIds);
      const room = this.#rooms.get(this.#accounts.get(accountId) ?? ''); const member = room?.members.get(accountId);
      if (!room || !member) return;
      for (const [id, sessionId] of member.connections) if (revoked.has(sessionId)) { member.connections.delete(id); this.#connections.delete(id); }
      for (const id of revoked) member.sessions.delete(id);
      if (member.sessions.size === 0) this.#removeMember(room, member, 'disconnected');
      else if (member.connections.size === 0 && member.disconnectedUntil === null) { member.disconnectedUntil = this.now() + DISCONNECT_GRACE_MS; room.version++; }
    }, true);
  }
  onEnded(listener: (connections: string[], event: RoomEnded) => void) { this.#ended.add(listener); return () => { this.#ended.delete(listener); }; }
  #run<T>(work: () => Promise<T>, control = false): Promise<T> {
    if (!control && (this.#closed || this.#pending >= 256)) return Promise.reject(new DomainError('RATE_LIMITED', 429, 'Room service busy'));
    this.#pending++;
    const result = this.#tail.then(work).finally(() => { this.#pending--; }); this.#tail = result.then(() => {}, () => {}); return result;
  }
  hasMembership(actor: WorldActor, slug: string, membershipId: string): boolean {
    const room = this.#rooms.get(this.#accounts.get(actor.accountId) ?? ''); const member = room?.members.get(actor.accountId);
    return Boolean(room?.slug === slug && member?.id === membershipId && [...member.connections.values()].includes(actor.sessionId));
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
  #sweep() {
    const time = this.now();
    for (const room of [...this.#rooms.values()]) {
      for (const member of [...room.members.values()]) if (member.disconnectedUntil !== null && member.disconnectedUntil <= time) this.#removeMember(room, member, 'disconnected');
      if (!room.members.size && time - room.emptySince >= 60000) this.#rooms.delete(room.id);
    }
    for (const [key, receipt] of this.#receipts) if (receipt.until <= time) this.#receipts.delete(key);
  }
  #snapshot(room: Room, member: Member): RoomSnapshot {
    const seats = [...room.seats].map(([seatId, ownerId]) => ({ seatId, state: ownerId ? room.members.get(ownerId)?.disconnectedUntil !== null ? 'held' : 'occupied' : 'available', mine: ownerId === member.accountId }));
    return RoomSnapshotSchema.parse({ schemaVersion: 1, type: 'snapshot', epoch: this.epoch, roomId: room.id, worldSlug: room.slug, roomVersion: room.version, capacity: room.capacity, occupancy: room.members.size, membershipId: member.id, self: { accountId: member.accountId, seatId: member.seatId }, seats });
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
      this.#sweep();
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
        if (member.disconnectedUntil !== null) { member.disconnectedUntil = null; current.version++; }
        member.sessions.add(actor.sessionId);
        member.connections.set(connectionId, actor.sessionId); this.#connections.set(connectionId, { roomId: current.id, accountId: actor.accountId, sessionId: actor.sessionId });
        this.#remember(actor, request, current, member, 'join'); return this.#snapshot(current, member);
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
        if (!connected()) throw new DomainError('UNAUTHENTICATED', 401, 'Connection closed');
      } catch (error) { this.#removeMember(room, member, 'disconnected'); if (created) this.#rooms.delete(room.id); throw error; }
      room.version++; this.#remember(actor, request, room, member, 'join'); return this.#snapshot(room, member);
    });
  }
  #own(actor: WorldActor, connectionId: string, input: RoomOwnCommand) {
    const connection = this.#connections.get(connectionId); const room = this.#rooms.get(input.roomId); const member = room?.members.get(actor.accountId);
    if (input.epoch !== this.epoch || !room || !member || member.id !== input.membershipId || connection?.roomId !== room.id || connection.accountId !== actor.accountId || connection.sessionId !== actor.sessionId) throw new DomainError('NOT_IN_ROOM', 409, 'Room membership unavailable; rejoin');
    return { room, member };
  }
  snapshot(credential: string, connectionId: string, input: RoomOwnCommand) {
    return this.#run(async () => {
      this.#sweep(); const actor = await this.identity.authenticate(credential); const { room, member } = this.#own(actor, connectionId, input);
      await this.registry.authorizeWorld(credential, room.slug); return this.#snapshot(room, member);
    });
  }
  leave(credential: string, connectionId: string, input: RoomOwnCommand) {
    return this.#run(async () => {
      this.#sweep(); const actor = await this.identity.authenticate(credential); const request = this.#receipt(actor, input.requestId, 'leave', input);
      if (request.receipt) return { schemaVersion: 1 as const, type: 'left' as const, epoch: this.epoch, roomId: request.receipt.roomId };
      const { room, member } = this.#own(actor, connectionId, input);
      try { await this.registry.dispatch(credential, room.slug, { schemaVersion: 1, worldVersion: member.worldVersion, sceneVersion: member.sceneVersion, membershipId: member.id, action: 'leave' }); }
      catch { /* Leaving remains possible even if world access or lifecycle was revoked. */ }
      this.#removeMember(room, member, 'left'); this.#remember(actor, request, room, member, 'leave');
      return { schemaVersion: 1 as const, type: 'left' as const, epoch: this.epoch, roomId: room.id };
    });
  }
  detach(connectionId: string) {
    return this.#run(async () => {
      const connection = this.#connections.get(connectionId); if (!connection) return;
      const room = this.#rooms.get(connection.roomId); const member = room?.members.get(connection.accountId);
      this.#connections.delete(connectionId); member?.connections.delete(connectionId);
      if (room && member && member.connections.size === 0) { member.disconnectedUntil = this.now() + DISCONNECT_GRACE_MS; room.version++; } this.#sweep();
    }, true);
  }
  seat(credential: string, connectionId: string, input: SeatClaim | SeatRelease, operation: 'seat.claim' | 'seat.release') {
    return this.#run(async () => {
      this.#sweep(); const actor = await this.identity.authenticate(credential); const { room, member } = this.#own(actor, connectionId, input);
      const generation = this.#worldGenerations.get(room.slug) ?? 0; await this.registry.authorizeWorld(credential, room.slug);
      if (generation !== (this.#worldGenerations.get(room.slug) ?? 0)) throw new DomainError('WORLD_UNAVAILABLE', 503, 'World unavailable');
      const request = this.#receipt(actor, input.requestId, operation, input);
      if (request.receipt) {
        if (request.receipt.membershipId !== member.id) throw new DomainError('NOT_IN_ROOM', 409, 'Previous membership ended');
        return this.#snapshot(room, member);
      }
      if (!room.seats.has(input.seatId)) throw new DomainError('NOT_FOUND', 404, 'Seat not found');
      const owner = room.seats.get(input.seatId);
      if (operation === 'seat.claim') {
        if (owner && owner !== actor.accountId) throw new DomainError('SEAT_TAKEN', 409, 'Seat unavailable');
        if (member.seatId && member.seatId !== input.seatId) throw new DomainError('ALREADY_SEATED', 409, 'Release your current seat first');
        if (!owner) { room.seats.set(input.seatId, actor.accountId); member.seatId = input.seatId; room.version++; }
      } else {
        if (owner && owner !== actor.accountId) throw new DomainError('FORBIDDEN', 403, 'Seat ownership required');
        if (owner === actor.accountId) { room.seats.set(input.seatId, null); member.seatId = null; room.version++; }
      }
      this.#remember(actor, request, room, member, operation); return this.#snapshot(room, member);
    });
  }
  list(credential: string, slug: string) {
    return this.#run(async () => {
      this.#sweep(); await this.registry.authorizeWorld(credential, slug);
      return { schemaVersion: 1 as const, rooms: [...this.#rooms.values()].filter(room => room.slug === slug).map(room => ({ roomId: room.id, capacity: room.capacity, occupancy: room.members.size })) };
    });
  }
  maintain() { return this.#run(async () => { this.#sweep(); }, true); }
  async close() {
    if (this.#closed) return this.#tail;
    this.#closed = true; this.#unsubscribe(); this.#unsubscribeRevocations(); await this.#run(async () => { for (const room of [...this.#rooms.values()]) this.#removeRoom(room, 'server-stopping'); this.#receipts.clear(); this.#ended.clear(); }, true);
  }
}
