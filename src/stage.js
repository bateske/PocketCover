// Engine-19 stage and frame passes (package E7 owns this module). Both take
// the engine's hook context (engine-contract 1.2) and edit `ctx.indices` in
// place. They never paint a colour of their own: every change steps an
// existing index through the fixed role tables (roles.js DARKER / LIGHTER),
// so the stage can never produce title colour 12, and it never lightens into
// cream from another role (LIGHTER[7]=7, LIGHTER[10]=10). The one exception
// is the recipe-requested contact `line`, which is the DARKER fixpoint, ink 4.
//
// Geometry is integer-friendly, as on the device: centres sit on the half-
// pixel grid (doubled coordinates), squared normalized distances are Q8
// integers (256 = on the boundary), the vignette's superellipse radius^4 is
// Q10, and every plateau boundary gets a 2 px checker seam on flat background;
// across a scene colour edge the seam cuts hard (seamParity). No sqrt, no
// atan2 per pixel. Nothing here touches the subject layer or the title.
//
// The vignette hugs the FRAME, not a lens: a superellipse of exponent 4 (a
// rounded rectangle) with its own semi-axis toward each side, dealt per cover
// from VIGNETTE_SHAPES. Its long top semi-axis keeps the title band open, so
// only corners and edges fall off. A title shield (the calm mask, filled per
// row) holds one flat vignette value, and the vignette may rise again only
// one step per 2 px from it, so no vignette seam comes within 3 px of the
// title. Light moods and radial stages or scenes get one corner-only step.
import {DARKER,LIGHTER} from './roles.js';
import {luma,oklch} from './palette.js';
import {noise2} from './materials.js';
import {scanPolygon} from './strokes.js';
import {SCENES} from './backgrounds.js';

const SIZE=128,N=SIZE*SIZE,TRANSPARENT=255,FIRST_MARKER=253;
const Q=256,VQ=1024,FAR=31;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;

/** Kinds of key light, in mood-spec order (palette.js MOODS[m].stage.kinds). */
export const STAGE_KINDS=Object.freeze(['pool','spot','blaze','flat']);
/** Vignette shapes, dealt by the named draw 'vignette': a superellipse of
 * exponent 4 about (VIGNETTE.x leaning toward the light, y) with semi-axes
 * [left, right, top, bottom] in px. corners: corners only; floor: the bottom
 * rows and corners; sides: the left and right bands and corners. */
export const VIGNETTE_SHAPES=Object.freeze({
  corners:Object.freeze({y:60,axes:Object.freeze([68,68,82,72])}),
  floor:Object.freeze({y:58,axes:Object.freeze([76,76,86,60])}),
  sides:Object.freeze({y:62,axes:Object.freeze([60,60,86,78])}),
});
/** Vignette: centre x 63.5, leaning `lean` of the way toward the light
 * centre (at most `maxLean` px); superellipse radii for the -1, -2, -3 steps; `corner` is the one
 * radius light moods and radial stages use (corners only). */
export const VIGNETTE=Object.freeze({x:63.5,lean:.25,maxLean:4,steps:Object.freeze([.92,1,1.08]),corner:.97});
/** Shape weights per mood (default row otherwise); light moods use corners. */
export const VIGNETTE_WEIGHTS=Object.freeze({
  default:Object.freeze({corners:3,floor:2,sides:2}),
  dusk:Object.freeze({corners:2,floor:3,sides:1}),
  infernal:Object.freeze({corners:2,floor:3,sides:1}),
  neon:Object.freeze({corners:2,floor:1,sides:3}),
});
/** Scenes that are already radial: the stage adds no blaze and one corner step. */
export const RADIAL_SCENES=Object.freeze(['sunburst','warp']);
/** Frame-pass luma limits for ring 0 (x or y 0/127) and ring 1 (1/126). */
export const FRAME_LIMITS=Object.freeze([.45,.55]);

// One index stepped `s` times through LIGHTER (s > 0) or DARKER (s < 0).
// Values outside the role tables (never expected) pass through untouched.
function step(c,s,lighter=LIGHTER) {
  if(c>=DARKER.length)return c;
  if(s>0)for(;s>0;s--)c=lighter[c];else for(;s<0;s++)c=DARKER[c];
  return c;
}
const hueGap=(a,b)=>{const d=Math.abs(a-b)%360;return d>180?360-d:d;};
/** LIGHTER for this palette: background light 2 -> 9 only when role 9 stays
 * in the background family (OKLCh hue within 40 degrees of role 2, or either
 * is near-neutral); otherwise lightening stops at 2 (dusk's ochre glow). */
export function stageLighter(palette) {
  if(!palette||palette.length<10)return LIGHTER;
  const [,c2,h2]=oklch(palette[2]),[,c9,h9]=oklch(palette[9]);
  if(c2<.02||c9<.02||hueGap(h2,h9)<=40)return LIGHTER;
  const lut=LIGHTER.slice();lut[2]=2;
  return lut;
}

// Q8 squared-distance band around a boundary at normalized radius^2 `t`:
// [lo, hi, mid]; pixels with lo < d2 < hi are seam pixels, d2 <= lo is
// inside, >= hi outside, and mid is the hard boundary.
function seamBand(t,invR) {
  const mid=Math.round(t*Q);
  if(!(invR>0))return [mid-1,mid,mid];
  const rho=Math.sqrt(t);
  return [Math.floor(Q*Math.max(0,rho-invR)**2),Math.ceil(Q*(rho+invR)**2),mid];
}
// 1 inside, 0 outside; in the seam band the checker parity `par`, or for a
// pixel on a scene colour edge (par < 0) the hard boundary.
const inside=(d2,band,par)=>d2<=band[0]?1:d2>=band[1]?0:par<0?(d2<band[2]?1:0):par;

