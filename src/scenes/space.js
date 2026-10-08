// Space scenes: no atmosphere, so no horizon sky (meta.sky 'none'). Far
// objects stay in 1/3 with small 2/9 accents; stars come in three tiers.
import {SCENE_TOP,cleanStep,dither,ellipseTest,plateaus,starfield} from './common.js';
import {noise2} from '../materials.js';

const meta=(id,extra={})=>Object.freeze({id,sky:'none',titleBand:false,ground:false,foreground:'none',...extra});

// ---- Engine-18 helpers (kept; distantPlanet gains a night-side crescent) ----
export function distantPlanet(p,r,x,y,radius) {
  const terrain=r(3),phase=r(60)/10,frequencyX=4+r(5),frequencyY=5+r(6),bandTilt=(r(31)-15)/100;
  const marks=Array.from({length:1+r(3)},()=>({x:(r(91)-45)/100,y:(r(91)-45)/100,r:.12+r(18)/100}));
  // A complete disk with clipped geography or latitude bands, lit from the
  // upper left: the lower-right crescent turns one step darker (3).
  p.ellipse(x,y,radius+1,radius+1,1);p.ellipse(x,y,radius,radius,2);
  p.sample(x-radius+1,y-radius+1,radius*2-2,radius*2-2,(px,py)=>{
    const nx=(px-x)/radius,ny=(py-y)/radius;
    if(nx*nx+ny*ny>.83)return null;
    const night=nx+ny>.42;
    if(terrain===0)return Math.sin(nx*frequencyX+phase)+Math.cos(ny*frequencyY-phase)>.5?(night?1:3):night?3:null;
    if(terrain===1)return Math.sin((ny+nx*bandTilt)*frequencyY+phase)>.2?1:night?3:null;
    return marks.some(m=>(nx-m.x)**2+(ny-m.y)**2<m.r*m.r)?1:night?3:null;
  });
  if(radius>6&&r(3)===0)p.ring(x,y+1,radius+3+r(5),2+r(3),2,1,(r(61)-30)/100);
}
export function galaxy(p,r,x,y) {
  const rx=14+r(7),ry=5+r(4),angle=(r(61)-30)/100,co=Math.cos(angle),si=Math.sin(angle);
  const arms=2+r(3),twist=(r(2)?1:-1)*(6+r(5)),turn=r(628)/100,core=2+r(2);
  const coord=(px,py)=>{const dx=px-x,dy=py-y;return [(dx*co+dy*si)/rx,(dy*co-dx*si)/ry];};
  dither(p,{x:x-rx-3,y:y-rx,w:rx*2+6,h:rx*2,color:1,density:.5,
    mask:(px,py)=>{const[u,v]=coord(px,py);return u*u+v*v<1;}});
  p.sample(x-rx-2,y-rx,rx*2+4,rx*2,(px,py)=>{
    const[u,v]=coord(px,py),distance=Math.hypot(u,v);
    return distance<.88&&Math.cos(Math.atan2(v,u)*arms+distance*twist+turn)>.65?2:null;
  });
  p.ellipse(x,y,core,2,2,angle);p.line(x-1,y,x+1,y,9);
  return {x,y,r:rx+3};
}
export function distantCraft(p,r,x,y) {
  if(r(2)) {
    const width=5+r(5),height=2+r(2),dome=2+r(3),lights=2+r(3);
    p.ellipse(x,y,width,height,2);p.ellipse(x,y-height,dome,height,1);
    p.line(x-width*.55,y+height,x+width*.55,y+height,3);
    for(let i=0;i<lights;i++)p.dot(x-width*.55+i*width*1.1/(lights-1),y,9);
    return {x,y,r:width+2};
  }
  const w=4+r(4),h=5+r(4),d=Math.ceil(w/2);
  p.poly([[x-w,y-d],[x,y-2*d],[x+w,y-d],[x+w,y+h-d],[x,y+h],[x-w,y+h-d]],2);
  p.poly([[x-w,y-d],[x,y],[x,y+h],[x-w,y+h-d]],1);
  p.poly([[x,y],[x+w,y-d],[x+w,y+h-d],[x,y+h]],3);
  p.line(x-w+1,y-d,x,y-2*d+1,9);
  if(r(2))p.line(x+2,y+1,x+w-1,y-d+2,1);
  return {x,y,r:w+h};
}

