import { Container,Graphics,Text } from 'pixi.js';
import type { SceneManifest } from '@virtual-city/contracts';
// Original deterministic Cafe Sakura art;no external raster,font or media.
export function maidInterior(scene:SceneManifest){
 const root=new Container(),g=new Graphics(),size=scene.tileSize;root.addChild(g);
 const rect=(x:number,y:number,w:number,h:number,color:string)=>g.rect(x,y,w,h).fill(color);
 for(let y=0;y<scene.rows;y++)for(let x=0;x<scene.columns;x++)rect(x*size,y*size,size,size,(x+y)%2?'#f1e9dc':'#faf4e9');
 for(const zone of scene.collisionZones){const x=zone.x*size,y=zone.y*size,w=zone.width*size,h=zone.height*size;
  if(zone.kind==='wall'){rect(x,y,w,h,'#52675e');rect(x+3,y+3,w-6,h-6,'#718678');}
  else if(zone.kind==='table'){rect(x+4,y+7,w-8,h-8,'#ad8a6c');rect(x+7,y+4,w-14,h-14,'#d8b998');rect(x+12,y+10,w-24,h-26,'#f5dfd8');for(const dx of [30,w-30]){g.circle(x+dx,y+h/2,8).fill('#fbfaf1');g.circle(x+dx,y+h/2,4).fill('#a58166');}g.circle(x+w/2,y+h/2,6).fill('#bc7d91');}
  else if(zone.kind==='counter'){rect(x,y,w,h,'#a27c62');rect(x+3,y+3,w-6,h-9,'#d8bca0');rect(x+14,y+7,46,22,'#445b52');rect(x+21,y+10,20,12,'#9eb8ae');for(let i=0;i<6;i++)g.circle(x+100+i*32,y+16,5).fill('#f8eee0');}
  else{rect(x+8,y+20,24,20,'#bc8e83');rect(x+17,y+3,7,22,'#8d7660');for(const [dx,dy,r]of [[12,8,12],[27,8,13],[19,0,12]])g.circle(x+dx,y+dy,r).fill('#d6a6b1');}
 }
 for(const x of [2,18]){rect(x*size,18,4*size,42,'#b1c5b5');rect(x*size+5,23,4*size-10,30,'#dce7dd');rect((x+2)*size-2,18,5,42,'#f5eee2');}
 function label(text:string,x:number,y:number,color='#43594f',fontSize=12){const item=new Text({text,style:{fontFamily:'system-ui, sans-serif',fontSize,fontWeight:'600',fill:color}});item.anchor.set(.5);item.position.set(x,y);root.addChild(item);}
 label('CAFE SAKURA',12*size,42,'#fbf0de',17);label('WINDOW TABLES',6*size,15.5*size);label('GARDEN TABLES',17*size,15.5*size);label('CITY ENTRANCE',12*size,17.4*size,'#52675e',10);
 return root;
}
