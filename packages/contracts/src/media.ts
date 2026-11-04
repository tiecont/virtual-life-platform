import { z } from 'zod';
import { AudienceReadSchema } from './audience';
// Readiness is never a playback capability. No URL,license claim or source ID
// may come from a player;the baseline has no playback/streaming endpoint.
export const MediaReadSchema=AudienceReadSchema;
export const MediaViewSchema=z.strictObject({schemaVersion:z.literal(1),mode:z.literal('SILENT'),playbackEnabled:z.literal(false),clearance:z.enum(['UNAVAILABLE','REVIEWED']),serverTime:z.number().int().nonnegative(),expiresAt:z.number().int().nonnegative()}).refine(value=>value.expiresAt>=value.serverTime&&value.expiresAt<=value.serverTime+3000);