/** Seam parity per pixel of the scene under the stage: (x+y)&1 where the
 * pixel and its 4 neighbours share one colour, -1 on a colour edge. Seams
 * checker only flat areas: across a scene line or an existing dither they cut
 * hard, so no lone pixels or checker-on-checker appear at the junctions. */
export function seamParity(indices) {
  const par=new Int8Array(N);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const i=y*SIZE+x,c=indices[i];
    const edge=(x>0&&indices[i-1]!==c)||(x<SIZE-1&&indices[i+1]!==c)||(y>0&&indices[i-SIZE]!==c)||(y<SIZE-1&&indices[i+SIZE]!==c);
    par[i]=edge?-1:(x+y)&1;
  }
  return par;
}

// Q8 squared normalized distance of pixel (x,y) from an ellipse centred at
// doubled coordinates (c2x, c2y) with radii rx, ry (pixel i sits at i).
function ellipseQ8(x,y,c2x,c2y,rx,ry) {
  const dx=2*x-c2x,dy=2*y-c2y;
  return Math.floor((dx*dx*ry*ry+dy*dy*rx*rx)*Q/(4*rx*rx*ry*ry));
}

// 1 inside, 0 outside an ellipse of any aspect, the checker parity `par`
// within 1 px of its boundary. The band is measured with the local gradient
// of d^2, so the seam is 2 px wide along a flat ellipse's top and at its ends
// alike (m = d^2 - 1 against |grad d^2|; no sqrt).
function ellipseSeam(x,y,c2x,c2y,rx,ry,par) {
  const dx=(2*x-c2x)/2,dy=(2*y-c2y)/2,ux=dx/(rx*rx),uy=dy/(ry*ry);
  const m=dx*ux+dy*uy-1,g=4*(ux*ux+uy*uy);
  if(m*m>=g)return m<0?1:0;
  return par<0?(m<0?1:0):par;
}

/** Q10 superellipse radius^4, |u|^4 + |v|^4, of pixel (x,y) about doubled
 * centre (v2x, v2y) with semi-axes [left, right, top, bottom]. All products
 * stay inside 32 bits. */
export function vignetteQ10(x,y,v2x,v2y,axes) {
  const dx=2*x-v2x,dy=2*y-v2y;
  const u=Math.floor(Math.abs(dx)*VQ/(2*(dx<0?axes[0]:axes[1]))),w=Math.floor(Math.abs(dy)*VQ/(2*(dy<0?axes[2]:axes[3])));
  const u2=(u*u)>>10,w2=(w*w)>>10;
  return (u2*u2+w2*w2)>>10;
}
// Q10 radius^4 seam band [lo, hi, mid] for radius t and a 1 px half-width
// 1/a: the superellipse's gradient is within 16% of 1/a everywhere, so the
// seam is about 2 px wide on edges and corners alike.
function vignetteBand(t,invA) {
  return [Math.floor(VQ*Math.max(0,t-invA)**4),Math.ceil(VQ*(t+invA)**4),Math.round(VQ*t**4)];
}

/** Blaze wedge 0..11 of a direction. Boundaries lie on the axes and the 1:2
 * and 2:1 diagonals only, so every ray edge is a clean pixel slope (equal
 * 30-degree sectors would step 1-2-2-1). Wedge 0 starts at +x and the index
 * grows toward +y (clockwise on screen); a 180-degree turn keeps parity. */
export function blazeWedge(dx,dy) {
  if(!dx&&!dy)return 0;
  const ax=Math.abs(dx),ay=Math.abs(dy),s=2*ay<ax?0:2*ax<ay?2:1;
  if(dx>0&&dy>=0)return s;
  if(dx<=0&&dy>0)return 5-s;
  if(dx<0&&dy<=0)return 6+s;
  return 11-s;
}

// Title rows end: the largest of the layout and title-art extents.
function titleExtent(ctx) {
  let e=-1;
  for(const v of [ctx.layout?.extent,ctx.titleArt?.extent,ctx.layout?.bottom])if(finite(v))e=Math.max(e,v);
  return e<0?0:e;
}
const groundedOf=ctx=>typeof ctx.screen?.grounded==='boolean'?ctx.screen.grounded:ctx.traits?.grounded===true;
const validBounds=b=>b&&['left','top','right','bottom'].every(key=>finite(b[key]))&&b.right>=b.left&&b.bottom>=b.top?b:null;
/** The subject's body box {left,top,right,bottom} (inclusive), or null: the
 * opaque pixels of ctx.layer only. Darken markers (253/254) are shadows, so
 * a shadow never moves the light or the contact shadow. Falls back to
 * ctx.bounds when there is no separate subject layer. */
export function bodyBounds(ctx) {
  const layer=ctx.layer;
  if(!(layer instanceof Uint8Array)||layer===ctx.indices||layer.length!==N)return validBounds(ctx.bounds);
  let left=SIZE,top=SIZE,right=-1,bottom=-1;
  for(let i=0;i<N;i++)if(layer[i]<FIRST_MARKER){
    const x=i%SIZE,y=(i-x)/SIZE;
    if(x<left)left=x;
    if(x>right)right=x;
    if(y<top)top=y;
    bottom=y;
  }
  return right<0?null:{left,top,right,bottom};
}
const boundsOf=bodyBounds;

