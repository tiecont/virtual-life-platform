import { it,expect } from 'vitest';
import { readConfig } from '../../../../../shared/config/environment';
it('Deadline world installation defaults OFF and local activation cannot enter production',()=>{
 const base={SESSION_SECRET:'synthetic-deadline-world-secret-00000',DATABASE_URL:'postgresql://localhost/virtual_city_test_unit'};
 expect(readConfig(base).LOCAL_DEADLINE_WORLD).toBe('0');expect(readConfig({...base,NODE_ENV:'test',LOCAL_DEADLINE_WORLD:'1'}).LOCAL_DEADLINE_WORLD).toBe('1');expect(()=>readConfig({...base,NODE_ENV:'production',WEB_ORIGIN:'https://example.invalid',LOCAL_DEADLINE_WORLD:'1'})).toThrow(/LOCAL_DEADLINE_WORLD/);
});
