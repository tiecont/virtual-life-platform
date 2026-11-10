import { it,expect } from 'vitest';
import { destinationLink,travelHref } from './destination-link';
const room='00000000-0000-4000-8000-000000000001';
it('accepts only a destination slug and optional room UUID as navigation hints',()=>{
 expect(destinationLink({})).toEqual({kind:'none'});expect(destinationLink({destination:'sdk-sandbox',room})).toEqual({kind:'preferred',worldSlug:'sdk-sandbox',roomId:room});expect(destinationLink({destination:'sdk-sandbox'})).toEqual({kind:'preferred',worldSlug:'sdk-sandbox'});expect(travelHref('sdk-sandbox',room)).toBe('/travel?destination=sdk-sandbox&room='+room);
});
it('rejects duplicate,malformed,authority-bearing or room-only query without echoing input',()=>{
 for(const raw of [{room},{destination:['sdk-sandbox','dating']},{destination:'https://example.invalid'},{destination:'javascript:alert(1)'},{destination:'sdk-sandbox',room:'staff'},{destination:'sdk-sandbox',capability:'private-secret'},{destination:'sdk-sandbox',role:'admin'}])expect(destinationLink(raw)).toEqual({kind:'invalid'});
 expect(()=>travelHref('javascript:alert(1)')).toThrow();
});