// ---- Nebula lobes: 3-5 ellipse plateaus in 1 strung along a diagonal, with
// 1 px 50% seams, a lit core plateau of 3 toward the upper left of the two
// largest lobes and, sometimes, a small hot core of 2. Lobe edges wander
// with low-frequency integer value noise (noise2), never per-pixel trig. ----
const LOBES=[[0,0,.6,.75],[.5,.32,.48,.55],[-.46,-.3,.45,.5],[.86,.52,.3,.36],[-.82,-.5,.28,.32]];
export function nebulaLobes(p,ctx,{x,y,rx,ry,bend=1,name='nebula',maxLobes=4}) {
  const v=ctx.variation,count=v.integer(name+'-lobes',3,maxLobes),top=ctx.top+SCENE_TOP,lobes=[];
  const seed=name+':'+v.integer(name+'-noise',0,9999),hot=v.chance(name+'-hot',.5);
  for(let i=0;i<count;i++){
    const [ox,oy,sx,sy]=LOBES[i],jx=v.integer(name+'-dx'+i,-3,3),jy=v.integer(name+'-dy'+i,-2,2);
    const lx=Math.round(x+bend*ox*rx+jx),ly=Math.round(y+oy*ry+jy),lrx=Math.max(4,Math.round(rx*sx)),lry=Math.max(3,Math.round(ry*sy));
    const outer=ellipseTest(lx,ly,lrx,lry),R=Math.min(lrx,lry);
    const ix=lx-Math.round(lrx*.18),iy=ly-Math.round(lry*.22);
    const inner=i<2?ellipseTest(ix,iy,Math.max(2,Math.round(lrx*.5)),Math.max(2,Math.round(lry*.5))):null;
    const core=i===0&&hot?ellipseTest(ix-1,iy-1,Math.max(2,Math.round(lrx*.2)),Math.max(2,Math.round(lry*.22))):null;
    lobes.push({outer,band:Math.round(outer.K*(1+1/R)**2),inner,innerBand:inner?Math.round(inner.K*(1+2/R)**2):0,core,box:[lx-lrx-3,ly-lry-3,lx+lrx+3,ly+lry+3]});
  }
  const x0=Math.max(0,Math.min(...lobes.map(l=>l.box[0]))),y0=Math.max(top,Math.min(...lobes.map(l=>l.box[1])));
  const x1=Math.min(127,Math.max(...lobes.map(l=>l.box[2]))),y1=Math.min(127,Math.max(...lobes.map(l=>l.box[3])));
  if(x1<x0||y1<y0)return null;
  p.sample(x0,y0,x1-x0+1,y1-y0+1,(px,py)=>{
    const X=Math.floor(px),Y=Math.floor(py),odd=(X+Y)&1;
    if(ctx.calm&&ctx.calm(X,Y))return null;
    // Warp the outer field by 0.75-1.25 with smooth noise (integer compare).
    const warp=noise2(seed,X,Y,10)+384;
    let inside=false,seam=false,lit=false,litSeam=false,hotCore=false;
    for(const l of lobes){
      const q=l.outer.at(X,Y)*warp;
      if(q<l.outer.K*512)inside=true;else if(q<l.band*512)seam=true;
      if(l.inner){const c=l.inner.at(X,Y);if(c<l.inner.K)lit=true;else if(c<l.innerBand)litSeam=true;}
      if(l.core&&l.core.at(X,Y)<l.core.K)hotCore=true;
    }
    if(inside)return hotCore?2:lit||(litSeam&&odd)?3:1;
    return seam&&odd?1:null;
  });
  return {x,y,rx:rx*1.1,ry:ry*1.1};
}
const insideAny=(objects,pad=2)=>(x,y)=>objects.some(o=>o&&((x-o.x)/((o.rx??o.r)+pad))**2+((y-o.y)/((o.ry??o.r)+pad))**2<1);

// ---- stars: the engine-18 star field and its distant features ----
export function stars(p,r,ctx) {
  const top=ctx.top,objects=[];
  const feature=r(4),side=r(2),x=side?105+r(5):18+r(7),y=top+14+r(20);
  if(feature===0||feature===3){const radius=5+r(7);distantPlanet(p,r,x,y,radius);objects.push({x,y,r:radius+1});}
  if(feature===1)objects.push(galaxy(p,r,x,Math.max(top+14,y)));
  if(feature===2||feature===3){
    // Engine-18 draws for the nebula's place and size, then named lobes.
    const nx=side?29:100,ny=top+23+r(22),rx=26+r(17),ry=12+r(10),bend=r(2)?1:-1;
    nebulaLobes(p,ctx,{x:nx,y:ny,rx,ry,bend,name:'stars-nebula'});
  }
  if(feature===1&&r(2)){const px=side?20:108,py=top+37+r(16),radius=4+r(4);distantPlanet(p,r,px,py,radius);objects.push({x:px,y:py,r:radius+1});}
  if(r(5)===0)objects.push(distantCraft(p,r,side?19:109,Math.min(107,top+51+r(18))));
  starfield(p,r,ctx,18+r(15),insideAny(objects));
}
stars.meta=meta('stars');

