import {cropIcon} from './garden-items.mjs';

/** A visual harvest ladder only: 2048 values, scoring and rewards stay unchanged. */
export const TILE_LEVELS=Object.freeze([
 {value:2,name:'种子袋',kind:'seed'},
 {value:4,name:'嫩芽',kind:'sprout'},
 {value:8,name:'小萝卜',kind:'crop'},
 {value:16,name:'草莓',kind:'crop'},
 {value:32,name:'蓝莓',kind:'crop'},
 {value:64,name:'荔枝',kind:'crop'},
 {value:128,name:'萝卜篮',kind:'basket'},
 {value:256,name:'草莓篮',kind:'basket'},
 {value:512,name:'蓝莓篮',kind:'basket'},
 {value:1024,name:'荔枝篮',kind:'basket'},
 {value:2048,name:'荔宝丰收礼',kind:'celebration'},
].map(Object.freeze));

export function tileIdentity(value){
 const level=TILE_LEVELS.find(level=>level.value===value);
 if(level)return {name:level.name,kind:level.kind};
 return value>=4096?{name:'丰收庆典',kind:'celebration'}:{name:'空格',kind:'empty'};
}

const svg=body=>`<svg class="arcade-tile-art" viewBox="0 0 32 32" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;
const use=(id,x,y,width,height=width)=>`<use href="#${id}" x="${x}" y="${y}" width="${width}" height="${height}"></use>`;
// Strip only the shared wrapper so nested sprites cannot inherit .sprite's UI size.
const cropAt=(crop,x,y,size=16)=>`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 16 16">${cropIcon(crop).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`;
const crops={8:'radish',16:'strawberry',32:'blueberry',64:'lychee',128:'radish',256:'strawberry',512:'blueberry',1024:'lychee'};

// Original sack: parchment cloth, a tied neck and a seed emblem on the front.
const seedBag=`<path fill="#61452f" d="M9 3h14v4h-2v3h3v3h2v4h2v10h-2v3H6v-3H4V17h2v-4h2v-3h3V7H9z"/>
<path fill="#d1a062" d="M11 4h10v3h-2v4h4v3h2v4h2v8h-2v2H7v-2H5v-8h2v-4h2v-3h4V7h-2z"/>
<path fill="#f0cd8c" d="M12 4h8v2h-8zM10 13h5v2h-3v9H8v-7h2zM9 26h15v1H9z"/>
<path fill="#96704a" d="M11 8h10v3H11zM22 14h2v3h2v9h-3z"/>
<path fill="#fff0bd" d="M13 15h9v9h-9z"/>
<path fill="#608143" d="M16 17h2v2h2v2h-2v2h-2v-3h-2v-2h2z"/>
<path fill="#b88a51" d="M18 8h5v2h-3v2h-2z"/>`;

const basket=crop=>`<path fill="#6b4a30" d="M9 4h14v2h3v12h-3V7H9v11H6V6h3z"/>
<path fill="#c69453" d="M10 5h12v2H10zM7 7h2v10H7zM23 7h2v10h-2z"/>
${cropAt(crop,1,8)}${cropAt(crop,15,8)}${cropAt(crop,8,5)}
<path fill="#67482f" d="M1 17h30v4h-2v8h-2v2H5v-2H3v-8H1z"/>
<path fill="#c39358" d="M3 18h26v2H3zM5 21h22v7H5zM7 28h18v1H7z"/>
<path fill="#edc282" d="M4 18h24v1H4zM6 21h3v6H6zM12 21h2v7h-2zM18 21h2v7h-2zM24 21h2v6h-2z"/>
<path fill="#9b703f" d="M5 23h22v2H5zM9 21h2v7H9zM15 21h2v7h-2zM21 21h2v7h-2z"/>`;

// The existing Libao happy symbol is 52 x 56; a 26 x 28 use keeps its 2 px art
// on this table's 1 px grid. Ribbons wrap the gift without redrawing the mascot.
const harvestGift=festival=>`${festival?'<path fill="#d69b34" d="M1 3h2v2h2v2H3v2H1V7H0V5h1zM27 1h2v2h2v2h-2v2h-2V5h-2V3h2z"/><path fill="#83a85a" d="M0 13h2v3H0zM30 10h2v3h-2z"/>':''}
${use('libao-happy',3,0,26,28)}
<path fill="#976436" d="M7 23h22v8H7z"/>
<path fill="#e9b965" d="M8 24h20v6H8z"/>
<path fill="#f9d78d" d="M8 24h20v2H8z"/>
<path fill="#a94150" d="M16 23h4v8h-4zM12 20h4v1h4v-1h4v3H12z"/>
<path fill="#ee9a9a" d="M13 21h3v1h-3zM20 21h3v1h-3zM17 24h1v6h-1z"/>`;

export function tileArtwork(value){
 if(value===2)return svg(seedBag);
 if(value===4)return svg(use('i-seed',0,0,32));
 if(value>=8&&value<=64&&crops[value])return svg(cropAt(crops[value],0,0,32));
 if(value>=128&&value<=1024&&crops[value])return svg(basket(crops[value]));
 if(value>=2048)return svg(harvestGift(value>=4096));
 return '';
}
