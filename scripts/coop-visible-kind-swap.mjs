// Inspect only the first batch visible on the committed board. Mixed matches
// are allowed when qualifying an explicitly converted group.
export function pureSwap(board,requiredKind,allowMixed=false){
 const kinds=board.map(tile=>tile.kind);
 function firstBatch(){
  const matched=new Set();
  for(let index=0;index<kinds.length;index++){
   const kind=kinds[index];
   for(const step of [1,8]){
    if(step===1?index%8>=6:index>=48)continue;
    if(kind===kinds[index+step]&&kind===kinds[index+step*2]){
     matched.add(index);matched.add(index+step);matched.add(index+step*2);
    }
   }
  }
  const eligible=[...matched].filter(index=>kinds[index]===requiredKind).length;
  return allowMixed||eligible===matched.size?eligible:0;
 }
 for(let first=0;first<kinds.length;first++){
  for(const second of [first%8<7?first+1:-1,first<56?first+8:-1]){
   if(second<0||kinds[first]===kinds[second])continue;
   [kinds[first],kinds[second]]=[kinds[second],kinds[first]];
   const matched=firstBatch();
   [kinds[first],kinds[second]]=[kinds[second],kinds[first]];
   if(matched>0)return {action:{kind:'swap',first,second},matched};
  }
 }
}
