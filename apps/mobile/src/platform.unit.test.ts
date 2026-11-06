import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({back:undefined as undefined|(()=>void),remove:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true}}));
vi.mock('@capacitor/app',()=>({App:{addListener:vi.fn((_event:string,callback:()=>void)=>{mocks.back=callback;return Promise.resolve({remove:mocks.remove});})}}));
beforeEach(()=>{vi.resetModules();mocks.back=undefined;mocks.remove.mockReset();});afterEach(()=>vi.unstubAllGlobals());
it('native Back closes the top dialog without navigating the room',async()=>{
 const close=vi.fn(),dispatchEvent=vi.fn((_event:Event)=>true),navigate=vi.fn();vi.stubGlobal('document',{querySelectorAll:()=>[{close,dispatchEvent}]});const {bindMobileBack}=await import('./platform');const stop=bindMobileBack(navigate);await vi.waitFor(()=>expect(mocks.back).toBeTypeOf('function'));mocks.back!();expect(dispatchEvent.mock.calls[0][0]).toMatchObject({type:'cancel',cancelable:true});expect(close).toHaveBeenCalledTimes(1);expect(navigate).not.toHaveBeenCalled();stop();
});
it('a dialog may prevent cancellation to protect its own pending interaction',async()=>{
 const close=vi.fn(),navigate=vi.fn();vi.stubGlobal('document',{querySelectorAll:()=>[{close,dispatchEvent:()=>false}]});const {bindMobileBack}=await import('./platform');const stop=bindMobileBack(navigate);await vi.waitFor(()=>expect(mocks.back).toBeTypeOf('function'));mocks.back!();expect(close).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();stop();
});
it('fallback Back still navigates home and an unmounted listener ignores late events',async()=>{
 const navigate=vi.fn();vi.stubGlobal('document',{querySelectorAll:()=>[]});const {bindMobileBack}=await import('./platform');const stop=bindMobileBack(navigate);await vi.waitFor(()=>expect(mocks.back).toBeTypeOf('function'));mocks.back!();expect(navigate).toHaveBeenCalledWith('/');stop();mocks.back!();expect(navigate).toHaveBeenCalledTimes(1);
});
