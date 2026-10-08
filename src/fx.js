// Engine-19 motion FX (package E10 owns this module): tapered speed streaks
// trailing a moving subject, painted into the background before the stage
// pass, so they take the key light and the vignette like the scene does.
// Everything is device space and deterministic: every choice is a named
// ctx.depthVariation draw, and the recipe stream is never read.
import {cleanVector} from './geometry.js';
import {streakPixels} from './strokes.js';

const SIZE=128,N=SIZE*SIZE,TRANSPARENT=255;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
/** Streak colour steps by arc fraction: background light at the root, then 2. */
export const STREAK_COLORS=Object.freeze([Object.freeze([9,.4]),Object.freeze([2,1])]);
/** Motion limits: streak count, length (px), root radius, tip radius, the
 * off-axis angle (degrees, before cleanVector), the clearance from the
 * silhouette (px), the gap between streaks and the frame margin. */
export const MOTION=Object.freeze({count:Object.freeze([3,6]),length:Object.freeze([10,30]),r0:Object.freeze([1,1.5]),r1:.3,
  angle:Object.freeze([6,10]),clear:3,gap:1,margin:2,spacing:6,contrast:4,minTurn:5*Math.PI/180,title:4});

/** Square (Chebyshev) dilation of a 0/1 mask by `radius`, as a new mask. */
export function dilateSquare(mask,radius,size=SIZE) {
  if(radius<=0)return mask.slice();
  const rows=new Uint8Array(mask.length),out=new Uint8Array(mask.length);
  for(let y=0;y<size;y++){
    let last=-1e9;
    for(let x=0;x<size;x++)if(mask[y*size+x])last=x;else if(x-last<=radius)rows[y*size+x]=1;
    last=1e9;
    for(let x=size-1;x>=0;x--)if(mask[y*size+x]){last=x;rows[y*size+x]=1;}else if(last-x<=radius)rows[y*size+x]=1;
  }
  for(let x=0;x<size;x++){
    let last=-1e9;
    for(let y=0;y<size;y++)if(rows[y*size+x]){last=y;out[y*size+x]=1;}else if(y-last<=radius)out[y*size+x]=1;
    last=1e9;
    for(let y=size-1;y>=0;y--)if(rows[y*size+x])last=y;else if(last-y<=radius)out[y*size+x]=1;
  }
  return out;
}

/** The motion plan for a cover, or null: {heading, direction, streaks} with
 * streak records {root, ctrl, end, r0, r1, length, pixels} in screen space.
 * It needs ctx.screen.heading (a nonzero [dx,dy], the direction of travel),
 * a separate subject layer and ctx.depthVariation; it fires on
 * chance('motion', .5 + .4w).
 * - 3-6 streaks leave the trailing edge (the silhouette's far side from the
 *   heading), spread across the silhouette at least 6 px apart (a narrow
 *   silhouette gets fewer), with unequal lengths of 10-30 px (neighbours
 *   differ by 4+ px), a root radius 1-1.5 tapering to .3.
 * - All run parallel, turned 6-10 degrees off the travel axis (one side per
 *   cover) and snapped with cleanVector (7.1 or 9.5 degrees on an axis
 *   heading, up to 11.3 on a diagonal; the other side is taken when a snap
 *   lands within 5 degrees of the axis), so they never merge with the
 *   subject's own axis lines and their edges step evenly.
 * - Every pixel is at least 3 px (Chebyshev) from the silhouette, outside the
 *   calm mask and 4+ rows below the title, 1 px clear of other streaks and
 *   `avoid`, and off the frame rings. A streak that does not fit is shortened
 *   (never below 10 px) or its root moved back up to 3 px, else dropped.
 * `avoid` is an optional 0/1 mask of pixels already used (echoes). */
