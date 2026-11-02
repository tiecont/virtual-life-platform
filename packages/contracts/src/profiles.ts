import { z } from 'zod';
export const AvatarKeySchema = z.enum(['fern', 'amber', 'indigo', 'rose', 'cloud', 'cocoa', 'mint', 'plum']);
export const PublicProfileSchema = z.strictObject({ id: z.uuid(), displayName: z.string(), avatarKey: AvatarKeySchema });
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
