// Shared scenery helpers. Scenes paint only the background roles 0,1,2,3,9
// (dark to light: 0 -> 1 -> 3 -> 2 -> 9) and start at row top+3. Depth is a
// value plan on that ramp: the sky in 0/1, far layers one or two steps above
// it with a darker foot, and the near ground lit (3, rim 2) where the subject
// stands, so every overlap has a value step in every mood. Large areas never
// sit in 0 low in the frame, because one vignette step turns 0 into ink.
// Per-pixel code is integer arithmetic: no trigonometry inside samplers.
import {dither} from '../materials.js';

/** First row a scene may paint below the title band. */
export const SCENE_TOP=3;
/** One step lighter along the background chain 0 -> 1 -> 3 -> 2 -> 9. */
export const LIT={0:1,1:3,3:2,2:9,9:9};

/** The engine-18 horizon draws: horizon=77+r(17), then r(13), which is
 * consumed but unused so later scenery draws stay aligned with engine 18. */
export function horizonDraws(r) {
  const horizon=77+r(17);r(13);
  return horizon;
}

// One row of an ordered seam in a 4-px period: level 1 = 25%, 2 = 50%,
// 3 = 75%. The patterns interleave, so stacked rows read as one ramp.
export function seamPixel(x,level) {
  const k=x&3;
  return level>=4||(level===3?k!==2:level===2?(k&1)===0:level===1&&k===1);
}
export function seamRow(p,y,x0,x1,level,color) {
  if(level<=0)return;
  if(level>=4){p.rect(x0,y,x1-x0+1,1,color);return;}
  p.sample(x0,y,x1-x0+1,1,(px)=>seamPixel(Math.floor(px),level)?color:null);
}

/** The sky: flat 0 above the horizon, a 3-row seam (one row each of 25, 50
 * and 75% of 1 at horizon-1, horizon and horizon+1) and solid 1 below. It
 * returns the horizon. Nothing is painted above top+3. */
export function sky(p,r,top) {
  const horizon=horizonDraws(r);
  skyRows(p,top,horizon,1);
  return horizon;
}
export function skyRows(p,top,horizon,color) {
  const y0=top+SCENE_TOP;
  for(let k=0;k<3;k++){const y=horizon-1+k;if(y>=y0&&y<128)seamRow(p,y,0,127,k+1,color);}
  const below=Math.max(y0,horizon+2);
  if(below<128)p.rect(0,below,128,128-below,color);
}

// Clean ridge slopes as [rise, run]: flat, 1:4, 1:3 and 1:2.
const RIDGE_SLOPES=[[0,1],[1,4],[1,3],[1,2]];
/** The heightfield of ridge() without painting: {tops (Int16Array(128)),
 * lit (rising, light-facing columns), top}. One r(height) draw per vertex,
 * as in engine 18, so a scene can lay out several ridges before it paints
 * them and keep the same draw order. */
export function ridgeTops(r,y,height=12,step=16,top=0) {
  y=Math.round(y);
  const lo=y-Math.max(1,height)+1,tops=new Int16Array(128),lit=new Uint8Array(128);
  let x=0,cur=y-r(height);
  while(x<128){
    const target=y-r(height),d=target-cur,want=Math.abs(d)/step;
    let best=0;
    for(let i=1;i<RIDGE_SLOPES.length;i++)if(Math.abs(RIDGE_SLOPES[i][0]/RIDGE_SLOPES[i][1]-want)<Math.abs(RIDGE_SLOPES[best][0]/RIDGE_SLOPES[best][1]-want))best=i;
    const [rise,run]=RIDGE_SLOPES[best],n=rise?Math.max(1,Math.round(step/run)):0,dx=rise?n*run:step;
    let dy=rise*n*Math.sign(d);
    if(cur+dy<lo||cur+dy>y)dy=cur-dy>=lo&&cur-dy<=y?-dy:0;
    for(let k=0;k<dx&&x+k<128;k++){
      // Run-aligned: a rising segment steps after each full run, a falling one too.
      const off=dy?Math.sign(dy)*Math.floor(k*Math.abs(dy)/dx):0;
      tops[x+k]=Math.max(top,cur+off);lit[x+k]=dy<0?1:0;
    }
    x+=dx;cur+=dy;
  }
  return {tops,lit,top};
}
/** Raise a heightfield by `dy` whole rows (every slope stays clean); tops
 * stop at `limit`, where the ridge becomes a flat plateau. */
