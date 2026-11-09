import {it,expect} from 'vitest';
import * as T from 'three';
import {starterAvatarParts} from '@virtual-city/contracts';
import {createAnimal,animalResourceSummary} from '../src/animal';
import {fitRoomCamera,selfCameraBounds,translateCameraTarget} from '../src/room-camera';

it('keeps actual animated animal bodies inside the follow envelope across species,body and pose without changing source geometry',()=>{
 for(const species of ['cat','dog','rabbit']as const)for(const body of ['round','slender']as const){
  const parts={...starterAvatarParts('cocoa',species),body},animal=createAnimal('low','cocoa','casual',parts);
  try{
   const before=Array.from(animal.body.geometry.getAttribute('position').array),bounds=selfCameraBounds({x:0,y:0});
   animal.group.position.set(.25,0,.25);
   for(const pose of ['idle','walk','sit','serve']as const)for(const time of [0,.4,1.3,3.7])for(const rotation of [0,Math.PI/2,Math.PI]){
    animal.group.rotation.y=rotation;animal.update(time,pose);
    const point=new T.Vector3();
    for(let i=0;i<animal.body.geometry.getAttribute('position').count;i++){
     animal.body.getVertexPosition(i,point);point.applyMatrix4(animal.body.matrixWorld);expect(bounds.containsPoint(point)).toBe(true);
    }
   }
   expect(Array.from(animal.body.geometry.getAttribute('position').array)).toEqual(before);
  }finally{animal.dispose();}
 }
 expect(animalResourceSummary()).toEqual({cachedQualityTiers:0,references:0});
},20000);

it('fits the follow bounds at portrait/landscape/orbit angles and follows world coordinates by pure camera translation',()=>{
 for(const aspect of [16/9,9/16,740/360])for(const angle of [-Math.PI/3,0,Math.PI/3]){
  const camera=new T.OrthographicCamera(-1,1,1,-1,.1,150),bounds=selfCameraBounds({x:2,y:3}),target=bounds.getCenter(new T.Vector3()),offset=new T.Vector3(Math.sin(angle)*10,8,Math.cos(angle)*10);
  camera.position.copy(target).add(offset);camera.lookAt(target);fitRoomCamera(camera,bounds,aspect);
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const point=new T.Vector3(x,y,z).project(camera);expect(Math.abs(point.x)).toBeLessThan(1);expect(Math.abs(point.y)).toBeLessThan(1);}
  const before=camera.position.clone().sub(target),next=selfCameraBounds({x:12,y:8}).getCenter(new T.Vector3());translateCameraTarget(camera,target,next);
  expect(camera.position.clone().sub(target).distanceTo(before)).toBeLessThan(1e-10);expect(target.distanceTo(next)).toBeLessThan(1e-10);
  const center=next.clone().project(camera);expect(Math.abs(center.x)).toBeLessThan(1e-10);expect(Math.abs(center.y)).toBeLessThan(1e-10);
 }
 const camera=new T.OrthographicCamera();for(const aspect of [0,-1,Infinity,NaN])expect(()=>fitRoomCamera(camera,selfCameraBounds({x:0,y:0}),aspect)).toThrow();
});