export function motionPlan(ctx,avoid=null) {
  const heading=ctx?.screen?.heading,v=ctx?.depthVariation,layer=ctx?.layer;
  if(!Array.isArray(heading)||!finite(heading[0])||!finite(heading[1])||!v)return null;
  if(!(layer instanceof Uint8Array)||layer.length!==N||layer===ctx.indices)return null;
  const length=Math.hypot(heading[0],heading[1]);
  if(!(length>0))return null;
  const w=finite(ctx.look?.wildness)?Math.max(0,Math.min(1,ctx.look.wildness)):0;
  if(!v.chance('motion',Math.min(1,.5+.4*w)))return null;
  const ux=heading[0]/length,uy=heading[1]/length;
  // The silhouette (every subject pixel, darken markers included), its
  // projection on the travel axis (a) and across it (b), and the trailing
  // edge: the smallest a in each 1 px band of b.
  const solid=new Uint8Array(N);
  const trail=new Map();
  let bmin=Infinity,bmax=-Infinity;
  for(let i=0;i<N;i++)if(layer[i]!==TRANSPARENT){
    solid[i]=1;
    const x=i%SIZE+.5,y=(i-i%SIZE)/SIZE+.5,a=x*ux+y*uy,b=Math.round(-x*uy+y*ux);
    if(b<bmin)bmin=b;
    if(b>bmax)bmax=b;
    const t=trail.get(b);
    if(t===undefined||a<t)trail.set(b,a);
  }
  if(!(bmax>=bmin))return null;
  const keep=dilateSquare(solid,MOTION.clear-1);
  const calm=typeof ctx.calm==='function'?ctx.calm:()=>false;
  // Nothing busy near the title: streaks stay 4 rows below its last row.
  let title=0;
  for(const e of [ctx.layout?.extent,ctx.titleArt?.extent,ctx.layout?.bottom])if(finite(e))title=Math.max(title,Math.ceil(e));
  const ceiling=Math.max(MOTION.margin,title?title+MOTION.title:0);
  const used=new Uint8Array(N);
  const span=bmax-bmin;
  // Roots at least `spacing` px apart across the silhouette (a narrow one
  // fits fewer than 3); the 1 px jitter only where they are 6+ px apart.
  let count=v.integer('motion-count',MOTION.count[0],MOTION.count[1]);
  count=Math.min(count,Math.floor((span-2)/MOTION.spacing));
  if(count<1)return null;
  const pitch=(span-2)/count,jitter=pitch>=6?1:0;
  // One off-axis turn for the whole cover: streaks stay parallel. The turned
  // direction snaps to a clean ratio; when that lands nearer than 5 degrees
  // to the travel axis (possible for off-axis headings), the other turn
  // side is taken, so the streaks never run along the subject's own lines.
  const side=v.integer('motion-turn',0,1)?1:-1,angle=v.range('motion-angle',MOTION.angle[0],MOTION.angle[1])*Math.PI/180;
  const tx=-ux,ty=-uy,turned=sign=>{
    const c=Math.cos(sign*angle),s=Math.sin(sign*angle),[sx,sy]=cleanVector(tx*c-ty*s,tx*s+ty*c),l=Math.hypot(sx,sy);
    return [sx/l,sy/l,Math.acos(Math.min(1,(sx*tx+sy*ty)/l))];
  };
  let [dx,dy,off]=turned(side);
  if(off<MOTION.minTurn){const other=turned(-side);if(other[2]>off)[dx,dy,off]=other;}
  const fits=pixels=>{
    for(const [x,y] of pixels){
      if(x<MOTION.margin||y<ceiling||x>=SIZE-MOTION.margin||y>=SIZE-MOTION.margin)return false;
      const i=y*SIZE+x;
      if(keep[i]||used[i]||(avoid&&avoid[i])||calm(x,y))return false;
    }
    return true;
  };
  const streaks=[];
  for(let k=0;k<count;k++){
    // Evenly spread across the silhouette, inset 1 px, with a 1 px jitter.
    const b=Math.round(bmin+1+(k+.5)*pitch)+(jitter?v.integer('motion-offset:'+k,-1,1):0);
    let a=Infinity;
    for(let d=-1;d<=1;d++){const t=trail.get(b+d);if(t!==undefined&&t<a)a=t;}
    if(a===Infinity)continue;
    const r0=v.range('motion-r0:'+k,MOTION.r0[0],MOTION.r0[1]),r1=MOTION.r1;
    let want=v.integer('motion-length:'+k,MOTION.length[0],MOTION.length[1]);
    // Neighbours differ by at least 4 px, so the set never reads as a comb.
    const last=streaks.at(-1)?.length;
    if(last!==undefined&&Math.abs(want-last)<MOTION.contrast)want=want+MOTION.contrast+2<=MOTION.length[1]&&want>=last?want+MOTION.contrast+2:Math.max(MOTION.length[0],want-MOTION.contrast-2);
    let placed=null;
    for(let back=0;back<=3&&!placed;back++){
      // The root sits behind the trailing edge by the clearance plus its radius.
      const along=a-(MOTION.clear+r0+back);
      const rx=along*ux-b*uy,ry=along*uy+b*ux;
      for(let L=want;L>=MOTION.length[0]&&!placed;L-=2){
        const root=[rx,ry],end=[rx+dx*L,ry+dy*L],ctrl=[(rx+end[0])/2,(ry+end[1])/2];
        const pixels=streakPixels(root,ctrl,end,r0,r1);
        if(pixels.length&&fits(pixels))placed={root,ctrl,end,r0,r1,length:L,pixels};
      }
    }
    if(!placed)continue;
    streaks.push(placed);
    for(const [x,y] of placed.pixels)for(let yy=y-MOTION.gap;yy<=y+MOTION.gap;yy++)for(let xx=x-MOTION.gap;xx<=x+MOTION.gap;xx++)
      if(xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE)used[yy*SIZE+xx]=1;
  }
  return streaks.length?{heading:[ux,uy],direction:[dx,dy],streaks}:null;
}

/** Paint the motion plan through ctx.screenRaster.streak (the E3 primitive,
 * colours STREAK_COLORS: background roles 9 and 2 only). Returns the plan or
 * null. */
export function renderMotion(ctx,avoid=null) {
  const plan=motionPlan(ctx,avoid);
  if(!plan||!ctx.screenRaster?.streak)return null;
  for(const {root,ctrl,end,r0,r1} of plan.streaks)ctx.screenRaster.streak(root,ctrl,end,r0,r1,STREAK_COLORS);
  return plan;
}