export function liftTops(field,dy,limit=field.top) {
  if(!(dy>0))return field;
  return {...field,tops:field.tops.map(t=>Math.max(limit,t-dy)),top:Math.max(field.top,limit)};
}
/** Paint a heightfield filled to the bottom in `color`, as ridge() does. */
export function paintRidge(p,{tops,lit,top},color,{rim=null,sky=null}={}) {
  for(let i=0;i<128;i++)if(tops[i]<128)p.rect(i,tops[i],1,128-tops[i],color);
  if(rim!=null)for(let i=0;i<128;i++)if(lit[i]&&tops[i]<128&&tops[i]>top)p.dot(i,tops[i],rim);
  if(Number.isFinite(sky)&&sky-1>=top)for(let i=1;i<127;i++)
    if(seamPixel(i,1)&&tops[i]>=sky&&tops[i]<=sky+1&&tops[i-1]<=sky&&tops[i+1]<=sky)p.dot(i,sky-1,0);
}
/** A ridge silhouette from row y up to `height` px, filled to the bottom.
 * Each segment snaps its slope to 0, 1/4, 1/3 or 1/2 (rise over run) with a
 * run-aligned length, so every staircase steps evenly. One r(height) draw per
 * vertex, as in engine 18. With `rim`, the top pixel of every rising
 * (light-facing, toward the upper left) segment takes that colour. With
 * `sky` (the painted horizon), a 25% seam dot that would rest alone on the
 * ridge's top row is not drawn (the sky's 0 is put back), so the seam never
 * leaves specks on a silhouette. Returns the column tops (Int16Array(128)). */
export function ridge(p,r,y,color,height=12,step=16,{rim=null,top=0,sky=null}={}) {
  const field=ridgeTops(r,y,height,step,top);
  paintRidge(p,field,color,{rim,sky});
  return field.tops;
}

/** One step darker along the background chain 9 -> 2 -> 3 -> 1 -> 0. */
export const SHADE=Object.freeze({0:0,1:0,3:1,2:3,9:2});
// The 2-row seams below are the sky's ordered 4-px patterns (seamPixel):
// 75% then 25% of the upper tone. The two rows interleave, so they read as
// a ramp at 1x with no checker windows and no lone pixels.
const fadeLit=(x,k)=>seamPixel(x,k?1:3);

/** The near ground as a lit stage floor (cover-art.md rule 1: the key light
 * falls on the floor). Each column runs from its top to row y+band in `lit`
 * (3), light-facing top pixels take `rim` (2), then a 2-row 75/25% seam leads
 * into `dark` (1) down to the bottom. Nothing is 0, so the stage's contact
 * shadow (two DARKER steps: 3 -> 1 -> 0) reads on the floor and one vignette
 * step never turns the ground to ink. Returns the first solid dark row. */
