import {part} from '../raster.js';
import {dither} from '../materials.js';
// FEATURE: bilateral construction is local to spacecraft; no engine dependency.
export default {
  id: 'spaceships', label: 'Spaceships', revision: 4, background: 'stars',
  features: ['rect', 'poly', 'round', 'line', 'ellipse', 'dot', 'sample', 'part', 'group'],
  specializedFeatures: ['bilateral wing construction', 'engine pods and ion exhaust'],
  // Varied framing only (composition.adjustPlacement): sparse hulls retain
  // their clean silhouettes at much smaller sizes. Uses the composition
  // stream's size, never recipe RNG.
  adjustPlacement(placement, traits) {
    const t=Math.max(0,Math.min(1,(placement.size-.62)/.38));
    if(traits.detailLevel==='simple')placement.size=.28+t*.50;
    else if(traits.detailLevel==='medium')placement.size=.45+t*.50;
  },
  render({p, r, pick,variation}) {
    const archetype = pick(['arrowhead interceptor', 'fork-wing fighter', 'heavy freighter', 'solar explorer','cartoon rocket']);
    const span = 28 + r(18), nose = 8 + r(14), engineY = 60 + r(7);
    const size=.78+r(5)*.055,stretch=.81+r(5)*.045,shift=r(7)-3;
    p=part(p,{x:64*(1-size)+shift,y:85*(1-stretch),scaleX:size,scaleY:stretch});
    const scene=p,detailLevel=archetype==='heavy freighter'?pick(['medium','complex','complex']):pick(['simple','medium','complex']);
    // The entire filled assembly owns the strong exterior stroke. Individual
    // groups below keep only thin mechanical seams where overlapping parts meet.
    if(archetype==='cartoon rocket') {
      const profile=pick(['classic capsule','needle rocket','bubble rocket']);
      const radius=profile==='needle rocket'?8+r(4):profile==='bubble rocket'?14+r(4):11+r(4);
      const height=profile==='needle rocket'?49+r(7):profile==='bubble rocket'?34+r(8):39+r(10);
      const base=76,shoulder=base-height,noseLength=Math.min(shoulder-4,14+r(9)),finReach=9+r(12),finHeight=17+r(12);
      const accent=pick([7,10]),ports=detailLevel==='complex'?variation.integer('rocket-ports',1,2):1,exhaust=10+r(13),fins=pick(['swept','triangular','stubby']);
      scene.group(q=>{
        // Exhaust belongs to the parent layer, behind the stroked hull.
        scene.poly([[57,base+5],[71,base+5],[68,base+exhaust],[64,base+exhaust+5],[60,base+exhaust]],11);
        scene.poly([[60,base+5],[68,base+5],[66,base+exhaust-1],[64,base+exhaust+1],[62,base+exhaust-1]],10);
        scene.rect(63,base+5,2,Math.max(4,exhaust-5),8);
        for(const side of [-1,1]) {
          const pts=fins==='stubby'?[[side*(radius-2),base-15],[side*(radius+finReach),base-5],[side*(radius+finReach),base+3],[side*radius,base-1]]:
            [[side*(radius-2),base-finHeight],[side*(radius+finReach),base-(fins==='swept'?4:10)],[side*(radius+finReach),base+5],[side*(radius-3),base-1]];
          q.poly(pts.map(([x,y])=>[64+x,y]),accent);
          q.line(64+side*radius,base-(fins==='stubby'?15:finHeight)+6,64+side*(radius+finReach-3),base-5,side<0?7:5,2);
        }
        q.round(64-radius,shoulder,radius*2,height,5,6);
        q.poly([[64,shoulder-noseLength],[64+radius,shoulder+3],[64-radius,shoulder+3]],accent);
        q.poly([[64,shoulder-noseLength+2],[64,shoulder+1],[66-radius,shoulder+1]],7);
        q.rect(64+radius*.35,shoulder+5,radius*.65-1,height-8,5);
        q.rect(66-radius,shoulder+6,3,height-13,7);
        q.rect(56,base-1,16,6,9);q.rect(59,base+1,10,3,5);
        for(let j=0;j<ports;j++) {
          const y=shoulder+12+j*13,rad=Math.min(radius-4,detailLevel==='simple'?5:6);
          q.ellipse(64,y,rad+1,rad+1,4);q.ellipse(64,y,rad,rad,10);q.rect(62,y-3,3,2,8);
        }
        if(detailLevel!=='simple') {
          q.line(65-radius,base-9,63+radius,base-9,9,2);
          const vents=variation.integer('rocket-vents',2,4);
          for(let i=0;i<vents;i++)q.rect(59+i*10/(vents-1),base-7,2,2,4);
        }
        if(detailLevel==='complex')for(const side of [-1,1])q.rect(64+side*(radius-4)-1,shoulder+22,2,2,8);
      },{outline:2,color:4,exteriorOnly:true,edgeShade:{color:4,width:2,density:.5},shadow:{x:3,y:3,color:4}});
      return {archetype,detailLevel,profile,wingAssembly:'rear fins',cockpit:ports===1?'round porthole':'twin portholes',equipment:[fins+' fins'],
        dimensions:{bodyWidth:radius*2,bodyHeight:height,noseLength,finReach,size,stretch},detail:'cylindrical hull, pointed nose and rear fins'};
    }
    let result;
    scene.group(q=>{
    p=q;
    // Fill each semantic part first. Its silhouette receives a one-device-pixel
    // outline from the shared mask, including after composition shrinks it.
    const outlined=draw=>{const parent=p;parent.group(q=>{p=q;draw();p=parent;},{outline:1,color:4});};
    // Mission, wing plan, body and equipment are independent compatible choices.
    const wingAssembly=pick([archetype,archetype,'arrowhead interceptor','fork-wing fighter','heavy freighter','solar explorer']);
    const equipment=[],engineWidth=8+r(5),engineLength=23+r(11),exhaustLength=10+r(11);
    const accent = pick([7, 10]), flame = r(2) === 0;
    const mirrorPoly = (points, color) => {
      p.poly(points.map(([x,y]) => [64+x,y]), color);
      p.poly(points.map(([x,y]) => [64-x,y]), color);
    };
    const mirrorRect = (x,y,w,h,c) => {p.rect(64+x,y,w,h,c);p.rect(64-x-w,y,w,h,c);};
    const thruster = (x,y,w=10) => {
      if(flame) {
        scene.poly([[x-w/2+1,y+8],[x+w/2-1,y+8],[x+2,y+exhaustLength+5],[x,y+exhaustLength+8],[x-2,y+exhaustLength+5]],11);
        scene.poly([[x-3,y+8],[x+3,y+8],[x+1,y+exhaustLength+3],[x-1,y+exhaustLength+3]],10);
        scene.rect(x-1,y+9,2,5,8);
      }
      outlined(()=>{
      p.round(x-w/2-2,y-engineLength+11,w+4,engineLength,3,5);
      p.rect(x-w/2+1,y-engineLength+14,3,engineLength-12,7);
      p.rect(x-w/2+4,y-engineLength+14,w-5,engineLength-12,6);
      p.rect(x-w/2-1,y+2,w+2,3,9);
      p.rect(x-w/2,y+7,w,3,4);
      p.rect(x-w/2+2,y+8,w-4,2,accent);
      if(detailLevel!=='simple')p.rect(x-1,y-11,2,8,4);
      });
    };
    const cannon = (x,y,length=18) => {
      outlined(()=>{p.rect(x-2,y,5,length,9);
        p.rect(x-3,y+length-5,7,6,5);p.rect(x-2,y+length-4,5,3,6);});
    };
    if(wingAssembly === 'arrowhead interceptor') {
      outlined(()=>{
      mirrorPoly([[5,nose+13],[span,59],[span+4,70],[14,63],[9,72]],5);
      mirrorPoly([[9,nose+22],[span-2,59],[15,54]],6);
      mirrorPoly([[10,nose+23],[15,nose+32],[span-3,61],[29,59]],7);
      mirrorPoly([[17,49],[27,57],[24,59],[15,53]],accent);
      });
      const gunY=38+r(6),gunLength=14+r(6);
      for(const side of [-1,1]) {if(detailLevel!=='simple')cannon(64+side*(span-1),gunY,gunLength);thruster(64+side*15,engineY,engineWidth);}
    } else if(wingAssembly === 'fork-wing fighter') {
      outlined(()=>{
      mirrorPoly([[6,47],[29,39],[span,20],[span+4,24],[span,61],[17,73],[8,68]],5);
      mirrorPoly([[11,50],[29,44],[span-1,28],[span-3,50],[18,58]],6);
      mirrorPoly([[28,45],[span-1,28],[span-3,48],[30,52]],7);
      mirrorPoly([[14,57],[27,49],[29,51],[17,62]],accent);
      });
      for(const side of [-1,1]) {if(detailLevel!=='simple')cannon(64+side*(span-2),15,19);thruster(64+side*23,engineY-2,engineWidth+2);}
    } else if(wingAssembly === 'heavy freighter') {
      outlined(()=>{mirrorRect(5,34,37,31,5);mirrorRect(7,36,33,4,9);});
      const cargoWidth=12+r(10);
      for(const side of [-1,1]) {
        const x=64+side*28-cargoWidth/2;
        outlined(()=>{
        p.round(x-2,25,cargoWidth+4,38,3,6);
        p.rect(x+1,28,3,30,7);p.rect(x+4,28,cargoWidth-6,3,9);
        const pitch=variation.integer('cargo-panel-pitch',7,11);
        for(let y=35;y<60;y+=pitch){p.rect(x,y,cargoWidth,2,4);p.rect(x+4,y+2,cargoWidth-8,1,5);}
        p.rect(x+5,30,cargoWidth-9,3,accent);
        });
        thruster(64+side*28,engineY,engineWidth+3);
      }
      outlined(()=>{mirrorRect(40,44,5,13,5);mirrorRect(41,46,3,8,accent);});
    } else {
      outlined(()=>{mirrorRect(9,42,33,6,5);mirrorRect(12,43,28,2,9);});
      for(const side of [-1,1]) {
        const x=64+side*32-12;
        outlined(()=>{
        p.poly([[x,24],[x+22,29],[x+26,64],[x+4,60]],5);
        for(let j=0;j<(detailLevel==='simple'?2:3);j++)for(let i=0;i<2;i++) {
          const px=x+4+i*8+j,py=29+j*9+i*2;
          p.poly([[px,py],[px+6,py+1],[px+7,py+8],[px+1,py+7]],i===0?6:accent);
          p.line(px+1,py+1,px+5,py+2,7);
        }
        });
        thruster(64+side*9,engineY,engineWidth);
      }
      p.line(64,8,64,23,9,1);p.ellipse(64,10,4,3,4);p.ellipse(64,9,2,2,accent);
    }
    // Faceted central fuselage unifies each structurally different wing assembly.
    const wide=7+r(9),cockpit=pick(['long canopy','twin canopy','observation dome']);
    outlined(()=>{
    p.poly([[64,nose],[64+wide,nose+16],[64+wide+2,57],[70,76],[58,76],[64-wide-2,57],[64-wide,nose+16]],5);
    p.poly([[64,nose+3],[64,nose+47],[59,69],[64-wide+2,54],[64-wide+3,nose+17]],6);
    dither(p,{x:64,y:nose+18,w:wide-2,h:Math.max(4,51-nose-18),color:6,density:(x)=>.48-.4*(x-64)/wide});
    p.line(64,nose+4,64-wide+4,nose+18,7,2);
    p.line(64-wide+3,nose+20,64-wide+2,51,7,1);
    p.poly([[64,nose+16],[69,nose+24],[68,nose+34],[60,nose+34],[59,nose+24]],4);
    p.poly([[64,nose+19],[67,nose+25],[66,nose+30],[61,nose+31],[61,nose+25]],10);
    p.line(63,nose+23,63,nose+29,8,1);
    if(cockpit==='twin canopy'){
      p.round(60,nose+37,8,9,2,4);p.rect(62,nose+39,4,5,10);p.rect(62,nose+39,2,3,8);
    }else if(cockpit==='observation dome'){
      p.ellipse(64,nose+26,wide-2,9,4);p.ellipse(64,nose+25,wide-4,6,10);p.ellipse(62,nose+23,2,3,8);
    }
    p.rect(60,57,8,3,accent);p.rect(61,64,6,2,4);
    if(detailLevel!=='simple')for(let y=65;y<71;y+=3)p.rect(62,y,4,1,9);
    p.dot(64,51,8);
    });
    const secondary=detailLevel==='simple'?'none':pick(['none','canards','sensor forks','cargo capsules','maneuvering jets']);
    if(secondary==='canards'){
      outlined(()=>{mirrorPoly([[wide-2,nose+19],[wide+15,nose+12],[wide+11,nose+24],[wide,nose+28]],5);
        mirrorPoly([[wide,nose+21],[wide+11,nose+16],[wide+8,nose+23],[wide+1,nose+25]],accent);});
    }else if(secondary==='sensor forks'){
      mirrorRect(wide-1,nose-1,3,20,4);mirrorRect(wide,nose,1,15,9);mirrorRect(wide-2,nose-3,5,3,accent);
    }else if(secondary==='cargo capsules'){
      for(const side of [-1,1]){const x=64+side*(wide+5);outlined(()=>{p.round(x-5,38,10,21,3,9);p.rect(x-3,46,6,2,5);p.rect(x-3,52,6,2,5);});}
    }else if(secondary==='maneuvering jets'){
      mirrorRect(wide-1,61,8,5,4);mirrorRect(wide+1,62,5,2,accent);
    }
    if(secondary!=='none')equipment.push(secondary);
    if(detailLevel==='complex'&&r(3)===0&&wingAssembly!=='solar explorer'){
      p.line(64,nose+1,64,Math.max(3,nose-7),4,3);p.line(64,nose,64,Math.max(3,nose-7),9);equipment.push('nose antenna');
    }
    result={archetype,detailLevel,wingAssembly,cockpit,equipment,dimensions:{span:Math.round(span*2*size),bodyWidth:wide*2,nose,size,stretch,engineLength,engineWidth},detail:flame?'ion exhaust and modular wings':'armored engine pods and modular wings'};
    p=scene;
    },{outline:2,color:4,exteriorOnly:true,edgeShade:{color:4,width:2,density:.5},shadow:{x:3,y:3,color:4}});
    return result;
  }
};
