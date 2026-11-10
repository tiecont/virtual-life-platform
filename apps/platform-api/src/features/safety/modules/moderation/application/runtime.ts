import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SafetyPolicySchema } from '@virtual-city/contracts';
import type { Config } from '../../../../../shared/config/environment';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import { ChatService, type ChatOptions } from './chat';

export type SafetyRuntimeOptions = Omit<ChatOptions, 'policy'> & { policy?: unknown };
export async function loadSafetyPolicy(input?: unknown,file?:string) {
  try {
    if (input !== undefined) return SafetyPolicySchema.parse(input);
    if(file){const bytes=await readFile(file);if(bytes.length>65536)throw Error('Safety policy bounds');return SafetyPolicySchema.parse(JSON.parse(bytes.toString('utf8')));}
    const bundled = await readFile(resolve(__dirname, 'default-policy.json'), 'utf8').catch(() => readFile(resolve(__dirname, '../../../../../../../../config/safety-policy.json'), 'utf8'));
    return SafetyPolicySchema.parse(JSON.parse(bundled));
  }
  catch { throw new Error('Safety policy configuration unavailable'); }
}
export async function createSafetyRuntime(config: Config, rooms: RoomService, identity: IdentityService, options: SafetyRuntimeOptions = {}, now = Date.now) {
  const policy = await loadSafetyPolicy(options.policy,config.SAFETY_POLICY_FILE);
  return new ChatService(rooms, identity, config.NODE_ENV, { ...options, policy }, now);
}
