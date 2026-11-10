import type {RoomSceneFactory} from '@virtual-city/client-sdk';
// The existing renderer is CommonJS. Next exposes its named exports, while the
// Vite lazy chunk can expose that same module under default. Keep both adapters.
export function rendererFactory(namespace:unknown):RoomSceneFactory{
 if(!namespace||typeof namespace!=='object')throw Error('Renderer unavailable');
 const module=namespace as {createCafeScene?:unknown;default?:{createCafeScene?:unknown}};
 const factory=module.createCafeScene??module.default?.createCafeScene;
 if(typeof factory!=='function')throw Error('Renderer unavailable');
 return factory as RoomSceneFactory;
}