/** Rows the calm band adds below calmTop at column x: a shallow arch, flat
 * for 25 px either side of the centre and 6 rows deeper at the edges, with
 * run lengths that only shrink outward (a clean curve). */
export const calmArch=x=>Math.floor((2*x-127)**2/2600);

// The scene under the stage, from the scenery sink: its name, whether it has
// a ground plane (scene meta), and whether it is already radial.
function sceneOf(ctx) {
  const name=typeof ctx.scenery?.name==='string'?ctx.scenery.name:null,meta=name?SCENES[name]?.meta:null;
  return {name,ground:meta?meta.ground!==false:null,radial:!!name&&RADIAL_SCENES.includes(name)};
}

/**
 * The stage plan for one cover, or null when there is no mood stage (legacy,
 * compat, or a context without a look). It reads only named `stageVariation`
 * draws, so review tools can recompute it.
 * - kind: weighted 'stage' over the mood's kinds, blaze and spot x (1 + w);
 *   no blaze over a ground scene (except the void alcove) or a radial scene,
 *   and no pool over a radial scene (its weight moves to the spot on a dark
 *   mood, to flat on a light one).
 * - centre: screen.focal, else the subject box centre moved by (-.12w, -.15h);
 *   a grounded subject moves it to bounds.bottom - ry/2.
 * - rx = max(28, .62w) + 8, ry = max(22, .58h) + 6, R = (rx + ry)/2; a pool
 *   that would reach the calm band is squashed from the top, bottom kept,
 *   and rx shrinks with ry (at least 28) so the top stays an arc.
 * - w, h and the box are the body bounds (darken markers excluded).
 * - calmTop = title extent + 2: rows above it are never lightened.
 * - apex: the spot cone's tip, three rows under the calm arch and an eighth of
 *   the depth left of the light centre, so the cone (left edge 1:4, right
 *   edge 1:2, its axis on the light centre) leans from the top left onto
 *   the subject; or screen.lamp.
 * - blaze: an ellipse blazeR x blazeRy whose top ends 4 rows under calmTop.
 * - vignette: steps (0..3; 1 for light moods and radial stages, corners
 *   only), shape (named draw 'vignette'), vx, vy, vaxes, vradii; the bottom
 *   semi-axis grows so the first step at the bottom midpoint stays 3 rows
 *   under the subject's base (or under the floor).
 * - floor: for grounded subjects and the default contact shadow, a floor
 *   ellipse {x, y, rx, ry} that is lit one step and kept out of the deep
 *   vignette.
 * - named draws: 'stage', 'vignette' (dark moods), 'blaze-phase' (blaze
 *   only), 'jitter-seed'.
 */
