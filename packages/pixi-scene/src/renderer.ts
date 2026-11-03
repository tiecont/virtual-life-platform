import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { RoomSnapshotSchema, SceneManifestSchema, type RoomSnapshot, type SceneManifest } from '@virtual-city/contracts';
import { tileCenter } from './spec';

export async function createCafeScene(host: HTMLElement, input: SceneManifest, onSeat: (seatId: string) => void) {
  const scene = SceneManifestSchema.parse(input); const size = scene.tileSize;
  const app = new Application();
  await app.init({ width: scene.columns * size, height: scene.rows * size, background: '#e4ebe7', antialias: false, autoStart: false, resolution: 1, preference: 'webgl' });
  let texture: Texture;
  try { texture = await Assets.load<Texture>('/assets/sandbox/fixture-avatar.svg'); }
  catch (error) { app.destroy(true, { children: true }); throw error; }
  const canvas = app.canvas;
  canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.scene = scene.key;
  const floor = new Graphics(); app.stage.addChild(floor);
  for (let y = 0; y < scene.rows; y++) for (let x = 0; x < scene.columns; x++) floor.rect(x * size, y * size, size, size).fill((x + y) % 2 ? '#dbe7df' : '#e5eee8');
  function rect(g: Graphics, x: number, y: number, w: number, h: number, color: string) { g.rect(x, y, w, h).fill(color); }
  for (const zone of scene.collisionZones) {
    const x = zone.x * size, y = zone.y * size, w = zone.width * size, h = zone.height * size;
    if (zone.kind === 'wall') {
      rect(floor, x, y, w, h, '#354944'); rect(floor, x + 8, y + 8, Math.max(8, w - 16), Math.max(8, h - 16), '#465f57');
    } else if (zone.kind === 'table') {
      rect(floor, x + 7, y + 13, w, h - 8, '#a4b8aa'); rect(floor, x, y, w, h - 10, '#f7f8ef');
      rect(floor, x + 8, y + 8, w - 16, h - 26, '#e9ebe2');
      for (const offset of [24, w - 38]) {
        rect(floor, x + offset, y + 27, 24, 28, '#587f8c'); rect(floor, x + offset + 3, y + 25, 18, 24, '#fafbf7');
        rect(floor, x + offset + 6, y + 28, 12, 4, '#cf6f5f');
      }
      floor.circle(x + w / 2, y + 34, 10).fill('#4f765c');
    } else if (zone.kind === 'counter') {
      rect(floor, x + 5, y + 9, w, h, '#adbbb0'); rect(floor, x, y, w, h - 5, '#566c67');
      rect(floor, x, y, w, 17, '#f2f3ed'); rect(floor, x + 18, y + 31, 54, 31, '#293b37');
      rect(floor, x + 22, y + 28, 46, 6, '#a9cbd2'); rect(floor, x + 90, y + 26, 18, 18, '#dcbd6b');
      rect(floor, x + 120, y + 26, 18, 18, '#d27664');
    } else {
      rect(floor, x + 8, y + 22, 30, 23, '#b96c60');
      floor.circle(x + 23, y + 15, 19).fill('#4b7e59'); floor.circle(x + 12, y + 21, 12).fill('#7ca06d');
    }
  }
  for (const x of [2, 7, 12, 16]) {
    rect(floor, x * size, 14, 3 * size - 16, 61, '#a8cfd7');
    rect(floor, x * size + 4, 18, 3 * size - 24, 20, '#d7e9ed');
    rect(floor, x * size + 61, 14, 6, 61, '#eff4ef');
  }
  const rug = new Graphics().rect(6 * size, 9 * size, 7 * size, 3 * size).fill('#a7c2c6');
  rug.rect(6 * size + 8, 9 * size + 8, 7 * size - 16, 3 * size - 16).stroke({ color: '#e6eee8', width: 2 }); app.stage.addChild(rug);
  const seats = new Container(); const people = new Container(); app.stage.addChild(seats, people);
  function label(text: string, x: number, y: number, color = '#354944', fontSize = 14) {
    const element = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize, fill: color, fontWeight: '600' } }); element.anchor.set(.5); element.position.set(x, y); return element;
  }
  app.stage.addChild(label('WINDOW TABLE', 4.5 * size, 8 * size), label('GARDEN TABLE', 13.5 * size, 8 * size));
  app.stage.addChild(label('LOCAL TEST CAFE', 9.5 * size, 1.8 * size, '#eff4ef', 14));
  let destroyed = false;
  function update(input: RoomSnapshot | null) {
    if (destroyed) return;
    const state = input ? RoomSnapshotSchema.parse(input) : null;
    if (state && (state.worldSlug !== scene.key || state.seats.some(seat => !scene.seats.some(point => point.seatId === seat.seatId)))) throw new Error('SCENE_CONTEXT_MISMATCH');
    seats.removeChildren().forEach(child => child.destroy()); people.removeChildren().forEach(child => child.destroy());
    for (const point of scene.seats) {
      const seat = state?.seats.find(seat => seat.seatId === point.seatId); const at = tileCenter(scene, point);
      const chair = new Graphics();
      chair.roundRect(-18, -17, 36, 33, 4).fill(seat?.mine ? '#287a70' : seat?.state === 'available' ? '#d77766' : '#87918c');
      chair.rect(-18, point.facing === 'south' ? -20 : 12, 36, 8).fill('#9c5149'); chair.position.set(at.x, at.y);
      if (state && seat?.state === 'available' && !state.self.seatId) { chair.eventMode = 'static'; chair.cursor = 'pointer'; chair.on('pointertap', () => onSeat(point.seatId)); }
      seats.addChild(chair, label(point.seatId.slice(5).padStart(2, '0'), at.x, at.y + 30, '#40584c', 12));
      if (seat?.state !== 'available' && seat?.state !== undefined && !state?.participants.some(p => p.seatId === seat.seatId)) {
        const occupied = new Graphics().circle(at.x, at.y - 3, 6).fill('#e4e9e4'); seats.addChild(occupied);
      }
    }
    const profiles = new Map(state?.participants.map(p => [p.profile.id, p]) ?? []);
    if (state && !profiles.has(state.self.accountId)) profiles.set(state.self.accountId, { profile: { id: state.self.accountId, displayName: 'You', avatarKey: 'mint' }, seatId: state.self.seatId, state: 'active' });
    let standing = 0;
    for (const person of profiles.values()) {
      const seat = scene.seats.find(seat => seat.seatId === person.seatId);
      const point = seat ?? { x: scene.spawn.x + (standing++ % 4) - 2, y: scene.spawn.y - Math.floor((standing - 1) / 4) };
      const at = tileCenter(scene, point); const sprite = new Sprite(texture); sprite.anchor.set(.5, .85); sprite.position.set(at.x, at.y); sprite.scale.set(1.2);
      sprite.alpha = person.state === 'reconnecting' ? .4 : 1;
      people.addChild(sprite);
      if (person.profile.id === state?.self.accountId) people.addChild(label('You', at.x, at.y - 55, '#233d34', 13));
    }
    canvas.dataset.entityCount = String(profiles.size); canvas.dataset.roomVersion = state ? String(state.roomVersion) : '';
    app.render();
  }
  host.appendChild(canvas); update(null);
  return { update, destroy() { if (destroyed) return; destroyed = true; app.destroy(true, { children: true }); } };
}
