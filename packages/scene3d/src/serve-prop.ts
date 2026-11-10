import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original procedural study prop: one opaque draw, no new textures/authority.
// Its contact frame follows both paw supports, independently of world yaw/scale.
export function createServingProp(quality:'low'|'balanced'|'high'){
 const segments=quality==='low'?8:quality==='balanced'?12:20,parts:T.BufferGeometry[]=[];
 function part(geometry:T.BufferGeometry,color:string){const value=new T.Color(color),colors=new Float32Array(geometry.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3)value.toArray(colors,i);geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));parts.push(geometry);}
 part(new T.CylinderGeometry(.30,.295,.025,segments).scale(1,1,.65),'#b78a57');
 const cupX=.025,cupZ=.025,top=.0125,profile=[[0,0],[.043,0],[.05,.006],[.054,.089],[.052,.104],[.043,.104],[.042,.093],[.039,.014],[0,.014]].map(([x,y])=>new T.Vector2(x,y));
 part(new T.LatheGeometry(profile,segments).translate(cupX,top,cupZ),'#eee4d2');
 part(new T.TorusGeometry(.032,.009,quality==='low'?3:4,segments).translate(cupX+.061,top+.055,cupZ),'#eee4d2');
 part(new T.CylinderGeometry(.041,.041,.002,segments).translate(cupX,top+.087,cupZ),'#684632');
 const geometry=mergeGeometries(parts,false);for(const item of parts)item.dispose();if(!geometry)throw Error('Serving prop unavailable');geometry.computeBoundingSphere();
 const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.65}),mesh=new T.Mesh(geometry,material);mesh.name='Serving tray and cup';mesh.visible=false;mesh.castShadow=true;mesh.receiveShadow=true;
 const left=new T.Vector3(),right=new T.Vector3(),x=new T.Vector3(),y=new T.Vector3(),z=new T.Vector3(),up=new T.Vector3(0,1,0),basis=new T.Matrix4();let disposed=false,span=0;
 const triangles=(geometry.index?.count??geometry.getAttribute('position').count)/3;
 function update(visible:boolean,leftPaw:T.Object3D,rightPaw:T.Object3D,root:T.Object3D){
  mesh.visible=visible&&!disposed;if(!mesh.visible)return;root.updateWorldMatrix(true,true);
  root.worldToLocal(leftPaw.getWorldPosition(left)).y+=.06;root.worldToLocal(rightPaw.getWorldPosition(right)).y+=.06;
  x.subVectors(right,left);span=x.length();if(!Number.isFinite(span)||span<1e-6){mesh.visible=false;return;}x.divideScalar(span);z.crossVectors(x,up);if(z.lengthSq()<1e-8){mesh.visible=false;return;}z.normalize();y.crossVectors(z,x).normalize();basis.makeBasis(x,y,z);
  mesh.position.copy(left).add(right).multiplyScalar(.5).addScaledVector(y,top);mesh.quaternion.setFromRotationMatrix(basis);mesh.updateWorldMatrix(true,false);
 }
 return{mesh,triangles,update,diagnostics(){return{visible:mesh.visible,triangles,supportDistance:span};},dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
