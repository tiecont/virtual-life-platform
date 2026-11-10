import { Application, Assets, Container, Graphics, Sprite, Text, Texture, Rectangle } from 'pixi.js';
import { SceneManifestSchema, AvatarOutfitSchema, type RoomMotion, type AvatarAppearance, type AnimationState, type RoomSnapshot, type SceneManifest } from '@virtual-city/contracts';
import { motionPosition } from '@virtual-city/world-sdk';
import { tileCenter } from './spec';
import { fitSceneCamera } from './camera';
import { sceneEntities } from './entities';
import { avatarAtlasSpec, avatarFrame } from './avatar-art';
import { parkLandscape } from './park-art';
import { deadlineInterior } from './deadline-art';
import { maidInterior } from './maid-art';

export async function createCafeScene(host: HTMLElement, input: SceneManifest, onSeat: (seatId: string) => void, options: { signal?: AbortSignal; outfit?: AvatarAppearance['outfit'];theme?:'cafe'|'reading-room'|'dining-room'|'lounge'|'park'|'deadline'|'maid'; onMove?: (point: { x: number; y: number }) => void } = {}) {
  const scene = SceneManifestSchema.parse(input); const size = scene.tileSize;
  const reading=options.theme==='reading-room',dining=options.theme==='dining-room',lounge=options.theme==='lounge',park=options.theme==='park';
  AvatarOutfitSchema.parse(options.outfit ?? 'casual');
  options.signal?.throwIfAborted();
  const app = new Application();
  let texture: Texture;
  try {
    await app.init({ width: scene.columns * size, height: scene.rows * size, background: '#e4ebe7', antialias: false, autoStart: false, resolution: Math.min(window.devicePixelRatio || 1, 2), preference: 'webgl', accessibilityOptions: { activateOnTab: false, enabledByDefault: false } });
    // The labeled native room controls provide the canvas alternative. Pixi's
    // mobile touch hook would add an offscreen, unnamed 1px button to that order.
    app.stage.accessibleChildren = false;
    const touchHook = app.renderer.accessibility?.hookDiv;
    if (touchHook) { touchHook.hidden = true; touchHook.tabIndex = -1; }
    options.signal?.throwIfAborted();
    texture = await Assets.load<Texture>(avatarAtlasSpec.path);
    texture.source.scaleMode = 'nearest';
    options.signal?.throwIfAborted();
  } catch (error) {
    if (app.renderer) app.destroy(true, { children: true });
    else app.stage.destroy({ children: true });
    throw error;
  }
  const canvas = app.canvas;
  canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.scene = scene.key;
  const world = new Container(); app.stage.addChild(world);
  world.eventMode = 'static'; world.hitArea = new Rectangle(0, 0, scene.columns * size, scene.rows * size);
  world.on('pointertap', event => {
    if (!current || current.self.seatId || !options.onMove) return;
    const point = world.toLocal(event.global); options.onMove({ x: Math.floor(point.x / size), y: Math.floor(point.y / size) });
  });
  function label(text: string, x: number, y: number, color = '#354944', fontSize = 14) {
    const element = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize, fill: color, fontWeight: '600' } }); element.anchor.set(.5); element.position.set(x, y); return element;
  }
  const background = new Container(); world.addChild(background);
  if(park){background.addChild(parkLandscape(scene));}else if(options.theme==='deadline'){background.addChild(deadlineInterior(scene));}else if(options.theme==='maid'){background.addChild(maidInterior(scene));}else{
  const floor = new Graphics(); background.addChild(floor);
  for (let y = 0; y < scene.rows; y++) for (let x = 0; x < scene.columns; x++) floor.rect(x * size, y * size, size, size).fill((x + y) % 2 ? lounge?'#e2dfeb':dining?'#ded0bf':reading?'#e1ddce':'#dbe7df' : lounge?'#eeeaf1':dining?'#eee3d5':reading?'#e9e5d9':'#e5eee8');
  function rect(g: Graphics, x: number, y: number, w: number, h: number, color: string) { g.rect(x, y, w, h).fill(color); }
  for (const zone of scene.collisionZones) {
    const x = zone.x * size, y = zone.y * size, w = zone.width * size, h = zone.height * size;
    if (zone.kind === 'wall') {
      rect(floor, x, y, w, h, reading?'#4a453c':'#354944'); rect(floor, x + 8, y + 8, Math.max(8, w - 16), Math.max(8, h - 16), reading?'#6a6353':'#465f57');
    } else if(zone.kind==='stage'){
      rect(floor,x,y,w,h,'#514464');rect(floor,x+8,y+8,w-16,h-24,'#786785');rect(floor,x,y+h-16,w,16,'#cfba8d');
      for(const side of [x,x+w-40]){rect(floor,side,y,40,h-16,'#70516e');for(let offset=8;offset<40;offset+=12)rect(floor,side+offset,y,4,h-16,'#94748c');}
      floor.circle(x+w/2,y+40,26).fill('#efe1ae');floor.circle(x+w/2+11,y+32,25).fill('#786785');for(const offset of [70,115,w-115,w-70]){rect(floor,x+offset,y+24,4,12,'#eee2b3');rect(floor,x+offset-4,y+28,12,4,'#eee2b3');}
    } else if (zone.kind === 'table'&&dining) {
      rect(floor,x+6,y+9,w,h-5,'#aa927f');rect(floor,x,y,w,h-6,'#fff8e9');rect(floor,x+6,y+6,w-12,h-18,'#e7ded1');
      for(const offset of [24,w-24]){floor.circle(x+offset,y+h/2-4,13).fill('#faf9f3');floor.circle(x+offset,y+h/2-4,9).stroke({color:'#bca979',width:2});rect(floor,x+offset-20,y+h/2-12,2,19,'#867b69');rect(floor,x+offset+18,y+h/2-12,3,19,'#867b69');}
      rect(floor,x+w/2-4,y+20,8,24,'#a07377');floor.circle(x+w/2,y+17,9).fill('#c9a1a0');floor.circle(x+w/2+5,y+12,5).fill('#6e8763');
    } else if (zone.kind === 'table') {
      rect(floor, x + 7, y + 13, w, h - 8, '#a4b8aa'); rect(floor, x, y, w, h - 10, '#f7f8ef');
      rect(floor, x + 8, y + 8, w - 16, h - 26, '#e9ebe2');
      for (const offset of [24, w - 38]) {
        rect(floor, x + offset, y + 27, 24, 28, '#587f8c'); rect(floor, x + offset + 3, y + 25, 18, 24, '#fafbf7');
        rect(floor, x + offset + 6, y + 28, 12, 4, '#cf6f5f');
      }
      floor.circle(x + w / 2, y + 34, 10).fill('#4f765c');
    } else if(zone.kind==='counter'&&lounge){
      rect(floor,x+5,y+8,w,h-5,'#a396a8');rect(floor,x,y,w,h-10,'#66576d');rect(floor,x,y,w,12,'#e8d7b3');
      for(let offset=24;offset<w-12;offset+=48){rect(floor,x+offset,y+26,18,28,'#f8f2e7');rect(floor,x+offset+3,y+34,12,17,offset%3?'#93b7a3':'#cf9fa5');rect(floor,x+offset+12,y+18,3,26,'#aa8a70');floor.circle(x+offset+5,y+29,6).fill('#d7cf8a');}
    } else if (zone.kind === 'counter'&&reading) {
      // Original deterministic pixel books: decorative spines only, no text or media.
      rect(floor,x+4,y+6,w,h,'#b7aa93');rect(floor,x,y,w,h,'#6a5542');rect(floor,x+5,y+5,w-10,h-10,'#443d35');
      const colors=['#bc795e','#8ca68a','#a4b6bd','#d2b56f','#aaa0b9'];
      for(let row=0;row<Math.max(1,Math.floor(h/40));row++){
        const base=y+Math.min(h-7,(row+1)*40),top=y+row*40+5;
        for(let column=0;column<Math.floor((w-12)/10);column++){
          const height=Math.min(base-top,20+(column%4)*3),left=x+7+column*10;
          rect(floor,left,base-height,7,height,colors[(column+row)%colors.length]);rect(floor,left+2,base-height+4,3,2,'#e8dfc8');
        }
        rect(floor,x+4,base,w-8,4,'#ac8863');
      }
    } else if (zone.kind === 'counter'&&dining) {
      rect(floor,x+6,y+9,w,h-6,'#a98f78');rect(floor,x,y,w,h-8,'#584642');rect(floor,x,y,w,12,'#e9d2a9');
      for(let offset=24;offset<w-16;offset+=54){floor.ellipse(x+offset,y+34,18,7).fill('#e9e6dc');floor.ellipse(x+offset,y+28,16,6).fill('#faf6ec');rect(floor,x+offset-2,y+16,4,7,'#a88d65');}
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
  const rugX=(dining?8:6)*size,rugY=(lounge?12:dining?4:9)*size,rugHeight=(dining?4:3)*size;
  const rug = new Graphics().rect(rugX,rugY,7*size,rugHeight).fill(lounge?'#b3a1b6':dining?'#a77b79':reading?'#b8a8ab':'#a7c2c6');
  rug.rect(rugX+8,rugY+8,7*size-16,rugHeight-16).stroke({ color: '#e6eee8', width: 2 }); background.addChild(rug);
  background.addChild(label(lounge?'TEXT / VISUAL STAGE':dining?'GARDEN DINING':reading?'READING CORNER':'WINDOW TABLE', (lounge?12:dining?5:4.5) * size, (lounge?5.7:dining?8.8:8) * size), label(lounge?'VIRTUAL MOCKTAILS':dining?'WINDOW DINING':reading?'STUDY ALCOVE':'GARDEN TABLE', (lounge?19.5:dining?18:13.5) * size, (lounge?12.7:dining?8.8:reading?9:8) * size));
  background.addChild(label(lounge?'MOONLIGHT LOUNGE':dining?'GRAND RESTAURANT':reading?'ETERNAL LIBRARY':'LOCAL TEST CAFE', (lounge||dining?12:9.5) * size, 1.8 * size, '#eff4ef', 14));
  }
  // Only immutable scenery is cached; seats, hit targets and people stay live.
  background.cacheAsTexture({ resolution: app.renderer.resolution, antialias: false });
  const seats = new Container(); const people = new Container({ sortableChildren: true }); world.addChild(seats, people);
  let destroyed = false;
  let current: RoomSnapshot | null = null; let context = ''; let created = 0; let removed = 0; let frames = 0;
  const avatars = new Map<string, { root: Container; sprite: Sprite; appearance: AvatarAppearance; pose: AnimationState; startedAt: number | null; motion?: RoomMotion; serverTime: number; receivedAt: number; settledPose: 'idle' | 'sit'; self: boolean }>();
  const framesCache = new Map<string, Texture>();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lowMotion = motion.matches; let motionOverride = false;
  let animationTimer: ReturnType<typeof setTimeout> | undefined;
  function frameTexture(appearance: AvatarAppearance, pose: AnimationState, frame: number) {
    const key = [appearance.palette, appearance.outfit, pose, frame].join(':');
    let cached = framesCache.get(key);
    if (!cached) { const at = avatarFrame(appearance, pose, frame); cached = new Texture({ source: texture.source, frame: new Rectangle(at.x, at.y, at.width, at.height) }); framesCache.set(key, cached); }
    return cached;
  }
  const chairs = scene.seats.map(point => {
    const at = tileCenter(scene, point); const chair = new Graphics().roundRect(-18, -17, 36, 33, 4).fill('#ffffff');
    chair.position.set(at.x, at.y);
    const back = new Graphics().rect(at.x - 18, at.y + (point.facing === 'south' ? -20 : 12), 36, 8).fill(park?'#806043':'#9c5149');
    const occupied = new Graphics().circle(at.x, at.y - 3, 6).fill('#e4e9e4'); occupied.visible = false;
    chair.on('pointertap', event => {
      event.stopPropagation();
      if (current && !current.self.seatId && current.seats.some(seat => seat.seatId === point.seatId && seat.state === 'available')) onSeat(point.seatId);
    });
    seats.addChild(chair, back, label(point.seatId.slice(5).padStart(2, '0'), at.x+(options.theme==='deadline'?28:0), at.y+(options.theme==='deadline'?0:30), '#40584c', 12), occupied);
    return { point, chair, occupied };
  });
  function render() { if (!destroyed) { canvas.dataset.renderCount = String(++frames); app.render(); } }
  function stopAnimations() {
    if (animationTimer !== undefined) clearTimeout(animationTimer); animationTimer = undefined;
    for (const avatar of avatars.values()) { avatar.startedAt = null; avatar.sprite.texture = frameTexture(avatar.appearance, avatar.pose, 0); }
    canvas.dataset.activeAnimations = '0';
  }
  function animate() {
    animationTimer = undefined;
    if (destroyed || lowMotion || !people.visible) { stopAnimations(); return; }
    let active = 0; let walking = 0;
    for (const avatar of avatars.values()) {
      if (avatar.motion) {
        const point = motionPosition(avatar.motion, avatar.serverTime + performance.now() - avatar.receivedAt);
        const at = tileCenter(scene, point); avatar.root.position.set(at.x, at.y); avatar.root.zIndex = at.y;
        const pose = point.moving ? 'walk' : avatar.settledPose;
        if (avatar.pose !== pose) { avatar.pose = pose; avatar.startedAt = performance.now(); }
        if (point.moving) walking++;
        if (avatar.self) canvas.dataset.selfPosition = point.x.toFixed(2) + ':' + point.y.toFixed(2);
      }
      if (avatar.startedAt === null) continue;
      const frame = Math.floor((performance.now() - avatar.startedAt) / avatarAtlasSpec.frameDurationMs);
      if (frame >= avatarAtlasSpec.frameCount && avatar.pose !== 'walk') { avatar.startedAt = null; avatar.sprite.texture = frameTexture(avatar.appearance, avatar.pose, 0); }
      else { active++; avatar.sprite.texture = frameTexture(avatar.appearance, avatar.pose, frame % avatarAtlasSpec.frameCount); }
    }
    canvas.dataset.sittingCount = String([...avatars.values()].filter(avatar => avatar.pose === 'sit').length);
    canvas.dataset.activeAnimations = String(active); canvas.dataset.movingCount = String(walking); render();
    if (active || walking) animationTimer = setTimeout(animate, walking ? 16 : avatarAtlasSpec.frameDurationMs);
  }
  function setReducedMotion(value: boolean, override = true) {
    if (destroyed) return;
    lowMotion = value; motionOverride = override;
    if (lowMotion) {
      stopAnimations();
      for (const avatar of avatars.values()) if (avatar.motion) {
        const point = avatar.motion.path[avatar.motion.path.length - 1]; const at = tileCenter(scene, point);
        avatar.root.position.set(at.x, at.y); avatar.root.zIndex = at.y; avatar.pose = avatar.settledPose;
        avatar.sprite.texture = frameTexture(avatar.appearance, avatar.pose, 0);
        if (avatar.self) canvas.dataset.selfPosition = point.x.toFixed(2) + ':' + point.y.toFixed(2);
      }
      canvas.dataset.movingCount = '0'; canvas.dataset.sittingCount = String([...avatars.values()].filter(avatar => avatar.pose === 'sit').length);
    }
    canvas.dataset.reducedMotion = String(lowMotion); render();
  }
  function motionChanged() { if (!motionOverride) setReducedMotion(motion.matches, false); }
  motion.addEventListener('change', motionChanged);
  function updateSeats(state: RoomSnapshot | null) {
    current = state;
    for (const { point, chair, occupied } of chairs) {
      const seat = state?.seats.find(seat => seat.seatId === point.seatId);
      chair.tint = seat?.mine ? '#287a70' : seat?.state === 'available' ? park?'#c6a06e':'#d77766' : '#87918c';
      const enabled = !!state && seat?.state === 'available' && !state.self.seatId;
      chair.eventMode = enabled ? 'static' : 'none'; chair.cursor = enabled ? 'pointer' : 'default';
      occupied.visible = !!seat && seat.state !== 'available' && !state?.participants.some(person => person.seatId === seat.seatId) && !seat.mine;
    }
  }
  function remove(id: string) {
    const avatar = avatars.get(id); if (!avatar) return;
    people.removeChild(avatar.root); avatar.root.destroy({ children: true }); avatars.delete(id); removed++;
  }
  function update(input: RoomSnapshot | null) {
    if (destroyed) return;
    let projection: ReturnType<typeof sceneEntities> | null;
    try { projection = input ? sceneEntities(scene, input) : null; }
    catch (error) { update(null); throw error; }
    const state = projection?.state ?? null;
    const nextContext = state ? [state.epoch, state.roomId, state.membershipId, state.self.accountId].join(':') : '';
    if (nextContext !== context) for (const id of avatars.keys()) remove(id);
    context = nextContext;
    const entities = projection?.entities ?? [];
    const visibleIds = new Set(entities.map(entity => entity.id));
    for (const id of avatars.keys()) if (!visibleIds.has(id)) remove(id);
    for (const entity of entities) {
      let avatar = avatars.get(entity.id);
      if (!avatar) {
        const appearance: AvatarAppearance = { schemaVersion: 1, core: 'starter-v1', palette: entity.palette, outfit:entity.outfit };
        const root = new Container(); const sprite = new Sprite(frameTexture(appearance, entity.pose, 0)); sprite.anchor.set(.5, .92); sprite.scale.set(1.2); root.addChild(sprite);
        if (entity.self) root.addChild(label('You', 0, -55, '#233d34', 13));
        avatar = { root, sprite, appearance, pose: entity.pose, startedAt: null, serverTime: 0, receivedAt: 0, settledPose: entity.settledPose, self: entity.self }; avatars.set(entity.id, avatar); people.addChild(root); created++;
      }
      avatar.root.position.set(entity.x, entity.y); avatar.root.zIndex = entity.y; avatar.root.alpha = entity.opacity;
      if (avatar.pose !== entity.pose) { avatar.pose = entity.pose; avatar.startedAt = lowMotion ? null : performance.now(); }
      avatar.motion = entity.motion; avatar.serverTime = state?.serverTime ?? 0; avatar.receivedAt = performance.now(); avatar.settledPose = entity.settledPose;
      if (entity.pose === 'walk' && !lowMotion && avatar.startedAt === null) avatar.startedAt = performance.now();
      if (lowMotion && entity.motion) { const at = tileCenter(scene, entity.motion.path[entity.motion.path.length - 1]); avatar.root.position.set(at.x, at.y); avatar.pose = entity.settledPose; }
      avatar.appearance = { ...avatar.appearance, palette: entity.palette, outfit:entity.outfit };
      avatar.sprite.texture = frameTexture(avatar.appearance, avatar.pose, 0);
    }
    people.visible = true; updateSeats(state);
    canvas.dataset.entityCount = String(entities.length); canvas.dataset.roomVersion = state ? String(state.roomVersion) : '';
    canvas.dataset.createdEntities = String(created); canvas.dataset.removedEntities = String(removed);
    canvas.dataset.sittingCount = String(entities.filter(entity => entity.pose === 'sit').length); canvas.dataset.suspended = 'false';
    canvas.dataset.avatarCore = 'starter-v1'; canvas.dataset.avatarOutfit = entities.find(entity=>entity.self)?.outfit??'casual';
    canvas.dataset.avatarPalettes = [...new Set(entities.map(entity => entity.palette))].sort().join(',');
    canvas.dataset.movingCount = String(entities.filter(entity => entity.pose === 'walk').length);
    const selfEntity = entities.find(entity => entity.self);
    canvas.dataset.selfPosition = selfEntity ? ((selfEntity.x / size - .5).toFixed(2) + ':' + (selfEntity.y / size - .5).toFixed(2)) : '';
    if (lowMotion) setReducedMotion(true, motionOverride);
    canvas.dataset.reducedMotion = String(lowMotion);
    canvas.dataset.activeAnimations = String([...avatars.values()].filter(avatar => avatar.startedAt !== null).length);
    if (animationTimer === undefined && !lowMotion && [...avatars.values()].some(avatar => avatar.startedAt !== null)) animationTimer = setTimeout(animate, avatarAtlasSpec.frameDurationMs);
    render();
  }
  function suspend() {
    if (destroyed) return;
    stopAnimations(); people.visible = false; updateSeats(null); canvas.dataset.entityCount = '0'; canvas.dataset.sittingCount = '0'; canvas.dataset.movingCount = '0'; canvas.dataset.selfPosition = ''; canvas.dataset.roomVersion = ''; canvas.dataset.suspended = 'true'; render();
  }
  function resize() {
    if (destroyed || !host.clientWidth || !host.clientHeight) return;
    const width = host.clientWidth, height = host.clientHeight;
    const camera = fitSceneCamera({ width, height }, { width: scene.columns * size, height: scene.rows * size });
    app.renderer.resize(width, height); world.scale.set(camera.scale); world.position.set(camera.x, camera.y); render();
  }
  const observer = new ResizeObserver(resize);
  function destroy() {
    if (destroyed) return;
    stopAnimations(); destroyed = true; observer.disconnect(); options.signal?.removeEventListener('abort', destroy); motion.removeEventListener('change', motionChanged);
    avatars.clear(); current = null; app.destroy(true, { children: true });
    for (const frame of framesCache.values()) frame.destroy(false); framesCache.clear();
  }
  host.appendChild(canvas); observer.observe(host); options.signal?.addEventListener('abort', destroy, { once: true });
  if (options.signal?.aborted) { destroy(); options.signal.throwIfAborted(); }
  update(null); resize();
  return { update, suspend, setReducedMotion, destroy };
}
