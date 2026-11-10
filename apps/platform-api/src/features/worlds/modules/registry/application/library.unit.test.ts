import { it,expect } from 'vitest';
import { readConfig } from '../../../../../shared/config/environment';
it('library installation defaults off and local activation is rejected in production',()=>{
 const base={SESSION_SECRET:'x'.repeat(32),DATABASE_URL:'postgres://localhost/virtual_city_test_unit'};
 expect(readConfig({...base,NODE_ENV:'test'}).LOCAL_LIBRARY_WORLD).toBe('0');
 expect(readConfig({...base,NODE_ENV:'test',LOCAL_LIBRARY_WORLD:'1'}).LOCAL_LIBRARY_WORLD).toBe('1');
 expect(()=>readConfig({...base,NODE_ENV:'production',WEB_ORIGIN:'https://city.example',LOCAL_LIBRARY_WORLD:'1'})).toThrow(/LOCAL_LIBRARY_WORLD/);
});