export function groundBand(p,field,y,{band=5,lit=3,rim=2,dark=1}={}) {
  // A seam that would fall on the frame rings is left out: the band then
  // runs to the bottom and the stage vignette and frame pass darken it.
  const {tops,lit:rising,top}=field,fade=Math.round(y)+band+1>122?128:Math.round(y)+band+1;
  for(let x=0;x<128;x++){
    const t=tops[x];
    if(t>=128)continue;
    const a=Math.min(128,Math.max(t,fade));
    if(a>t)p.rect(x,t,1,a-t,lit);
    for(let yy=Math.max(t+1,fade);yy<fade+2&&yy<128;yy++)p.dot(x,yy,fadeLit(x,yy-fade)?lit:dark);
    const b=Math.max(t+1,fade+2);
    if(b<128)p.rect(x,b,1,128-b,dark);
    if(rim!=null&&rising[x]&&t>top&&t<fade)p.dot(x,t,rim);
  }
  return fade+2;
}
/** The tone groundBand paints at row yy (null on its seam rows). */
export function bandTone(yy,y,{band=5,lit=3,dark=1}={}) {
  const fade=Math.round(y)+band+1>122?128:Math.round(y)+band+1;
  return yy<fade?lit:yy>=fade+2?dark:null;
}
// A flat ground plane from row y0: dark (1), with a lit (3) band from
// `above` rows over to `below` rows under the contact row, each side
// through a 2-row 25/75% seam. Returns the lit rows [first, last].
export function floorPlane(p,y0,floor,{above=6,below=4}={}) {
  y0=Math.round(y0);floor=Math.round(floor);
  const a=Math.max(y0,floor-above),b=floor+below+2>124?127:floor+below;
  if(y0<128)p.rect(0,y0,128,128-y0,1);
  if(b>=a)p.rect(0,a,128,b-a+1,3);
  for(const [yy,k] of [[a-2,1],[a-1,0],[b+1,0],[b+2,1]])if(yy>=y0&&yy<128&&(yy<a||yy>b))
    p.sample(0,yy,128,1,px=>fadeLit(Math.floor(px),k)?3:null);
  return [a,b];
}
/** The foot of a far layer fading into the dark ground in front of it: from
 * row f a 2-row 75/25% seam of the layer's `color` into `dark`, then solid
 * `dark`, always below each column's own top pixel. */
export function farFoot(p,field,f,color,dark=1) {
  const {tops}=field;
  for(let x=0;x<128;x++){
    const t=tops[x];
    if(t>=128)continue;
    for(let yy=Math.max(t+1,f);yy<f+2&&yy<128;yy++)p.dot(x,yy,fadeLit(x,yy-f)?color:dark);
    const b=Math.max(t+1,f+2);
    if(b<128)p.rect(x,b,1,128-b,dark);
  }
}

/** Soft cloud of rounded lobes (unchanged from engine 18; the mascot uses it). */
export function cloud(p,r,x,y,w,color=1) {
  const h=3+r(3),lobes=2+r(3),step=w/(lobes+1);
  p.round(x,y,w,h,2,color);
  for(let i=0;i<lobes;i++){
    const rise=2+r(4),span=step*(1.1+r(5)/10),cx=x+step*(i+1);
    p.round(cx-span/2,y-rise,span,rise+h,Math.min(3,rise),color);
  }
}

/** The calm title zone (ctx.calm: the title footprint grown by 3) grown by
 * `pad` more pixels (Chebyshev), as a Uint8Array(128*128) over rows up to
 * maxRow + pad, or null when nothing is calm. Scenes keep busy texture and
 * the light roles 2 and 9 out of it (cover-art.md: a calm, dark area round
 * the title, with no busy detail near it). */
export function calmMask(ctx,pad=2,maxRow=127) {
  if(!ctx.calm)return null;
  const N=128,rows=Math.min(127,Math.round(maxRow)+pad),base=new Uint8Array(N*N);
  let any=false;
  for(let y=0;y<=rows;y++)for(let x=0;x<N;x++)if(ctx.calm(x,y)){base[y*N+x]=1;any=true;}
  if(!any)return null;
  const wide=new Uint8Array(N*N),out=new Uint8Array(N*N);
  for(let y=0;y<=rows;y++)for(let x=0;x<N;x++)if(base[y*N+x])
    for(let k=Math.max(0,x-pad);k<=Math.min(N-1,x+pad);k++)wide[y*N+k]=1;
  for(let y=0;y<=rows;y++)for(let x=0;x<N;x++)if(wide[y*N+x])
    for(let k=Math.max(0,y-pad);k<=Math.min(N-1,y+pad);k++)out[k*N+x]=1;
  return out;
}
/** {left, right, top, bottom} of mask pixels within rows y0..y1 and columns
 * x0..x1, or null when there are none. */
