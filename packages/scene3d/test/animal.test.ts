import {afterEach,it,expect,vi} from 'vitest';
import * as T from 'three';
import {createAnimal,animalResourceSummary,type Quality} from '../src/animal';
const models:Array<ReturnType<typeof createAnimal>>=[];
afterEach(()=>{for(const model of models.splice(0))model.dispose();expect(animalResourceSummary()).toEqual({cachedQualityTiers:0,references:0});});
function model(quality:Quality='balanced',outfit:'casual'|'cafe-apron'='casual'){const value=createAnimal(quality,'cocoa',outfit);models.push(value);return value;}
it('counts the entire visible character including face, ears, collar and apron against the locked base ceilings',()=>{
 for(const [quality,baseMax]of [['low',3500],['balanced',10000],['high',28000]]as const)for(const outfit of ['casual','cafe-apron']as const){const animal=model(quality,outfit);let base=0;animal.group.traverseVisible(object=>{if(object instanceof T.Mesh&&object!==animal.fur)base+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;});expect(base).toBeLessThanOrEqual(baseMax);expect(animal.triangles).toBe(base+animal.fur.geometry.getAttribute('position').count/3);}
});
it('creates an original24bone mesh and groom with valid normalized skin weights under the locked LOD ceilings',()=>{
 for(const [quality,furMax,baseMax]of [['low',1500,3500],['balanced',8000,10000],['high',24000,28000]]as const){const animal=model(quality);expect(animal.bones).toHaveLength(24);const body=animal.body.geometry,fur=animal.fur.geometry;expect((body.index?.count??body.getAttribute('position').count)/3).toBeLessThanOrEqual(baseMax);expect(fur.getAttribute('position').count/3).toBeLessThanOrEqual(furMax);
  for(const geometry of [body,fur]){const weights=geometry.getAttribute('skinWeight'),indices=geometry.getAttribute('skinIndex');let maximumError=0,invalidIndices=0;for(let i=0;i<weights.count;i++){maximumError=Math.max(maximumError,Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1));if(indices.getX(i)<0||indices.getX(i)>=24)invalidIndices++;}expect(maximumError).toBeLessThan(1e-6);expect(invalidIndices).toBe(0);}
  for(const pose of ['idle','walk','sit','serve']as const){animal.update(1.75,pose);const vertex=new T.Vector3(),positions=body.getAttribute('position');for(let i=0;i<positions.count;i+=97){vertex.fromBufferAttribute(positions,i);animal.body.applyBoneTransform(i,vertex);expect(vertex.toArray().every(Number.isFinite)).toBe(true);expect(vertex.length()).toBeLessThan(3);}}
 }
});
it('shares expensive geometry/groom across20avatars while keeping their skeletons and poses independent',()=>{
 for(let i=0;i<20;i++)model();expect(animalResourceSummary()).toEqual({cachedQualityTiers:1,references:20});const [a,b]=models;expect(a.body.geometry).toBe(b.body.geometry);expect(a.fur.geometry).toBe(b.fur.geometry);expect(a.bones[14]).not.toBe(b.bones[14]);a.update(.3,'walk');b.update(.3,'idle');expect(a.bones[14].rotation.x).not.toBe(b.bones[14].rotation.x);
 const disposed=vi.fn();a.body.geometry.addEventListener('dispose',disposed);for(let i=0;i<19;i++)models[i].dispose();expect(disposed).not.toHaveBeenCalled();models[19].dispose();expect(disposed).toHaveBeenCalledTimes(1);models[19].dispose();expect(disposed).toHaveBeenCalledTimes(1);
});
