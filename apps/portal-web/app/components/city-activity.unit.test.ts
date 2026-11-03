import { it,expect } from 'vitest';
import { activityFresh,roomActivity,scheduledActivity } from './city-activity';
it('counts only actual directory allocations and rejects impossible or duplicate rooms',()=>{
 const room={roomId:'00000000-0000-4000-8000-000000000001',capacity:8,occupancy:2};expect(roomActivity({schemaVersion:1,rooms:[room]})).toEqual({rooms:1,usedPlaces:2,directory:[room]});expect(roomActivity({schemaVersion:1,rooms:[]})).toEqual({rooms:0,usedPlaces:0,directory:[]});expect(()=>roomActivity({schemaVersion:1,rooms:[room,room]})).toThrow('INCONSISTENT_ROOM_DIRECTORY');expect(()=>roomActivity({schemaVersion:1,rooms:[{...room,occupancy:9}]})).toThrow('INCONSISTENT_ROOM_DIRECTORY');
});
it('expires observations across wall-clock jumps,suspension and exact30second boundary',()=>{
 expect(activityFresh(1000,500,30999,30499)).toBe(true);for(const [wall,mono] of [[31000,30500],[999,600],[1100,499],[32000,500],[1001,31000],[NaN,600]])expect(activityFresh(1000,500,wall,mono)).toBe(false);
});
it('does not invent a schedule from unavailable or malformed responses',()=>{
 expect(scheduledActivity({schemaVersion:1,items:[],truncated:false},'sdk-sandbox')).toEqual({items:[],truncated:false});expect(()=>scheduledActivity({schemaVersion:1,items:[{title:'unverified'}],truncated:false},'sdk-sandbox')).toThrow();
});
