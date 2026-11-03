import { defineWorld } from '@virtual-city/world-sdk';
// Explicit development/test fixtures only. These do not integrate either legacy
// application and have no external resources, media, staff or progression.
export function createTravelFixtures() {
  return ['deadline', 'maid', 'portal'].map(name => defineWorld({ schemaVersion: 1, apiVersion: 1, slug: `travel-${name}-fixture`, version: '1.0.0', title: `Synthetic ${name[0].toUpperCase() + name.slice(1)} (travel test)`, kind: 'sandbox', sceneRef: { key: `travel-${name}-fixture`, version: '1.0.0' }, capacity: 2, capabilities: ['presence', 'portals'], accessPolicy: { kind: 'public' }, visibility: 'listed', map: { region: 'sandbox', position: { x: .5, y: .5 }, icon: 'flask' } }, { bootstrap: async () => {}, shutdown: async () => {}, onJoin: async () => {}, onLeave: async () => {}, onCommand: async () => {}, travel: { prepare: async context => { if (context.signal.aborted) throw new Error('Preparation aborted'); }, abort: async () => {}, depart: async () => {} } }));
}
