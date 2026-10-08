// Landscapes under a horizon sky. The value plan (common.js) gives every
// ground scene two depth layers with a guaranteed step in any mood:
// - the sky: 0, with a 3-row seam into 1 at the horizon;
// - the far layer: 3, with a 1 px rim of 2 on light-facing slopes (two steps
//   over the 0 sky, one over the 1 horizon band), its foot fading to 1;
// - the near ground: lit 3 (rim 2) from its top past the subject's contact
//   row, then a 2-row seam into 1 toward the frame. Nothing large is 0, so
//   the stage's contact shadow reads and its vignette never inks the floor.
// Grounded subjects stand on the near ground: its line follows ctx.floor.
// Buildings keep their footprint-derived ground line (traits.horizonY, as
// in engine 18).
import {LIT,SCENE_TOP,SHADE,bandTone,blocked,cloud,crater,farFoot,floorPlane,ground,groundBand,liftTops,paintRidge,plateaus,ridge,ridgeTops,seamPixel,seamRow,starfield} from './common.js';
import {distantPlanet} from './space.js';

const meta=(id,extra={})=>Object.freeze({id,sky:'horizon',titleBand:false,ground:true,foreground:'none',...extra});
const FAR=3,RIM=2,FOOT=1,RUIN=0,BAND=5;

// Small rocks on the near ground: two-row lumps, never 1 px dashes, lit on
// top (one step lighter than the ground under them) and shaded below (one
// step darker). A rock is skipped where it would cross the seam or stand
// above the ground's top line.
function rocks(p,r,count,near,{y0=114,span=10}={}) {
  for(let i=0;i<count;i++){
    const x=7+r(108),y=y0+r(span),w=Math.min(124,x+5+r(8))-x;
    const tone=bandTone(y,near.y,{band:BAND}),below=bandTone(y+1,near.y,{band:BAND});
    let clear=tone!=null&&tone===below&&y+1<126;
    for(let k=0;clear&&k<w;k++)if(near.field.tops[x+k]>=y)clear=false;
    if(!clear)continue;
    p.rect(x+1,y,Math.max(2,w-2),1,LIT[tone]);p.rect(x,y+1,w,1,SHADE[tone]);
  }
}
// Craters keep off the lit floor under the subject, where the stage's contact
// shadow falls: such a crater is drawn into a sink that paints nothing, so
// its draws are still consumed.
const NO_PAINT=Object.freeze({ellipse(){},line(){}});
const underFoot=(ctx,x,y,rx,y0,y1)=>!!ctx.bounds&&x+rx>=ctx.bounds.left&&x-rx<=ctx.bounds.right&&y+4>=y0&&y-4<=y1;
// Crater tones on the ground at row y: a lit rim one step above the ground,
// a bowl of 1 and a 0 shadow line on its upper-left inner wall.
function craterTones(near,y) {
  return y<=Math.round(near.y)+BAND?{rim:RIM,bowl:FOOT,shade:0}:{rim:FAR,bowl:FOOT,shade:0};
}

// The near ground line: under a placed subject it is the contact row
// (ctx.floor = bounds.bottom + 1), so every column's top is at or above it
// and the subject stands on the lit floor; with no subject it is the
// engine-18 draw.
const nearLine=(ctx,drawn)=>ctx.bounds?Math.max(ctx.top+30,Math.min(118,ctx.floor)):drawn;
// Far tops stay at least FAR_GAP rows above the highest near top, so the far
// foot's seam and a band of 1 always part the two layers. The far ridge is
// lifted by whole rows (its slopes stay clean) rather than squeezed, and it
// stops 4 rows below the title extent; with too little room it is left out.
const FAR_GAP=7;
function landLayers(p,ctx,far,near,{color=FAR,rim=RIM,sky=ctx.skyHorizon}={}) {
  const minNear=Math.min(...near.field.tops),limit=Math.max(ridgeTop(ctx),Math.ceil(ctx.extent??ctx.top)+4);
  let placed=null;
  if(far&&minNear-limit>=FAR_GAP+2){
    placed=liftTops(far,Math.max(...far.tops)-(minNear-FAR_GAP),limit);
    paintRidge(p,placed,color,{rim,sky});
    farFoot(p,placed,minNear-4,color,FOOT);
  }
  groundBand(p,near.field,near.y,{band:BAND,lit:FAR,rim:RIM,dark:FOOT});
  return placed;
}
// Engine-18 sky clouds: one in three covers, `count` soft clouds in 1.
function skyClouds(p,r,ctx,{x0=5,xr=95,y0=10,yr=16,w0=13,wr=18}={}) {
  if(r(3)!==0)return;
  for(let i=0;i<ctx.counts.clouds;i++)cloud(p,r,x0+r(xr),ctx.top+y0+r(yr),w0+r(wr),1);
}