// ---- nebula: one large lobed cloud across the frame, plus stars ----
export function nebula(p,r,ctx) {
  const v=ctx.variation,top=ctx.top,side=v.integer('nebula-side',0,1);
  const rx=Math.round(v.wild('nebula-rx',40,54,52,66)),ry=Math.round(v.wild('nebula-ry',18,26,24,32));
  const x=side?v.integer('nebula-x',62,86):v.integer('nebula-x',42,66),y=top+SCENE_TOP+Math.round(ry*.8)+v.integer('nebula-y',4,24);
  const cloud=nebulaLobes(p,ctx,{x,y,rx,ry,bend:side?-1:1,name:'nebula',maxLobes:5});
  // A small far companion on the open side, then dim stars.
  if(v.chance('nebula-companion',.5)){
    const cx=side?v.integer('nebula-cx',14,28):v.integer('nebula-cx',100,114),cy=top+SCENE_TOP+8+v.integer('nebula-cy',0,40);
    nebulaLobes(p,ctx,{x:cx,y:cy,rx:v.integer('nebula-crx',9,14),ry:v.integer('nebula-cry',5,8),bend:side?1:-1,name:'nebula-companion',maxLobes:3});
  }
  starfield(p,r,ctx,22+r(14),cloud?(X,Y)=>((X-cloud.x)/cloud.rx)**2+((Y-cloud.y)/cloud.ry)**2<.5:null);
}
nebula.meta=meta('nebula');

// ---- eclipse: a dark disk with a corona of plateau rings ----
// Rings, outward from the disk edge: 1 px of 9, 2 px of 2, a 50% seam to 3,
// 3 px of 3, a 50% seam to 1, 3 px of 1 and a 50% seam to the 0 sky. The
// outer rings are centred 2 px toward the key light, so the corona is
// fuller on the upper left; a cross glint marks the 'diamond ring'.
export function eclipse(p,r,ctx) {
  const v=ctx.variation,top=ctx.top+SCENE_TOP,radius=Math.round(v.wild('eclipse-radius',26,36,34,44));
  const corona=13,cx=v.integer('eclipse-x',36,92),cy=top+radius+corona+v.integer('eclipse-drop',0,12);
  const sq=d=>(2*d)**2,inner=[sq(radius),sq(radius+1),sq(radius+3),sq(radius+4)],outer=[sq(radius+7),sq(radius+8),sq(radius+11),sq(radius+12)];
  const x0=Math.max(0,cx-radius-corona-2),x1=Math.min(127,cx+radius+corona+1),y0=Math.max(top,cy-radius-corona-2),y1=Math.min(127,cy+radius+corona+1);
  p.sample(x0,y0,x1-x0+1,y1-y0+1,(px,py)=>{
    const X=Math.floor(px),Y=Math.floor(py),dx=2*X+1-2*cx,dy=2*Y+1-2*cy,d=dx*dx+dy*dy,ex=dx+4,ey=dy+4,e=ex*ex+ey*ey,odd=(X+Y)&1;
    if(d<inner[0])return 0;
    if(d<inner[1])return 9;
    if(d<inner[2])return 2;
    if(d<inner[3])return odd?2:3;
    if(e<outer[0])return 3;
    if(e<outer[1])return odd?3:1;
    if(e<outer[2])return 1;
    if(e<outer[3])return odd?1:null;
    return null;
  });
  // Diamond ring: a cross glint on the rim toward the upper left.
  const gx=Math.round(cx-(radius+2)*.7071),gy=Math.round(cy-(radius+2)*.7071),arm=v.integer('eclipse-glint',3,4);
  if(gy-arm>=top&&!(ctx.calm&&ctx.calm(gx,gy))){p.line(gx-arm,gy,gx+arm,gy,9);p.line(gx,gy-arm,gx,gy+arm,9);}
  const reach=(radius+corona+2)**2;
  starfield(p,r,ctx,14+r(12),(X,Y)=>(X-cx)**2+(Y-cy)**2<reach);
  return {horizon:null};
}
eclipse.meta=meta('eclipse');

