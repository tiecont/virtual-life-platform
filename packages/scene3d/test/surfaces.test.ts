import {expect,it} from 'vitest';
import * as T from 'three';
import {createFurAtlas,createClothWeave,createTailoredApron,groomFlow} from '../src/surfaces';
import {createAnimal,animalResourceSummary} from '../src/animal';
import {starterAvatarParts} from '@virtual-city/contracts';

function textureBytes(texture:T.Texture){if(!(texture instanceof T.DataTexture)||!texture.image.data)throw Error('Expected live data texture');return texture.image.data;}

it('groom flow stays tangent and finite across cheek,chest,ear,tail and vertical normals',()=>{
 const regions=[new T.Vector3(.18,1.05,.14),new T.Vector3(-.18,1.05,.14),new T.Vector3(0,.8,.14),new T.Vector3(.12,1.3,0),new T.Vector3(0,.8,-.4)];
 for(const point of regions)for(const normal of [new T.Vector3(0,1,0),new T.Vector3(0,-1,0),new T.Vector3(0,0,1),new T.Vector3(.8,0,.6)]){const flow=groomFlow(point,normal);expect(flow.direction.toArray().every(Number.isFinite)).toBe(true);expect(flow.direction.length()).toBeCloseTo(1,6);expect(Math.abs(flow.direction.dot(normal))).toBeLessThan(1e-6);expect(flow.length).toBeGreaterThan(0);expect(flow.length).toBeLessThan(.06);}
 expect(groomFlow(regions[3],new T.Vector3(0,0,1)).length).toBeLessThan(groomFlow(regions[0],new T.Vector3(0,0,1)).length);
});

it('fur alpha tapers at edges/tips and cloth uses bounded normalized linear-space normals',()=>{
 const fur=createFurAtlas(),cloth=createClothWeave();try{const furData=textureBytes(fur),clothData=textureBytes(cloth);expect(fur.image.width).toBe(128);expect(fur.image.height).toBe(256);expect(fur.colorSpace).toBe(T.SRGBColorSpace);const alpha=[];for(let i=3;i<furData.length;i+=4)alpha.push(furData[i]);expect(alpha.some(value=>value>0&&value<255)).toBe(true);expect(alpha.at(-1)).toBe(0);expect(alpha.filter(value=>value>0).length).toBeGreaterThan(5000);expect(cloth.colorSpace).toBe(T.NoColorSpace);expect(cloth.image.width).toBe(64);for(let i=0;i<clothData.length;i+=4){const normal=new T.Vector3(clothData[i]/255*2-1,clothData[i+1]/255*2-1,clothData[i+2]/255*2-1);expect(normal.length()).toBeGreaterThan(.98);expect(normal.length()).toBeLessThan(1.02);expect(normal.z).toBeGreaterThan(.95);}}finally{fur.dispose();cloth.dispose();}
});

it('tailored aprons wrap the torso with finite normals and remain under48/96/192triangles',()=>{
 for(const quality of ['low','balanced','high']as const){const geometry=createTailoredApron(quality);try{const positions=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),zs=[];for(let i=0;i<positions.count;i++){expect([positions.getX(i),positions.getY(i),positions.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i)].every(Number.isFinite)).toBe(true);zs.push(positions.getZ(i));}expect(Math.max(...zs)-Math.min(...zs)).toBeGreaterThan(.04);expect(geometry.boundingBox!.getSize(new T.Vector3()).x).toBeLessThan(.3);expect(geometry.index!.count/3).toBeLessThanOrEqual(quality==='low'?48:quality==='balanced'?96:192);}finally{geometry.dispose();}}
});