// ---- buildings: the ground plane continues BEHIND the lower floors; its
// horizon must not coincide with the frontmost foot of the building. ----
function buildingGround(p,r,ctx,{perspective=false,clouds=true}={}) {
  const {traits,bounds,floor}=ctx;
  const rear=Number.isFinite(traits.groundRearScreenY)?traits.groundRearScreenY:bounds?bounds.bottom-(bounds.bottom-bounds.top+1)*.48:floor-22;
  const groundY=Math.round(rear-4-r(7));
  traits.horizonY=groundY;
  if(clouds&&r(3)===0)for(let i=0;i<ctx.counts.clouds;i++)cloud(p,r,6+r(92),ctx.top+10+r(13),16+r(18),1);
  return groundY;
}
const ridgeTop=ctx=>ctx.top+SCENE_TOP;
const BUILDING_GROUND={fill:1,edge:3,lines:0};

// ---- skyline: two layers of blocks, the far one closer to the sky ----
function skylineLayer(p,r,ctx,base,{color,windows,lit=null,litShare=0,name='skyline',far=false}) {
  const v=ctx.variation,top=ctx.top;
  let n=0;
  for(let x=far?-6+v.integer(name+'-phase',0,5):-3;x<128;n++) {
    // The near layer keeps the engine-18 draws; the far layer is named.
    const width=far?v.integer(name+'-w'+n,9,22):7+r(20);
    const room=Math.max(1,Math.min(28,base-top-16));
    const height=far?Math.min(base-top-SCENE_TOP,v.integer(name+'-h'+n,10,10+room)):7+r(room);
    const y=Math.max(top+SCENE_TOP,base-height);
    p.rect(x,y,width,base-y,color);
    if(far){x+=width+v.integer(name+'-gap'+n,0,3);continue;}
    if(r(3)===0)p.rect(x+Math.floor(width*.35),Math.max(top+SCENE_TOP,y-3),Math.max(3,Math.floor(width*.4)),3,color);
    // Windows are at least two rows tall: a 1 px window reads as a speck.
    const pitchX=5+r(4),pitchY=5+r(3),windowW=1+r(3),windowH=Math.max(2,1+r(2));
    let k=0;
    for(let wy=y+4;wy<base-3;wy+=pitchY)for(let wx=x+3;wx<x+width-windowW;wx+=pitchX,k++){
      const on=lit!=null&&v.chance(name+'-lit'+n+'-'+k,litShare);
      p.rect(wx,wy,windowW,windowH,on?lit:windows);
    }
    x+=width+2+r(4);
  }
}
function drawSkyline(p,r,ctx,base,night) {
  skylineLayer(p,r,ctx,base-ctx.variation.integer('skyline-far-drop',2,6),{color:1,far:true,name:night?'night-far':'skyline-far'});
  skylineLayer(p,r,ctx,base,{color:FAR,windows:night?0:1,lit:night?9:null,litShare:night?ctx.variation.integer('night-lit',14,26)/100:0,name:night?'night':'skyline'});
}
// The far city stands on the horizon, not at the subject's feet.
const cityBase=ctx=>Math.max(ctx.top+30,Math.min(ctx.floor-6,ctx.horizon+ctx.variation.integer('city-base',4,10)));
export function skyline(p,r,ctx) {
  if(ctx.style==='buildings'){
    const groundY=buildingGround(p,r,ctx);
    drawSkyline(p,r,ctx,groundY,false);
    ground(p,r,groundY,true,BUILDING_GROUND);
    return {horizon:groundY,floor:groundY};
  }
  const base=cityBase(ctx);
  drawSkyline(p,r,ctx,base,false);
  ground(p,r,base,true,{fill:1,edge:3,lines:0});
  return {horizon:base,floor:ctx.floor};
}
skyline.meta=meta('skyline',{foreground:'girders'});

