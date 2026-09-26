import { cel, flat } from './vendor/sakura/core/toon.mjs';

// Original campus miniatures. Geometry is authored here; Sakura Crossing supplies
// the cel-lighting material and the host's depth-ink / colour pipeline.
export function buildCampusScene(THREE, scene, skin = 'lake') {
  const root = new THREE.Group();
  root.name = `campus-${skin}`;
  scene.add(root);
  const batches = new Map(), materials = new Map(), geometries = new Map();
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let serial = 0;
  const geometry = (key, create) => {
    if (!geometries.has(key)) geometries.set(key, create());
    return geometries.get(key);
  };
  const material = (color, options = {}) => {
    const key = `${color}|${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, options.unlit
      ? flat({color, cache:false, ...options})
      : cel({color, tint:0x8a84a4, bands:3, cache:false, ...options}));
    return materials.get(key);
  };
  const put = (geo, color, p, scale = [1,1,1], rotation = [0,0,0], options = {}) => {
    const mat = material(color, options.material || {});
    const cast = options.cast !== false, receive = options.receive !== false;
    const key = `${geo.uuid}|${mat.uuid}|${cast}|${receive}`;
    if (!batches.has(key)) batches.set(key,{geo,mat,cast,receive,matrices:[]});
    quaternion.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(new THREE.Vector3(...p),quaternion,new THREE.Vector3(...scale));
    batches.get(key).matrices.push(matrix.clone());
  };
  const box = (c,x,y,z,w,h,d,ry=0,o={}) => put(geometry('box',()=>new THREE.BoxGeometry(1,1,1)),c,[x,y,z],[w,h,d],[0,ry,0],o);
  const ball = (c,x,y,z,sx,sy=sx,sz=sx,o={}) => put(geometry('blob',()=>new THREE.IcosahedronGeometry(1,1)),c,[x,y,z],[sx,sy,sz],[0,0,0],o);
  const cylinder = (c,x,y,z,r,h,rb=r,o={}) => put(geometry(`cyl-${rb/r}`,()=>new THREE.CylinderGeometry(1,rb/r,1,12)),c,[x,y,z],[r,h,r],[0,0,0],o);
  const rod = (c,a,b,r=.06,o={}) => {
    const start=new THREE.Vector3(...a), end=new THREE.Vector3(...b), diff=end.clone().sub(start);
    const geo=geometry('rod',()=>new THREE.CylinderGeometry(1,1,1,7));
    const mat=material(c,o.material||{}),key=`${geo.uuid}|${mat.uuid}|true|true`;
    if(!batches.has(key)) batches.set(key,{geo,mat,cast:true,receive:true,matrices:[]});
    batches.get(key).matrices.push(new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(up,diff.clone().normalize()),new THREE.Vector3(r,diff.length(),r)));
  };
  const torus = (c,x,y,z,r,t,rotation=[0,0,0],o={}) => put(geometry(`ring-${r}-${t}`,()=>new THREE.TorusGeometry(r,t,6,24)),c,[x,y,z],[1,1,1],rotation,o);
  const polygon = (c,points,y,o={}) => {
    const shape = new THREE.Shape();
    points.forEach(([x,z],i)=>i ? shape.lineTo(x,-z) : shape.moveTo(x,-z));
    shape.closePath();
    put(geometry(`polygon-${serial++}`,()=>new THREE.ShapeGeometry(shape)),c,[0,y,0],[1,1,1],[-Math.PI/2,0,0],o);
  };
  const curveRibbon = (c,points,width,y) => {
    const path=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,y,z)));
    const positions=[], normals=[], indices=[];
    for(let i=0;i<=72;i++){
      const p=path.getPoint(i/72), t=path.getTangent(i/72),side=new THREE.Vector3(-t.z,0,t.x).multiplyScalar(width/2);
      positions.push(p.x+side.x,p.y,p.z+side.z,p.x-side.x,p.y,p.z-side.z);
      normals.push(0,1,0,0,1,0);
      if(i<72){let n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setIndex(indices);
    put(geo,c,[0,0,0]);return path;
  };
  const tree=(x,z,s=1,seed=1)=>{
    const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    cylinder(0x90755b,x,1.7*s,z,.17*s,3.4*s,.23*s);
    const tones=[0x71ad87,0x93c28f,0x4f927a];
    for(let n=0;n<4;n++){
      const angle=n*1.57+.2,ex=x+Math.cos(angle)*.9*s,ez=z+Math.sin(angle)*.9*s;
      rod(0x90755b,[x,2.6*s,z],[ex,3.8*s,ez],.1*s);
    }
    for(let n=0;n<30;n++){
      const angle=rand()*Math.PI*2,r=Math.sqrt(rand())*1.65*s;
      const px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r,py=(3.6+rand()*.95)*s;
      const sz=(.6+rand()*.5)*s;
      ball(tones[n%3],px,py,pz,sz,sz*.78,sz,{receive:false,material:{bands:'soft',tint:0x9aaaac}});
    }
  };
  const palm=(x,z,s=1)=>{
    const top=[x+.35*s,5.2*s,z];
    rod(0xa38b6e,[x,0,z],top,.15*s);
    for(let i=0;i<9;i++){
      const a=i*Math.PI*2/9;const pts=[];
      for(let j=0;j<=6;j++){
        const t=j/6,rr=t*2.65*s;pts.push(new THREE.Vector3(top[0]+Math.cos(a)*rr,top[1]+Math.sin(t*Math.PI)*.45*s-t*.85*s,top[2]+Math.sin(a)*rr));
      }
      const positions=[],indices=[];
      for(let j=0;j<pts.length;j++){
        const w=Math.sin(j/6*Math.PI)*.3*s;
        positions.push(pts[j].x-Math.sin(a)*w,pts[j].y,pts[j].z+Math.cos(a)*w,pts[j].x+Math.sin(a)*w,pts[j].y,pts[j].z-Math.cos(a)*w);
        if(j<6){let n=j*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
      put(geo,i%2?0x528d70:0x79ad77,[0,0,0],[1,1,1],[0,0,0],{receive:false,material:{side:THREE.DoubleSide,bands:'soft'}});
    }
    ball(0x698354,...top,.3*s,.28*s,.3*s);
  };
  const bench=(x,z,ry=0,y=0)=>{
    const pos=(lx,ly,lz)=>[x+Math.cos(ry)*lx+Math.sin(ry)*lz,y+ly,z-Math.sin(ry)*lx+Math.cos(ry)*lz];
    for(let i=0;i<4;i++) box(0xc69764,...pos(0,.72,-.3+i*.2),2.4,.11,.15,ry);
    for(let i=0;i<3;i++) box(0xc69764,...pos(0,1.1+i*.2,-.42),2.4,.13,.12,ry);
    for(const a of [-.9,.9]){
      rod(0x546365,pos(a,0,-.3),pos(a,1.65,-.44),.065);
      rod(0x546365,pos(a,0,.34),pos(a,.72,.26),.065);
    }
  };
  const bike=(x,z,ry=-.2,y=0)=>{
    const pos=(lx,ly,lz=0)=>[x+Math.cos(ry)*lx+Math.sin(ry)*lz,y+ly,z-Math.sin(ry)*lx+Math.cos(ry)*lz];
    for(const a of [-.65,.65]){
      torus(0x495661,...pos(a,.46),.43,.045,[0,ry,0]);
      torus(0xcbd6d5,...pos(a,.46),.35,.018,[0,ry,0]);
      for(let i=0;i<4;i++)rod(0xb8cecc,pos(a-Math.cos(i*.78)*.36,.46-Math.sin(i*.78)*.36),pos(a+Math.cos(i*.78)*.36,.46+Math.sin(i*.78)*.36),.012);
    }
    const joints=[[-.65,.46],[-.25,1.06],[0,.48],[.47,1.09],[.65,.46]];
    for(const [a,b] of [[0,1],[1,2],[2,0],[1,3],[2,3],[3,4]])rod(0xd67c66,pos(...joints[a]),pos(...joints[b]),.042);
    rod(0x687572,pos(-.25,1.06),pos(-.3,1.22),.035);box(0x536a65,...pos(-.31,1.24),.33,.09,.2,ry);
    rod(0x647c75,pos(.47,1.09),pos(.4,1.39),.035);rod(0x647c75,pos(.4,1.39,-.22),pos(.4,1.39,.22),.035);
    rod(0x8b9890,pos(-.03,.5),pos(-.1,.08,.3),.028);
  };
  const pot=(x,y,z,s=.5,flower=false)=>{
    cylinder(0xb47c65,x,y+s*.45,z,s*.55,s*.9,s*.42);
    cylinder(0xd29d79,x,y+s*.9,z,s*.6,.1*s);
    cylinder(0x655e57,x,y+s*.96,z,s*.48,.02);
    for(let i=0;i<5;i++){const a=i*1.27;ball(flower&&i%2?0xe0a3ae:0x79a68a,x+Math.cos(a)*s*.3,y+s*(1.35+(i%2)*.15),z+Math.sin(a)*s*.3,s*.4,s*.38,s*.4,{receive:false});}
  };
  const lamp=(x,z,y=0,night=false)=>{
    cylinder(0x627273,x,y+1.7,z,.05,3.4);
    box(0x627273,x,y+3.42,z,.6,.13,.56);
    box(night?0xffd794:0xf5ecc9,x,y+3.16,z,.38,.38,.38,0,{material:night?{unlit:true}:{}});
    box(0x627273,x,y+2.94,z,.51,.07,.48);
  };
  const bag=(x,y,z)=>{
    box(0xdcab65,x,y+.3,z,.45,.59,.28,-.14);
    box(0xe7bd7e,x,y+.18,z+.17,.32,.22,.1,-.14);
    torus(0x795f54,x,y+.62,z,.12,.025);
  };
  const building=(x,z,w,h,d)=>{
    box(0xe7e6d9,x,h/2,z,w,h,d);
    box(0xd4b39b,x,h+.08,z,w+.3,.19,d+.35);
    box(0xc7816e,x+w*.35,h/2,z,w*.25,h+.4,d+.1);
    for(let level=0;level<3;level++){
      const yy=.9+level*1.55;
      box(0x80a6ac,x-w*.1,yy,z+d/2+.03,w*.7,.93,.08);
      box(0xe8e8da,x-w*.1,yy-.54,z+d/2+.28,w*.72,.15,.5);
      for(let j=0;j<7;j++)box(0xf1ead9,x-w*.43+j*w*.107,yy,z+d/2+.13,.14,1.05,.27);
      for(let j=0;j<3;j++)box(0x8cabb0,x+w/2+.03,yy,z-d*.31+j*d*.3,.08,.85,d*.2);
    }
    for(let j=0;j<3;j++)box(0x92acaa,x+w*.35,.9+j*1.55,z+d/2+.08,w*.13,.74,.08);
  };
  const animations=[];
  const hanging=(x,y,z,{night=false}={})=>{
    const pivot=new THREE.Group();pivot.position.set(x,y,z);root.add(pivot);
    const cord=new THREE.Mesh(geometry('hanging-cord',()=>new THREE.CylinderGeometry(.017,.017,.33,5)),material(0x647674));cord.position.y=-.165;pivot.add(cord);
    const cap=new THREE.Mesh(geometry('hanging-cap',()=>new THREE.CylinderGeometry(.11,.19,.21,12)),material(night?0xb5a683:0x91aaa0));cap.position.y=-.41;pivot.add(cap);
    const body=new THREE.Mesh(geometry('hanging-body',()=>new THREE.SphereGeometry(.12,12,8)),material(night?0xffdca4:0xd8d9be,night?{unlit:true}:{}));body.position.y=-.5;body.scale.set(1,1.35,1);pivot.add(body);
    if(!night){const tag=new THREE.Mesh(geometry('hanging-tag',()=>new THREE.BoxGeometry(.08,.23,.012)),material(0xd1b993));tag.position.y=-.75;pivot.add(tag);}
    animations.push(time=>{pivot.rotation.z=Math.sin(time*.8)*.055;pivot.rotation.x=Math.sin(time*.53)*.025;});
  };

  // Distant crowns are quiet painted silhouettes: small overlapping smooth
  // lobes, no lighting facets, shadow casting or shadow reception.
  const distantTrees=(colors,x0,z0,count,spacing=5.7)=>{
    const geo=geometry('distant-crown',()=>new THREE.SphereGeometry(1,9,6));
    for(let i=0;i<count;i++){
      const x=x0+i*spacing,z=z0-(i%3)*2.1,base=2.1+(i%4)*.36;
      for(let k=0;k<7;k++){
        const angle=k*2.399,spread=k?1.45:0;
        const px=x+Math.cos(angle)*spread,pz=z+Math.sin(angle)*spread*.66;
        const y=base+(k%3)*.67,sz=1.24+(k%3)*.2;
        put(geo,colors[(i+k)%colors.length],[px,y,pz],[sz,sz*.95,sz*.82],[0,0,0],{cast:false,receive:false,material:{unlit:true}});
      }
    }
  };

  const lake=()=>{
    box(0x99bd91,0,-.24,0,400,.4,400 );
    distantTrees([0xa8c9b9,0xafcdbc,0xb5d1c2],-36,-28,14);
    const shore=new THREE.CatmullRomCurve3([[-14,-12],[-10,-7],[-6,-3],[-2,.5],[0,4],[1.6,10],[2,25]].map(([x,z])=>new THREE.Vector3(x,0,z)));
    const boundary=Array.from({length:73},(_,i)=>{const p=shore.getPoint(i/72);return[p.x,p.z]});
    polygon(0x62b6bc,[[-50,-35],[-14,-35],...boundary,[-50,35]],.006,{cast:false,receive:true,material:{bands:'soft',tint:0x96b4cd}});
    curveRibbon(0xc8d5b1,[[-12,-12],[-8.1,-7],[-4.2,-3],[0,.5],[1.9,4],[3.5,10],[3.9,25]],2.05,.035);
    curveRibbon(0xe4d6b8,[[-12,-12],[-8.1,-7],[-4.2,-3],[0,.5],[1.9,4],[3.5,10],[3.9,25]],1.8,.045);
    for(let i=0;i<27;i++){
      const x=-14+(i%7)*1.48,z=-4+Math.floor(i/7)*3.1+(i%3)*.5;
      box(i%2?0xa4d8d3:0x8ec9c8,x,.022,z,.55+(i%4)*.25,.013,.035,0,{cast:false,receive:false,material:{unlit:true}});
    }
    building(-3,-10,12,4.9,4.6);
    building(8,-14,6.4,5,3.8);
    // Shaded entrance and a raised portico give the main block a campus scale.
    box(0x6b8d92,-5,1,-7.62,2.7,2,.08);
    box(0xe6decc,-5,2.5,-6.95,3.3,.23,1.7);
    for(const x of [-6.35,-3.65])box(0xe6decc,x,1.25,-6.32,.2,2.5,.2);
    box(0xd7d4bf,-5,.12,-6.45,3.65,.24,2.2);
    tree(-10.7,-12,1.2,39);tree(10,-8,1.1,5);tree(14,-6,1.1,99);
    tree(15,3,1.3,73);tree(18,9,1.1,20);
    palm(7,-1,1);palm(-8,-10,.82);
    bench(5.2,5.3,-.25);bag(5.7,.79,5.42);bike(4.75,3.8,-.45);
    lamp(3.2,1.3);lamp(-.4,-2.5);
    for(let i=0;i<7;i++)ball(i%2?0x70a583:0x7eb38b,7.8+i*.72,.48,7.6+Math.sin(i)*.2,.64,.65,.6,{receive:false});
    pot(6.8,.02,4.7,.56,true);
    // Quiet waterfowl made of geometry, not a sticker or title card.
    for(const [x,z,s] of [[-5.1,4.2,1],[-6,4.6,.78]]){
      ball(0xf5efda,x,.16,z,.25*s,.18*s,.41*s);ball(0xf8f2dc,x+.05,.38,z-.23,.16*s,.17*s,.16*s);
      box(0xd8aa6f,x+.05,.35,z-.42,.12,.065,.15);
      torus(0x99d1cb,x,.03,z,.52*s,.012,[Math.PI/2,0,0],{cast:false,receive:false,material:{unlit:true}});
    }
    for(let i=0;i<3;i++){
      const ripple=new THREE.Mesh(geometry('water-ripple',()=>new THREE.TorusGeometry(.42,.012,4,36)),material(0xc2e3dd,{unlit:true,transparent:true,opacity:.55,depthWrite:false}));
      ripple.rotation.x=-Math.PI/2;ripple.position.set(-5.25-i*1.55,.04,5.4+i*.55);root.add(ripple);
      animations.push(time=>{const phase=Math.sin(time*.85+i*1.7);ripple.scale.set(1+phase*.15,.65+phase*.08,1);});
    }
    return {camera:{position:[18,10.7,23],target:[-.9,1.65,-2],fov:39},lighting:{fog:0xc4dcd1,fogNear:38,fogFar:100,skyTop:0x79b6cc,skyMid:0xa7d1d8,skyHaze:0xc9dedb,sun:0xffecd2,fill:0xafd9e4,hemiSky:0xe5eff0,hemiGround:0x85aa92,sunIntensity:2.05,fillIntensity:.9,hemiIntensity:1.08}};
  };
  const bookshelf=(x,y,z,w=2.2,h=2.2)=>{
    box(0x665e5c,x,y+h/2,z-.18,w,h,.1);
    for(const dx of [-w/2,w/2])box(0x94735c,x+dx,y+h/2,z,.1,h,.58);
    const covers=[0x7f9c9a,0xcb8d7e,0xd7ba87,0xa7b58a,0x8a93aa];
    for(let level=0;level<4;level++){
      const yy=y+level*h/4;
      box(0xba9771,x,yy+.055,z+.04,w,.11,.61);
      for(let i=0;i<8;i++){
        const bh=.28+(i%3)*.07;
        box(covers[(i+level)%covers.length],x-w*.41+i*w*.116,yy+.11+bh/2,z+.1,.12+(i%2)*.055,bh,.29);
      }
    }
    box(0xc5a279,x,y+h,z,w+.15,.12,.67);
  };
  const bookshop=()=>{
    box(0xadbab4,0,-.23,0,400,.4,400);
    box(0x99aeb0,0,-.008,13,80,.02,15);
    box(0xc2c7bd,0,.1,1,30,.22,9);
    for(let i=0;i<14;i++)for(let j=0;j<6;j++){
      const x=-13+i*1.8,z=-2.5+j*1.28;
      box((i+j)%4?0xc3c9bf:0xb4c2bc,x,.217,z,1.74,.016,1.21,0,{cast:false});
    }
    // The open frontage is a 1.4 m deep recess, with real shelves behind it.
    box(0xc6cabb,0,1.68,-4.2,9.4,3.2,4.7);
    box(0x6c8381,0,1.57,-1.8,8.4,2.9,.09);
    for(const x of [-4.45,4.45])box(0xe4ddd0,x,1.68,-.87,.5,3.2,2.0);
    box(0xd3d0bc,0,.31,-.7,9.4,.2,2.7);
    box(0xe9e2cc,0,3.16,-.7,9.4,.28,2.7);
    bookshelf(-2.55,.39,-.73,2.65,2.28);
    bookshelf(2.78,.39,-.95,2.22,2.28);
    box(0x546f6c,.25,1.69,-1.55,1.8,2.65,.09);
    box(0xe2d7b8,.24,2.92,-1.3,2,.12,.28);
    for(const x of [-.65,1.18])box(0xd6cfb5,x,1.7,-1.3,.12,2.55,.22);
    // An open door keeps the interior readable from the oblique camera.
    box(0x90b3af,1.47,1.68,-.74,.09,2.5,1.45,-.36);
    box(0xe8d8b8,1.7,1.45,-.22,.06,.3,.08,-.36);
    box(0xe1decd,-.1,4.59,-3.4,9.15,2.6,5.9);
    box(0xa77262,-.1,5.98,-3.4,9.6,.23,6.3);
    box(0xc78b72,-.1,6.2,-6.38,9.4,.55,.15);
    for(const x of [-2.8,0,2.8]){
      box(0x799da0,x,4.6,-.39,1.68,1.5,.08);
      for(const dx of [-.9,0,.9])box(0xe9debf,x+dx,4.6,-.27,.09,1.67,.18);
      box(0xe9debf,x,4.6,-.24,1.85,.07,.17);
      box(0xd4b99a,x,3.78,-.14,2,.14,.47);
      for(let i=0;i<4;i++)box(0x9aaca1,x-.68+i*.45,3.97,.03,.1,.3,.08);
    }
    // Rain awning: alternating broad fabric stripes and a scalloped valance.
    for(let i=0;i<12;i++){
      const color=i%2?0xe6dcbf:0x719c95;
      const geo=geometry('box',()=>new THREE.BoxGeometry(1,1,1));
      put(geo,color,[-4.3+i*.78,3.35,.47],[.775,.1,2.65],[.12,0,0]);
      box(color,-4.3+i*.78,3.03,1.77,.775,.35,.08);
    }
    for(const x of [-4.65,4.66])rod(0x5f7974,[x,.24,1.45],[x,3.4,1.45],.055);
    // A little three-dimensional open-book emblem, not a text texture.
    put(geometry('box',()=>new THREE.BoxGeometry(1,1,1)),0xf1e5c1,[-.32,3.06,1.83],[.55,.36,.1],[0,0,-.14]);
    put(geometry('box',()=>new THREE.BoxGeometry(1,1,1)),0xf1e5c1,[.23,3.06,1.83],[.55,.36,.1],[0,0,.14]);
    box(0x547b78,-.05,3.03,1.9,.055,.4,.03);
    // Adjacent campus wall makes a street corner rather than an isolated prop.
    box(0xc4cbbf,-6.45,3.38,-4.55,3.5,6.3,4.4);
    box(0x9aafab,-6.45,6.59,-4.55,3.7,.16,4.65);
    for(let j=0;j<3;j++)box(0x789a9a,-6.45,1.5+j*1.8,-2.28,1.8,1.12,.08);
    rod(0x879e93,[-5.03,.28,-2.24],[-5.03,6.4,-2.24],.05);
    // Reading table, books and a mug waiting after the rain.
    cylinder(0xc09973,5.9,1.06,2.45,.9,.13);
    cylinder(0x6d827a,5.9,.65,2.45,.065,.74);
    for(let n=0;n<3;n++){
      const a=n*2.094;rod(0x6d827a,[5.9,.66,2.45],[5.9+Math.cos(a)*.48,.23,2.45+Math.sin(a)*.48],.045);
    }
    box(0xc48c78,5.69,1.16,2.55,.44,.065,.35,.3);
    box(0xe4d9b7,5.69,1.2,2.55,.39,.026,.33,.3);
    cylinder(0xe7dcc1,6.17,1.28,2.4,.1,.25);
    torus(0xe7dcc1,6.3,1.27,2.4,.065,.025);
    bench(5.65,3.65,Math.PI,.23);bag(6.2,1.02,3.68);
    bike(-5.75,1.5,.24,.22);
    for(const [x,z,s] of [[-4.8,1.72,.62],[4.72,1.78,.67],[7,1.45,.58],[-7.6,-.7,.8]])pot(x,.24,z,s,true);
    tree(-10,-5,1.6,220);tree(10,-6,1.5,304);
    distantTrees([0xa9c3ba,0xafc8c0,0xb7cec6],-28,-24,12);
    // Blue-grey puddles sit in the paving. Offset edges and a bright rim suggest
    // a wet surface without an expensive reflection render or mirror illusion.
    polygon(0xa0bec0,[[1.8,4.8],[3.2,4.5],[4.6,4.8],[4.9,5.2],[3.8,5.6],[2,5.3]],.232,{cast:false,receive:false,material:{unlit:true}});
    polygon(0xa8c3c3,[[-6.5,3.3],[-5,3.1],[-4.4,3.5],[-4.7,3.8],[-6.2,3.7]],.233,{cast:false,receive:false,material:{unlit:true}});
    box(0xd1dfd7,3.2,.238,5.02,1.3,.01,.025,0,{cast:false,receive:false,material:{unlit:true}});
    box(0xc6d8d3,-5.4,.24,3.52,.83,.01,.02,0,{cast:false,receive:false,material:{unlit:true}});
    lamp(9,2.6,.2);
    hanging(4.37,2.86,1.62);
    return {camera:{position:[11.47,8.12,16.95],target:[-.5,2,-1.5],fov:40},lighting:{fog:0xbdcfd0,fogNear:40,fogFar:105,skyTop:0x88aebf,skyMid:0xb6d3d8,skyHaze:0xd0dfd8,sun:0xffe6c5,fill:0xafd0e4,hemiSky:0xe4e9e3,hemiGround:0x8eaaa2,sunIntensity:1.7,fillIntensity:1.04,hemiIntensity:1.08}};
  };
  const terrace=()=>{
    box(0x738a89,0,-.26,0,400,.4,400);
    box(0x939c98,0,.22,0,17,.6,14);
    box(0xbbb4a0,0,.57,0,17.2,.11,14.1);
    box(0x8c9f97,0,.98,-3.9,15,.76,5.6);
    box(0xb9b5a1,0,1.39,-3.9,15.2,.12,5.8);
    for(let j=0;j<3;j++)box(0xc4bca4,0,.1+j*.1,7.9-j*.39,6.8,.2+j*.2,.8);
    for(let j=0;j<4;j++)box(0xc1b8a1,4.7,.73+j*.1,-.18-j*.36,2.5,.22+j*.2,.5);
    for(let i=0;i<12;i++)box(0xa9ada0,-7.8+i*1.4,.634,1.2,.018,.01,9.2,0,{cast:false});
    for(let i=0;i<8;i++)box(0xa9ada0,0,.635,-2.8+i*1.28,16.5,.01,.018,0,{cast:false});
    curveRibbon(0xafb7a8,[[0,8.4],[.4,10.5],[2.1,13.2],[5,16],[8,20]],2.9,-.041);
    box(0xb3baaa,0,-.039,8.8,5.3,.022,1.3,0,{cast:false});
    for(let i=0;i<6;i++)for(const side of [-1,1]){
      const x=.15+i*.32+side*(2.3+i*.12),z=9.2+i*.8;
      ball(i%2?0x839f92:0x8ba799,x,.3,z,.58,.5,.65,{receive:false});
      ball(0x96b29a,x+.18,.45,z+.17,.42,.44,.48,{receive:false});
    }
    // Community room behind the terrace; warm recessed windows anchor the dusk.
    box(0x9eada7,-4.9,3.8,-7.15,6.7,5.9,4.2);
    box(0x668989,-4.9,6.82,-7.15,7,.17,4.5);
    box(0x86a4a2,-1.25,3.6,-8.5,1.5,5.5,3.5);
    for(const x of [-6.9,-4.75,-2.65])for(const y of [2.7,4.95]){
      box(0x6d7d79,x,y,-4.98,1.7,1.54,.22);
      box(0xf0cc91,x,y,-4.84,1.5,1.32,.04,0,{cast:false,receive:false,material:{unlit:true}});
      box(0x91a099,x,y,-4.77,.075,1.4,.11);
      box(0x91a099,x,y,-4.74,1.53,.075,.1);
      box(0xc3b49a,x,y-.8,-4.71,1.86,.14,.6);
    }
    box(0x6d9690,-4.75,1.98,-4.77,1.55,1.17,.11);
    // Two tiers of seedlings are genuinely on shelves, not floating over soil.
    for(const xx of [3.05,6.45])for(const zz of [-4.55,-3.3])box(0x967f67,xx,2.55,zz,.12,2.2,.12);
    for(const yy of [1.77,2.54,3.32]){
      box(0xb0926c,4.75,yy,-3.92,3.6,.12,1.45);
      for(let n=0;n<5;n++)pot(3.4+n*.67,yy+.08,-3.77,.28,n%3===0);
    }
    for(const [x,z] of [[-3,.35],[.5,.35]]){
      box(0xb49168,x,.91,z,2.55,.57,1.55);
      box(0x645f58,x,1.21,z,2.36,.055,1.36);
      for(const dz of [-.62,.62])box(0xccaa78,x,1.22,z+dz,2.6,.12,.14);
      for(let n=0;n<6;n++){
        const px=x-.82+(n%3)*.82,pz=z-.37+Math.floor(n/3)*.7;
        ball(0x82a37f,px,1.39,pz,.3,.2,.32,{receive:false});
        if(n%2)ball(0xc79189,px+.1,1.35,pz+.16,.105,.11,.1);
      }
    }
    // Pergola frames one side of the sky and leaves the garden centre open.
    for(const x of [3.1,7])for(const z of [.25,4.5])box(0x9e9276,x,2.43,z,.16,3.62,.16);
    for(const x of [3.1,7])box(0xb0a181,x,4.32,2.38,.2,.19,4.7);
    for(let i=0;i<8;i++)box(0xbba989,5.05,4.38,.08+i*.65,4.35,.12,.16);
    bench(5.1,3.2,0,.64);bag(5.55,1.4,3.35);
    hanging(5.05,4.32,2.68,{night:true});
    cylinder(0x79948b,3.8,.92,4.48,.26,.54);
    torus(0x839f92,3.8,1.05,4.51,.38,.05,[Math.PI/2,0,0]);
    rod(0x839f92,[4,.94,4.48],[4.5,1.2,4.48],.065);
    cylinder(0x86a49b,4.54,1.22,4.48,.12,.08);
    // Hanging bulbs use the same shared endpoints as their curved cable.
    const wire=[];
    for(let i=0;i<=24;i++){const t=i/24;wire.push([-7+14*t,4.4-Math.sin(t*Math.PI)*.7,2.5]);if(i)rod(0x667475,wire[i-1],wire[i],.02);}
    for(let i=1;i<12;i++){
      const t=i/12,x=-7+14*t,y=4.4-Math.sin(t*Math.PI)*.7;
      rod(0x77817d,[x,y,2.5],[x,y-.18,2.5],.018);
      ball(0xffdca1,x,y-.26,2.5,.09,.13,.09,{cast:false,receive:false,material:{unlit:true}});
    }
    for(const x of [-7,7])rod(0x6f847d,[x,.65,2.5],[x,4.55,2.5],.055);
    for(const [x,z] of [[-7.5,5.4],[7.55,5.25],[-7.4,-2]])pot(x,.64,z,.72,true);
    lamp(-6,1.2,.65,true);lamp(7,-2,1.42,true);
    tree(-12,-4,1.6,327);tree(12,-7,1.7,531);
    distantTrees([0x99b5b5,0xa2bcbc,0xabc4c2],-36,-29,14);
    for(let i=0;i<12;i++){
      const x=-35+i*6;

      if(i%2)box(0x8fa5a7,x,3.8,-24,2.7,7.5,3.2,0,{cast:false});
    }
    for(const x of [-4.8,5.2]){
      const light=new THREE.PointLight(0xffc37e,6,7,2);light.position.set(x,3,0);root.add(light);
    }
    return {camera:{position:[12.3,9.06,17.5],target:[.15,2,-.9],fov:42},lighting:{fog:0x9cbbbf,fogNear:38,fogFar:100,skyTop:0x6685a9,skyMid:0x9ab6cb,skyHaze:0xc4d1d0,sun:0xf7ceb0,fill:0x94b5d9,hemiSky:0xc0d5df,hemiGround:0x6f8f8c,sunIntensity:1.2,fillIntensity:.8,hemiIntensity:.8}};
  };

  const result=skin === 'bookshop' ? bookshop() : skin === 'terrace' ? terrace() : lake();
  for(const {geo,mat,cast,receive,matrices} of batches.values()){
    const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
    mesh.castShadow=cast;mesh.receiveShadow=receive;mesh.name=`campus-detail-${root.children.length}`;root.add(mesh);
  }
  return {...result,root,update(time){animations.forEach(animate=>animate(time));},dispose(){root.removeFromParent();}};
}
