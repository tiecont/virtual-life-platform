import * as T from 'three';
import {TILE_METERS} from './room';

// Conservative local envelope for all current animal species,parts and poses,
// including ears/tail/coat. Presentation only;never changes the floor or actor.
export function selfCameraBounds(point:{x:number;y:number}){
 const x=(point.x+.5)*TILE_METERS,z=(point.y+.5)*TILE_METERS;
 return new T.Box3(new T.Vector3(x-.85,-.12,z-.85),new T.Vector3(x+.85,2.1,z+.85));
}
export function fitRoomCamera(camera:T.OrthographicCamera,bounds:T.Box3,aspect:number){
 if(bounds.isEmpty()||!Number.isFinite(aspect)||aspect<=0)throw Error('Room camera bounds unavailable');
 camera.updateMatrixWorld(true);let x=0,y=0;
 for(const a of [bounds.min.x,bounds.max.x])for(const b of [bounds.min.y,bounds.max.y])for(const c of [bounds.min.z,bounds.max.z]){
  const point=new T.Vector3(a,b,c).applyMatrix4(camera.matrixWorldInverse);x=Math.max(x,Math.abs(point.x));y=Math.max(y,Math.abs(point.y));
 }
 const half=Math.max(y,x/aspect)*1.04;
 Object.assign(camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});camera.updateProjectionMatrix();
}
export function translateCameraTarget(camera:T.Camera,target:T.Vector3,next:T.Vector3){
 camera.position.add(next.clone().sub(target));target.copy(next);camera.updateMatrixWorld(true);
}
