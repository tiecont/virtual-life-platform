import { z } from 'zod';
import { CannedMessageIdSchema } from './safety';
import { DatingAliasSchema } from './dating-profile';
export const DatingDateEnterSchema=z.strictObject({schemaVersion:z.literal(1),expectedVersion:z.number().int().nonnegative(),consent:z.literal(true)});
export const DatingDateChatSchema=z.strictObject({schemaVersion:z.literal(1),key:CannedMessageIdSchema});
export const DatingDateChatReceiptSchema=z.strictObject({schemaVersion:z.literal(1),recorded:z.literal(true),messageId:z.uuid()});
export const DatingDateViewSchema=z.strictObject({schemaVersion:z.literal(1),id:z.uuid(),version:z.number().int().nonnegative(),state:z.enum(['WAITING','ACTIVE']),consentedByMe:z.boolean(),serverTime:z.number().int().nonnegative(),expiresAt:z.number().int().nonnegative(),deadline:z.number().int().nonnegative(),peer:z.strictObject({aliasKey:DatingAliasSchema}).nullable(),messages:z.array(z.strictObject({id:z.uuid(),key:CannedMessageIdSchema,sender:z.enum(['you','partner']),sentAt:z.number().int().nonnegative()})).max(20)}).superRefine((v,ctx)=>{if(v.deadline<=v.serverTime||v.expiresAt<=v.serverTime||v.expiresAt>Math.min(v.serverTime+3000,v.deadline)||v.state==='WAITING'&&(v.peer!==null||v.messages.length!==0)||v.state==='ACTIVE'&&(!v.consentedByMe||!v.peer))ctx.addIssue({code:'custom',message:'Invalid private date observation'});});
