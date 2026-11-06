import {normalize,furColors} from './catalog.mjs';
const outline='#54483d';
export function animalParts(input){
 const a=normalize(input),[fur,cream]=furColors[a.fur],wide=a.head==='wide'?1.1:1,body=a.body==='slender'?.87:1,back=a.facing==='back',side=a.facing==='right'||a.facing==='left',shift=side?12:0,sit=a.pose==='sit',walk=a.pose==='walk',serve=a.pose==='serve';
 const tail={curved:`<path d="M72 167C22 179 21 123 43 127C59 131 31 148 58 150" fill="none" stroke="${fur}" stroke-width="17"/>`,plume:`<path d="M70 165Q12 185 28 124Q63 129 70 165" fill="${fur}"/>`,wag:`<path d="M71 170Q20 158 34 143" fill="none" stroke="${fur}" stroke-width="18"/>`,curl:`<path d="M70 164C35 158 29 132 45 128S68 148 50 150" fill="none" stroke="${fur}" stroke-width="16"/>`,puff:`<circle cx="68" cy="165" r="16" fill="${cream}"/>`,bob:`<ellipse cx="68" cy="168" rx="12" ry="10" fill="${cream}"/>`}[a.tail];
 const ear={pointed:`<path d="M61 73L60 24L90 49M111 49L144 24L141 76"/>`,tufted:`<path d="M58 74L53 19L72 28L88 48M112 48L135 23L150 19L143 76"/>`,floppy:`<ellipse cx="57" cy="76" rx="19" ry="36" transform="rotate(20 57 76)"/><ellipse cx="145" cy="76" rx="19" ry="36" transform="rotate(-20 145 76)"/>`,upright:`<path d="M60 74L66 18L92 52M109 52L137 18L143 76"/>`,long:`<ellipse cx="74" cy="37" rx="14" ry="40" transform="rotate(-10 74 37)"/><ellipse cx="125" cy="37" rx="14" ry="40" transform="rotate(10 125 37)"/>`,bent:`<path d="M61 65Q53 1 76 0Q99 4 81 58M112 61Q109 8 133 11Q158 11 152 39L131 34L138 65"/>`}[a.ears];
 const clothes=a.outfit==='knit'?'#496b59':a.outfit==='overalls'?'#bd785a':'#d4c1a0';
 const lower=sit?188:209;
 return `<g stroke="${outline}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
 <ellipse cx="100" cy="${lower+7}" rx="48" ry="10" fill="#354739" opacity=".15" stroke="none"/>
 <g data-part="tail">${tail}</g>
 <g data-part="body" transform="translate(100 0) scale(${body} 1) translate(-100 0)">
 <g data-part="feet" fill="${fur}"><ellipse cx="${walk?66:78}" cy="${lower}" rx="18" ry="10"/><ellipse cx="${walk?131:123}" cy="${lower-(walk?8:0)}" rx="18" ry="10"/></g>
 <path d="M73 126Q100 111 128 126L137 ${sit?176:190}Q102 ${sit?203:214} 63 ${sit?176:190}Z" fill="${clothes}"/>
 <g data-part="outfit">${a.outfit==='overalls'?'<path d="M78 124L82 163H117L123 124" fill="#e9c9a0"/><rect x="86" y="156" width="29" height="24" rx="4" fill="#a6644f"/>':a.outfit==='apron'?'<path d="M83 126L116 126L125 194L76 194Z" fill="#f4e5cc"/><path d="M87 161H112V179H87Z" fill="#e5d1ae"/>':'<path d="M76 144Q100 153 125 144M75 153Q101 162 127 153" fill="none" stroke="#688471"/>'}</g>
 <g data-part="hands" fill="${fur}"><path d="M70 132Q49 142 55 ${serve?126:166}Q62 ${serve?116:178} 74 ${serve?137:159}"/><path d="M127 131Q151 136 147 ${serve?119:165}Q139 ${serve?113:179} 126 ${serve?138:160}"/></g>
 ${serve?'<g data-part="tray"><path d="M135 125H177" stroke-width="5"/><path d="M148 106H164V123H148Z" fill="#f6e9ce"/><path d="M164 109Q174 108 171 117H164" fill="none"/></g>':''}</g>
 <g data-part="head" transform="translate(100 0) scale(${wide} 1) translate(-100 0)">
 <g data-part="ears" fill="${fur}">${ear}</g>
 ${a.species==='rabbit'?'<path d="M74 15V45M125 15V45" stroke="#d8aa96" stroke-width="7"/>':''}
 <ellipse cx="100" cy="88" rx="49" ry="43" fill="${fur}"/>
 <path d="M62 101Q100 145 138 101Q134 131 100 132Q68 131 62 101" fill="${cream}" stroke="none"/>
 <g data-part="marking">${a.marking==='patch'?'<path d="M65 62Q80 47 94 58L88 94L59 90Z" fill="#715e4e" opacity=".55" stroke="none"/>':a.marking==='freckles'?'<path d="M68 101H69M77 105H78M124 105H125M133 101H134" stroke="#80624b" stroke-width="3"/>':''}</g>
 ${!back?`<g data-part="eyes" fill="#393d33"><ellipse cx="${80+shift}" cy="88" rx="${side?3:4}" ry="${a.eyes==='calm'?3:7}"/><ellipse cx="${119+shift}" cy="88" rx="4" ry="${a.eyes==='calm'?3:7}"/>${a.eyes==='bright'?`<circle cx="${81+shift}" cy="85" r="1.7" fill="#fff8e4" stroke="none"/><circle cx="${120+shift}" cy="85" r="1.7" fill="#fff8e4" stroke="none"/>`:''}</g><g data-part="muzzle" transform="translate(${shift} 0)"><ellipse cx="100" cy="108" rx="${a.muzzle==='soft'?23:16}" ry="14" fill="${cream}" stroke="none"/><path d="M95 102Q100 99 105 102L100 107Z" fill="#6e5148"/><path d="M100 107V112M93 113Q100 119 107 113" fill="none"/></g><path d="M67 101L73 103M127 103L133 101" stroke="#c78570" stroke-width="4" opacity=".6"/>`:''}
 <g data-part="hair">${a.hair==='tuft'?`<path d="M85 52L95 36L102 45L116 38L110 55" fill="${fur}"/>`:''}</g>
 <g data-part="accessory">${a.accessory==='scarf'?'<path d="M72 125Q100 136 129 125L127 137Q102 150 73 136Z" fill="#ce9971"/><path d="M115 136L131 161L117 166L106 140" fill="#ce9971"/>':a.accessory==='cap'?'<path d="M65 67Q68 29 101 30Q133 31 138 66Z" fill="#3e6658"/><path d="M61 64Q101 54 140 64L139 75Q101 67 62 75Z" fill="#77917c"/>':a.accessory==='glasses'&&!back?`<g fill="none" stroke-width="3"><rect x="${66+shift}" y="77" width="26" height="23" rx="8"/><rect x="${106+shift}" y="77" width="26" height="23" rx="8"/><path d="M${92+shift} 85H${106+shift}"/></g>`:''}</g></g></g>`;
}
export function avatarSvg(input){const a=normalize(input);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 200 240" role="img" aria-label="${a.species}, ${a.facing}, ${a.pose} design preview"><g${a.facing==='left'?' transform="translate(200 0) scale(-1 1)"':''}>${animalParts(a)}</g></svg>`;}
function plant(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="12" rx="30" ry="9" fill="#5d5e43" opacity=".13"/><path d="M-19-5H19L14 20H-14Z" fill="#bf8668"/><path d="M0-4V-59" stroke="#59735b" stroke-width="5"/><g fill="#718d61"><ellipse cx="-14" cy="-24" rx="17" ry="9" transform="rotate(30 -14 -24)"/><ellipse cx="14" cy="-40" rx="17" ry="9" transform="rotate(-30 14 -40)"/><ellipse cy="-58" rx="11" ry="18"/></g></g>`;}
function table(x,y){return `<g transform="translate(${x} ${y})"><ellipse cy="42" rx="115" ry="32" fill="#54483d" opacity=".12"/><path d="M-67 10L-75 80M65 10L73 80" stroke="#816044" stroke-width="14"/><path d="M-98-27H98V8Q0 56-98 8Z" fill="#b88757"/><ellipse cy="-26" rx="98" ry="40" fill="#e0b77f" stroke="#c39460" stroke-width="3"/><path d="M-72-35Q0-58 75-33" fill="none" stroke="#eccb99" stroke-width="2"/><path d="M-33-41L0-47L30-32L-2-26Z" fill="#f8edce"/><path d="M0-47V-28" stroke="#bd9b79"/><ellipse cx="44" cy="-22" rx="11" ry="5" fill="#dfd5af"/><rect x="37" y="-37" width="14" height="14" rx="3" fill="#f4f0dd"/></g>`;}
export function sceneSvg(input,world='deadline'){
 const warm=world==='maid';const other={...input,species:'rabbit',fur:'cloud',ears:'long',tail:'puff',outfit:'overalls',accessory:'none',pose:'sit'};
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="Original animal ${warm?'cafe':'reading room'} concept, illustrated guests and tables are simulated">
 <defs><linearGradient id="wall" x2="0" y2="1"><stop stop-color="#e6d8b9"/><stop offset="1" stop-color="#f7edd4"/></linearGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="#d3b48a"/><stop offset="1" stop-color="#b78c65"/></linearGradient><linearGradient id="glass" x2="0" y2="1"><stop stop-color="#b8d0b9"/><stop offset="1" stop-color="#f4e6b4"/></linearGradient><radialGradient id="light"><stop stop-color="#fff3c6" stop-opacity=".85"/><stop offset="1" stop-color="#fff3c6" stop-opacity="0"/></radialGradient><pattern id="planks" width="140" height="65" patternUnits="userSpaceOnUse"><path d="M0 65H140M70 0V65" stroke="#846649" stroke-opacity=".13" fill="none"/></pattern></defs>
 <rect width="1280" height="720" fill="#e9dfc7"/><path d="M0 0H1280V310L640 400L0 310Z" fill="url(#wall)"/><path d="M0 310L640 370L1280 310V720H0Z" fill="url(#floor)"/><path d="M0 310L640 370L1280 310V720H0Z" fill="url(#planks)"/>
 <path d="M0 304L640 364L1280 304" stroke="#947959" stroke-width="20" fill="none"/>
 <path d="M210 268L405 264L730 720H430Z" fill="#fff1b8" opacity=".15"/>
 <g stroke="#8d7859" stroke-width="12" fill="url(#glass)"><path d="M164 268V109Q164 39 240 39Q316 39 316 109V268Z"/><path d="M350 268V109Q350 39 426 39Q502 39 502 109V268Z"/></g>
 <g fill="#8aa88a" opacity=".7"><ellipse cx="220" cy="219" rx="35" ry="69"/><ellipse cx="397" cy="220" rx="40" ry="91"/></g>
 <g stroke="#f4e5c6" stroke-width="7"><path d="M240 45V267M166 153H315M426 45V268M351 153H503"/></g>
 <path d="M143 276H518" stroke="#a08056" stroke-width="15"/>
 <g transform="translate(775 102)"><rect x="-20" y="-15" width="290" height="220" rx="5" fill="#987650"/><path d="M-8 0H256V203H-8Z" fill="#c7ac7e"/><g fill="#faf0d3"><path d="M0 58H246V67H0ZM0 126H246V136H0Z"/></g><g stroke-width="13"><path d="M13 8V56M28 20V56M48 11V56M66 18V56M84 10V56M105 24V56" stroke="#6d876d"/><path d="M135 15V55M155 22V55M173 10V55M195 18V55M217 25V55" stroke="#b67e64"/><path d="M16 84V126M36 81V126M55 90V126M74 83V126M95 92V126M116 80V126" stroke="#8a9782"/></g><g fill="#d8b278"><rect x="149" y="85" width="68" height="37" rx="5"/><rect x="15" y="155" width="90" height="42" rx="5"/></g></g>
 <ellipse cx="671" cy="115" rx="180" ry="180" fill="url(#light)"/><path d="M670 0V72" stroke="#877156" stroke-width="4"/><path d="M628 108Q670 37 713 108Z" fill="${warm?'#be8861':'#819378'}"/><ellipse cx="670" cy="108" rx="43" ry="9" fill="#f9e6ae"/>
 ${plant(1080,342,1.3)}${plant(118,326,1.1)}
 <path d="M442 458Q640 408 860 458L942 627Q634 699 355 617Z" fill="${warm?'#a7755f':'#718977'}" opacity=".75"/><path d="M454 473Q640 427 845 473L918 615Q636 675 379 608Z" fill="none" stroke="#c9b996" stroke-width="3"/>
 <g transform="translate(834 408) scale(.55)">${animalParts(other)}</g>${table(812,444)}
 <g transform="translate(347 436) scale(.6)">${animalParts({...input,pose:'sit'})}</g>${table(343,482)}
 <g transform="translate(581 335) scale(.86)">${animalParts(input)}</g>
 ${plant(1025,601,1.1)}
 <g transform="translate(96 485)"><path d="M0 0L130 15V123L0 104Z" fill="#8c6f50"/><path d="M0 0L22-20L154-4L130 15Z" fill="#c9aa7a"/><path d="M130 15L154-4V102L130 123Z" fill="#745e46"/><path d="M26 28L104 37V91L26 82Z" fill="#b5966d"/></g>
 <g transform="translate(1088 527)"><ellipse cy="8" rx="78" ry="19" fill="#54483d" opacity=".12"/><path d="M-50-11H50V35H-50Z" fill="#98734f"/><ellipse cy="-11" rx="50" ry="20" fill="#d9b985"/>${plant(0,-17,.55)}</g>
 <path d="M0 719H1280" stroke="#a1805b" stroke-width="4"/>
 </svg>`;
}
