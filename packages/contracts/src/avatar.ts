import { z } from 'zod';
import { AvatarKeySchema } from './profiles';

export const AvatarOutfitSchema = z.enum(['casual', 'cafe-apron']);
export const AnimationStateSchema = z.enum(['idle', 'walk', 'sit', 'serve']);
export const AvatarAppearanceSchema = z.strictObject({ schemaVersion: z.literal(1), core: z.literal('starter-v1'), palette: AvatarKeySchema, outfit: AvatarOutfitSchema });
export type AvatarAppearance = z.infer<typeof AvatarAppearanceSchema>;
export type AnimationState = z.infer<typeof AnimationStateSchema>;