// ---- skylineNight: the skyline with sparse lit windows, a moon and stars ----
function moon(p,ctx,base) {
  const v=ctx.variation;
  if(!v.chance('night-moon',.6))return null;
  const left=ctx.bounds?(ctx.bounds.left+ctx.bounds.right)/2>64:v.integer('night-moon-side',0,1)===1;
  const radius=v.integer('night-moon-r',4,6),x=left?v.integer('night-moon-x',12,30):v.integer('night-moon-x',98,116);
  const y=ctx.top+SCENE_TOP+radius+3+v.integer('night-moon-y',2,12);
  if(y+radius+3>=base)return null;
  plateaus(p,ctx,x,y,radius+3,radius+3,[[1,1,false],[(radius+1)/(radius+3),2],[radius/(radius+3),9,false]]);
  return {x,y,r:radius+4};
}
export function skylineNight(p,r,ctx) {
  const base=ctx.style==='buildings'?buildingGround(p,r,ctx,{clouds:false}):cityBase(ctx);
  const m=moon(p,ctx,base);
  starfield(p,r,ctx,8+r(8),(x,y)=>y>=base-30||(m&&(x-m.x)**2+(y-m.y)**2<m.r*m.r));
  drawSkyline(p,r,ctx,base,true);
  if(ctx.style==='buildings')ground(p,r,base,false,BUILDING_GROUND);
  else{
    // A street: the kerb line in 3, then the dark road with a lit band
    // through the subject's contact row.
    ground(p,r,base,false,BUILDING_GROUND);
    if(ctx.floor>base+3)floorPlane(p,base+1,ctx.floor);
  }
  return {horizon:base,floor:ctx.style==='buildings'?base:ctx.floor};
}
skylineNight.meta=meta('skylineNight',{foreground:'girders'});

// ---- hills, mist, badlands, garden, lunar: layered ridges ----
function farRidge(p,r,ctx,y,height,step) {
  return ridge(p,r,y,FAR,height,step,{rim:RIM,top:ridgeTop(ctx),sky:ctx.skyHorizon});
}
// The far and near heightfields of a ridge landscape, drawn in the engine-18
// order (far vertices, then near) before anything is painted.
function ridgeLand(r,ctx,drawn,{farY=Math.max(ctx.top+28,ctx.horizon+9),farH=23,farStep=20,nearH=10,nearStep=24}={}) {
  const y=nearLine(ctx,drawn),far=ridgeTops(r,farY,farH,farStep,ridgeTop(ctx));
  return {far,near:{y,field:ridgeTops(r,y,nearH,nearStep,ridgeTop(ctx))}};
}
export function hills(p,r,ctx) {
  if(ctx.style==='buildings'){
    const groundY=buildingGround(p,r,ctx);
    farRidge(p,r,ctx,groundY,Math.max(2,Math.min(20,groundY-ctx.top-8)),24);
    ground(p,r,groundY,false,BUILDING_GROUND);
    return {horizon:groundY,floor:groundY};
  }
  skyClouds(p,r,ctx);
  const {far,near}=ridgeLand(r,ctx,109+r(7));
  landLayers(p,ctx,far,near);
  rocks(p,r,ctx.counts.rocks,near);
  return {floor:near.y};
}
hills.meta=meta('hills',{foreground:'grass'});

// Mist: a fog plateau of 2 over the far ridge's foot, with one 50% seam row
// above and below; the fog sits below the ridge's lowest top, so its seams
// never touch the silhouette.
function fogBank(p,ctx,y,depth=4) {
  const top=ctx.top+SCENE_TOP;
  if(y-1>=top&&y-1<128)seamRow(p,y-1,0,127,2,RIM);
  if(y+depth<128&&y+depth>=top)seamRow(p,y+depth,0,127,2,RIM);
  const y0=Math.max(top,y);if(y0<128)p.rect(0,y0,128,Math.min(128,y+depth)-y0,RIM);
}
export function mist(p,r,ctx) {
  if(ctx.style==='buildings'){
    const groundY=buildingGround(p,r,ctx);
    farRidge(p,r,ctx,groundY,Math.max(2,Math.min(14,groundY-ctx.top-8)),24);
    fogBank(p,ctx,groundY-3,2);
    ground(p,r,groundY,false,BUILDING_GROUND);
    return {horizon:groundY,floor:groundY};
  }
  skyClouds(p,r,ctx);
  const {far,near}=ridgeLand(r,ctx,109+r(7));
  const placed=landLayers(p,ctx,far,near),minNear=Math.min(...near.field.tops);
  // The fog lies in the far layer's dark foot, clear of the near ground.
  if(placed){
    const lowest=Math.max(...placed.tops),depth=ctx.variation.integer('mist-depth',3,5);
    const y=Math.min(lowest+2,minNear-depth-3)-ctx.variation.integer('mist-rise',0,1);
    if(y>lowest)fogBank(p,ctx,y,depth);
  }
  rocks(p,r,ctx.counts.rocks,near);
  return {floor:near.y};
}
mist.meta=meta('mist',{foreground:'grass'});

