/**
 * Pixel animation master: 18 authored poses × 6 frames × 6 companions.
 * Limbs, eyes, beaks, necks, tails, fruit leaves and body silhouettes are drawn
 * separately on the integer pixel grid. No whole-sprite transform or CSS tween
 * is baked into a frame. Every emitted symbol is a complete standalone drawing.
 *
 * The neutral proportions intentionally follow pet-art.mjs: notably 栗栗 keeps
 * its coarse 20×22 grid, uneven eyes, slab-shaped head and overconfident stance.
 * Pingu and Skipper are project-drawn fan depictions; underlying character rights
 * remain with their respective owners, as documented for the static art.
 */
import {PETS} from './pet-catalog.mjs';
import {drawPinguFrame} from './pet-art.mjs';
import {PET_ACTIONS,PET_CLIPS,ACTION_LABELS} from './pet-animation.mjs';

// Pose keys: b=body compression, h=head drop, x=eye/head direction,
// l/r=left/right limb gesture, f=alternating feet, t=tail/leaf beat,
// e=eyes, m=mouth, p=prop phase. Different species interpret each limb gesture.
const pose=(overrides={})=>({b:0,h:0,x:0,l:0,r:0,f:0,t:0,e:'open',m:0,p:0,...overrides});
const POSES={
  idle:[{}, {b:1,t:1}, {b:1,e:'half',t:2}, {e:'closed',t:1}, {e:'half',t:-1}, {t:-1}],
  look:[{}, {x:1,h:1,t:1}, {x:2,l:1,t:2}, {x:0,e:'half',t:1}, {x:-1,r:1,t:-2}, {x:0,h:-1,t:-1}],
  walk:[{f:-1,l:1,r:-1,t:-1}, {f:-1,b:1,r:1,t:0}, {f:0,h:-1,l:-1,r:1,t:1}, {f:1,r:1,l:-1,t:2}, {f:1,b:1,l:1,t:1}, {f:0,h:-1,l:1,r:-1,t:-1}],
  pat:[{h:-1,x:1}, {h:1,b:1,e:'half',t:1}, {h:2,b:2,e:'closed',l:1,r:1,t:2}, {h:1,b:1,e:'smile',t:-1}, {h:-1,e:'smile',r:2,t:1}, {h:0,e:'half',t:2}],
  eat:[{x:1,p:1,l:3,r:3}, {h:2,b:1,p:2,l:3,r:3,m:1}, {h:1,p:3,l:3,r:3,m:2,e:'half'}, {h:2,b:1,p:4,l:3,r:3,m:1}, {h:0,b:2,p:5,m:2,e:'smile'}, {b:1,e:'half',r:1,t:2}],
  play:[{h:1,b:1,x:1,p:1,t:1}, {h:2,b:2,l:3,r:1,p:2,t:2}, {h:-1,l:2,r:2,f:-1,p:3,e:'wide',t:-1}, {h:0,l:1,r:3,f:1,p:4,t:-2}, {h:1,b:2,e:'half',p:5,t:1}, {h:-1,l:1,e:'smile',p:6,t:2}],
  sleep:[{b:2,h:4,e:'closed',t:-1,p:1}, {b:3,h:4,e:'closed',t:0,p:2}, {b:3,h:5,e:'closed',t:1,p:3}, {b:2,h:5,e:'closed',t:0,p:4}, {b:1,h:4,e:'closed',t:-1,p:5}, {b:2,h:4,e:'closed',t:-2,p:6}],
  wake:[{b:2,h:4,e:'closed',t:-1}, {b:1,h:2,e:'half',m:1}, {h:-1,l:2,r:2,e:'closed',m:2,t:2}, {h:-1,l:2,r:2,e:'wide',t:-1}, {h:1,l:1,r:1,e:'half',t:1}, {h:0,e:'open',t:-1}],
  celebrate:[{b:1,e:'smile',l:1,r:1,p:1}, {h:-1,l:2,r:2,f:-1,e:'smile',m:1,p:2,t:1}, {b:1,l:1,r:2,f:1,m:1,e:'wide',p:3,t:2}, {h:-1,l:2,r:1,f:-1,e:'smile',m:2,p:4,t:-1}, {h:0,l:2,r:2,e:'smile',m:1,p:5,t:-2}, {e:'smile',l:1,r:1,p:6,t:1}],
  focus:[{h:1,x:1,l:3,p:1}, {h:2,x:1,e:'half',l:3,p:2}, {h:1,x:0,l:3,r:3,p:3}, {h:1,e:'closed',l:3,p:4}, {h:0,x:-1,r:3,p:5,t:1}, {h:1,x:1,l:3,p:6,t:-1}],
  sad:[{h:1,b:1,e:'half',t:-2}, {h:2,b:2,x:-1,t:-1}, {h:2,b:2,e:'closed',t:0}, {h:3,b:2,e:'half',x:1,t:1}, {h:2,b:1,e:'half',r:3,t:0}, {h:1,e:'half',t:-1}],
  greet:[{h:0,x:1,r:1}, {h:-1,r:2,t:1}, {h:0,r:1,l:1,e:'smile',t:2}, {h:-1,r:2,m:1,t:-1}, {h:0,r:1,e:'smile',t:-2}, {h:0,r:0,x:0,t:1}],
  water:[{x:1,r:3,p:1}, {h:1,l:3,r:3,p:2}, {h:2,b:1,r:3,e:'half',p:3}, {h:1,b:1,r:3,m:1,p:4}, {h:0,l:1,r:3,e:'smile',p:5}, {h:-1,r:1,p:6,t:1}],
  harvest:[{h:1,x:1,l:3,r:3,p:1}, {h:2,b:2,l:3,r:3,p:2}, {h:1,b:1,l:3,r:3,p:3}, {h:-1,l:3,r:3,e:'wide',p:4}, {h:0,l:3,r:3,e:'smile',p:5,t:1}, {h:0,l:3,r:3,p:6,t:-1}],
  gift:[{h:1,l:3,r:3,p:1}, {h:0,x:1,l:3,r:3,p:2}, {h:-1,x:1,l:3,r:1,p:3,e:'smile'}, {h:0,x:1,l:1,r:3,p:4,m:1}, {h:1,l:3,r:3,p:5}, {h:0,l:1,r:1,p:6,e:'smile',t:1}],
  build:[{h:1,x:1,l:3,r:3,p:1}, {h:-1,x:1,l:3,r:2,p:2}, {h:2,b:1,l:3,r:3,p:3}, {h:-1,l:3,r:2,p:4}, {h:2,b:1,r:3,p:5,e:'half'}, {h:0,r:1,p:6,e:'smile',t:1}],
  ponder:[{h:0,x:1,r:3,p:1}, {h:1,x:1,r:3,p:2,e:'half'}, {h:0,x:-1,r:3,p:3}, {h:-1,x:-1,r:3,p:4,e:'wide'}, {h:0,x:0,r:3,p:5,e:'closed'}, {h:-1,x:1,r:1,p:6,e:'smile',t:1}],
  signature:[{h:0,x:1,r:1,p:1}, {h:1,b:1,l:3,r:3,p:2}, {h:-1,l:2,r:2,p:3,m:1}, {h:1,l:2,r:2,p:4,m:1,t:1}, {h:0,l:3,r:3,p:5,e:'smile'}, {h:-1,l:1,r:1,p:6,e:'half',t:-1}],
};

