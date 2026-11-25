// Pure field-path comparison between two authored gameplay bundles. The Admin
// workspace only displays this; publication authority stays with the engine.
export function bundleDifferences(left:unknown,right:unknown,path:readonly string[]=[]):string[]{
 if(typeof left!==typeof right||Array.isArray(left)!==Array.isArray(right))return [path.join('.')||'(root)'];
 if(left&&typeof left==='object'&&!Array.isArray(left)){
  const a=left as Record<string,unknown>,b=right as Record<string,unknown>;
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  return [...keys].flatMap(key=>bundleDifferences(a[key],b[key],[...path,key]));
 }
 if(Array.isArray(left)&&Array.isArray(right)){
  if(left.length!==right.length)return [path.join('.')+'.length'];
  return left.flatMap((value,index)=>bundleDifferences(value,right[index],[...path,String(index)]));
 }
 return Object.is(left,right)?[]:[path.join('.')];
}
