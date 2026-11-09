import * as T from 'three';
import type {AvatarFraming} from '@virtual-city/client-sdk';

// Read the current skinned model, not fixed cat proportions. Long rabbit ears,
// changed bodies and the selected pose must remain inside the inspection view.
export function creatorFrame(body:T.SkinnedMesh,framing:AvatarFraming,fov:number,aspect:number){
 const bounds=new T.Box3(),position=body.geometry.getAttribute('position'),skin=body.geometry.getAttribute('skinIndex'),point=new T.Vector3();
 body.updateWorldMatrix(true,false);
 for(let i=0;i<position.count;i++){
  const bone=skin.getX(i),selected=framing==='character'||framing==='face'&&bone>=5&&bone<=7||framing==='outfit'&&bone>=1&&bone<=13&&!(bone>=5&&bone<=7)||framing==='tail'&&bone>=20;
  if(selected){body.getVertexPosition(i,point);bounds.expandByPoint(point.applyMatrix4(body.matrixWorld));}
 }
 if(bounds.isEmpty())throw Error('Character inspection bounds unavailable');
 const sphere=bounds.getBoundingSphere(new T.Sphere()),vertical=T.MathUtils.degToRad(fov),horizontal=2*Math.atan(Math.tan(vertical/2)*aspect);
 // A padded enclosing sphere fits at every orbit angle and includes coat tips.
 const distance=Math.max(.65,(sphere.radius+.035)*1.12/Math.sin(Math.min(vertical,horizontal)/2));
 return{target:sphere.center,distance,bounds};
}
