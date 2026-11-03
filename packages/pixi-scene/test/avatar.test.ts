import { it, expect } from 'vitest';
import { AvatarAppearanceSchema, AvatarKeySchema, AvatarOutfitSchema, AnimationStateSchema, ProfilePatchSchema } from '@virtual-city/contracts';
import { avatarFrame, avatarAtlasSpec } from '../src/avatar-art';
import { avatarAtlasSvg } from '../src/avatar-art-generator';

it('maps every approved appearance/action/frame to a distinct bounded atlas cell', () => {
  const cells = new Set<string>();
  for (const palette of AvatarKeySchema.options) for (const outfit of AvatarOutfitSchema.options) for (const state of AnimationStateSchema.options) for (let frame = 0; frame < 4; frame++) {
    const rect = avatarFrame({ schemaVersion: 1, core: 'starter-v1', palette, outfit }, state, frame);
    expect(rect.x + rect.width).toBeLessThanOrEqual(avatarAtlasSpec.width); expect(rect.y + rect.height).toBeLessThanOrEqual(avatarAtlasSpec.height);
    cells.add(rect.x + ':' + rect.y);
  }
  expect(cells.size).toBe(256); expect(avatarAtlasSvg()).not.toMatch(/href=|<script|<image|<foreignObject/);
});
it('rejects unknown cores, palettes, outfits, frames and permission/entitlement injection', () => {
  const appearance = { schemaVersion: 1, core: 'starter-v1', palette: 'fern', outfit: 'casual' } as const;
  for (const input of [{ ...appearance, outfit: 'moderator' }, { ...appearance, core: 'foreign' }, { ...appearance, palette: 'unowned' }, { ...appearance, role: 'staff' }]) expect(AvatarAppearanceSchema.safeParse(input).success).toBe(false);
  for (const frame of [-1, 4, .5, NaN]) expect(() => avatarFrame(appearance, 'idle', frame)).toThrow('INVALID_AVATAR_FRAME');
  expect(ProfilePatchSchema.safeParse({ avatarKey: 'fern', outfit: 'cafe-apron' }).success).toBe(false);
});