export function stagePlan(ctx) {
  const spec=ctx?.look?.moodSpec?.stage;
  if(!spec||ctx.legacy||ctx.compat||!ctx.stageVariation)return null;
  const v=ctx.stageVariation,w=finite(ctx.look.wildness)?ctx.look.wildness:0,k=spec.kinds;
  const scene=sceneOf(ctx),light=ctx.look.moodSpec.dark===false;
  const blazeOk=!scene.radial&&(scene.ground!==true||scene.name==='void');
  // A radial scene carries its own light: a pool's elliptical edge over its
  // wedges would read as dartboard rings. Its share goes to the spot (straight
  // cone edges, the key light from the top left) on a dark mood, and to flat
  // light on a light mood.
  const radialPool=scene.radial?k.pool:0;
  const entries=[['pool',scene.radial?0:k.pool],['spot',(k.spot+(light?0:radialPool))*(1+w)],
    ['blaze',blazeOk?k.blaze*(1+w):0],['flat',k.flat+(light?radialPool:0)]];
  const kind=entries.some(([,weight])=>weight>0)?v.weighted('stage',entries):'pool';
  const b=boundsOf(ctx),bw=b?b.right-b.left+1:0,bh=b?b.bottom-b.top+1:0;
  const screen=ctx.screen||{},focal=Array.isArray(screen.focal)&&finite(screen.focal[0])&&finite(screen.focal[1])?screen.focal:null;
  const grounded=groundedOf(ctx);
  let rx=Math.max(28,.62*bw)+8,ry=Math.max(22,.58*bh)+6;
  const cx=focal?focal[0]:b?(b.left+b.right)/2-.12*bw:63.5;
  let cy=focal?focal[1]:b?(b.top+b.bottom)/2-.15*bh:80;
  if(grounded&&b)cy=b.bottom-ry/2;
  const calmTop=Math.ceil(titleExtent(ctx))+2;
  // A pool that would rise into the calm band is squashed from the top (its
  // bottom edge stays put), so it ends in its own curved seam instead of a
  // straight cut under the title. 2.1 leaves room for the 10% jitter. rx
  // shrinks with ry, so a wide squashed pool keeps an arched top.
  const roof=calmTop+3;
  if(cy-1.1*ry<roof){const bottom=cy+ry,squashed=Math.max(12,(bottom-roof)/2.1);rx=Math.max(28,rx*squashed/ry);ry=squashed;cy=bottom-ry;}
  const lamp=screen.lamp&&finite(screen.lamp.x)&&finite(screen.lamp.y)?screen.lamp:null;
  // The spot's tip sits three rows under the calm arch, past the calm mask's
  // checker ring, where the cap allows a full step: a solid 3 px run.
  const tipX=lamp?lamp.x:clamp(cx-Math.max(0,cy-calmTop)/8,12,115);
  const apex=[tipX,Math.max(calmTop+3+calmArch(clamp(Math.round(tipX),0,SIZE-1)),lamp?lamp.y:0)];
  // Contact floor: grounded subjects and the default contact shadow.
  const own=Array.isArray(screen.groundShadows)&&screen.groundShadows.length>0;
  const floor=b&&(grounded||own||defaultGroundShadow(ctx))?{x:(b.left+b.right)/2+.06*bw,y:b.bottom+2,rx:Math.max(12,.7*bw),ry:6}:null;
  // Vignette: steps, shape and frame-hugging superellipse.
  const radial=scene.radial||kind==='blaze';
  const steps=clamp(spec.vignette|0,0,3),corner=light||radial;
  let shape='corners';
  if(!light&&steps){
    const row=VIGNETTE_WEIGHTS[ctx.look.moodSpec.id]??VIGNETTE_WEIGHTS.default;
    // A subject on a floor never gets the floor shape.
    shape=v.weighted('vignette',[['corners',row.corners],['floor',floor?0:row.floor],['sides',row.sides]]);
  }
  // The centre leans toward the light, so the far side falls off more; a
  // light mood stays centred, so its corner-only step never grows a strip
  // down one edge.
  const base=VIGNETTE_SHAPES[shape],vaxes=base.axes.slice(),vy=base.y,vx=VIGNETTE.x+(light?0:clamp(VIGNETTE.lean*(cx-VIGNETTE.x),-VIGNETTE.maxLean,VIGNETTE.maxLean));
  const vradii=steps?corner?[VIGNETTE.corner]:VIGNETTE.steps.slice(0,steps):[];
  // The first vignette step at the bottom midpoint stays clear of the floor,
  // or 3 rows under the subject's base, so nothing stands in the falloff.
  const base3=floor?floor.y+floor.ry+4:b?b.bottom+3:0;
  if(vradii.length)vaxes[3]=Math.max(vaxes[3],(base3-vy)/vradii[0]);
  const blazeR=1.6*Math.max(rx,ry);
  return {kind,pool:spec.pool,vignette:vradii.length,
    cx,cy,rx,ry,R:(rx+ry)/2,grounded,calmTop,apex,
    blazeR,blazeRy:clamp(cy-calmTop-4,12,blazeR),blazePhase:kind==='blaze'?v.integer('blaze-phase',0,1):0,
    jitterSeed:'stage-jitter:'+v.integer('jitter-seed',0,0x7fffffff),
    light,radial,scene:scene.name,vignetteShape:shape,vx,vy,vaxes,vradii,floor};
}

/** Most positive steps allowed per pixel: 0 above the calm arch (calmTop plus
 * calmArch(x)) and inside the calm mask, then a graded checker ramp (0/1, 1,
 * 1/2) over the next three rows and the three Chebyshev rings around the calm
 * mask, so a lit area never ends in a hard cut under the title. */
export function capField(ctx,calmTop,parity=null) {
  const cap=new Uint8Array(N).fill(2),parAt=(x,y)=>{const p=parity?parity[y*SIZE+x]:(x+y)&1;return p<0?0:p;};
  for(let x=0;x<SIZE;x++){
    const top=calmTop+calmArch(x);
    for(let y=0;y<SIZE&&y<top+3;y++){
      const d=y-top;
      cap[y*SIZE+x]=d<0?0:d===0?parAt(x,y):d===1?1:1+parAt(x,y);
    }
  }
  if(typeof ctx.calm!=='function')return cap;
  let calm=new Uint8Array(N),any=false;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(ctx.calm(x,y)){calm[y*SIZE+x]=1;any=true;}
  if(!any)return cap;
  for(let i=0;i<N;i++)if(calm[i])cap[i]=0;
  for(let ring=1;ring<=3;ring++){
    const next=calm.slice();
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const i=y*SIZE+x;
      if(calm[i])continue;
      search:for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const u=x+dx,t=y+dy;
        if(u>=0&&u<SIZE&&t>=0&&t<SIZE&&calm[t*SIZE+u]){next[i]=1;break search;}
      }
      if(next[i]){
        const par=parAt(x,y),limit=ring===1?par:ring===2?1:1+par;
        if(cap[i]>limit)cap[i]=limit;
      }
    }
    calm=next;
  }
  return cap;
}

// The title's calm mask as a Uint8Array: the title art's own (footprint plus
// 3 px), else sampled from ctx.calm; null when there is none.
function calmMaskOf(ctx) {
  const art=ctx.titleArt?.calm;
  if(art instanceof Uint8Array&&art.length===N)return art.some(v=>v)?art:null;
  if(typeof ctx.calm!=='function')return null;
  const mask=new Uint8Array(N);let any=false;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(ctx.calm(x,y)){mask[y*SIZE+x]=1;any=true;}
  return any?mask:null;
}
/** The title shield and the Chebyshev distance to it: 0 inside the calm mask
 * filled per row (so no vignette reaches into the notches between letters or
 * lines), 1.. outside, capped at 31. Returns {dist, cx, cy} or null. Two
 * raster passes, exact for the chessboard metric. */
