import {afterEach,describe,it,expect,vi} from 'vitest';
import {browserPlatform} from '../src/index';
afterEach(()=>vi.unstubAllGlobals());
describe('navigation platform boundary',()=>{
 it('uses an injected client router without touching document navigation',()=>{const push=vi.fn(),assign=vi.fn();vi.stubGlobal('window',{location:{assign}});browserPlatform(()=>{},push).navigate('/worlds/deadline?from=city');expect(push).toHaveBeenCalledWith('/worlds/deadline?from=city');expect(assign).not.toHaveBeenCalled();});
 it('rejects hostile navigation before invoking either adapter',()=>{const push=vi.fn(),assign=vi.fn();vi.stubGlobal('window',{location:{assign}});for(const path of ['//outside.invalid','javascript:alert(1)','/\\outside.invalid','/identity\n']){expect(()=>browserPlatform(()=>{},push).navigate(path)).toThrow();expect(()=>browserPlatform(()=>{}).navigate(path)).toThrow();}expect(push).not.toHaveBeenCalled();expect(assign).not.toHaveBeenCalled();});
 it('keeps classic document navigation when no router is supplied',()=>{const assign=vi.fn();vi.stubGlobal('window',{location:{assign}});browserPlatform(()=>{}).navigate('/');expect(assign).toHaveBeenCalledWith('/');});
});
