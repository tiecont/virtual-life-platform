import {it,expect} from 'vitest';
import * as T from 'three';
import {sandboxScene} from '@virtual-city/world-sdk';
import {createRoomArt} from '../src/room';
import {sceneResourceInventory} from '../src/resources';
import budgets from '../../../docs/design/vnext/animals-3d/budgets-v1.json';

for(const theme of ['deadline','maid'] as const){
 const manifest=sandboxScene;
 it(`${theme} batches complete cafe art within environment budgets and preserves the input floor`,()=>{
  const before=structuredClone(manifest),room=createRoomArt(manifest,theme);
  try{
   expect(manifest).toEqual(before);expect(room.width).toBe(manifest.columns*.5);expect(room.depth).toBe(manifest.rows*.5);
   expect(room.art).toMatchObject({theme,revision:'cafe-details-v2',windows:4});
   expect(room.art.workstations).toBe(theme==='deadline'?2:0);expect(room.art.teaSets).toBe(theme==='maid'?2:0);
   const baseline=createRoomArt(manifest);
   try{const bounds=new T.Box3().setFromObject(room.group),original=new T.Box3().setFromObject(baseline.group);for(const axis of ['x','z'] as const){expect(bounds.min[axis]).toBeCloseTo(original.min[axis],6);expect(bounds.max[axis]).toBeCloseTo(original.max[axis],6);}}finally{baseline.dispose();}
   const inventory=sceneResourceInventory(room.group,new T.Group(),new T.DirectionalLight().shadow);
   expect(inventory.unknownTextures).toBe(0);expect(inventory.environmentTextureBytes).toBeLessThan(budgets.artTextures.environmentDecodedRGBA8WithMipsMiBMax*1024*1024);expect(inventory.geometryBytes).toBeLessThan(budgets.geometry.residentGeometryBuffersMiBMax*1024*1024);
   let draws=0;room.group.traverse(object=>{if(!(object instanceof T.Mesh))return;draws++;const positions=object.geometry.getAttribute('position');expect([...positions.array].every(Number.isFinite)).toBe(true);expect(positions.count).toBeGreaterThan(0);});expect(draws).toBeLessThanOrEqual(12);
  }finally{room.dispose();}
 });
 it(`${theme} releases every retained geometry,material and texture once without touching a sibling room`,()=>{
  const room=createRoomArt(manifest,theme),sibling=createRoomArt(manifest,theme),resources=new Set<T.BufferGeometry|T.Material|T.Texture>(),counts=new Map<object,number>();
  room.group.traverse(object=>{if(!(object instanceof T.Mesh))return;resources.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){resources.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)resources.add(value);}});
  for(const resource of resources){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));}
  const parent=new T.Group();parent.add(room.group,sibling.group);room.dispose();room.dispose();expect([...counts.values()].every(count=>count===1)).toBe(true);expect(parent.children).toEqual([sibling.group]);sibling.dispose();
 });
}
it('unselected themes and the creator study retain the original room recipe',()=>{
 for(const manifest of [undefined,sandboxScene]){const room=createRoomArt(manifest);try{expect(room.art).toEqual({revision:'original-room-v1',theme:null,windows:0,workstations:0,teaSets:0});}finally{room.dispose();}}
});
