import { it, expect } from 'vitest';
import type { RoomSnapshot } from '@virtual-city/contracts';
import { fitSceneCamera } from '../src/camera';
import { sceneEntities } from '../src/entities';
import { sandboxScene } from '../src/spec';

const self = '00000000-0000-4000-8000-000000000001';
const peer = '00000000-0000-4000-8000-000000000002';
const snapshot: RoomSnapshot = {
  schemaVersion: 1, type: 'snapshot', epoch: self, roomId: peer, worldSlug: 'sdk-sandbox', roomVersion: 1, capacity: 8, occupancy: 2, membershipId: self,
  self: { accountId: self, seatId: null }, seats: sandboxScene.seats.map(seat => ({ seatId: seat.seatId, state: 'available', mine: false })),
  participants: [{ profile: { id: peer, displayName: 'Peer', avatarKey: 'fern' }, seatId: null, state: 'active' }],
};
it('fits the complete world in wide and narrow viewports and rejects nonfinite camera inputs', () => {
  expect(fitSceneCamera({ width: 480, height: 336 }, { width: 960, height: 672 })).toEqual({ scale: .5, x: 0, y: 0 });
  expect(fitSceneCamera({ width: 1000, height: 336 }, { width: 960, height: 672 })).toEqual({ scale: .5, x: 260, y: 0 });
  for (const width of [0, -1, Infinity, NaN]) expect(() => fitSceneCamera({ width, height: 336 }, { width: 960, height: 672 })).toThrow('INVALID_CAMERA_BOUNDS');
});
it('projects only visible peers plus self; seat and recovery pose follow authoritative state', () => {
  expect(sceneEntities(sandboxScene, snapshot).entities).toHaveLength(2);
  const seated = structuredClone(snapshot); seated.self.seatId = 'seat-1'; seated.seats[0] = { seatId: 'seat-1', state: 'occupied', mine: true };
  seated.participants[0].state = 'reconnecting';
  const projection = sceneEntities(sandboxScene, seated);
  expect(projection.entities.find(entity => entity.self)).toMatchObject({ x: 168, y: 168, pose: 'sit', opacity: 1 });
  expect(projection.entities.find(entity => !entity.self)).toMatchObject({ pose: 'idle', opacity: .4 });
  expect(sceneEntities(sandboxScene, { ...snapshot, participants: [] }).entities.map(entity => entity.id)).toEqual([self]);
});
it('fails closed on duplicate participants, foreign world and unmapped seats', () => {
  for (const state of [
    { ...snapshot, participants: [snapshot.participants[0], snapshot.participants[0]] },
    { ...snapshot, worldSlug: 'foreign-world' },
    { ...snapshot, participants: [{ ...snapshot.participants[0], seatId: 'seat-99' }] },
  ]) expect(() => sceneEntities(sandboxScene, state)).toThrow('SCENE_CONTEXT_MISMATCH');
});
it('keeps each participant outfit independent and defaults older snapshots to casual', () => {
  const state = structuredClone(snapshot);
  state.participants[0].outfit = 'cafe-apron';
  const entities = sceneEntities(sandboxScene, state).entities;
  expect(entities.find(entity => entity.id === peer)?.outfit).toBe('cafe-apron');
  expect(entities.find(entity => entity.self)?.outfit).toBe('casual');
  expect(sceneEntities(sandboxScene, snapshot).entities.every(entity => entity.outfit === 'casual')).toBe(true);
});
