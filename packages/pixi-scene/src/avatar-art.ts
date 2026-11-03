import avatarAsset from './avatar-asset.json';
import { AvatarAppearanceSchema, AvatarKeySchema, AvatarOutfitSchema, AnimationStateSchema, type AvatarAppearance, type AnimationState } from '@virtual-city/contracts';

export const avatarAtlasSpec = { schemaVersion: 1, core: 'starter-v1', path: avatarAsset.path, width: 512, height: 768, frameWidth: 32, frameHeight: 48, frameCount: 4, frameDurationMs: 120 } as const;
export const avatarPalette = { fern: '#4c806b', amber: '#d7a04a', indigo: '#687ab3', rose: '#c88291', cloud: '#cedbd6', cocoa: '#986c55', mint: '#77b8a5', plum: '#936e9c' } as const;

export function avatarFrame(input: AvatarAppearance, inputState: AnimationState, frame: number) {
  const appearance = AvatarAppearanceSchema.parse(input); const state = AnimationStateSchema.parse(inputState);
  if (!Number.isInteger(frame) || frame < 0 || frame >= avatarAtlasSpec.frameCount) throw new Error('INVALID_AVATAR_FRAME');
  const variant = AvatarOutfitSchema.options.indexOf(appearance.outfit) * AvatarKeySchema.options.length + AvatarKeySchema.options.indexOf(appearance.palette);
  return { x: (variant % 4) * 128 + frame * 32, y: Math.floor(variant / 4) * 192 + AnimationStateSchema.options.indexOf(state) * 48, width: 32, height: 48 };
}
