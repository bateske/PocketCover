import {buildingGeometry} from './building-geometry.js';

// FEATURE buildings-only: measured 2:1 footprints, projected face ordering,
// facade bays, cornices, hipped roofs and octagonal towers. No front dithering.
// Masses own their wall details so a nearer roof occludes both wall and windows.
const masonry={front:6,side:5,roof:9};
const metal={front:9,side:5,roof:7};
const timber={front:5,side:3,roof:9};

function cornice(g,b,{depth=1.5,height=2,color=9}={}) {
  return g.box(b.u-depth,b.v-depth,b.w+2*depth,b.d+2*depth,b.z+b.h,height,{front:color,side:5,roof:7});
}
function steps(g,{u=-6,v=21,width=12,count=3,z=0}) {
  for(let i=0;i<count;i++)g.box(u,v+i*3,width,3,z,count-i,{front:9,side:5,roof:7});
}
function mast(g,u,v,z,height=11,flag=false) {
  const b=g.box(u-.6,v-.6,1.2,1.2,z,height,{front:9,side:5,roof:7});
  if(flag)g.mark(b.right,[[u+.6,v+.6,z+height-1],[u+.6,v-10,z+height-4],[u+.6,v-8,z+height-7],[u+.6,v+.6,z+height-6]],10);
}
function crenels(g,b) {
  const c={front:6,side:5,roof:7},z=b.z+b.h;
  // Broad, sparse merlons survive the final cover scale. The rear parapet is
  // deliberately continuous; tiny cubes on all four edges create roof noise.
  g.box(b.u,b.v,b.w,2,z,2,c);g.box(b.u,b.v+2,2,b.d-6,z,2,c);
  const count=Math.max(2,Math.round(b.w/10)),step=(b.w-4)/(count-1);
  for(let i=0;i<count;i++)g.box(b.u+i*step,b.v+b.d-4,4,4,z,4,c);
  const sideCount=Math.max(1,Math.floor((b.d-7)/9));
  for(let i=0;i<sideCount;i++)g.box(b.u+b.w-4,b.v+3+i*9,4,4,z,4,c);
}
function sawRoof(g,u,v,w,d,z,count) {
  const step=w/count;
  for(let i=0;i<count;i++){
    const a=u+i*step,b=a+step,rise=6;
    const roof=g.face([[a,v,z],[b,v,z+rise],[b,v+d,z+rise],[a,v+d,z]],9);
    const glass=g.face([[b,v,z],[b,v+d,z],[b,v+d,z+rise],[b,v,z+rise]],3);
    const end=g.face([[a,v+d,z],[b,v+d,z+rise],[b,v+d,z]],6);
    for(let t=3;t<d-2;t+=7)g.mark(glass,[[b,v+t,z+1],[b,v+t+4,z+1],[b,v+t+4,z+4],[b,v+t,z+4]],11);
    g.edge(roof,[[b,v,z+rise],[b,v+d,z+rise]],7);
    g.edge(end,[[a,v+d,z],[b,v+d,z+rise]],7);
  }
}