export function titleShield(mask) {
  if(!mask)return null;
  const dist=new Uint8Array(N).fill(FAR);
  let left=SIZE,right=-1,top=SIZE,bottom=-1;
  for(let y=0;y<SIZE;y++){
    let lo=-1,hi=-1;
    for(let x=0;x<SIZE;x++)if(mask[y*SIZE+x]){if(lo<0)lo=x;hi=x;}
    if(lo<0)continue;
    dist.fill(0,y*SIZE+lo,y*SIZE+hi+1);
    if(lo<left)left=lo;
    if(hi>right)right=hi;
    if(y<top)top=y;
    bottom=y;
  }
  if(right<0)return null;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const i=y*SIZE+x;let d=dist[i];
    if(!d)continue;
    if(x>0&&dist[i-1]+1<d)d=dist[i-1]+1;
    if(y>0){
      if(dist[i-SIZE]+1<d)d=dist[i-SIZE]+1;
      if(x>0&&dist[i-SIZE-1]+1<d)d=dist[i-SIZE-1]+1;
      if(x<SIZE-1&&dist[i-SIZE+1]+1<d)d=dist[i-SIZE+1]+1;
    }
    dist[i]=d;
  }
  for(let y=SIZE-1;y>=0;y--)for(let x=SIZE-1;x>=0;x--){
    const i=y*SIZE+x;let d=dist[i];
    if(!d)continue;
    if(x<SIZE-1&&dist[i+1]+1<d)d=dist[i+1]+1;
    if(y<SIZE-1){
      if(dist[i+SIZE]+1<d)d=dist[i+SIZE]+1;
      if(x<SIZE-1&&dist[i+SIZE+1]+1<d)d=dist[i+SIZE+1]+1;
      if(x>0&&dist[i+SIZE-1]+1<d)d=dist[i+SIZE-1]+1;
    }
    dist[i]=d;
  }
  return {dist,cx:Math.round((left+right)/2),cy:Math.round((top+bottom)/2)};
}

/** Vignette steps per pixel (0..3) for a plan, before any shield: the
 * superellipse radii in plan.vradii, each with a 2 px checker seam (hard on
 * scene colour edges). `parity` null means hard boundaries everywhere. */
export function vignetteSteps(plan,parity=null) {
  const out=new Uint8Array(N),radii=plan.vradii;
  if(!radii.length)return out;
  const ax=plan.vaxes,v2x=Math.round(2*plan.vx),v2y=Math.round(2*plan.vy);
  // Seam bands per quadrant (left/right x top/bottom), with 1/a the mean of
  // that quadrant's two semi-axes.
  const bands=[0,1,2,3].map(q=>{const a=(ax[q&1]+ax[2+(q>>1)])/2;return radii.map(t=>vignetteBand(t,1/a));});
  const reach=Math.floor(VQ*Math.max(0,radii[0]-2/Math.max(...ax))**4);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const d4=vignetteQ10(x,y,v2x,v2y,ax);
    if(d4<=reach)continue;
    const i=y*SIZE+x,par=parity?parity[i]:-1,q=(2*x>=v2x?1:0)+(2*y>=v2y?2:0);
    let s=0;
    for(const band of bands[q])s+=1-inside(d4,band,par);
    out[i]=s;
  }
  return out;
}

// Key light plus vignette: integer steps summed per pixel, clamped to
// [-3, +2], then limited by the cap field. The vignette is held flat over the
// title shield and may rise only one step per 2 px from it; the floor
// ellipse is lit at least one step and never darkened past -1.
function lightLevels(plan,cap,parity,shield) {
  const levels=new Int8Array(N),{kind,cx,cy,rx,ry,R}=plan;
  const c2x=Math.round(2*cx),c2y=Math.round(2*cy),invR=1/R;
  const outer=seamBand(1,invR),inner=seamBand(.4,invR);
  const a2x=Math.round(2*plan.apex[0]),a2y=Math.round(2*plan.apex[1]);
  const brx=plan.blazeR,bry=plan.blazeRy,lit=1-plan.blazePhase;
  const floor=plan.floor,f2x=floor?Math.round(2*floor.x):0,f2y=floor?Math.round(2*floor.y):0;
  const vig=vignetteSteps(plan,parity);
  // The shield's own value: the vignette at its centre (hard boundaries).
  let plateau=0;
  if(shield&&plan.vradii.length){
    const d4=vignetteQ10(shield.cx,shield.cy,Math.round(2*plan.vx),Math.round(2*plan.vy),plan.vaxes);
    for(const t of plan.vradii)if(d4>=Math.round(VQ*t**4))plateau++;
  }
  // The pool radius wobbles by +-10% on smooth 16 px value noise (Q8 factor).
  const jitter=(x,y,d2)=>{const kq=Q+(((noise2(plan.jitterSeed,x,y,16)-128)*51)>>8);return Math.floor(d2*Q*Q/(kq*kq));};
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const i=y*SIZE+x,par=parity[i],p01=par<0?0:par;
    let s=0;
    if(kind==='pool'){
      let d2=ellipseQ8(x,y,c2x,c2y,rx,ry);
      if(d2<Q*1.6){
        d2=jitter(x,y,d2);
        s+=inside(d2,outer,par);
        if(plan.pool>=2)s+=inside(d2,inner,par);
      }
    }else if(kind==='spot'){
      // Cone from the apex: right edge 1:2 (x grows by half the depth),
      // left edge 1:4 (a quarter), in quarter pixels; e is the overshoot past
      // the nearer edge, and -8 widens the tip to a solid 3 px run.
      const T4=2*(2*y-a2y);
      if(T4>=0){
        const X4=2*(2*x-a2x),e=Math.max(X4-(T4>>1),-X4-(T4>>2))-8;
        s+=e<=-4?1:e>=4?0:par<0?(e<0?1:0):par;
      }
    }else if(kind==='blaze'){
      if((blazeWedge(2*x-c2x,2*y-c2y)&1)===lit)s+=ellipseSeam(x,y,c2x,c2y,brx,bry,par);
    }
    // The floor is lit at least one step; around it (a 3 px margin, its own
    // seam) the vignette goes no deeper than one step.
    let held=0;
    if(floor&&Math.abs(2*y-f2y)<=2*floor.ry+12){
      const fl=ellipseSeam(x,y,f2x,f2y,floor.rx,floor.ry,par);
      if(fl>s)s=fl;
      held=ellipseSeam(x,y,f2x,f2y,floor.rx+3,floor.ry+3,par);
    }
    let vk=vig[i];
    if(shield){
      const d=shield.dist[i];
      if(!d)vk=plateau;
      else{const lim=plateau+((d-1)>>1)+((d-1)&1?p01:0);if(vk>lim)vk=lim;}
    }
    if(held&&vk>1)vk=1;
    s=clamp(s-vk,-3,2);
    if(s>cap[i])s=cap[i];
    levels[i]=s;
  }
  return levels;
}