// Badlands: flat-topped mesas with steep sides (3 or 4 rows per column),
// lit on the left edge and cap in 2, with one or two strata of 1, in front of a faint
// far ridge of 1 that rises into the dark sky.
function mesas(p,ctx,base) {
  const v=ctx.variation,top=ridgeTop(ctx),count=v.integer('mesa-count',2,3);
  for(let i=0;i<count;i++){
    const w=v.integer('mesa-w'+i,12,28),h=Math.min(base-top-2,Math.round(v.wild('mesa-h'+i,12,22,20,32))),slant=v.integer('mesa-slant'+i,3,4);
    if(h<4)continue;
    const side=Math.ceil(h/slant),total=2*side+w,x=Math.round(-6+i*140/count+v.integer('mesa-x'+i,0,22)),strata=[Math.round(h*.38),Math.round(h*.7)].slice(0,v.integer('mesa-strata'+i,1,2));
    let previous=base;
    for(let k=0;k<total;k++){
      const col=x+k,height=Math.min(h,(k+1)*slant,(total-k)*slant),yt=base-height;
      if(col>=0&&col<128){
        p.rect(col,yt,1,base-yt,FAR);
        for(const d of strata){const sy=base-h+d;if(sy>yt+1&&sy<base-1)p.dot(col,sy,1);}
        if(k<side)p.rect(col,yt,1,Math.max(1,previous-yt),RIM);
        else if(height===h)p.dot(col,yt,RIM);
      }
      previous=yt;
    }
  }
}
export function badlands(p,r,ctx) {
  skyClouds(p,r,ctx);
  // A faint far ridge of 1 against the dark sky, mesas of 3 (lit in 2)
  // standing on it, then the lit near ground in front.
  const {far,near}=ridgeLand(r,ctx,109+r(7),{farY:ctx.horizon+3,farH:12,farStep:24});
  paintRidge(p,far,FOOT,{sky:ctx.skyHorizon});
  mesas(p,ctx,Math.min(Math.min(...near.field.tops)-3,ctx.horizon+ctx.variation.integer('mesa-base',10,16)));
  landLayers(p,ctx,null,near);
  rocks(p,r,ctx.counts.rocks,near);
  return {floor:near.y};
}
badlands.meta=meta('badlands',{foreground:'rocks'});

export function garden(p,r,ctx) {
  skyClouds(p,r,ctx);
  // The plant stands on the near ground: its line sits 2 rows above the
  // plant's foot, so the lit floor runs behind and under the base.
  const y=ctx.bounds?Math.max(ctx.top+18,ctx.bounds.bottom-2):109+r(7);
  const far=ridgeTops(r,Math.max(ctx.top+22,y-7),17,20,ridgeTop(ctx));
  const near={y,field:ridgeTops(r,y,6,24,ridgeTop(ctx))};
  landLayers(p,ctx,far,near);
  // Broad, open mountain planes: no sprouts, speckles or ground pattern.
  return {floor:y};
}
garden.meta=meta('garden',{foreground:'grass'});

// Lunar: no atmosphere, so no horizon sky; stars, grey ridges, craters and
// sometimes a far world rising on the open side.
export function lunar(p,r,ctx) {
  if(ctx.style==='buildings'){
    const groundY=buildingGround(p,r,ctx,{clouds:false});
    starfield(p,r,ctx,13+r(9),(x,y)=>y>=groundY-24);
    farRidge(p,r,ctx,groundY,Math.max(2,Math.min(14,groundY-ctx.top-8)),24);
    ground(p,r,groundY,false,{fill:FOOT,edge:FAR,lines:0});
    for(let i=0;i<ctx.counts.craters;i++)crater(p,r,8+r(112),Math.max(groundY+6,110+r(14)),5+r(8));
    return {horizon:groundY,floor:groundY};
  }
  starfield(p,r,ctx,13+r(9));
  const {far,near}=ridgeLand(r,ctx,109+r(7));
  landLayers(p,ctx,far,near);
  for(let i=0;i<ctx.counts.craters;i++){
    const x=8+r(112),y=110+r(14);
    const rx=5+r(8);
    crater(underFoot(ctx,x,y,rx,Math.min(...near.field.tops),near.y+BAND)?NO_PAINT:p,r,x,y,rx,craterTones(near,y));
  }
  const v=ctx.variation;
  if(v.chance('lunar-world',.45)){
    const left=ctx.bounds?(ctx.bounds.left+ctx.bounds.right)/2>64:v.integer('lunar-world-side',0,1)===1;
    const radius=v.integer('lunar-world-r',5,8),x=left?v.integer('lunar-world-x',14,26):v.integer('lunar-world-x',102,114),y=ctx.top+SCENE_TOP+radius+4+v.integer('lunar-world-y',0,10);
    if(!blocked(ctx,x,y,radius+2))distantPlanet(p,r,x,y,radius);
  }
  return {floor:near.y};
}
lunar.meta=meta('lunar',{sky:'none',foreground:'rocks'});

