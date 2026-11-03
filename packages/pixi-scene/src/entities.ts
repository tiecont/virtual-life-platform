import { RoomSnapshotSchema, type RoomSnapshot, type SceneManifest } from '@virtual-city/contracts';
import { tileCenter } from './spec';

export function sceneEntities(scene: SceneManifest, input: RoomSnapshot) {
  const state = RoomSnapshotSchema.parse(input);
  const seatIds = new Set(scene.seats.map(seat => seat.seatId));
  if (state.worldSlug !== scene.key || state.seats.length !== seatIds.size || state.seats.some(seat => !seatIds.has(seat.seatId))
    || (state.self.seatId && !seatIds.has(state.self.seatId))
    || state.participants.some(person => person.seatId && !seatIds.has(person.seatId))
    || new Set(state.participants.map(person => person.profile.id)).size !== state.participants.length) throw new Error('SCENE_CONTEXT_MISMATCH');
  const profiles = new Map(state.participants.map(person => [person.profile.id, person]));
  if (!profiles.has(state.self.accountId)) profiles.set(state.self.accountId, {
    profile: { id: state.self.accountId, displayName: 'You', avatarKey: 'mint' }, seatId: state.self.seatId, state: 'active',
  });
  let standing = 0;
  const entities = [...profiles.values()].sort((a, b) => a.profile.id.localeCompare(b.profile.id)).map(person => {
    const seat = scene.seats.find(seat => seat.seatId === person.seatId);
    const point = seat ?? { x: scene.spawn.x + (standing++ % 4) - 2, y: scene.spawn.y - Math.floor((standing - 1) / 4) };
    return { id: person.profile.id, palette: person.profile.avatarKey, ...tileCenter(scene, point), pose: seat ? 'sit' as const : 'idle' as const,
      self: person.profile.id === state.self.accountId, opacity: person.state === 'reconnecting' ? .4 : 1 };
  });
  return { state, entities };
}
