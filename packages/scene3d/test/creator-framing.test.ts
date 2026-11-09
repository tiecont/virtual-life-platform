import {expect,it} from 'vitest';
import * as T from 'three';
import {starterAvatarParts} from '@virtual-city/contracts';
import {createAnimal,animalResourceSummary} from '../src/animal';
import {creatorFrame} from '../src/creator-framing';

it('frames real skinned body parts across species,LOD,pose and viewport without changing geometry or resource ownership',()=>{
 for(const quality of ['low','balanced','high']as const)for(const species of ['cat','dog','rabbit']as const){
  const animal=createAnimal(quality,'cocoa','casual',starterAvatarParts('cocoa',species));
  try{
   const positions=Array.from(animal.body.geometry.getAttribute('position').array);
   for(const pose of ['idle','walk','sit','serve']as const){
    animal.group.position.set(.2,0,.45);animal.group.rotation.y=Math.PI/3;animal.update(1.75,pose,true);
    for(const aspect of [16/9,9/16]){
     const whole=creatorFrame(animal.body,'character',32,aspect);
     for(const part of ['character','face','outfit','tail']as const){
      const view=creatorFrame(animal.body,part,32,aspect),camera=new T.PerspectiveCamera(32,aspect,.05,30);
      expect(view.distance).toBeGreaterThan(0);expect(view.distance).toBeLessThan(15);
      if(part==='face')expect(view.distance).toBeLessThan(whole.distance);
      camera.position.copy(view.target).addScaledVector(new T.Vector3(1.4,.58,2.55).normalize(),view.distance);camera.lookAt(view.target);camera.updateMatrixWorld(true);
      for(const x of [view.bounds.min.x,view.bounds.max.x])for(const y of [view.bounds.min.y,view.bounds.max.y])for(const z of [view.bounds.min.z,view.bounds.max.z]){
       const point=new T.Vector3(x,y,z).project(camera);
       expect(Math.abs(point.x),part+' horizontal crop').toBeLessThan(1);expect(Math.abs(point.y),part+' vertical crop').toBeLessThan(1);expect(point.z).toBeGreaterThan(-1);expect(point.z).toBeLessThan(1);
      }
     }
    }
   }
   expect(Array.from(animal.body.geometry.getAttribute('position').array)).toEqual(positions);
  }finally{animal.dispose();}
 }
 expect(animalResourceSummary()).toEqual({cachedQualityTiers:0,references:0});
},20000);