// Glows, beams and the aura add positive steps into `up`.
function addGlows(up,emitters,parity) {
  for(const e of emitters){
    if(!e||!finite(e.x)||!finite(e.y))continue;
    const r=finite(e.r)&&e.r>0?e.r:6,two=e.steps===2,c2x=Math.round(2*e.x),c2y=Math.round(2*e.y);
    const invR=r>=6?1/r:0,outer=seamBand(1,invR),inner=seamBand(.3025,invR);
    const x0=Math.max(0,Math.floor(e.x-r-2)),x1=Math.min(SIZE-1,Math.ceil(e.x+r+2));
    const y0=Math.max(0,Math.floor(e.y-r-2)),y1=Math.min(SIZE-1,Math.ceil(e.y+r+2));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const d2=ellipseQ8(x,y,c2x,c2y,r,r),par=parity[y*SIZE+x];
      up[y*SIZE+x]+=inside(d2,outer,par)+(two?inside(d2,inner,par):0);
    }
  }
}
function addBeams(up,beams,parity) {
  for(const b of beams){
    if(!b||!finite(b.x)||!finite(b.y))continue;
    const dx=finite(b.dx)?b.dx:0,dy=finite(b.dy)?b.dy:1,len=Math.hypot(dx,dy);
    if(!(len>0))continue;
    const ux=dx/len,uy=dy/len,L=finite(b.length)&&b.length>0?b.length:48,spread=finite(b.spread)&&b.spread>=0?b.spread:.25;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const px=x-b.x,py=y-b.y,t=px*ux+py*uy;
      if(t<0||t>.8*L||Math.abs(px*uy-py*ux)>Math.max(.5,t*spread))continue;
      const par=parity[y*SIZE+x];
      if(t<=.4*L||(par<0?t<=.6*L:par))up[y*SIZE+x]+=1;
    }
  }
}
// Occupied = opaque subject pixels (darken markers are shadows, not body).
const occupied=(layer,i)=>layer[i]<FIRST_MARKER;
function addAura(up,layer,aura,parity) {
  const rings=clamp(Math.round(finite(aura.rings)?aura.rings:2),1,6),two=aura.steps===2;
  const FAR_D=0x7fffffff,dist=new Int32Array(N).fill(FAR_D),R2=rings*rings;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const i=y*SIZE+x;
    if(!occupied(layer,i))continue;
    // Only edge pixels can be the nearest occupied pixel of an outside one.
    if(x>0&&x<SIZE-1&&y>0&&y<SIZE-1&&occupied(layer,i-1)&&occupied(layer,i+1)&&occupied(layer,i-SIZE)&&occupied(layer,i+SIZE))continue;
    for(let dy=-rings;dy<=rings;dy++){
      const t=y+dy;if(t<0||t>=SIZE)continue;
      for(let dx=-rings;dx<=rings;dx++){
        const u=x+dx,d=dx*dx+dy*dy;
        if(u<0||u>=SIZE||d>R2)continue;
        const j=t*SIZE+u;if(d<dist[j])dist[j]=d;
      }
    }
  }
  for(let i=0;i<N;i++){
    const d=dist[i];
    if(d===FAR_D||occupied(layer,i))continue;
    let ring=1;while(ring*ring<d)ring++;   // (ring-1)^2 < d <= ring^2
    if(ring<rings)up[i]+=1+(two&&ring===1?1:0);
    else if(parity[i]>0)up[i]+=1;
  }
}

