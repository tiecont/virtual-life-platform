import { AvatarAppearanceSchema, AvatarKeySchema, AvatarOutfitSchema, AnimationStateSchema, type AvatarAppearance, type AnimationState } from '@virtual-city/contracts';

export const avatarAtlasSpec = { schemaVersion: 1, core: 'starter-v1', path: '/assets/avatars/starter-v1.svg', width: 512, height: 768, frameWidth: 32, frameHeight: 48, frameCount: 4, frameDurationMs: 120 } as const;
export const avatarPalette = { fern: '#4c806b', amber: '#d7a04a', indigo: '#687ab3', rose: '#c88291', cloud: '#cedbd6', cocoa: '#986c55', mint: '#77b8a5', plum: '#936e9c' } as const;

export function avatarFrame(input: AvatarAppearance, inputState: AnimationState, frame: number) {
  const appearance = AvatarAppearanceSchema.parse(input); const state = AnimationStateSchema.parse(inputState);
  if (!Number.isInteger(frame) || frame < 0 || frame >= avatarAtlasSpec.frameCount) throw new Error('INVALID_AVATAR_FRAME');
  const variant = AvatarOutfitSchema.options.indexOf(appearance.outfit) * AvatarKeySchema.options.length + AvatarKeySchema.options.indexOf(appearance.palette);
  return { x: (variant % 4) * 128 + frame * 32, y: Math.floor(variant / 4) * 192 + AnimationStateSchema.options.indexOf(state) * 48, width: 32, height: 48 };
}

// Original pixel geometry. No external image, font, character reference or music.
function figure(appearance: AvatarAppearance, state: AnimationState, frame: number) {
  const c = avatarPalette[appearance.palette]; const bob = state === 'walk' && frame % 2 ? -1 : state === 'sit' && frame === 2 ? 1 : 0;
  const seated = state === 'sit'; const serving = state === 'serve'; const blink = (state === 'idle' && frame === 1) || (state === 'sit' && frame === 2);
  const stride = state === 'walk' ? [0, -2, 0, 2][frame] : 0;
  const art: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, fill: string) => art.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  art.push('<ellipse cx="16" cy="44" rx="11" ry="2" fill="#263f37" opacity=".18"/>');
  if (seated) {
    rect(10, 33, 15, 5, '#304b46'); rect(12, 37, 5, 5, '#405d55'); rect(21, 37, 5, 5, '#405d55');
    rect(11, 41, 7, 3, '#223932'); rect(20, 41, 8, 3, '#223932');
  } else {
    rect(10, 34, 5, 8 + stride, '#304b46'); rect(18, 34, 5, 8 - stride, '#405d55');
    rect(9, 41 + stride, 7, 3, '#223932'); rect(18, 41 - stride, 7, 3, '#223932');
  }
  art.push(`<g transform="translate(0 ${bob})">`);
  rect(8, 6, 17, 17, '#263f37'); rect(10, 11, 13, 12, '#dca88c'); rect(11, 20, 11, 3, '#c38b73');
  rect(7, 5, 18, 7, '#344e43'); rect(9, 3, 14, 3, c); rect(7, 8, 19, 4, c); rect(9, 5, 3, 3, '#e7d4a9');
  rect(12, 15, 2, blink ? 1 : 2, '#263f37'); rect(20, 15, 2, blink ? 1 : 2, '#263f37'); rect(16, 20, 3, 1, '#9c6258');
  rect(9, 24, 15, seated ? 11 : 13, c); rect(12, 23, 9, 3, '#e9dac2'); rect(15, 25, 3, 6, '#e9dac2');
  rect(5, 25, 4, serving ? 6 : 9, c); rect(5, serving ? 29 : 33, 4, 5, '#dca88c');
  if (serving) {
    rect(24, 22, 4, 9, c); rect(24, 18, 4, 5, '#dca88c'); rect(20, 18, 12, 2, '#d7b479');
    rect(25, 12, 5, 6, '#f0eee1'); rect(30, 13, 2, 3, '#d7b479'); rect(26, 11, 3, 1, '#715a45');
    rect(26 + frame % 2, 6, 1, 3, '#c0d1c4');
  } else { rect(24, 25, 4, 9, c); rect(24, 33, 4, 5, '#dca88c'); }
  if (appearance.outfit === 'cafe-apron') {
    rect(12, 27, 10, seated ? 8 : 11, '#eee9d7'); rect(12, 24, 2, 5, '#eee9d7'); rect(20, 24, 2, 5, '#eee9d7');
    rect(14, 31, 6, 3, '#c8d7bc'); rect(16, 31, 2, 2, '#657e62');
  } else { rect(10, 35, 13, 2, '#426157'); rect(20, 28, 2, 3, '#e7d4a9'); }
  art.push('</g>'); return art.join('');
}

export function avatarAtlasSvg() {
  const content: string[] = [];
  for (const outfit of AvatarOutfitSchema.options) for (const palette of AvatarKeySchema.options) for (const state of AnimationStateSchema.options) for (let frame = 0; frame < 4; frame++) {
    const appearance: AvatarAppearance = { schemaVersion: 1, core: 'starter-v1', palette, outfit };
    const at = avatarFrame(appearance, state, frame);
    content.push(`<g transform="translate(${at.x} ${at.y})">${figure(appearance, state, frame)}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768" shape-rendering="crispEdges">${content.join('')}</svg>\n`;
}