// ---- battlefield: a low ruined horizon, crater-pocked ground, stakes ----
// The far layer is the ruined ridge in 3 (rim 2) on the horizon line; the
// plain in front is dark (1) far off, lit (3) in a band through the
// subject's contact row, and dark again toward the frame.
export function battlefield(p,r,ctx) {
  const {top,floor,counts}=ctx,line=Math.max(top+16,floor-17-r(9));
  ridge(p,r,line,FAR,12,24,{rim:RIM,top:ridgeTop(ctx),sky:ctx.skyHorizon});
  const [litTop,litBottom]=floorPlane(p,line+1,floor);
  // Quiet silhouettes: low damaged masonry, crater lips and leaning stakes.
  // Nothing competes with the vehicle or turns into a second foreground unit.
  for(let i=0;i<counts.ruins;i++){
    const x=Math.round(5+i*116/counts.ruins+r(8)),w=9+r(16),h=4+r(7),notch=Math.round(w*.45);
    p.poly([[x,line],[x,line-h],[x+Math.round(w*.35),line-h],[x+notch,line-h+2],[x+Math.round(w*.7),line-h+2],[x+w,line-3],[x+w,line]],RUIN);
  }
  for(let i=0;i<counts.craters;i++){
    const x=9+r(111),y=line+10+r(Math.max(1,119-line-10));
    const rx=5+r(7);
    crater(underFoot(ctx,x,y,rx,litTop,litBottom)?NO_PAINT:p,r,x,y,rx,y>=litTop&&y<=litBottom?{rim:RIM,bowl:FOOT,shade:0}:{rim:FAR,bowl:FOOT,shade:0});
  }
  // Stakes on whole-ratio leans (1:2 up, 1:1 crossbar), dark like the ruins.
  for(const x of [9+r(10),107+r(10)]){p.line(x-3,line+3,x+1,line-5,RUIN);p.line(x-2,line-2,x+2,line+2,RUIN);}
  return {floor:line};
}
battlefield.meta=meta('battlefield',{foreground:'rubble'});