// Ground shadows add negative steps into `down`; `ink` collects contact lines.
function addEllipseShadow(down,s) {
  const rx=Math.max(.5,s.rx),ry=Math.max(.5,s.ry),core=finite(s.core)?s.core:2,rim=finite(s.rim)?s.rim:1;
  const c2x=Math.round(2*s.x),c2y=Math.round(2*s.y),coreQ=Math.round(.36*Q);
  const x0=Math.max(0,Math.floor(s.x-rx-1)),x1=Math.min(SIZE-1,Math.ceil(s.x+rx+1));
  const y0=Math.max(0,Math.floor(s.y-ry-1)),y1=Math.min(SIZE-1,Math.ceil(s.y+ry+1));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const d2=ellipseQ8(x,y,c2x,c2y,rx,ry);
    if(d2<coreQ)down[y*SIZE+x]-=core;else if(d2<Q)down[y*SIZE+x]-=rim;
  }
}
function addShadows(down,ink,layer,shadows) {
  for(const s of shadows){
    if(!s)continue;
    const steps=finite(s.steps)?Math.max(0,Math.round(s.steps)):1;
    if(s.kind==='ellipse'&&finite(s.x)&&finite(s.y)&&finite(s.rx)&&finite(s.ry))addEllipseShadow(down,s);
    else if(s.kind==='poly'&&Array.isArray(s.points)&&s.points.length>=3){
      const ys=s.points.map(p=>p[1]),lo=Math.max(0,Math.floor(Math.min(...ys))),hi=Math.min(SIZE-1,Math.ceil(Math.max(...ys)));
      scanPolygon(s.points,lo,hi,0,SIZE-1,(x,y)=>{down[y*SIZE+x]-=steps;});
    }else if(s.kind==='project'&&finite(s.groundY)){
      const [sx,sy]=Array.isArray(s.shear)&&finite(s.shear[0])&&finite(s.shear[1])?s.shear:[.5,-.3];
      const hit=new Uint8Array(N);
      for(let y=0;y<SIZE&&y<s.groundY;y++)for(let x=0;x<SIZE;x++){
        if(!occupied(layer,y*SIZE+x))continue;
        const h=s.groundY-y,u=Math.round(x+h*sx),t=Math.round(s.groundY+h*sy);
        if(u>=0&&u<SIZE&&t>=0&&t<SIZE)hit[t*SIZE+u]=1;
      }
      for(let i=0;i<N;i++)if(hit[i])down[i]-=steps;
    }else if(s.kind==='line'&&finite(s.x0)&&finite(s.x1)&&finite(s.y)){
      const y=Math.round(s.y);
      if(y<0||y>=SIZE)continue;
      const x1=Math.min(SIZE-1,Math.round(Math.max(s.x0,s.x1)));
      for(let x=Math.max(0,Math.round(Math.min(s.x0,s.x1)));x<=x1;x++)ink[y*SIZE+x]=1;
    }
  }
}

/** The default contact shadow for grounded subjects, plus the engine-18
 * vehicle fallback (style 'vehicles', archetype 'cars' or 'crawler tank')
 * that takes over from backgrounds.js's ink contact ellipse: an ellipse at
 * (box cx + .06w, bounds.bottom), rx .46w, ry max(2, .05w), core 2 steps,
 * rim 1. A recipe that returns its own groundShadows opts out. Returns the
 * shadow record, or null when none applies. */
export function defaultGroundShadow(ctx) {
  const b=boundsOf(ctx),own=ctx.screen?.groundShadows;
  if(!b||(Array.isArray(own)&&own.length))return null;
  // An explicit grounded trait (true or false) wins over the fallback.
  const explicit=typeof ctx.screen?.grounded==='boolean'||typeof ctx.traits?.grounded==='boolean';
  const legacyVehicle=!explicit&&ctx.style==='vehicles'&&['cars','crawler tank'].includes(ctx.traits?.archetype);
  if(!groundedOf(ctx)&&!legacyVehicle)return null;
  const w=b.right-b.left+1;
  return {kind:'ellipse',x:(b.left+b.right)/2+.06*w,y:b.bottom,rx:.46*w,ry:Math.max(2,.05*w),core:2,rim:1};
}

/** Light pool, vignette, glows, beams, aura and ground shadows. The engine
 * calls it for every non-legacy cover after renderBackground and renderDepth,
 * while `ctx.indices` holds only the background. A context without a mood
 * stage (no look.moodSpec) is left untouched. Returns nothing. */
export function renderStage(ctx) {
  const plan=stagePlan(ctx);
  if(!plan)return;
  // Exposed for review tools and integration (ctx only, never traits).
  ctx.stage=plan;
  const {indices}=ctx,layer=ctx.layer&&ctx.layer!==indices?ctx.layer:null,screen=ctx.screen||{};
  const lighter=stageLighter(ctx.palette);
  const parity=seamParity(indices),cap=capField(ctx,plan.calmTop,parity);
  const shield=plan.vradii.length?titleShield(calmMaskOf(ctx)):null;
  const levels=lightLevels(plan,cap,parity,shield);
  for(let i=0;i<N;i++)if(levels[i])indices[i]=step(indices[i],levels[i],lighter);
  // Glows, beams and the aura: positive steps, never past the cap field.
  const up=new Int8Array(N);
  let lifted=false;
  if(Array.isArray(screen.emitters)&&screen.emitters.length){addGlows(up,screen.emitters,parity);lifted=true;}
  if(Array.isArray(screen.beams)&&screen.beams.length){addBeams(up,screen.beams,parity);lifted=true;}
  if(layer&&screen.aura&&typeof screen.aura==='object'){addAura(up,layer,screen.aura,parity);lifted=true;}
  if(lifted)for(let i=0;i<N;i++){const s=Math.min(up[i],cap[i]);if(s>0)indices[i]=step(indices[i],s,lighter);}
  // Ground shadows, then the default contact shadow.
  const shadows=Array.isArray(screen.groundShadows)?screen.groundShadows.slice():[];
  const fallback=defaultGroundShadow(ctx);
  if(fallback)shadows.push(fallback);
  if(!shadows.length)return;
  const down=new Int8Array(N),ink=new Uint8Array(N);
  addShadows(down,ink,layer||new Uint8Array(N).fill(TRANSPARENT),shadows);
  // On the light stage a ground shadow stops at bg0: one step past the pale sky is ink.
  const light=ctx.look?.moodSpec?.dark===false;
  for(let i=0;i<N;i++){
    if(down[i]){const c=step(indices[i],Math.max(-3,down[i]));indices[i]=light&&c===4&&indices[i]!==4?0:c;}
    if(ink[i])indices[i]=step(indices[i],-8);
  }
}