export function maskSpan(mask,y0,y1,x0=0,x1=127) {
  if(!mask)return null;
  let left=128,right=-1,top=128,bottom=-1;
  for(let y=Math.max(0,Math.round(y0));y<=Math.min(127,Math.round(y1));y++)
    for(let x=Math.max(0,Math.round(x0));x<=Math.min(127,Math.round(x1));x++)if(mask[y*128+x]){
      if(x<left)left=x;
      if(x>right)right=x;
      if(y<top)top=y;
      bottom=y;
    }
  return right<0?null:{left,right,top,bottom};
}

/** True when (x,y) +- pad lies inside the subject bounds or a calm pixel. */
export function blocked(ctx,x,y,pad=0) {
  const b=ctx.bounds;
  if(b&&x>=b.left-2-pad&&x<=b.right+2+pad&&y>=b.top-2-pad&&y<=b.bottom+2+pad)return true;
  if(ctx.calm){
    if(ctx.calm(x,y))return true;
    if(pad&&(ctx.calm(x-pad,y)||ctx.calm(x+pad,y)||ctx.calm(x,y-pad)||ctx.calm(x,y+pad)))return true;
  }
  return y<ctx.top+SCENE_TOP+pad;
}

/** Star tiers: dim singles in 2, a bright single in 9 every `brightEvery`,
 * and a cross glint (arms in 2, core 9) every `crossEvery`. The draws match
 * engine 18; stars in the calm title zone, inside the subject bounds + 2 or
 * where `avoid(x,y)` holds are skipped (their draws are still consumed). */
export function starfield(p,r,ctx,n,avoid=null) {
  const top=ctx.top,brightEvery=5+r(6),crossEvery=11+r(8),phase=r(crossEvery);
  for(let i=0;i<n;i++){
    const x=5+r(118),y=top+5+r(Math.max(1,116-top));
    const cross=(i+phase)%crossEvery===0,arm=cross?1+r(2):0;
    if(blocked(ctx,x,y,arm)||(avoid&&avoid(x,y)))continue;
    if(cross){p.line(x-arm,y,x+arm,y,2);p.line(x,y-arm,x,y+arm,2);p.dot(x,y,9);}
    else p.dot(x,y,i%brightEvery?2:9);
  }
}

/** Engine-18 crater draws: a raised rim around a shallow bowl, with a
 * shadow line on the bowl's upper-left inner wall (light comes from the
 * upper left). The default tones (rim 3, bowl 1, shadow 0) suit the dark
 * (1) ground; on the lit (3) floor the rim takes 2. */
export function crater(p,r,x,y,rx,{rim=3,bowl=1,shade=0}={}) {
  const ry=Math.max(2.2,rx*(.25+r(12)/100)),lip=1+r(2),offset=r(3)-1;
  p.ellipse(x,y,rx,ry,rim);p.ellipse(x+offset,y,Math.max(2,rx-lip),Math.max(1,ry-1),bowl);
  const x1=x-1-r(3);if(ry>=2&&x1>x-rx+lip+1)p.line(x-rx+lip+1,Math.round(y-ry+2),x1,Math.round(y-ry+2),shade);
}

// A flat floor plane with its far edge; perspective rows and fan lines step
// on clean slopes (each fan line keeps an exact whole ratio).
export function ground(p,r,floor,perspective=false,{fill=3,edge=2,lines=1}={}) {
  floor=Math.round(floor);
  p.rect(0,floor,128,128-floor,fill);p.line(0,floor,127,floor,edge);
  if(perspective){
    const rowStep=6+r(5),columnStep=25+r(15),vanishingX=54+r(21),convergence=.6+r(21)/100;
    for(let y=floor+4+r(4);y<128;y+=rowStep)p.line(0,y,127,y,lines);
    const depth=128-floor;
    for(let x=-48;x<190;x+=columnStep){
      const sx=Math.round(vanishingX+(x-vanishingX)*convergence);
      cleanLine(p,sx,floor+1,x-sx,depth,lines);
    }
  }
}