// ---- stratosphere (islands): a far world's limb in the bottom 12 rows ----
// Curvature raises the centre by 1-2.5 px; each vertex step is limited to
// one pixel and drawn run-aligned, so the limb steps evenly.
function limbLine(p,points,color,top) {
  for(let i=0;i+1<points.length;i++){
    const [xa,ya]=points[i],[xb]=points[i+1],y0=Math.round(ya),y1=Math.max(y0-1,Math.min(y0+1,Math.round(points[i+1][1])));
    points[i+1][1]=y1;
    for(let x=Math.round(xa);x<Math.round(xb);x++){
      if(x<0||x>127)continue;
      const k=x-Math.round(xa),n=Math.round(xb)-Math.round(xa),y=y0+(y1!==y0&&k>=n>>1?y1-y0:0);
      const yt=Math.max(top,y);if(yt<128)p.rect(x,yt,1,128-yt,color);
    }
  }
}
function distantWorld(p,r,top) {
  const base=115+r(3),curvature=1+r(16)/10,center=56+r(17),curve=x=>curvature*((x-center)/64)**2,step=7+r(4);
  const far=[],near=[];
  for(let x=0;x<=128+step;x+=step){far.push([x,base+curve(x)-r(4)]);near.push([x,base+4+curve(x)-r(3)]);}
  limbLine(p,far,FAR,top);limbLine(p,near,1,top);
  // Broad continent/coast shapes and compressed mountain chains interrupt
  // the limb. Keep each feature a readable cluster at this enormous distance.
  const coasts=2+r(3),chains=1+r(3);
  for(let i=0;i<coasts;i++){
    const x=Math.round(3+i*118/coasts+r(7)),y=Math.round(base+5+curve(x)),w=12+r(16);
    p.poly([[x,y],[x+Math.round(w*.3),y-2],[x+Math.round(w*.7),y-1],[x+w,y+1],[x+Math.round(w*.7),y+3],[x+3,y+2]],FAR);
    p.line(x+3,y,x+Math.round(w*.45),y,2);
  }
  for(let i=0;i<chains;i++){
    const x=12+r(101),y=Math.round(base+curve(x)-1);
    p.poly([[x-7,y+1],[x-3,y-3],[x,y-1],[x+4,y-4],[x+10,y+2]],FAR);
    p.line(x-3,y-3,x-1,y-1,RIM);
  }
  // Ocean glitter stops at row 125: rows 126-127 belong to the dark frame.
  const oceanPitch=12+r(9),oceanPhase=r(oceanPitch);
  p.sample(0,124,128,2,(x,y)=>Math.floor((Math.floor(x)+oceanPhase)/oceanPitch)%3!==1&&seamPixel(Math.floor(x),Math.floor(y)===124?1:2)?FAR:null);
}
export function stratosphere(p,r,ctx) {
  distantWorld(p,r,ctx.top+SCENE_TOP);
  if(r(3)===0)cloud(p,r,8+r(88),111+r(3),15+r(15),1);
  return {floor:null};
}
stratosphere.meta=meta('stratosphere',{ground:false});

// ---- duskClouds: a low sun behind long cloud bars over a cloud sea ----
// Sky plateaus 0 -> 1 (the shared seam) -> 3 (a second 3-row seam lower
// down), a 9 sun disk with a 2 ring, cloud bars in 1 with lit 2 undersides,
// and a lumpy cloud sea of 3 with a 2 crest along the bottom.
export function duskClouds(p,r,ctx) {
  const v=ctx.variation,top=ctx.top+SCENE_TOP,glow=Math.min(118,ctx.horizon+v.integer('dusk-glow',9,15));
  for(let k=0;k<3;k++){const y=glow-1+k;if(y>=top)seamRow(p,y,0,127,k+1,FAR);}
  if(glow+2<128)p.rect(0,Math.max(top,glow+2),128,128-Math.max(top,glow+2),FAR);
  // Cloud bars: long, thin, rounded; lit from below by the low sun.
  const bars=v.integer('dusk-bars',3,5);
  for(let i=0;i<bars;i++){
    const w=v.integer('dusk-bar-w'+i,18,48),h=v.integer('dusk-bar-h'+i,2,3),x=v.integer('dusk-bar-x'+i,-10,110);
    const y=Math.max(top+4,ctx.horizon-24+Math.floor(i*36/bars)+v.integer('dusk-bar-y'+i,0,5));
    p.round(x,y,w,h,1,1);p.rect(x+2,y+h,Math.max(1,w-4),1,RIM);
  }
  // The sun sinks into the cloud sea: a 9 disk in a 2 ring, its lower part
  // hidden by the sea's lumpy crest (1, lit in 2) along the bottom rows.
  const seaTop=v.integer('dusk-sea',106,112),sunR=Math.round(v.wild('dusk-sun-r',6,9,9,13)),sunX=v.integer('dusk-sun-x',22,106);
  plateaus(p,ctx,sunX,seaTop+1-Math.round(sunR*.6),sunR+2,sunR+2,[[1,2],[sunR/(sunR+2),9,false]]);
  p.rect(0,seaTop+4,128,128-seaTop-4,1);
  for(let x=-8,i=0;x<136;i++){
    const w=v.integer('dusk-puff-w'+i,12,22),rise=v.integer('dusk-puff-h'+i,3,6),y=seaTop+4-rise;
    p.round(x,y,w,rise+6,Math.min(4,rise+1),1);p.rect(x+3,y,Math.max(1,w-6),1,RIM);
    x+=w-v.integer('dusk-puff-o'+i,3,6);
  }
  return {horizon:glow,floor:null};
}
duskClouds.meta=meta('duskClouds',{ground:false});

export const LAND_SCENES=Object.freeze({hills,mist,skyline,skylineNight,garden,lunar,badlands,battlefield,stratosphere,duskClouds});
