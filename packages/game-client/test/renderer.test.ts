import {it,expect,vi} from 'vitest';import {rendererFactory} from '../src/renderer';
it('accepts the actual Next named and Vite default CommonJS namespace shapes',()=>{const factory=vi.fn();expect(rendererFactory({createCafeScene:factory})).toBe(factory);expect(rendererFactory({default:{createCafeScene:factory}})).toBe(factory);});
it('fails safely when a renderer import has no callable reviewed entry',()=>{for(const value of [null,undefined,{}, {default:{}},{createCafeScene:'untrusted'}])expect(()=>rendererFactory(value)).toThrow('Renderer unavailable');});
