import { RoomSnapshotSchema, type RoomSnapshot, type SceneManifest } from '@virtual-city/contracts';
import { tileCenter, motionPosition, isWalkable } from './scene';

export function sceneEntities(scene: SceneManifest, input: RoomSnapshot) {
  const state = RoomSnapshotSchema.parse(input);
  const seatIds = new Set(scene.seats.map(seat => seat.seatId));
  if (state.worldSlug !== scene.key || state.seats.length !== seatIds.size || state.seats.some(seat => !seatIds.has(seat.seatId))
    || (state.self.seatId && !seatIds.has(state.self.seatId))
    || state.participants.some(person => person.seatId && !seatIds.has(person.seatId))
    || new Set(state.participants.map(person => person.profile.id)).size !== state.participants.length) throw new Error('SCENE_CONTEXT_MISMATCH');
  const profiles = new Map(state.participants.map(person => [person.profile.id, person]));
  if (!profiles.has(state.self.accountId)) profiles.set(state.self.accountId, {
    profile: { id: state.self.accountId, displayName: 'You', avatarKey: 'mint' }, seatId: state.self.seatId, state: 'active', ...(state.self.motion ? { motion: state.self.motion } : {}),
  });
  let standing = 0;
  const entities = [...profiles.values()].sort((a, b) => a.profile.id.localeCompare(b.profile.id)).map(person => {
    const seat = scene.seats.find(seat => seat.seatId === person.seatId);
    const point = seat ?? { x: scene.spawn.x + (standing++ % 4) - 2, y: scene.spawn.y - Math.floor((standing - 1) / 4) };
    if (person.motion && (state.serverTime === undefined || !person.motion.path.every(point => isWalkable(scene, point)))) throw new Error('SCENE_MOTION_MISMATCH');
    const position = person.motion ? motionPosition(person.motion, state.serverTime!) : point;
    const moving = 'moving' in position && position.moving;
    return { id: person.profile.id, palette: person.profile.avatarKey, outfit:person.outfit??'casual' as const, ...tileCenter(scene, position), motion: person.motion, settledPose: seat ? 'sit' as const : 'idle' as const, pose: moving ? 'walk' as const : seat ? 'sit' as const : 'idle' as const,
      self: person.profile.id === state.self.accountId, opacity: person.state === 'reconnecting' ? .4 : 1 };
  });
  return { state, entities };
}
