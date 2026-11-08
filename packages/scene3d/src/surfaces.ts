import * as T from 'three';

export const TORSO_PROFILE:ReadonlyArray<readonly[number,number]>=[[.075,.45],[.145,.49],[.18,.57],[.175,.7],[.15,.81],[.10,.9],[.075,.94]];

// Original deterministic surface recipes. No downloaded textures or URLs.
export function createFurAtlas(){
 const width=128,height=256,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/(width-1),v=y/(height-1),center=.5+.025*Math.sin(v*5),span=.44*Math.pow(1-v,.55)+.008;
  const envelope=Math.pow(T.MathUtils.clamp(1-Math.abs(u-center)/span,0,1),.7),phase=(u*7+.12*Math.sin(v*4)+v*.05)%1,strandWidth=.32*(1-v*.7),fibers=1-T.MathUtils.smoothstep(Math.abs(phase-.5),strandWidth*.5,strandWidth);
  const at=(y*width+x)*4,albedo=Math.round(230-12*v);
  data[at]=data[at+1]=data[at+2]=albedo;data[at+3]=Math.round(255*envelope*fibers*T.MathUtils.smoothstep(1-v,0,.14));
 }
 const texture=new T.DataTexture(data,width,height,T.RGBAFormat);texture.name='Original tapered seven-strand groom v2.1';texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}

export function createClothWeave(){
 const size=64,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const warp=Math.sin(x*Math.PI/4),weft=Math.sin(y*Math.PI/4),normal=new T.Vector3(warp*.14*(.7+.3*Math.cos(y*Math.PI/4)),weft*.14,1).normalize(),at=(y*size+x)*4;
  data[at]=Math.round((normal.x*.5+.5)*255);data[at+1]=Math.round((normal.y*.5+.5)*255);data[at+2]=Math.round((normal.z*.5+.5)*255);data[at+3]=255;
 }
 const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.name='Original cotton warp and weft v2';texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(6,6);texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.needsUpdate=true;return texture;
}

export function createTailoredApron(quality:'low'|'balanced'|'high'){
 const geometry=new T.PlaneGeometry(.27,.32,quality==='high'?6:4,quality==='low'?4:quality==='balanced'?6:8);
 geometry.userData.apronRest=new Float32Array(geometry.getAttribute('position').array);poseTailoredApron(geometry,false);return geometry;
}

export function poseTailoredApron(geometry:T.BufferGeometry,seated:boolean){
 const positions=geometry.getAttribute('position'),rest=geometry.userData.apronRest as Float32Array;
 for(let vertex=0;vertex<positions.count;vertex++){
  const restY=rest[vertex*3+1],t=(restY+.16)/.32,y=seated?restY*.75+.04:restY,x=rest[vertex*3]*T.MathUtils.lerp(1.04,.72,t),worldY=.655+y;
  const next=TORSO_PROFILE.findIndex(([,height])=>height>=worldY),upper=Math.max(1,next<0?TORSO_PROFILE.length-1:next),[r0,y0]=TORSO_PROFILE[upper-1],[r1,y1]=TORSO_PROFILE[upper],radius=T.MathUtils.lerp(r0,r1,T.MathUtils.clamp((worldY-y0)/(y1-y0),0,1));
  const front=radius*.8*Math.sqrt(Math.max(0,1-(x/radius)**2));
  positions.setXYZ(vertex,x,y,front+.028-.15+(1-t)**2*.012+Math.sin(x*48+y*9)*.003*(1-t*.5));
 }
 positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

export function groomFlow(point:T.Vector3,normal:T.Vector3){
 const cheek=point.y>.96&&point.y<1.2&&Math.abs(point.x)>.12&&point.z>.02,chest=point.y>.68&&point.y<.91&&point.z>.1,tail=point.z<-.16;
 const direction=cheek?new T.Vector3(Math.sign(point.x)*.5,-.8,.08):tail?new T.Vector3(0,.6,-.65):new T.Vector3(0,-1,0);
 direction.addScaledVector(normal,-direction.dot(normal));if(direction.lengthSq()<.01)direction.set(0,0,1).addScaledVector(normal,-normal.z);direction.normalize();
 const length=point.y>1.23?.009:cheek?.034:chest?.026:point.y>.94?.016:.024;
 return {direction,length};
}