it('cloth textures share a quality lease and release once after the final avatar',()=>{
 const a=createAnimal('balanced','fern','cafe-apron'),b=createAnimal('balanced','amber','cafe-apron');let disposed=0;try{const apron=(value:typeof a)=>value.group.getObjectByName('Tailored cotton apron')as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;const texture=apron(a).material.normalMap!,before=Array.from(apron(a).geometry.getAttribute('position').array),other=Array.from(apron(b).geometry.getAttribute('position').array);expect(texture).toBe(apron(b).material.normalMap);a.update(0,'sit');expect(Array.from(apron(a).geometry.getAttribute('position').array)).not.toEqual(before);expect(Array.from(apron(b).geometry.getAttribute('position').array)).toEqual(other);a.update(0,'idle');expect(Array.from(apron(a).geometry.getAttribute('position').array)).toEqual(before);texture.addEventListener('dispose',()=>disposed++);a.dispose();expect(disposed).toBe(0);expect(animalResourceSummary().references).toBe(1);b.dispose();expect(disposed).toBe(1);b.dispose();expect(disposed).toBe(1);}finally{a.dispose();b.dispose();}expect(animalResourceSummary().references).toBe(0);
});

it('immutable surface textures survive mixed style/tier leases and are recreated after final disposal',()=>{
 const models:Array<ReturnType<typeof createAnimal>>=[],disposed=[0,0,0];
 const textures=(model:ReturnType<typeof createAnimal>)=>[(model.fur.material as T.MeshStandardMaterial).map!,(model.body.material as T.MeshPhysicalMaterial).normalMap!,(model.group.getObjectByName('Tailored cotton apron') as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>).material.normalMap!];
 try{
  models.push(createAnimal('low'),createAnimal('balanced','fern','casual',starterAvatarParts('fern','dog')),createAnimal('high','amber','cafe-apron',starterAvatarParts('amber','rabbit')));
  const shared=textures(models[0]),bytes=shared.map(texture=>Array.from(textureBytes(texture)));
  shared.forEach((texture,index)=>texture.addEventListener('dispose',()=>disposed[index]++));
  for(const model of models)expect(textures(model)).toEqual(shared);
  expect(models[1].body.material).not.toBe(models[2].body.material);
  models[1].dispose();models[0].dispose();models[0].dispose();expect(disposed).toEqual([0,0,0]);
  models.push(createAnimal('balanced','plum','casual',{...starterAvatarParts('plum','cat'),body:'slender'}));
  expect(textures(models[3])).toEqual(shared);models[2].dispose();expect(disposed).toEqual([0,0,0]);
  models[3].dispose();expect(disposed).toEqual([1,1,1]);expect(animalResourceSummary().references).toBe(0);
  models.push(createAnimal('low'));const recreated=textures(models[4]);
  recreated.forEach((texture,index)=>{expect(texture).not.toBe(shared[index]);expect(Array.from(textureBytes(texture))).toEqual(bytes[index]);});
  expect(disposed).toEqual([1,1,1]);
 }finally{for(const model of models)model.dispose();}
 expect(animalResourceSummary()).toEqual({cachedQualityTiers:0,references:0});
},20000);

it('posed apron vertices remain in front of torso and groom at all tiers',()=>{
 for(const quality of ['low','balanced','high']as const){const animal=createAnimal(quality,'cocoa','cafe-apron');try{const apron=animal.group.getObjectByName('Tailored cotton apron')as T.Mesh,position=apron.geometry.getAttribute('position'),point=new T.Vector3(),ray=new T.Raycaster();let checked=0;
  for(const pose of ['idle','walk','sit','serve']as const){animal.update(1.75,pose);animal.group.updateMatrixWorld(true);animal.body.computeBoundingSphere();animal.fur.computeBoundingSphere();for(let vertex=0;vertex<position.count;vertex++){point.fromBufferAttribute(position,vertex).applyMatrix4(apron.matrixWorld);ray.set(new T.Vector3(point.x,point.y,point.z+.3),new T.Vector3(0,0,-1));const hit=ray.intersectObjects([animal.body,animal.fur],false)[0];if(hit){checked++;expect(point.z-hit.point.z,quality+'/'+pose+'/'+vertex).toBeGreaterThan(.004);}}}
  expect(checked).toBeGreaterThan(position.count*2);
 }finally{animal.dispose();}}
},20000);
