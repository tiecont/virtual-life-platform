import {it,expect} from 'vitest';
import * as T from 'three';
import {compactFaceGeometry} from '../src/face-geometry';
import {createAnimal} from '../src/animal';
import {sceneResourceInventory} from '../src/resources';

it('keeps coincident vertices separate when their blink targets differ and preserves every triangle attribute when split',()=>{
 const source=new T.BufferGeometry(),positions=new Float32Array([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0]);source.setAttribute('position',new T.BufferAttribute(positions,3));source.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(24).fill(2),4));source.morphAttributes.position=[new T.Float32BufferAttribute(positions.map((value,index)=>index>=9?value+.25:value),3)];source.morphTargetsRelative=true;
 const compact=compactFaceGeometry(source),split=compactFaceGeometry(source,3);expect(compact).toHaveLength(1);expect(compact[0].getAttribute('position').count).toBe(6);expect(split).toHaveLength(2);expect(split.every(chunk=>chunk.morphTargetsRelative)).toBe(true);
 const expanded=split.map(chunk=>chunk.index?chunk.toNonIndexed():chunk);for(const name of ['position','skinIndex'])expect(expanded.flatMap(chunk=>Array.from(chunk.getAttribute(name).array))).toEqual(Array.from(source.getAttribute(name).array));expect(expanded.flatMap(chunk=>Array.from(chunk.morphAttributes.position![0].array))).toEqual(Array.from(source.morphAttributes.position[0].array));
 for(const geometry of new Set([source,...compact,...split,...expanded]))geometry.dispose();
});
it('keeps every complete original character under the locked texture dimension without dropping triangles',()=>{
 for(const quality of ['low','balanced','high']as const){const model=createAnimal(quality,'cocoa','cafe-apron'),people=new T.Group();people.add(model.group);const inventory=sceneResourceInventory(new T.Group(),people,new T.DirectionalLight().shadow,16384);expect(inventory.maxTextureDimension).toBeLessThanOrEqual(2048);let triangles=0;model.group.traverseVisible(object=>{if(object instanceof T.Mesh)triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;});expect(triangles).toBe(model.triangles);model.dispose();}
});
