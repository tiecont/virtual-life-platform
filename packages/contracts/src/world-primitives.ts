import { z } from 'zod';
export const WorldSlugSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(64);
export const WorldVersionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/).max(32);
export const SeatIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
