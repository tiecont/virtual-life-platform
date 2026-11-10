import { cityPlots } from '../domain/city-plots';
// Original code-authored orthogonal pixel town. No third-party raster/media.
export default function PixelCityArt(){
 return <svg className="city-art" viewBox="0 0 48 30" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
  <rect width="48" height="30" fill="#cbd9b5"/>
  {Array.from({length:120},(_,i)=><rect key={'grass'+i} x={(i*7)%48} y={Math.floor(i/16)*4+(i%3)} width="1" height="1" fill={i%2?'#bccda6':'#d7e2c4'}/>)}
  <path d="M0 9h48v3H0zM0 19h48v3H0zM23 0h3v30h-3z" fill="#e6d9ba"/>
  <path d="M0 10h48v1H0zM0 20h48v1H0zM24 0h1v30h-1z" fill="#d3c2a2"/>
  <rect y="28" width="48" height="2" fill="#85bac0"/><path d="M2 29h5v1H2zM13 28h7v1h-7zM30 29h8v1h-8zM41 28h5v1h-5z" fill="#afd3cb"/>
  {cityPlots.map(({x,y},i)=><g key={'house'+i}>
   <rect x={x-3} y={y-2} width="7" height="6" fill="#b4c49c"/>
   <rect x={x-3} y={y-2} width="6" height="5" fill={['#f0e4c6','#d7dfd3','#e7c9b4'][i%3]}/>
   <rect x={x-3} y={y-3} width="6" height="2" fill={['#b47660','#577f72','#667c8b'][i%3]}/>
   <rect x={x-2} y={y-4} width="4" height="1" fill={['#c88a6e','#6a9680','#7b93a1'][i%3]}/>
   <rect x={x-2} y={y} width="1" height="1" fill="#607e78"/><rect x={x+1} y={y} width="1" height="1" fill="#607e78"/>
   <rect x={x} y={y+1} width="1" height="2" fill="#746f5d"/><rect x={x-1} y={y+3} width="3" height="1" fill="#e6d9ba"/>
  </g>)}
  {[1,13,34,46].flatMap(x=>[4,15,24].map(y=><g key={x+':'+y}><rect x={x} y={y} width="1" height="3" fill="#887952"/><rect x={x-1} y={y-1} width="3" height="2" fill="#4d7c64"/><rect x={x} y={y-2} width="1" height="1" fill="#639675"/></g>))}
  <rect x="23" y="14" width="3" height="3" fill="#f3e9ce"/><rect x="24" y="15" width="1" height="1" fill="#85bac0"/>
 </svg>;
}
