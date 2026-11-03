import { defineWorld, WorldError } from './registry';
import { SandboxCommandSchema } from '@virtual-city/contracts';
import { sandboxScene } from './scene';

// Lifecycle example only. This module does not allocate rooms, publish presence or load a scene.
export function createSandboxWorld() {
  let started = false;
  return defineWorld({
    schemaVersion: 1, apiVersion: 1, slug: 'sdk-sandbox', version: '1.0.0', title: 'SDK Sandbox (local test world)', kind: 'sandbox',
    sceneRef: { key: 'sdk-sandbox', version: '1.0.0' }, capacity: 8, capabilities: ['presence', 'seating', 'focus'], focusPolicy: { pauseAllowed: false },
    scene: sandboxScene,
    appearancePolicy: { apron: 'allowed' },
    seatIds: ['seat-1', 'seat-2', 'seat-3', 'seat-4', 'seat-5', 'seat-6', 'seat-7', 'seat-8'],
    accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: 0.5, y: 0.5 }, icon: 'flask' },
  }, {
    bootstrap: async () => { started = true; }, shutdown: async () => { started = false; },
    onJoin: async () => { if (!started) throw new Error('Sandbox not initialized'); },
    onLeave: async () => { if (!started) throw new Error('Sandbox not initialized'); },
    travel: { prepare: async context => { if (!started || context.signal.aborted) throw new Error('Sandbox unavailable'); }, abort: async () => {}, depart: async () => {} },
    onCommand: async (_context, payload) => {
      if (!started) throw new Error('Sandbox not initialized');
      if (!SandboxCommandSchema.safeParse(payload).success) throw new WorldError('INVALID_REQUEST', 'Unknown sandbox command');
      return { sandbox: true, worldVersion: '1.0.0', sceneVersion: '1.0.0' };
    },
  });
}