// ---- warp: tapered radial streaks on clean slopes from a vanishing point ----
const DIRS=Array.from({length:32},(_,k)=>[Math.round(64*Math.cos(Math.PI*k/16)),Math.round(64*Math.sin(Math.PI*k/16))]);
// Integer Bresenham with clipping to the scene area and the calm zone.
function segment(p,ctx,x0,y0,x1,y1,colorAt) {
  const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,n=Math.max(dx,-dy)||1,top=ctx.top+SCENE_TOP;
  let err=dx+dy,x=x0,y=y0;
  for(let k=0;;k++){
    if(x>=0&&x<128&&y>=top&&y<128&&!(ctx.calm&&ctx.calm(x,y))){const c=colorAt(k/n);if(c!=null)p.dot(x,y,c);}
    if(x===x1&&y===y1)break;
    const e2=2*err;if(e2>=dy){err+=dy;x+=sx;}if(e2<=dx){err+=dx;y+=sy;}
  }
}
export function warp(p,r,ctx) {
  const v=ctx.variation,b=ctx.bounds;
  const vx=b?Math.round((b.left+b.right+1)/2):64,vy=b?Math.round((b.top+b.bottom+1)/2):Math.round((ctx.top+128)/2);
  // A faint tunnel glow behind the subject: one plateau of 1, 1 px seam.
  plateaus(p,ctx,vx,vy,v.integer('warp-glow-rx',18,26),v.integer('warp-glow-ry',14,20),[[1,1]]);
  const n=v.integer('warp-streaks',20,28),spin=v.integer('warp-spin',0,31);
  for(let i=0;i<n;i++){
    const k=(spin+Math.floor(i*32/n)+v.integer('warp-jitter'+i,0,1))&31,[qx,qy]=cleanStep(DIRS[k][0],DIRS[k][1]);
    const unit=Math.max(Math.abs(qx),Math.abs(qy));
    if(!unit)continue;
    const d0=v.integer('warp-in'+i,16,32),length=Math.round(v.wild('warp-length'+i,22,52,40,80));
    const m0=Math.ceil(d0/unit),m1=m0+Math.max(1,Math.ceil(length/unit));
    const x0=vx+qx*m0,y0=vy+qy*m0,x1=vx+qx*m1,y1=vy+qy*m1,bright=i%3===0;
    // Thin and dim at the inner end, a 2 px outer half, 9 tips on every third.
    segment(p,ctx,x0,y0,x1,y1,t=>t<.3?3:bright&&t>.78?9:2);
    const mx=Math.round(x0+(x1-x0)*.55),my=Math.round(y0+(y1-y0)*.55),[ox,oy]=Math.abs(qx)>=Math.abs(qy)?[0,1]:[1,0];
    segment(p,ctx,mx+ox,my+oy,x1+ox,y1+oy,t=>bright&&t>.5?9:2);
  }
  starfield(p,r,ctx,10+r(8));
  return {horizon:null};
}
warp.meta=meta('warp');

// ---- planetLimb: a huge world's curved horizon below the subject ----
// An ellipse centred below the frame, its lit upper-left arc rimmed in 9
// then 2 (atmosphere), the body in 3 with latitude bands of 1 that follow
// the limb, and a night side of 1 beyond a curved terminator: the edge of
// the same ellipse shifted toward the key light, with a 1 px 50% seam.
export function planetLimb(p,r,ctx) {
  const v=ctx.variation,top=ctx.top+SCENE_TOP;
  const limbTop=Math.round(v.wild('limb-top',86,100,70,88)),rx=v.integer('limb-rx',96,150),ry=v.integer('limb-ry',46,80);
  const cx=v.integer('limb-x',20,108),cy=limbTop+ry,limb=ellipseTest(cx,cy,rx,ry);
  const shell=s=>Math.round(limb.K*s),rim1=shell((1-1.2/ry)**2),rim2=shell((1-3.2/ry)**2),haze=shell((1+1.6/ry)**2);
  const bands=[v.integer('limb-band0',84,90),v.integer('limb-band1',70,78)].map(b=>[shell((b/100)**2),shell(((b-2.6)/100)**2)]);
  const shift=v.integer('limb-terminator',30,70)/100,light=ellipseTest(cx-Math.round(rx*shift),cy-Math.round(ry*.35),rx,ry);
  const seamBand=Math.round(light.K*(1+1.4/ry)**2);
  const y0=Math.max(top,limbTop-2);
  p.sample(0,y0,128,128-y0,(px,py)=>{
    const X=Math.floor(px),Y=Math.floor(py),q=limb.at(X,Y),l=light.at(X,Y),odd=(X+Y)&1;
    const night=l>=seamBand||(l>=light.K&&odd);
    if(q>=limb.K)return q<haze&&!night&&odd?1:null;
    if(q>=rim1)return night?1:l<light.K*.9?9:2;
    if(q>=rim2)return night?1:2;
    if(night)return 1;
    for(const [hi,lo] of bands)if(q<hi&&q>=lo)return 1;
    return 3;
  });
  starfield(p,r,ctx,18+r(12),(X,Y)=>Y>=limbTop-3);
  return {horizon:limbTop};
}
planetLimb.meta=meta('planetLimb');

export const SPACE_SCENES=Object.freeze({stars,nebula,eclipse,warp,planetLimb});