// The painter rejects out-of-frame geometry. These helpers draw native SVG,
// rather than embedding bitmaps or relying on external symbol dependencies.
function painter(width,height){
  const parts=[];
  const rect=(x,y,w,h,color)=>{
    if(w<=0||h<=0)return;
    if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||x+w>width||y+h>height)throw new Error(`Pixel rect outside ${width}×${height}: ${x},${y},${w},${h}`);
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`);
  };
  const poly=(points,color)=>{
    if(points.some(([x,y])=>!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>width||y>height))throw new Error(`Pixel polygon outside ${width}×${height}: ${JSON.stringify(points)}`);
    parts.push(`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="${color}"/>`);
  };
  return {r:rect,p:poly,finish:()=>parts.join('')};
}
const C={ink:'#2A2222',cream:'#FFF6E0',pink:'#E07070',blue:'#7EABC0',gold:'#E6B34B'};
function spark(d,x,y,color=C.gold,size=1){d.r(x+size,y,size,size*3,color);d.r(x,y+size,size*3,size,color)}
function eye(d,x,y,style,color=C.ink,size=2,dir=0){
  if(style==='closed'||style==='half'){d.r(x,y+(style==='half'?1:2),size+1,1,color);return}
  if(style==='smile'){d.r(x,y+1,1,1,color);d.r(x+1,y,size-1,1,color);d.r(x+size,y+1,1,1,color);return}
  d.r(x+dir,y,size,style==='wide'?size+1:size,color);
  if(size>1)d.r(x+dir,y,1,1,'#FFFFFF');
}

// Props have their own preparation, action and settling poses. Each species
// supplies a native-grid anchor, so nothing is stretched or raster-resampled.
function gardenProps(d,q,action,{x,y,u=1,bubbleX,bubbleY=1}){
  const phase=Math.max(1,q.p),R=(a,b,w,h,c)=>d.r(x+a*u,y+b*u,w*u,h*u,c);
  if(action==='water'){
    const tip=phase===3||phase===4,up=phase===2?-1:0;
    R(0,up,5,5,'#386C73');R(1,1+up,3,3,'#75ADB0');R(1,up,3,1,'#B5D9C9');
    R(-1,1+up,1,3,'#386C73');R(0,1+up,1,1,'#75ADB0');
    if(tip){R(5,3,2,1,'#386C73');R(6,4,2,1,'#386C73');R(7,4,2,1,'#85BAB6')}
    else{R(5,2+up,1,1,'#386C73');R(6,1+up,1,2,'#386C73');R(6,up,2,1,'#85BAB6')}
    if(phase>=3&&phase<=5){R(8,5+phase%2,1,1,'#6EAEC3');R(9,7,1,1,'#A9D8D5');if(phase===4)R(7,7,1,1,'#6EAEC3')}
    R(6,9,4,1,'#AC7850');R(7,8,2,1,'#66543B');R(8,6,1,2,'#6B964F');if(phase>3)R(7,6,1,1,'#A1BC73');
  }
  if(action==='harvest'){
    const lift=[2,2,1,0,0,1][phase-1];
    R(0,3+lift,10,1,'#765137');R(1,4+lift,8,3,'#AC7444');R(2,5+lift,6,1,'#D3A568');R(3,4+lift,1,3,'#825639');R(6,4+lift,1,3,'#825639');
    R(2,1+lift,3,3,'#ECAD76');R(3,lift,1,2,'#88AB59');R(2,lift,1,1,'#A1C175');R(4,lift,1,1,'#668B4D');
    R(6,2+lift,3,2,'#D86966');R(7,1+lift,1,1,'#75A254');R(7,2+lift,1,1,'#FFC199');
    if(phase===4||phase===5)spark(d,x+10*u,y-2*u,phase===4?C.gold:'#A5BF78',u);
  }
  if(action==='gift'){
    const dx=[0,1,2,2,1,0][phase-1],dy=[1,0,-1,-1,0,1][phase-1];
    R(dx,1+dy,7,5,'#97613E');R(1+dx,2+dy,5,4,'#D9B47A');R(3+dx,1+dy,1,5,'#BD5960');
    R(dx,dy,7,2,'#E8C88F');R(3+dx,dy,1,2,'#CD6C6D');R(1+dx,-1+dy,2,1,'#BD5960');R(4+dx,-1+dy,2,1,'#BD5960');
    if(phase===3||phase===4)spark(d,x+(9+dx)*u,y+(phase===3?-2:0)*u,C.gold,u);
  }
  if(action==='build'){
    R(0,6,10,2,'#A7784E');R(1,6,8,1,'#D1A56C');R(2,4,7,2,'#9E6C46');R(3,4,5,1,'#D7B17A');
    const high=phase===2||phase===4,hy=high?-2:2;
    R(5,hy,1,5,'#86533B');R(3,hy-1,5,2,'#46616C');R(3,hy-1,4,1,'#9DB1B1');R(6,hy,2,1,'#354B54');
    if(phase===3||phase===5){R(1,2,1,1,'#E1B962');R(9,2,1,1,'#E1B962');R(7,1,1,1,'#F6D48B')}
    if(phase===6)R(1,3,8,1,'#D1A56C');
  }
  if(action==='ponder'){
    const bx=bubbleX,by=bubbleY;
    if(phase<3){d.r(bx,by+5,1,1,'#BC9A60');if(phase===2)d.r(bx+2,by+3,1,1,'#BC9A60')}
    else if(phase<6){d.r(bx+1,by,3,1,'#BC9A60');d.r(bx+4,by+1,1,2,'#BC9A60');d.r(bx+2,by+3,2,1,'#BC9A60');d.r(bx+2,by+4,1,1,'#BC9A60');d.r(bx+2,by+6,1,1,'#BC9A60')}
    else{spark(d,bx+1,by+1,'#E4B955');d.r(bx+2,by+5,1,1,'#A28350')}
  }
}

function cat(q,action){
  const d=painter(20,22),fur='#F0A03A',dark='#E8862E',belly=C.cream;
  const drop=Math.min(2,Math.max(-1,q.h)), crouch=Math.min(2,q.b),hx=q.x>1?1:q.x<0?-1:0;
  const tailY=action==='sleep'?17:10+Math.max(-2,q.t);
  d.r(17,tailY,2,action==='sleep'?4:6,dark);if(q.t>0)d.r(16,tailY,2,2,dark);
  // Keep the mismatched little ears and the original rectangular head.
  d.r(3+hx,2+drop,3,3,dark);d.r(12+hx,3+drop,3,2,dark);
  d.r(4+hx,3+drop,1,2,'#F8C8A0');d.r(13+hx,4+drop,1,1,'#F8C8A0');
  d.r(2+hx,4+drop,14,9,fur);
  d.r(6+hx,4+drop,2,2,dark);d.r(10+hx,4+drop,2,2,dark);
  d.r(1,13+crouch,16,7-crouch,fur);d.r(5,15+crouch,8,5-crouch,belly);
  // Uncoordinated feet deliberately travel a different distance.
  d.r(3+q.f,20,3,2,dark);d.r(12-q.f,20+(q.f>0?1:0),3,q.f>0?1:2,dark);
  if(q.l===2){d.r(0,10,3,5,fur);d.r(0,9,2,2,dark)}else if(q.l===3){d.r(2,14,5,2,dark)}else d.r(2,13+crouch,1,3-crouch,dark);
  if(q.r===2){d.r(15,9,3,6,fur);d.r(16,8,2,2,dark)}else if(q.r===3){d.r(11,14,5,2,dark)}else if(q.r===1)d.r(15,12,3,3,dark);else d.r(15,14+crouch,1,3-crouch,dark);
  if(q.e==='open'||q.e==='wide'){
    d.r(4+hx,7+drop,2,3,C.ink);d.r(12+hx,8+drop,2,2,C.ink);
    d.r(4+hx+(q.x>0?1:0),7+drop,1,1,'#FFF');d.r(13+hx-(q.x<0?1:0),8+drop,1,1,'#FFF');
  }else{eye(d,4+hx,7+drop,q.e,C.ink,1);eye(d,12+hx,8+drop,q.e,C.ink,1)}
  d.r(8+hx,10+drop,2,1,C.pink);
  // Still serious even when pleased; the crooked mouth never becomes a grin.
  d.r(8+hx,12+drop,3,q.m===1?2:1,'#B05030');
  if(q.m===2)d.r(10+hx,12+drop,1,1,C.pink);
  if(action==='eat'&&q.p&&q.p<5){d.r(7,15,6,2,'#9A6345');d.r(8,14,4-(q.p>2?2:0),1,'#DCC197')}
  if(action==='play'){const bx=[2,5,12,16,11,5][q.p-1]||2;d.r(bx,18,3,3,'#7F9C71');d.r(bx+1,18,1,3,'#CFD99C')}
  if(action==='focus'){d.r(3,17,12,3,'#AD7953');d.r(4,16,5,3,'#FFF4D3');d.r(10,16,4,3,'#E8D5A8');d.r(10+q.p%2,17,2,1,'#AA875D')}
  if(action==='celebrate'&&q.p>1&&q.p<6)spark(d,17,q.p%2, C.gold);
  if(action==='sleep'){const z=q.p%3;d.r(15,1+z,3,1,C.blue);d.r(16,2+z,1,1,C.blue);d.r(15,3+z,3,1,C.blue)}
  gardenProps(d,q,action,{x:action==='water'?9:action==='gift'?5:3,y:action==='water'?12:action==='gift'?14:13,bubbleX:14,bubbleY:0});
  if(action==='signature'){
    const rim=[16,15,13,13,14,16][q.p-1];
    d.r(1,rim,16,1,'#795138');d.r(2,rim+1,14,21-rim,'#C5945B');d.r(3,rim+2,12,1,'#DBB27C');d.r(8,rim+1,2,21-rim,'#B17B46');
    d.p([[1,rim],[0,rim-2],[6,rim-2],[8,rim],[8,rim+1],[2,rim+1]],'#E0B780');
    d.p([[10,rim],[12,rim-2],[18,rim-2],[17,rim+1],[10,rim+1]],'#D4A46C');
    if(q.p===3||q.p===4){d.r(3,rim,3,2,fur);d.r(12,rim,3,2,fur)}
  }
  return d.finish();
}

function libao(q,action){
  const d=painter(52,56),o='#6E1F35',red='#ED4C67',hi='#F585A0',shade='#C93A55',h=q.h,b=q.b;
  const top=8+Math.max(0,Math.min(3,h)),bottom=44;
  // Fruit leaf and twig have their own anticipation/settle beat.
  d.p([[18+q.t,top-4],[20+q.t,top-8],[24+q.t,top-8],[24+q.t,top-6],[28+q.t,top-6],[28+q.t,top-2],[34,top-2],[34,top]],o);
  d.r(20+q.t,top-6,4,2,red);d.r(20,top-2,12,2,hi);
  // The waving left sprout is part of 荔宝's familiar silhouette.
  const armY=q.l===2?6:q.l===3?26:14+Math.max(0,q.l)*2;
  d.p([[10,armY+8],[4,armY+8],[4,armY+4],[0,armY+4],[0,armY],[6,armY],[6,armY+4],[10,armY+4],[12,armY+6]],o);
  d.r(2,armY+1,3,3,red);d.r(6,armY+5,4,2,red);
  const ry=q.r===2?7:q.r===3?26:23;
  d.p([[40,ry],[46,ry],[46,ry-3],[50,ry-3],[50,ry+4],[46,ry+4],[46,ry+8],[40,ry+8]],o);
  d.r(42,ry+2,4,4,red);d.r(46,ry-1,2,4,red);
  // Squash changes the outline and belly width, not a group transform.
  d.p([[16,top],[38,top],[38,top+2],[42,top+2],[42,top+8],[44,top+8],[44,34+b],[42,34+b],[42,38+b],[38,38+b],[38,42],[34,42],[34,bottom],[16,bottom],[16,42],[12,42],[12,38],[10,38],[10,34],[8,34],[8,top+10],[10,top+10],[10,top+4],[16,top+4]],o);
  d.p([[16,top+2],[38,top+2],[38,top+4],[40,top+4],[40,top+10],[42,top+10],[42,34],[40,34],[40,38],[36,38],[36,40],[16,40],[16,38],[12,38],[12,34],[10,34],[10,top+12],[12,top+12],[12,top+6],[16,top+6]],red);
  d.r(12,top+5,4,4,hi);d.r(16,top+2,12,2,hi);d.r(36,32,4,6,shade);d.r(18,40,18,2,shade);
  const ly=44+(q.f<0?2:0),ryFoot=44+(q.f>0?2:0);
  d.r(16+q.f*2,ly,10,54-ly,o);d.r(18+q.f*2,ly,6,52-ly,'#31407A');d.r(14+q.f*2,52,12,4,o);
  d.r(28-q.f*2,ryFoot,10,54-ryFoot,o);d.r(30-q.f*2,ryFoot,6,52-ryFoot,'#31407A');d.r(28-q.f*2,52,12,4,o);
  const ey=16+Math.min(4,h),dx=q.x>0?2:q.x<0?-2:0;
  eye(d,18+dx,ey,q.e,'#4A1A28',3);eye(d,32+dx,ey,q.e,'#4A1A28',3);
  d.r(14,ey+6,4,2,'#F78DA7');d.r(36,ey+6,4,2,'#F78DA7');
  d.r(23,ey+9,9,q.m?5:2,'#4A1A28');if(q.m)d.r(25,ey+10,5,2,C.cream);
  if(action==='eat'&&q.p<5){d.r(18,31,18,4,'#9A6345');d.r(22,28,10-(q.p>2?4:0),4,'#F4CE6A')}
  if(action==='play'){const bx=[5,12,32,42,27,14][q.p-1]||5;d.r(bx,44,6,6,'#7C9E73');d.r(bx+2,44,2,6,'#C9DCA4')}
  if(action==='focus'){d.r(13,33,28,7,'#A77853');d.r(15,31,12,7,'#FFF3D6');d.r(28,31,11,7,'#E7D6B5');d.r(30,33+q.p%2,6,1,'#A58E6B')}
  if(action==='celebrate'&&q.p>1&&q.p<6){spark(d,42,q.p%3*2,C.gold,2);spark(d,4,3+(q.p%2)*3,'#9DBE77')}
  if(action==='sleep'){const z=q.p%3;d.r(42,2+z,8,2,C.blue);d.r(46,4+z,2,2,C.blue);d.r(44,6+z,2,2,C.blue);d.r(42,8+z,8,2,C.blue)}
  gardenProps(d,q,action,{x:action==='water'?30:action==='gift'?16:15,y:action==='water'?30:action==='gift'?32:32,u:2,bubbleX:43,bubbleY:0});
  if(action==='signature'){
    const sy=[23,15,2,3,13,24][q.p-1];
    d.r(39,sy+7,3,12,'#795136');d.r(28,sy,22,10,'#785137');d.r(30,sy+2,18,6,'#FFF0BC');
    // A tiny sunny emblem can be read at desktop-pet size without text.
    d.r(37,sy+3,4,4,'#E9B44A');d.r(34,sy+4,2,2,'#E9B44A');d.r(42,sy+4,2,2,'#E9B44A');
    if(q.p===3||q.p===4){spark(d,4,3+q.p%2,C.gold,2);d.r(42,sy+10,4,3,red)}
  }
  return d.finish();
}

function penguin(q,action){
  const commander=true;
  const d=painter(32,40),o=commander?'#202B34':'#202A30',shine=commander?'#3E4C55':'#39454B',white=commander?'#FFFFF0':'#FFF9E9';
  const h=Math.min(5,q.h),b=Math.min(3,q.b),headTop=(commander?2:3)+Math.max(-1,h),faceY=(commander?10:11)+h;
  // Feet rock in opposite directions; the small penguin waddles much wider.
  const stride=q.f*(commander?1:2),foot=commander?'#EFAE46':'#E75B36',footDark=commander?'#AE642C':'#9D382C';
  d.r(4+stride,35,10,3,footDark);d.r(5+stride,35,8,2,foot);d.r(19-stride,35,10,3,footDark);d.r(20-stride,35,8,2,foot);
  if(q.f){d.r(q.f<0?4+stride:20-stride,34,5,2,foot)}
  function wing(side,gesture){
    if(gesture===2){
      if(commander&&side===1){d.p([[24,23],[29,20],[29,11],[25,8],[21,8],[21,11],[26,12],[25,18],[22,19]],o);d.r(23,9,3,1,shine)}
      else if(side<0){d.p([[8,22],[5,20],[3,16],[1,16],[1,9],[3,9],[3,13],[6,16],[9,18]],o);d.r(3,14,2,4,shine)}
      else{d.p([[23,22],[27,20],[29,16],[31,16],[31,9],[29,9],[29,13],[26,16],[23,18]],o);d.r(27,14,2,4,shine)}
    }else if(gesture===1){
      if(side<0){d.p([[9,20],[4,18],[1,20],[1,23],[5,23],[8,26]],o);d.r(2,20,4,1,shine)}
      else{d.p([[23,20],[28,18],[31,20],[31,23],[27,23],[24,26]],o);d.r(27,20,3,1,shine)}
    }else if(gesture!==3){d.r(side<0?3:26,20,3,11,o);d.r(side<0?4:26,21,1,7,shine)}
  }
  wing(-1,q.l);wing(1,q.r);
  // Head and belly merge differently: pear-shaped Pingu vs upright Skipper.
  if(commander){
    d.p([[12,headTop],[20,headTop],[20,headTop+2],[23,headTop+2],[23,headTop+5],[25,headTop+5],[25,24+b],[27,24+b],[27,33],[24,33],[24,36],[9,36],[9,34],[6,34],[6,26+b],[8,26+b],[8,headTop+5],[10,headTop+5],[10,headTop+2],[12,headTop+2]],o);
    d.r(11,headTop+2,8,1,shine);d.r(9,headTop+5,2,8,shine);
    d.p([[11,faceY-2],[15,faceY-2],[15,faceY],[18,faceY],[18,faceY-2],[22,faceY-2],[22,faceY+5],[23,faceY+5],[23,25],[24,25],[24,31],[21,31],[21,34],[11,34],[11,32],[9,32],[9,24],[10,24],[10,faceY+3],[11,faceY+3]],white);
    d.r(21,25,3,6,'#D2E1DF');d.r(11,32,10,2,'#D2E1DF');d.r(12,24,3,7,'#FFFFFF');
  }
  if(q.l===3){d.p([[6,25],[9,25],[9,27],[15,27],[15,30],[9,30],[9,29],[6,29]],o);d.r(9,27,4,1,shine)}
  if(q.r===3){d.p([[24,25],[27,25],[27,29],[23,29],[23,30],[17,30],[17,27],[23,27],[23,25]],o);d.r(19,27,4,1,shine)}
  // His saluting flipper passes in front of the temple, not behind the head.
  if(commander&&q.r===2)wing(1,2);
  const dx=q.x<0?-1:q.x>0?1:0;
  if(commander){
    eye(d,12+dx,faceY+2,q.e,o,2);eye(d,19+dx,faceY+2,q.e,o,2);
    // The commander's straight, low brows stay even during celebrations.
    d.r(10,faceY-1,4,1,o);d.r(13,faceY,3,1,o);d.r(18,faceY,3,1,o);d.r(20,faceY-1,3,1,o);
    const billY=faceY+5;
    d.p([[12,billY],[23,billY],[23,billY+2],[21,billY+2],[21,billY+4],[18,billY+4],[18,billY+6],[16,billY+6],[16,billY+4],[14,billY+4],[14,billY+2],[12,billY+2]],'#AC642C');
    d.r(13,billY,9,2,'#EFAE46');d.r(15,billY+2,5,2,'#EFAE46');d.r(14,billY,6,1,'#FFD778');
    d.r(15,billY+2,6,q.m?2:1,'#965228');
  }
  if(action==='eat'&&q.p<5){d.r(8,29,16,3,'#9A6345');d.r(12,27,9-(q.p>2?4:0),3,'#A8CCD0');d.r(13,28,1,1,o)}
  if(action==='play'){const bx=[3,8,21,25,17,10][q.p-1]||3;d.r(bx,34,4,4,commander?'#7B925B':'#E7BD63');d.r(bx+1,34,1,4,'#FFF4B6')}
  if(action==='focus'){d.r(7,28,19,5,'#98724D');d.r(8,27,8,5,'#FFF3D6');d.r(17,27,8,5,'#E7D6B5');d.r(19,28+q.p%2,4,1,'#AA8D68')}
  if(action==='sleep'){const z=q.p%3;d.r(25,1+z,6,1,C.blue);d.r(29,2+z,1,1,C.blue);d.r(28,3+z,1,1,C.blue);d.r(27,4+z,1,1,C.blue);d.r(25,5+z,6,1,C.blue)}
  if(action==='celebrate'&&q.p>1&&q.p<6){spark(d,1,2+q.p%3,C.gold);spark(d,27,q.p%2,C.gold)}
  gardenProps(d,q,action,{x:action==='water'?20:action==='gift'?11:10,y:action==='water'?27:action==='gift'?27:26,bubbleX:26,bubbleY:0});
  if(action==='signature'){
    const raised=q.p>=2&&q.p<=5,tx=raised?17:15,ty=raised?12+(q.p===4?1:0):25;
    d.r(tx,ty+1,10,4,'#8F673D');d.r(tx+1,ty+1,6,1,'#D2B077');d.r(tx+7,ty,4,6,'#3C535F');d.r(tx+8,ty+1,2,4,'#8BB4C2');
    d.r(tx-1,ty+2,2,2,'#283840');d.r(tx+3,ty+5,4,2,o);
    if(q.p===3||q.p===4)d.r(28,ty+2,1,1,'#E7F4DB');
  }
  return d.finish();
}

function pingu(q,action){
  const d=painter(32,40),o='#17191B';
  if(action==='eat'&&q.p<5){d.r(8,29,16,3,'#9A6345');d.r(12,27,9-(q.p>2?4:0),3,'#A8CCD0');d.r(13,28,1,1,o)}
  if(action==='play'){const bx=[3,8,21,25,17,10][q.p-1]||3;d.r(bx,34,4,4,'#E7BD63');d.r(bx+1,34,1,4,'#FFF4B6')}
  if(action==='focus'){d.r(7,28,19,5,'#98724D');d.r(8,27,8,5,'#FFF3D6');d.r(17,27,8,5,'#E7D6B5');d.r(19,28+q.p%2,4,1,'#AA8D68')}
  if(action==='sleep'){const z=q.p%3;d.r(25,1+z,6,1,C.blue);d.r(29,2+z,1,1,C.blue);d.r(28,3+z,1,1,C.blue);d.r(27,4+z,1,1,C.blue);d.r(25,5+z,6,1,C.blue)}
  if(action==='celebrate'&&q.p>1&&q.p<6){spark(d,1,2+q.p%3,C.gold);spark(d,27,q.p%2,C.gold)}
  if(action==='signature'&&(q.p===3||q.p===4)){d.r(29,9+q.p%2,2,1,C.gold);d.r(28,5,1,2,C.gold);d.r(24,2+q.p%2,1,2,C.gold)}
  gardenProps(d,q,action,{x:action==='water'?20:action==='gift'?11:10,y:action==='water'?27:action==='gift'?27:26,bubbleX:26,bubbleY:0});
  return drawPinguFrame({...q,action})+d.finish();
}

function egret(q,action){
  const d=painter(32,32),o='#3B4B50',white=C.cream,shade='#B8D8D3';
  // Small body stays low; the articulated neck folds for sleep and feeding.
  const fold=action==='signature'?[0,4,8,7,4,0][q.p-1]:action==='sleep'?7:action==='eat'?Math.min(6,q.h*2):Math.max(-1,q.h),hy=3+fold,hx=q.x>0?1:q.x<0?-1:0,bodyY=19+Math.min(2,q.b);
  d.p([[9,bodyY-1],[20,bodyY-1],[20,bodyY],[24,bodyY],[24,bodyY+2],[26,bodyY+2],[26,26],[22,26],[22,28],[8,28],[8,26],[5,26],[5,22],[8,22],[8,bodyY]],o);
  d.r(9,bodyY,13,7-Math.min(2,q.b),white);d.r(7,23,17,3,white);d.r(10,25,12,2,shade);
  d.r(10+q.f,28,2,3,'#93623E');d.r(8+q.f,30,4,1,'#93623E');d.r(19-q.f,28,2,q.f?2:3,'#93623E');d.r(20-q.f,30-(q.f?1:0),4,1,'#93623E');
  d.p([[15+hx,hy],[22+hx,hy],[22+hx,hy+2],[25+hx,hy+2],[25+hx,hy+7],[22+hx,hy+7],[22+hx,hy+10],[20,hy+10],[20,23],[16,23],[16,hy+9],[13+hx,hy+9],[13+hx,hy+2],[15+hx,hy+2]],o);
  d.r(16+hx,hy+1,6,7,white);d.r(15+hx,hy+3,8,4,white);d.r(17,hy+7,2,Math.max(1,15-hy),white);d.r(16+hx,hy+2,3,2,'#FFFFFF');
  const beakY=hy+4;
  d.r(24+hx,beakY,5,2,'#E8862E');d.r(24+hx,beakY,5,1,'#F5C766');if(q.m)d.r(24+hx,beakY+3,3,1,'#E8862E');
  eye(d,20+hx,hy+2,q.e,C.ink,1);
  if(q.l===2||q.r===2){d.p([[13,23],[8,20],[5,17],[3,12],[1,12],[1,20],[4,24],[8,26],[13,26]],o);d.p([[11,23],[7,21],[4,18],[3,16],[3,20],[6,24],[11,25]],white);d.r(5,21,2,3,shade)}
  else if(q.l===3||q.r===3){d.p([[8,22],[12,22],[12,24],[18,24],[18,26],[8,26]],shade)}
  else{const flap=q.l===1||q.r===1?2:0;d.p([[9,22],[12,21-flap],[19,23-flap],[19,25],[13,26],[9,25]],shade);d.r(11,22,5,1,'#FFFFFF')}
  if(action==='eat'&&q.p<5){d.r(23,26,8,2,'#AC8561');d.r(25,25,4-(q.p>2?2:0),1,'#A2C4CB')}
  if(action==='play'){const bx=[2,5,11,24,19,10][q.p-1]||2;d.r(bx,28,3,3,'#97B670');d.r(bx+1,28,1,2,'#D3DCA8')}
  if(action==='focus'){d.r(4,23,13,4,'#AB825A');d.r(5,22,5,4,'#FFF4D6');d.r(11,22,5,4,'#E7D6B5');d.r(12,23+q.p%2,3,1,'#AA8D68')}
  if(action==='sleep'){const z=q.p%3;d.r(25,1+z,5,1,C.blue);d.r(28,2+z,1,1,C.blue);d.r(27,3+z,1,1,C.blue);d.r(25,4+z,5,1,C.blue)}
  if(action==='celebrate'&&q.p>1&&q.p<6)spark(d,2,2+q.p%3,C.gold);
  gardenProps(d,q,action,{x:action==='water'?21:action==='gift'?9:9,y:action==='water'?21:action==='gift'?21:21,bubbleX:2,bubbleY:2});
  if(action==='signature'){
    const lift=[0,2,6,5,2,0][q.p-1];
    d.p([[10,23],[15,22],[19,22-lift],[22,20-lift],[24,20-lift],[24,24],[20,26],[12,27],[9,25]],o);
    d.p([[11,23],[16,23],[20,23-lift],[23,21-lift],[23,24],[19,25],[12,26]],white);
    d.r(13,24,6,1,shade);if(q.p===4){d.r(27,21,2,1,white);d.r(29,23,1,2,shade)}
  }
  return d.finish();
}

function turtle(q,action){
  const d=painter(32,32),o='#3D5C42',skin='#88B876',hi='#B6D594',shell='#678C48';
  const retreat=action==='sleep'?4:Math.max(0,q.h),hx=22-Math.min(4,retreat),hy=17+(q.b>1?1:0);
  d.r(7+q.f,25,5,5,o);d.r(8+q.f,26,3,2,skin);d.r(18-q.f,25,5,5,o);d.r(19-q.f,26,3,2,skin);
  d.r(2,21+q.t%2,5,3,o);d.r(3,22+q.t%2,3,1,skin);
  // Head can slide visibly inside its shell; no whole-frame translation.
  d.p([[hx,hy],[hx+5,hy],[hx+5,hy+2],[hx+7,hy+2],[hx+7,hy+8],[hx+4,hy+8],[hx+4,hy+10],[hx,hy+10],[hx,hy+8],[hx-2,hy+8],[hx-2,hy+3],[hx,hy+3]],o);
  d.r(hx,hy+2,5,6,skin);d.r(hx+1,hy+2,3,2,hi);
  const sy=9+Math.min(2,q.b);
  d.p([[10,sy],[18,sy],[18,sy+2],[22,sy+2],[22,sy+5],[24,sy+5],[24,24],[21,24],[21,27],[8,27],[8,25],[5,25],[5,sy+6],[7,sy+6],[7,sy+2],[10,sy+2]],o);
  d.p([[10,sy+2],[18,sy+2],[18,sy+4],[21,sy+4],[21,sy+7],[22,sy+7],[22,23],[20,23],[20,25],[8,25],[8,23],[7,23],[7,sy+7],[9,sy+7],[9,sy+4],[10,sy+4]],shell);
  d.r(11,sy+2,6,2,'#B6CB73');d.r(9,sy+5,3,2,'#94AF5C');
  d.p([[12,sy+6],[18,sy+6],[18,sy+8],[20,sy+8],[20,23],[17,23],[17,25],[12,25],[12,23],[10,23],[10,sy+8],[12,sy+8]],'#496C40');
  d.r(13,sy+8,5,4,'#86A656');d.r(8,23,3,1,'#94AF5C');
  eye(d,hx+4,hy+3,q.e,C.ink,1);d.r(hx+2,hy+7,3,q.m?2:1,C.ink);
  if(q.r===2){d.r(23,23,3,5,o);d.r(25,20,3,5,o);d.r(24,23,2,3,skin);d.r(26,21,1,3,hi)}
  else if(q.r===3)d.r(23,25,5,2,hi);
  if(q.l===2){d.r(5,21,3,6,o);d.r(4,20,3,3,skin)}else if(q.l===1)d.r(5,26,5,2,skin);
  if(action==='eat'&&q.p<5){d.r(26,27,6,2,'#AE8359');d.r(27,24,3,3,'#91B568');if(q.p<3)d.r(29,23,2,3,'#B6D48B')}
  if(action==='play'){const bx=[2,6,15,25,17,8][q.p-1]||2;d.r(bx,28,3,3,'#D2AD63');d.r(bx+1,28,1,2,'#FFE2A0')}
  if(action==='focus'){d.r(5,23,13,4,'#A77853');d.r(6,22,5,4,'#FFF4D6');d.r(12,22,5,4,'#E7D6B5');d.r(13,23+q.p%2,3,1,'#AA8D68')}
  if(action==='sleep'){const z=q.p%3;d.r(25,5+z,5,1,C.blue);d.r(28,6+z,1,1,C.blue);d.r(27,7+z,1,1,C.blue);d.r(25,8+z,5,1,C.blue)}
  if(action==='celebrate'&&q.p>1&&q.p<6)spark(d,5,3+q.p%3,C.gold);
  gardenProps(d,q,action,{x:action==='water'?21:action==='gift'?10:10,y:action==='water'?21:action==='gift'?21:21,bubbleX:25,bubbleY:0});
  if(action==='signature'){
    const uy=[8,5,2,3,5,8][q.p-1];
    d.r(20,uy+7,1,18-uy,'#54763F');
    d.p([[16,uy],[24,uy],[24,uy+2],[28,uy+2],[28,uy+4],[30,uy+4],[30,uy+6],[27,uy+6],[27,uy+7],[23,uy+7],[23,uy+8],[14,uy+8],[14,uy+7],[11,uy+7],[11,uy+5],[13,uy+5],[13,uy+2],[16,uy+2]],'#4C7543');
    d.r(16,uy+2,8,2,'#98B769');d.r(14,uy+4,13,2,'#7E9E54');d.r(18,uy+2,2,5,'#C1CE83');
    if(q.p===3||q.p===4){d.r(9,8+q.p,1,2,'#86B8C9');d.r(29,uy+8,1,2,'#86B8C9')}
  }
  return d.finish();
}

const DRAW={libao,chestnut:cat,egret,pingu,skipper:penguin,turtle};
export const ANIMATION_FRAMES=Object.freeze(Object.entries(PETS).flatMap(([species,pet])=>PET_ACTIONS.flatMap(action=>POSES[action].map((p,index)=>{
  const draw=DRAW[species];
  if(!draw)throw new Error(`Register animation drawing for ${species}`);
  const art=draw(pose(p),action);
  return Object.freeze({species,action,index,id:PET_CLIPS[species][action].frames[index].id,viewBox:pet.viewBox,art});
}))));
const frameSymbol=f=>`<symbol id="${f.id}" viewBox="${f.viewBox}" shape-rendering="crispEdges">${f.art}</symbol>`;
export const ANIMATION_SYMBOLS=ANIMATION_FRAMES.map(frameSymbol).join('\n');
/** Install one companion's frames at a time when only the active pet animates. */
export function animationSymbols(species){return ANIMATION_FRAMES.filter(f=>f.species===species).map(frameSymbol).join('\n')}

/** Review/export every actual frame; preview sheets are never used as runtime sprites. */
export function animationContactSheet(species){
  const pet=PETS[species];if(!pet)throw new Error('Unknown species');
  const cellW=104,cellH=100,left=94,top=65,width=left+cellW*6+16,height=top+PET_ACTIONS.length*cellH+20;
  const labels=PET_ACTIONS.map((action,row)=>`<text x="16" y="${top+row*cellH+44}" font-size="13" fill="#64462d">${ACTION_LABELS[action]}</text>`).join('');
  const cells=ANIMATION_FRAMES.filter(f=>f.species===species).map(f=>{
    const row=PET_ACTIONS.indexOf(f.action),x=left+f.index*cellW,y=top+row*cellH;
    const [,,w,h]=f.viewBox.split(' ').map(Number),scale=Math.floor(Math.min(78/w,72/h)),rw=w*scale,rh=h*scale;
    return `<rect x="${x}" y="${y}" width="96" height="92" rx="2" fill="${f.index%2?'#eadcc1':'#f3e7cd'}"/><svg x="${x+(96-rw)/2}" y="${y+7+(70-rh)}" width="${rw}" height="${rh}" viewBox="${f.viewBox}">${f.art}</svg><text x="${x+48}" y="${y+87}" text-anchor="middle" font-size="10" fill="#796449">${f.index+1} · ${PET_CLIPS[species][f.action].frames[f.index].duration} ms</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff8e8"/><text x="16" y="28" font-size="20" font-family="sans-serif" fill="#4b3427">${pet.name} · ${PET_ACTIONS.length} 组动作 / ${PET_ACTIONS.length*6} 帧</text><text x="16" y="48" font-size="11" fill="#8d7557">整数像素逐帧 · 各帧独立完整绘制 · 时间按性格调整</text>${labels}${cells}</svg>`;
}
