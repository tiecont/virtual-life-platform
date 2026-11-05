import { Container,Graphics,Text } from 'pixi.js';
import type { SceneManifest } from '@virtual-city/contracts';

// Original deterministic outdoor graphics. Geometry remains in the world manifest;
// this shared renderer imports no world implementation and grants no interaction.
export function parkLandscape(scene:SceneManifest){
 const result=new Container(),paint=new Graphics(),s=scene.tileSize;result.addChild(paint);
 const box=(x:number,y:number,w:number,h:number,color:string)=>paint.rect(x,y,w,h).fill(color);
 for(let y=0;y<scene.rows;y++)for(let x=0;x<scene.columns;x++){
  const path=x===11||x===12||y===10||y===11;
  box(x*s,y*s,s,s,path?((x+y)%2?'#dfcfab':'#e7d8b9'):((x+y)%2?'#b9ce99':'#bfd7a2'));
  if(!path&&(x*3+y*7)%11===0){box(x*s+12,y*s+20,3,8,'#91b37e');box(x*s+17,y*s+24,3,5,'#91b37e');}
 }
 for(const zone of scene.collisionZones){
  const x=zone.x*s,y=zone.y*s,w=zone.width*s,h=zone.height*s;
  if(zone.kind==='wall'){
   box(x,y,w,h,'#5e7952');box(x+4,y+4,Math.max(1,w-8),Math.max(1,h-8),'#79945f');
  }else if(zone.id==='commons-garden'){
   box(x,y,w,h,'#85765b');box(x+7,y+7,w-14,h-14,'#83a36a');
   for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const px=x+23+col*32,py=y+22+row*36;box(px,py+7,3,13,'#4c7854');paint.circle(px+1,py+4,7).fill((col+row)%2?'#d4a36e':'#dcbcc1');paint.circle(px+1,py+4,2).fill('#f2dfac');
   }
  }else if(zone.kind==='planter'){
   const cx=x+w/2,cy=y+h/2;paint.ellipse(cx,cy+h*.23,w*.42,h*.25).fill('#9fb88a');box(cx-7,cy-2,14,h*.4,'#886b4b');
   paint.circle(cx-w*.2,cy-h*.08,w*.29).fill('#638955');paint.circle(cx+w*.2,cy-h*.13,w*.29).fill('#71975d');paint.circle(cx,cy-h*.29,w*.33).fill('#82a869');
  }else if(zone.id.startsWith('bench-')){
   box(x+8,y+15,w-16,27,'#6c5842');box(x+16,y+18,9,30,'#48564b');box(x+w-25,y+18,9,30,'#48564b');
   for(let row=0;row<3;row++)box(x+5,y+7+row*9,w-10,6,row%2?'#bd9160':'#cba776');
  }else if(zone.id==='activity-board'){
   box(x+16,y+20,9,h-18,'#66563e');box(x+w-25,y+20,9,h-18,'#66563e');box(x+7,y+3,w-14,h-20,'#8a6f48');box(x+15,y+11,w-30,h-38,'#e5d6af');
   for(let col=0;col<3;col++){box(x+23+col*33,y+20,26,34,col%2?'#b7caba':'#f6f0db');box(x+27+col*33,y+27,17,3,'#78917d');box(x+27+col*33,y+34,13,3,'#9caf98');}
  }else if(zone.id==='portal-signpost'){
   box(x+w/2-5,y+15,10,h-10,'#78674f');box(x+6,y+6,w-12,28,'#397365');box(x+16,y+38,w-32,25,'#609182');
   for(const at of [y+17,y+47]){box(x+32,at,w-64,4,'#e9eed9');box(x+w-39,at-4,5,12,'#e9eed9');}
  }
 }
 function label(text:string,x:number,y:number,size=14){const t=new Text({text,style:{fontFamily:'system-ui, sans-serif',fontSize:size,fontWeight:'600',fill:'#314e3d'}});t.anchor.set(.5);t.position.set(x*s,y*s);result.addChild(t);}
 label('CENTRAL PARK',12,2,20);label('WEST BENCHES',4,7.1);label('EAST BENCHES',20,7.1);label('ACTIVITY BOARD',4.5,14.6,12);label('CITY PORTALS',19.5,14.6,12);
 return result;
}
