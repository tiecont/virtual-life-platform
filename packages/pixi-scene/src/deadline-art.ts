import { Container,Graphics,Text } from 'pixi.js';
import type { SceneManifest } from '@virtual-city/contracts';
// Original code-authored cafe art. No external bitmap,font,audio or source art.
export function deadlineInterior(scene:SceneManifest){
 const root=new Container(),g=new Graphics(),s=scene.tileSize;root.addChild(g);
 for(let y=0;y<scene.rows;y++)for(let x=0;x<scene.columns;x++)g.rect(x*s,y*s,s,s).fill((x+y)%2?'#e5dbc5':'#eee6d4');
 for(const zone of scene.collisionZones){const x=zone.x*s,y=zone.y*s,w=zone.width*s,h=zone.height*s;
  if(zone.kind==='wall'){g.rect(x,y,w,h).fill('#354f45');g.rect(x+4,y+4,Math.max(1,w-8),Math.max(1,h-8)).fill('#486657');}
  else if(zone.kind==='table'){g.roundRect(x+3,y+9,w-6,h-10,5).fill('#aa8b69');g.roundRect(x+2,y+4,w-6,h-10,5).fill('#d1ad7f');g.rect(x+8,y+9,16,11).fill('#41645e');g.rect(x+10,y+11,12,7).fill('#b8d8cf');g.circle(x+w-10,y+24,4).fill('#fff4de');g.circle(x+w-10,y+24,2).fill('#71503c');}
  else if(zone.kind==='counter'){g.rect(x+4,y+8,w-4,h-8).fill('#947554');g.rect(x,y,w,h-8).fill('#bfa078');g.rect(x,y,w,7).fill('#f7e7c9');g.rect(x+12,y+12,36,15).fill('#39544b');for(let offset=74;offset<w-12;offset+=28){g.circle(x+offset,y+18,5).fill('#f2e2bb');g.rect(x+offset+4,y+16,3,5).fill('#f2e2bb');}}
  else if(zone.kind==='planter'){g.roundRect(x+8,y+22,24,16,3).fill('#a5755a');g.circle(x+20,y+16,14).fill('#4e7653');g.circle(x+13,y+12,7).fill('#6f965d');}
 }
 // Decorative windows are inside solid north walls;not walkable openings.
 for(const x of [13,17,21]){g.rect(x*s,12,2*s-12,42).fill('#a1b4a3');g.rect(x*s+4,16,2*s-20,34).fill('#638e8e');g.rect(x*s+4,16,2*s-20,7).fill('#bbd4bd');g.rect(x*s+s-8,16,4,34).fill('#d7d5ba');}
 const sign=new Text({text:'DEADLINE CAFE',style:{fontFamily:'system-ui,sans-serif',fontSize:18,fontWeight:'600',fill:'#f5e7c8'}});sign.anchor.set(.5);sign.position.set(6*s,s);root.addChild(sign);
 const entrance=new Text({text:'CITY ENTRANCE',style:{fontFamily:'system-ui,sans-serif',fontSize:10,fill:'#3f5d4d'}});entrance.anchor.set(.5);entrance.position.set(12.5*s,15.5*s);root.addChild(entrance);
 return root;
}
