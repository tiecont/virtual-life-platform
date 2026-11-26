// Shared Pet Level progression rule. One authored curve is used by Wave 1
// rewards and cooperative settlement; changing it changes both deliberately.
export function levelIncrement(level:number,exp:number){
 let nextLevel=level;let nextExp=exp;
 while(nextLevel<60){
  const threshold=25+nextLevel*5;
  if(nextExp<threshold)break;
  nextExp-=threshold;nextLevel+=1;
 }
 if(nextLevel===60)nextExp=0;
 return {level:nextLevel,exp:nextExp};
}
