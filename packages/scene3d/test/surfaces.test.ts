import {expect,it} from 'vitest';
import * as T from 'three';
import {createFurAtlas,createClothWeave,createTailoredApron,groomFlow} from '../src/surfaces';
import {createAnimal,animalResourceSummary} from '../src/animal';

it('groom flow stays tangent and finite across cheek,chest,ear,tail and vertical normals',()=>{
 const regions=[new T.Vector3(.18,1.05,.14),new T.Vector3(-.18,1.05,.14),new T.Vector3(0,.8,.14),new T.Vector3(.12,1.3,0),new T.Vector3(0,.8,-.4)];
 for(const point of regions)for(const normal of [new T.Vector3(0,1,0),new T.Vector3(0,-1,0),new T.Vector3(0,0,1),new T.Vector3(.8,0,.6)]){const flow=groomFlow(point,normal);expect(flow.direction.toArray().every(Number.isFinite)).toBe(true);expect(flow.direction.length()).toBeCloseTo(1,6);expect(Math.abs(flow.direction.dot(normal))).toBeLessThan(1e-6);expect(flow.length).toBeGreaterThan(0);expect(flow.length).toBeLessThan(.06);}
 expect(groomFlow(regions[3],new T.Vector3(0,0,1)).length).toBeLessThan(groomFlow(regions[0],new T.Vector3(0,0,1)).length);
});

it('fur alpha tapers at edges/tips and cloth uses bounded normalized linear-space normals',()=>{
 const fur=createFurAtlas(),cloth=createClothWeave();try{expect(fur.image.width).toBe(128);expect(fur.image.height).toBe(256);expect(fur.colorSpace).toBe(T.SRGBColorSpace);const alpha=[];for(let i=3;i<fur.image.data.length;i+=4)alpha.push(fur.image.data[i]);expect(alpha.some(value=>value>0&&value<255)).toBe(true);expect(alpha.at(-1)).toBe(0);expect(alpha.filter(value=>value>0).length).toBeGreaterThan(5000);expect(cloth.colorSpace).toBe(T.NoColorSpace);expect(cloth.image.width).toBe(64);for(let i=0;i<cloth.image.data.length;i+=4){const data=cloth.image.data,normal=new T.Vector3(data[i]/255*2-1,data[i+1]/255*2-1,data[i+2]/255*2-1);expect(normal.length()).toBeGreaterThan(.98);expect(normal.length()).toBeLessThan(1.02);expect(normal.z).toBeGreaterThan(.95);}}finally{fur.dispose();cloth.dispose();}
});

it('tailored aprons wrap the torso with finite normals and remain under48/96/192triangles',()=>{
 for(const quality of ['low','balanced','high']as const){const geometry=createTailoredApron(quality);try{const positions=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),zs=[];for(let i=0;i<positions.count;i++){expect([positions.getX(i),positions.getY(i),positions.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i)].every(Number.isFinite)).toBe(true);zs.push(positions.getZ(i));}expect(Math.max(...zs)-Math.min(...zs)).toBeGreaterThan(.04);expect(geometry.boundingBox!.getSize(new T.Vector3()).x).toBeLessThan(.3);expect(geometry.index!.count/3).toBeLessThanOrEqual(quality==='low'?48:quality==='balanced'?96:192);}finally{geometry.dispose();}}
});

it('cloth textures share a quality lease and release once after the final avatar',()=>{
 const a=createAnimal('balanced','fern','cafe-apron'),b=createAnimal('balanced','amber','cafe-apron');let disposed=0;try{const apron=(value:typeof a)=>value.group.getObjectByName('Tailored cotton apron')as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;const texture=apron(a).material.normalMap!,before=Array.from(apron(a).geometry.getAttribute('position').array),other=Array.from(apron(b).geometry.getAttribute('position').array);expect(texture).toBe(apron(b).material.normalMap);a.update(0,'sit');expect(Array.from(apron(a).geometry.getAttribute('position').array)).not.toEqual(before);expect(Array.from(apron(b).geometry.getAttribute('position').array)).toEqual(other);a.update(0,'idle');expect(Array.from(apron(a).geometry.getAttribute('position').array)).toEqual(before);texture.addEventListener('dispose',()=>disposed++);a.dispose();expect(disposed).toBe(0);expect(animalResourceSummary().references).toBe(1);b.dispose();expect(disposed).toBe(1);b.dispose();expect(disposed).toBe(1);}finally{a.dispose();b.dispose();}expect(animalResourceSummary().references).toBe(0);
});

it('posed apron vertices remain in front of torso and groom at all tiers',()=>{
 for(const quality of ['low','balanced','high']as const){const animal=createAnimal(quality,'cocoa','cafe-apron');try{const apron=animal.group.getObjectByName('Tailored cotton apron')as T.Mesh,position=apron.geometry.getAttribute('position'),point=new T.Vector3(),ray=new T.Raycaster();let checked=0;
  for(const pose of ['idle','walk','sit','serve']as const){animal.update(1.75,pose);animal.group.updateMatrixWorld(true);animal.body.computeBoundingSphere();animal.fur.computeBoundingSphere();for(let vertex=0;vertex<position.count;vertex++){point.fromBufferAttribute(position,vertex).applyMatrix4(apron.matrixWorld);ray.set(new T.Vector3(point.x,point.y,point.z+.3),new T.Vector3(0,0,-1));const hit=ray.intersectObjects([animal.body,animal.fur],false)[0];if(hit){checked++;expect(point.z-hit.point.z,quality+'/'+pose+'/'+vertex).toBeGreaterThan(.004);}}}
  expect(checked).toBeGreaterThan(position.count*2);
 }finally{animal.dispose();}}
},20000);