// Whole ratios p:q for clean lines (the transposes are the same set).
const CLEAN=[[0,1],[1,8],[1,6],[1,4],[1,3],[1,2],[2,3],[1,1]];
/** The integer step [qx,qy] (minor over major a whole ratio) nearest the
 * direction (dx,dy); the major axis keeps its sign. */
export function cleanStep(dx,dy) {
  const ax=Math.abs(dx),ay=Math.abs(dy),major=Math.max(ax,ay);
  if(!major)return [0,0];
  const want=Math.min(ax,ay)/major;
  let best=0;
  for(let i=1;i<CLEAN.length;i++)if(Math.abs(CLEAN[i][0]/CLEAN[i][1]-want)<Math.abs(CLEAN[best][0]/CLEAN[best][1]-want))best=i;
  const [a,b]=CLEAN[best],sx=dx<0?-1:1,sy=dy<0?-1:1;
  return ax>=ay?[sx*b,sy*a]:[sx*a,sy*b];
}
/** A 1 px line from (x0,y0) toward (dx,dy), snapped to a whole ratio and
 * extended to a whole number of steps, so its runs are all equal. */
export function cleanLine(p,x0,y0,dx,dy,color) {
  const [qx,qy]=cleanStep(dx,dy),major=Math.max(Math.abs(dx),Math.abs(dy)),unit=Math.max(Math.abs(qx),Math.abs(qy));
  if(!unit)return;
  const n=Math.ceil(major/unit);
  p.line(x0,y0,x0+qx*n,y0+qy*n,color);
}

/** Pixel-centre ellipse test in integer arithmetic: 2x coordinates, so a
 * centre on a pixel corner or centre stays exact. Returns q scaled so that
 * q < K means inside, with K = (2rx*2ry)^2. */
export function ellipseTest(cx,cy,rx,ry) {
  const ax=Math.round(2*cx),ay=Math.round(2*cy),rx2=4*rx*rx,ry2=4*ry*ry,K=rx2*ry2;
  return {K,rx2,ry2,at:(x,y)=>{const dx=2*x+1-ax,dy=2*y+1-ay;return dx*dx*ry2+dy*dy*rx2;}};
}

/** Plateau rings around an ellipse, rings=[[scale,color,seam=true],...] from
 * the outside in. Each ring fills inside scale x radii; with a seam, a 1 px
 * band just outside its edge takes the ring colour on a 50% checker. All
 * per-pixel work is integer (2x pixel-centre coordinates). */
export function plateaus(p,ctx,cx,cy,rx,ry,rings,{clip=null,minY=ctx.top+SCENE_TOP}={}) {
  const outer=rings[0][0],y0=Math.max(minY,0,Math.floor(cy-ry*outer-2));
  const x0=Math.max(0,Math.floor(cx-rx*outer-2)),x1=Math.min(127,Math.ceil(cx+rx*outer+2)),y1=Math.min(127,Math.ceil(cy+ry*outer+2));
  const tests=rings.map(([s,color,seam=true])=>{
    const t=ellipseTest(cx,cy,rx*s,ry*s),R=Math.max(1,Math.min(rx,ry)*s);
    return {...t,color,band:seam?Math.round(t.K*(1+1/R)**2):0};
  });
  if(x1<x0||y1<y0)return;
  p.sample(x0,y0,x1-x0+1,y1-y0+1,(px,py)=>{
    const x=Math.floor(px),y=Math.floor(py);
    if(clip&&!clip(x,y))return null;
    let color=null;
    for(const t of tests){
      const q=t.at(x,y);
      if(q<t.K||(q<t.band&&((x+y)&1)))color=t.color;
    }
    return color;
  });
}

/** 50% checker of `color` over a rectangle (a seam band). */
export function checker(p,x,y,w,h,color,parity=0) {
  p.sample(x,y,w,h,(px,py)=>((Math.floor(px)+Math.floor(py)+parity)&1)?color:null);
}

export {dither};
