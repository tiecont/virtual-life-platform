import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({acquire:vi.fn(),release:vi.fn(),platform:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:mocks.platform},registerPlugin:()=>({acquire:mocks.acquire,release:mocks.release})}));
beforeEach(()=>{vi.resetModules();mocks.acquire.mockReset().mockResolvedValue({requestedPolicy:6});mocks.release.mockReset().mockResolvedValue({restored:true});mocks.platform.mockReturnValue('android');});
it('serializes an unresolved acquire, cleanup and replacement route',async()=>{
 let resolve!:()=>void;mocks.acquire.mockImplementationOnce(()=>new Promise<void>(ok=>resolve=ok));const {bindLandscape}=await import('./orientation');const first=bindLandscape('sensor');await vi.waitFor(()=>expect(mocks.acquire).toHaveBeenCalledTimes(1));const oldId=mocks.acquire.mock.calls[0][0].leaseId;first();const second=bindLandscape('secondary');expect(mocks.release).not.toHaveBeenCalled();expect(mocks.acquire).toHaveBeenCalledTimes(1);resolve();await vi.waitFor(()=>expect(mocks.acquire).toHaveBeenCalledTimes(2));expect(mocks.release).toHaveBeenCalledWith({leaseId:oldId});expect(mocks.acquire.mock.calls[1][0].leaseId).not.toBe(oldId);second();await vi.waitFor(()=>expect(mocks.release).toHaveBeenCalledTimes(2));
});
it('a cancelled pre-acquire route never applies its orientation',async()=>{
 const {bindLandscape}=await import('./orientation');const cancel=bindLandscape('sensor');cancel();await vi.waitFor(()=>expect(mocks.release).toHaveBeenCalledTimes(1));expect(mocks.acquire).not.toHaveBeenCalled();
});
it('browser fallback never invokes a native bridge',async()=>{
 mocks.platform.mockReturnValue('web');const {bindLandscape}=await import('./orientation');bindLandscape('primary')();expect(mocks.acquire).not.toHaveBeenCalled();expect(mocks.release).not.toHaveBeenCalled();
});