export default {
  id:'buildings',label:'Buildings / towers',revision:5,background:'mist',
  features:['poly','stroke','group'],
  featureNotes:{architecture:'Buildings only: 2:1 footprint projection, convex face visibility, attached wall marks, facade bays, roofs and towers in building-geometry.js.'},
  // Framing metadata (composition.js): large and kept low in its area.
  composition:{sizeRange:{standard:[.80,1]},vertical:[.45,1]},
  // Big buildings read as the subject; keep them near the middle column.
  adjustPlacement(placement){if(Number.isFinite(placement.horizontal))placement.horizontal=.38+.24*placement.horizontal;},
  render({p,r,pick,variation}) {
    const kind=pick(['wizard tower','temple','factory','castle','space spire','skyscraper']);
    const facade={bayAdjustment:variation.integer('facade-bays',-1,1),pitchAdjustment:variation.integer('facade-pitch',-1,1),
      windowWidth:variation.integer('window-width',4,6),windowHeight:variation.integer('window-height',4,6)};
    const g=buildingGeometry(p,facade),equipment=[];
    let floors=3,roofStyle,height,footprint,structure;
    if(kind==='wizard tower'){
      const radius=13+r(3),bodyHeight=38+r(9),rows=2+r(2),cap=pick(['steep cone','lantern crown','pointed slate']);
      footprint={width:radius*2+7,depth:radius*2+17};
      g.cylinder(0,0,radius+2,0,3,masonry);
      g.cylinder(0,0,radius,3,bodyHeight,{...masonry,windows:rows,phase:r(4)});
      g.cylinder(0,0,radius+1,bodyHeight+3,2,{front:9,side:5,roof:7});
      const z=bodyHeight+5;
      if(cap==='lantern crown'){
        g.cone(0,0,radius+4,z,11,{lit:10,shade:11});
        const lantern=g.box(-4,-4,8,8,z+9,9,{front:6,side:5,roof:7});
        g.windows(lantern,{columns:1,rows:1,pitch:8});
        g.pyramid(-6,-6,12,12,z+18,8,{lit:10,shade:11});height=z+26;
      }else{
        const rise=18+r(5);g.cone(0,0,radius+4,z,rise,{lit:cap==='pointed slate'?14:10,shade:cap==='pointed slate'?13:11});height=z+rise;
      }
      const annex=g.box(-9,radius-3,18,13,0,15+r(3),masonry);
      g.door(annex,{width:7,height:11,arched:true});g.window(annex,'right',4,6,4,6,true,true);
      g.hip(annex.u-2,annex.v-2,annex.w+4,annex.d+4,annex.h,5,5,{lit:9,shade:5,top:7});
      steps(g,{u:-5,v:annex.v+annex.d,width:10,count:2});
      if(r(2)){mast(g,0,0,height,9,true);height+=9;equipment.push('roof pennant');}
      floors=rows;roofStyle=cap;structure='octagonal tower with entry house';equipment.push('entry house');
    }else if(kind==='temple'){
      const tiers=2+r(2),w=38+r(3)*2,d=30+r(3)*2,storyHeight=11+r(2),rise=5;
      footprint={width:w+12,depth:d+19};floors=tiers;roofStyle='nested hipped eaves';structure=tiers===3?'three tier pagoda':'two tier pavilion';
      const base=g.box(-w/2-5,-d/2-5,w+10,d+10,0,3,{front:9,side:5,roof:7});
      let z=3,ww=w,dd=d;
      for(let tier=0;tier<tiers;tier++){
        const body=g.box(-ww/2,-dd/2,ww,dd,z,storyHeight,timber);
        g.windows(body,{columns:tier===0?4:2,rows:1,phase:tier,door:tier===0});
        g.band(body,1,1,9,5);g.band(body,storyHeight-2,1,9,5);
        if(tier===0)g.door(body,{width:8,height:10});
        // The next floor sits on the flat inner roof, never on an arbitrary y.
        const roof=g.hip(-ww/2-3,-dd/2-3,ww+6,dd+6,z+storyHeight,rise,7,{lit:10,shade:11,top:9});
        z=roof.z;ww-=10;dd-=10;
      }
      g.pyramid(-4,-4,8,8,z,6,{lit:10,shade:11});mast(g,0,0,z+6,8,false);height=z+14;
      steps(g,{u:-7,v:base.v+base.d,width:14,count:3});
      // A small shrine annex borrows the same roof pitch and shares the plinth.
      if(r(3)===0){
        const shrine=g.box(-w/2+2,d/2+1,9,7,3,8,timber);g.door(shrine,{width:5,height:7});
        g.pyramid(shrine.u-1,shrine.v-1,11,9,11,5,{lit:10,shade:11});equipment.push('porch shrine');
      }
    }else if(kind==='factory'){
      const w=38+r(4)*2,d=27+r(3)*2,h=20+r(5),stacks=1+r(2),teeth=3+r(2);
      const skylights=r(2)===0;
      footprint={width:w+12,depth:d+16};floors=2;roofStyle=skylights?`${teeth} sawtooth bays`:'plain flat roof';structure='mill with loading hall';height=h+(skylights?7:2);
      g.box(-w/2-2,-d/2-2,w+4,d+16,0,2,{front:9,side:5,roof:9});
      for(let i=0;i<stacks;i++){
        const u=-w/2+w/teeth*(i===0?1:teeth-1),v=-d/2+5,stackHeight=44+r(13);
        // Shafts start at their roof mount; each collar replaces a shaft slice.
        // Interpenetrating whole shafts would create impossible painter cycles.
        const mount=h+(skylights?8:2);let z=mount;
        while(z<stackHeight+1){
          const length=Math.min(8,stackHeight+1-z);
          g.cylinder(u,v,3.5,z,length,{front:5,side:3,roof:9});z+=length;
          if(z<stackHeight+1){g.cylinder(u,v,3.8,z,2,{front:9,side:5,roof:9});z+=2;}
        }
        g.cylinder(u,v,4.5,stackHeight+1,3,{front:9,side:5,roof:3});height=Math.max(height,stackHeight+4);
      }
      const hall=g.box(-w/2,-d/2,w,d,2,h,{front:6,side:5,roof:9});
      g.windows(hall,{columns:4,rows:2,phase:r(5),pitch:10});g.band(hall,h-2,2,9,5);
      if(skylights)sawRoof(g,hall.u,hall.v,w,d,h+2,teeth);
      const loading=g.box(-5,d/2,24,12,2,12,{front:9,side:5,roof:7});
      g.door(loading,{width:14,height:11,garage:true});g.window(loading,'right',4,5,4,5,true);
      cornice(g,loading,{depth:1,height:1});equipment.push(`${stacks} chimney${stacks>1?'s':''}`,'loading hall');
      if(r(2)){
        g.cylinder(-w/2+6,d/2+5,5,2,15,{front:9,side:5,roof:7});
        g.cone(-w/2+6,d/2+5,5,17,4,{lit:7,shade:9});equipment.push('storage tank');
      }
    }else if(kind==='castle'){
      const keepHeight=32+r(10),towerHeight=24+r(7),cap=pick(['battlements','conical turrets']);
      footprint={width:54,depth:44};floors=3;roofStyle=cap;structure='keep with gatehouse and curtain wall';
      g.box(-26,-20,52,40,0,2,{front:9,side:5,roof:9});
      const keep=g.box(-12,-16,24,25,2,keepHeight,masonry);
      g.windows(keep,{columns:2,rows:3,style:'slit',phase:r(5),pitch:10});cornice(g,keep);crenels(g,{...keep,z:keep.z+2});
      height=keepHeight+8;mast(g,0,-4,height-2,12,true);height+=10;equipment.push('keep pennant');
      const wall=g.box(-20,10,40,7,2,14,masonry);g.door(wall,{width:11,height:13,arched:true});
      // The curtain enters the towers, but its parapet stops at their inner
      // tangent. A merlon inside a round tower is an intersecting solid.
      crenels(g,{...wall,u:-12,w:24});
      for(const u of [-21,21]){
        const tower=g.cylinder(u,11,7.5,2,towerHeight,{...masonry,windows:1,phase:1});
        g.cylinder(u,11,8.5,towerHeight+2,2,{front:9,side:5,roof:7});
        if(cap==='conical turrets')g.cone(u,11,10,towerHeight+4,13,{lit:10,shade:11});
        else{
          const top=g.box(u-6,5,12,12,towerHeight+4,1,masonry);crenels(g,top);
        }
      }
      steps(g,{u:-7,v:17,width:14,count:2});
    }else if(kind==='space spire'){
      const bodyHeight=49+r(8),decks=3+r(2),podHeight=13+r(5);
      footprint={width:52,depth:38};floors=decks;roofStyle='stepped observation decks';structure='orbital terminal';
      g.box(-25,-13,50,30,0,3,{front:9,side:5,roof:7});
      const phase=r(4);let shaftZ=3;
      for(let i=0;i<decks;i++){
        const z=12+i*(bodyHeight-17)/(decks-1),rad=16-i*2;
        g.cylinder(0,-2,8,shaftZ,z-shaftZ,{front:6,side:5,roof:7,windows:1,phase});
        g.cylinder(0,-2,rad,z,4,{front:10,side:11,roof:7});
        g.cylinder(0,-2,rad+1,z+4,1,{front:9,side:5,roof:7});
        shaftZ=z+5;
      }
      if(shaftZ<bodyHeight+3)g.cylinder(0,-2,8,shaftZ,bodyHeight+3-shaftZ,{front:6,side:5,roof:7});
      g.cylinder(0,-2,6,bodyHeight+3,6,{front:10,side:11,roof:7});
      g.cone(0,-2,7,bodyHeight+9,5,{lit:7,shade:9});mast(g,0,-2,bodyHeight+14,9);height=bodyHeight+23;
      for(const u of [-24,12]){
        const pod=g.box(u,4,12,12,3,podHeight,metal);g.windows(pod,{columns:1,rows:1});
        g.pyramid(u-1,3,14,14,podHeight+3,5,{lit:9,shade:5});
      }
      equipment.push('paired arrival halls','observation rings');
    }else{
      const plan=pick(['setback office','twin slab','terraced office']),w=30+r(4)*2,d=24+r(3)*2,h=37+r(10),phase=r(5);
      footprint={width:w+13,depth:d+14};roofStyle='setback flat roof';structure=plan;floors=Math.floor(h/10)+1;height=h+22;
      const podium=g.box(-w/2-5,-d/2-4,w+10,d+12,0,12,metal);
      g.windows(podium,{columns:4,rows:1,door:true,phase});g.door(podium,{width:8,height:10});cornice(g,podium,{depth:1,height:1});
      if(plan==='twin slab'){
        for(const u of [-w/2,2]){
          const tower=g.box(u,-d/2,w/2-2,d,13,h,{front:6,side:5,roof:7});
          g.windows(tower,{columns:2,rows:5,phase,pitch:10});cornice(g,tower,{depth:.5,height:1});
          for(let z=11;z<h-2;z+=10)g.band(tower,z,1,9,3);
          g.box(u+3,-d/2+4,7,8,14+h,5,metal);
        }
        height=h+19;equipment.push('paired towers');
      }else{
        const tower=g.box(-w/2,-d/2,w,d,13,h,{front:6,side:5,roof:7});
        g.windows(tower,{columns:3,rows:5,phase,pitch:10});cornice(g,tower,{depth:.5,height:1});
        for(let z=11;z<h-2;z+=10)g.band(tower,z,1,9,3);
        const crown=g.box(-w/2+5,-d/2+5,w-10,d-10,h+14,7,metal);
        g.windows(crown,{columns:2,rows:1,phase});height=h+21;
        if(plan==='terraced office'){
          const wing=g.box(w/2,-d/2+2,10,d-5,13,23,{front:9,side:5,roof:7});
          g.windows(wing,{columns:1,rows:2,phase});cornice(g,wing,{depth:.5,height:1});equipment.push('side office wing');
        }
        if(r(2)){mast(g,0,-3,height,10);height+=10;equipment.push('roof antenna');}
      }
    }
    const painter=g.render();
    return {archetype:kind,structure,floors,roofStyle,equipment,footprint,height,facade,
      groundAnchor:{x:64,y:77},horizonFraction:.24,projection:'2:1 footprint',outlinePixels:2,shadowPixels:{x:4,y:4},
      lighting:'lit roof and left facade; darker right facade; no front dithering',...painter};
  },
};