/** Frame look-up tables for `palette`: FRAME0[c] is DARKER applied 3 times,
 * then again while luma > .45; FRAME1[c] is DARKER twice, then again while
 * luma > .55; at most 8 steps in all. Indices outside the palette or the role
 * tables map to themselves. Returns [FRAME0, FRAME1], each a Uint8Array(16). */
export function frameLut(palette) {
  return [[3,FRAME_LIMITS[0]],[2,FRAME_LIMITS[1]]].map(([first,limit])=>{
    const lut=new Uint8Array(16);
    for(let c=0;c<16;c++){
      if(c>=DARKER.length||c>=palette.length){lut[c]=c;continue;}
      let v=c,n=0;
      for(;n<first;n++)v=DARKER[v];
      for(;n<8&&luma(palette[v])>limit;n++)v=DARKER[v];
      lut[c]=v;
    }
    return lut;
  });
}

/** Edge falloff for covers the stage vignette did not frame: no stage ran
 * (the varied mascot) or the mood is light. Ring 2 (x or y 2/125) steps one
 * DARKER on a 1 px checker, and with no stage the corners fall one step on
 * the corner superellipse (VIGNETTE_SHAPES.corners at VIGNETTE.corner), each
 * with a 2 px seam. The title's calm mask and opaque subject-layer pixels are
 * never touched, so the edge steps down instead of boxing in a stroke.
 * Returns the stepped pixel count. */
export function edgeFalloff(ctx) {
  const {indices}=ctx,last=SIZE-1,calm=calmMaskOf(ctx);
  const layer=ctx.layer instanceof Uint8Array&&ctx.layer!==indices&&ctx.layer.length===N?ctx.layer:null;
  // The corner superellipse (no stage only); its zone lies inside the four
  // 35 px corner boxes, so nothing else is evaluated.
  const ax=VIGNETTE_SHAPES.corners.axes,v2x=Math.round(2*VIGNETTE.x),v2y=Math.round(2*VIGNETTE_SHAPES.corners.y);
  const bands=ctx.stage?null:[0,1,2,3].map(q=>vignetteBand(VIGNETTE.corner,2/(ax[q&1]+ax[2+(q>>1)])));
  const parAt=i=>{const c=indices[i];return indices[i-1]!==c||indices[i+1]!==c||indices[i-SIZE]!==c||indices[i+SIZE]!==c?-1:((i%SIZE)+((i/SIZE)|0))&1;};
  const hits=[];
  for(let y=2;y<last-1;y++)for(let x=2;x<last-1;x++){
    const ring2=x===2||y===2||x===last-2||y===last-2,box=bands&&Math.min(x,last-x)<=34&&Math.min(y,last-y)<=34;
    if(!ring2&&!box)continue;
    const i=y*SIZE+x;
    if(calm?.[i]||(layer&&layer[i]<FIRST_MARKER)||indices[i]>=DARKER.length)continue;
    const par=parAt(i);
    let hit=ring2&&par>0;
    if(!hit&&box){const q=(2*x>=v2x?1:0)+(2*y>=v2y?2:0);hit=!inside(vignetteQ10(x,y,v2x,v2y,ax),bands[q],par);}
    if(hit)hits.push(i);
  }
  for(const i of hits)indices[i]=DARKER[indices[i]];
  return hits.length;
}

/** Frame-luma pass on rows/columns 0-1 and 126-127: ring 0 (x or y 0/127)
 * through FRAME0, ring 1 (x or y 1/126, not ring 0) through FRAME1. Covers
 * the stage vignette did not frame (a look with no stage, or a light mood)
 * first get edgeFalloff, so the frame does not read as a drawn box. The
 * engine calls it for every cover except compat (classic mascot), after the
 * foreground and before the title paints. Returns nothing. */
export function framePass(ctx) {
  if(!ctx||ctx.compat)return;
  const {indices}=ctx,[f0,f1]=frameLut(ctx.palette),last=SIZE-1;
  const spec=ctx.look?.moodSpec;
  if(spec&&(!ctx.stage||spec.dark===false))edgeFalloff(ctx);
  const map=(i,lut)=>{const c=indices[i];if(c<16)indices[i]=lut[c];};
  for(let x=0;x<SIZE;x++){map(x,f0);map(last*SIZE+x,f0);}
  for(let y=1;y<last;y++){map(y*SIZE,f0);map(y*SIZE+last,f0);}
  for(let x=1;x<last;x++){map(SIZE+x,f1);map((last-1)*SIZE+x,f1);}
  for(let y=2;y<last-1;y++){map(y*SIZE+1,f1);map(y*SIZE+last-1,f1);}
}
