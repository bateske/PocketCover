// Engine-19 depth passes (package E10 owns this module). Both take the
// engine's hook context (engine-contract 1.2) and edit `ctx.indices` in place.
// - renderDepth, after renderBackground and before renderStage: echo
//   silhouettes (the recorded subject replayed small through recolor()) and
//   motion streaks (fx.js). Both paint background roles only, so the stage
//   lights them like the scene, and neither touches the calm mask.
// - renderForeground, after the subject composite and before framePass: one or
//   two ink silhouettes rising from the bottom corners, overlapping the
//   subject's outer 15% at most (depth through overlap), never its focal point.
// Every choice is a named ctx.depthVariation draw; the recipe stream is never
// read, and nothing is written to traits (framing-dependent values stay in
// ctx). Legacy covers never reach these hooks, and a context without a
// variation, drawing or scenery is a no-op.
import {raster,recolor,viewport} from './raster.js';
import {LIGHTER} from './roles.js';
import {frameLut,renderStage,stagePlan} from './stage.js';
import {seamPixel} from './scenes/common.js';
import {dilateSquare,renderMotion} from './fx.js';

const SIZE=128,N=SIZE*SIZE,TRANSPARENT=255,FIRST_MARKER=253;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
const wildnessOf=ctx=>finite(ctx.look?.wildness)?clamp(ctx.look.wildness,0,1):0;
const validBox=b=>b&&['left','top','right','bottom'].every(k=>finite(b[k]))&&b.right>=b.left&&b.bottom>=b.top?b:null;
const titleBottom=ctx=>{
  let e=0;
  for(const v of [ctx.layout?.extent,ctx.titleArt?.extent,ctx.layout?.bottom])if(finite(v))e=Math.max(e,v);
  return Math.ceil(e);
};

/** The subject's body box {left,top,right,bottom}: opaque ctx.layer pixels
 * (darken markers excluded), else ctx.bounds, else null. */
export function bodyBox(ctx) {
  const layer=ctx.layer;
  if(!(layer instanceof Uint8Array)||layer.length!==N||layer===ctx.indices)return validBox(ctx.bounds)??null;
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
/** screen.focal when the recipe returns one, else the body box centre. */
export function focalOf(ctx,body) {
  const f=ctx.screen?.focal;
  return Array.isArray(f)&&finite(f[0])&&finite(f[1])?[Math.round(f[0]),Math.round(f[1])]
    :[Math.round((body.left+body.right)/2),Math.round((body.top+body.bottom)/2)];
}

// ---------------------------------------------------------------- echoes --
/** Default echo placement per style; other styles get no echoes unless the
 * recipe declares `echo`. */
export const ECHO_PLACES=Object.freeze({spaceships:'sky',vehicles:'horizon',buildings:'horizon',islands:'sky',plants:'horizon',planets:'sky'});
export const ECHO_DEFAULTS=Object.freeze({chance:.25,scale:Object.freeze([.18,.35]),count:Object.freeze([1,3]),place:'sky'});
/** Echo geometry and rules.
 * - minHeight: the smallest visible echo (px); clear: the clearance from
 *   the subject bounds; margin: the frame margin; gap: between echoes;
 *   follow: the follower scale step; bottom: the lowest echo row (above the
 *   install bar); title: rows kept clear under the title.
 * - halo: the ring (Chebyshev px) around an echo that stays open sky; its
 *   outer rings may hold a star (a scene shape of at most `star` px).
 * - occluder, hide, visible: a scene shape of `occluder` px or more that
 *   starts in a horizon echo's lowest `hide` share of rows is a layer in
 *   front of it (a ridge, a fog bank, the ground line) and hides the echo
 *   below that point; at least `visible` of the echo's pixels must show.
 * - light: the most key-light steps an echo may take (stage pool).
 * - far, near: the echo colours. On the background chain 0 -> 1 -> 3 -> 2
 *   -> 9 these are one and two steps above the night sky (0), so a far echo
 *   is the dimmer one; neither may display as 2 or 9 after the stage. */
export const ECHO=Object.freeze({minHeight:10,clear:4,margin:3,gap:3,follow:.78,bottom:108,title:6,
  halo:3,star:9,occluder:24,hide:.4,visible:.6,light:1,far:1,near:3});

/** Scenes that are interiors (walls, niches, caves, workbenches): no echoes. */
export const ECHO_INTERIORS=Object.freeze(['workshop','circuit','catacomb','crypt','cavern','void']);

/** Echo settings {chance, scale:[lo,hi], count:[lo,hi], place} for a style,
 * or null when it has none. recipe.echo (an object) is merged over the style
 * default (chance .25 when the style has none); recipe.echo === false turns
 * echoes off. */
export function echoSettings(style,recipe=null) {
  const own=recipe?.echo;
  if(own===false)return null;
  const declared=!!own&&typeof own==='object';
  const place=ECHO_PLACES[style];
  const s={...ECHO_DEFAULTS,place:place??ECHO_DEFAULTS.place,chance:place||declared?ECHO_DEFAULTS.chance:0,...(declared?own:{})};
  const range=(r,lo,hi)=>Array.isArray(r)&&finite(r[0])&&finite(r[1])&&r[0]>=lo&&r[1]>=r[0]&&r[1]<=hi;
  if(!finite(s.chance)||s.chance<0||s.chance>1||!range(s.scale,.05,1)||!range(s.count,1,3)||(s.place!=='sky'&&s.place!=='horizon'))
    throw Error('recipe.echo needs chance in [0,1], scale [lo,hi] in [.05,1], count [lo,hi] in 1..3 and place sky or horizon.');
  return s.chance>0?{chance:s.chance,scale:[s.scale[0],s.scale[1]],count:[Math.round(s.count[0]),Math.round(s.count[1])],place:s.place}:null;
}

/**
 * The sky the scene was painted on, and where it still shows:
 * {horizon, base, open, size}.
 * - horizon: the middle row of the horizon sky's 3-row seam (backgrounds'
 *   sky(): 0 above, one row each of 25, 50 and 75% of 1, solid 1 below),
 *   found from the painted pattern; null when the scene has no horizon sky
 *   (space, lunar) or covers its seam.
 * - base[i]: that sky's colour at pixel i (0 everywhere without a seam).
 * - open[i]: 1 where the scene left the sky showing.
 * - size[i]: the size of the 8-connected scene shape that holds pixel i (0
 *   on open sky). Stars are small; ridges, ribbons, planet limbs, nebulae,
 *   buildings, clouds and fog banks are large.
 */
export function openSky(ctx) {
  const indices=ctx.indices,base=new Uint8Array(N);
  let horizon=null;
  if(ctx.scenery?.sky==='horizon'){
    let best=0;
    for(let h=1;h<SIZE-1;h++){
      let score=0;
      for(let x=0;x<SIZE;x++)if(indices[(h-1)*SIZE+x]===(seamPixel(x,1)?1:0)&&indices[h*SIZE+x]===(seamPixel(x,2)?1:0)
        &&indices[(h+1)*SIZE+x]===(seamPixel(x,3)?1:0))score++;
      if(score>best){best=score;horizon=h;}
    }
    if(best<12)horizon=null;
    else for(let y=horizon-1;y<SIZE;y++)for(let x=0;x<SIZE;x++)base[y*SIZE+x]=seamPixel(x,y-horizon+2)?1:0;
  }
  const open=new Uint8Array(N),size=new Int32Array(N),queue=new Int32Array(N),seen=new Uint8Array(N);
  for(let i=0;i<N;i++)open[i]=indices[i]===base[i]?1:0;
  for(let i=0;i<N;i++)if(!open[i]&&!seen[i]){
    let head=0,tail=0;queue[tail++]=i;seen[i]=1;
    while(head<tail){
      const j=queue[head++],x=j%SIZE,y=(j-x)/SIZE;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const u=x+dx,t=y+dy;
        if(u<0||t<0||u>=SIZE||t>=SIZE)continue;
        const k=t*SIZE+u;
        if(!open[k]&&!seen[k]){seen[k]=1;queue[tail++]=k;}
      }
    }
    for(let k=0;k<tail;k++)size[queue[k]]=tail;
  }
  return {horizon,base,open,size};
}

// Key-light steps the stage will give each pixel, or null without a stage:
// the stage pass (stage.js, pure in its named draws) run on a flat probe of
// colour 3, whose results along the chain 4 0 1 [3] 2 9 decode to -3..+2.
const PROBE_LEVEL=Object.freeze({4:-3,0:-2,1:-1,3:0,2:1,9:2});
export function stageLevels(ctx) {
  if(!stagePlan(ctx))return null;
  const probe=new Uint8Array(N).fill(3);
  renderStage({...ctx,indices:probe});
  return Int8Array.from(probe,c=>PROBE_LEVEL[c]??0);
}
const lighter=(c,steps)=>{for(;steps>0;steps--)c=LIGHTER[c];return c;};

// Replay the recorded drawing at k times the subject scale into a scratch
// mask centred on the canvas: {pixels:[[dx,dy]], w, h} relative to its box,
// or null when empty or clipped. recolor() runs groups without effects, so
// outlines and shadows drop out; recipe-painted darken markers are skipped.
function echoMask(ctx,k,body) {
  const {drawing,frame}=ctx,scratch=new Uint8Array(N).fill(TRANSPARENT),sink={left:SIZE,top:SIZE,right:-1,bottom:-1};
  const cx=(body.left+body.right+1)/2,cy=(body.top+body.bottom+1)/2;
  const surface=viewport(raster(scratch,SIZE,{pixelArt:true,effects:false,bounds:sink}),
    {x:64-(cx-frame.x)*k,y:64-(cy-frame.y)*k,scale:frame.scale*k});
  drawing.draw(recolor(surface,c=>c>=FIRST_MARKER?TRANSPARENT:1));
  if(sink.right<0)return null;
  let left=SIZE,top=SIZE,right=-1,bottom=-1;
  for(let y=sink.top;y<=sink.bottom;y++)for(let x=sink.left;x<=sink.right;x++)if(scratch[y*SIZE+x]===1){
    if(x<left)left=x;
    if(x>right)right=x;
    if(y<top)top=y;
    bottom=y;
  }
  if(right<0||left===0||top===0||right===SIZE-1||bottom===SIZE-1)return null;
  // A distant silhouette cannot resolve details smaller than a few pixels:
  // fragments under 4 px (apart from the largest part) drop out, pinholes
  // of up to 4 px and 1 px notches close. Larger gaps, such as a ring's
  // opening, stay open. This shapes the echo's own mask, never the picture.
  const w=right-left+3,h=bottom-top+3,m=new Uint8Array(w*h),label=new Int32Array(w*h),queue=new Int32Array(w*h);
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(scratch[y*SIZE+x]===1)m[(y-top+1)*w+x-left+1]=1;
  const flood=(start,value,eight,id)=>{
    let head=0,tail=0;queue[tail++]=start;label[start]=id;
    while(head<tail){
      const i=queue[head++],x=i%w,y=(i-x)/w;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!(dx||dy)||(!eight&&dx&&dy))continue;
        const u=x+dx,t=y+dy;
        if(u<0||t<0||u>=w||t>=h)continue;
        const j=t*w+u;
        if(m[j]===value&&!label[j]){label[j]=id;queue[tail++]=j;}
      }
    }
    return tail;
  };
  const parts=[];
  for(let i=0;i<w*h;i++)if(m[i]&&!label[i])parts.push([parts.length+1,flood(i,1,true,parts.length+1)]);
  const largest=parts.reduce((best,part)=>part[1]>best[1]?part:best,[0,0])[0];
  for(let i=0;i<w*h;i++)if(m[i]&&label[i]!==largest&&parts[label[i]-1][1]<4)m[i]=0;
  label.fill(0);
  flood(0,0,false,-1);
  for(let i=0;i<w*h;i++)if(!m[i]&&!label[i]){
    const size=flood(i,0,false,i+1);
    if(size<=4)for(let k=0;k<size;k++)m[queue[k]]=1;
  }
  closeNotches(m,w,h);
  const pixels=[];
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(m[y*w+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;y1=y;}
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(m[y*w+x])pixels.push([x-x0,y-y0]);
  return {pixels,w:x1-x0+1,h:y1-y0+1};
}

// Candidate offsets around a preferred spot, nearest first (dy weighs
// double); horizon echoes keep to their ground line (|dy| <= 2).
function offsets(horizon) {
  const list=[];
  for(let dy=horizon?-2:-10;dy<=(horizon?2:10);dy+=horizon?1:2)for(let dx=-18;dx<=18;dx+=2)list.push([dx,dy]);
  return list.sort((a,b)=>a[0]*a[0]+2*a[1]*a[1]-(b[0]*b[0]+2*b[1]*b[1])||a[1]-b[1]||a[0]-b[0]);
}
const NEAR_HORIZON=offsets(true),NEAR_SKY=offsets(false);
// craft-lint's orphan neighbourhood: the 8 neighbours and 2 px on the axes.
const AROUND=Object.freeze([[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1],[-2,0],[2,0],[0,-2],[0,2]]);
// Whether painting `cells` (screen indices, marked `stamp` in `mark`) in
// colour `fill` would strand a pixel beside them: one that had a pixel of its
// own colour in craft-lint's orphan neighbourhood and would have none (half a
// star, a ribbon's edge row, the end of a grid line). `frame` (optional,
// frameLut's pair) maps the two outer rings as the later frame pass will. It
// tests the layer's own placement; nothing in the picture is cleaned up.
function strands(indices,cells,mark,stamp,fill,frame=null) {
  const shown=(j,c)=>{
    if(!frame||c>=16)return c;
    const x=j%SIZE,y=(j-x)/SIZE,ring=Math.min(x,y,SIZE-1-x,SIZE-1-y);
    return ring===0?frame[0][c]:ring===1?frame[1][c]:c;
  };
  const lone=(x,y,c,after)=>{
    for(const [u,t] of AROUND){
      const xx=x+u,yy=y+t;
      if(xx<0||yy<0||xx>=SIZE||yy>=SIZE)continue;
      const j=yy*SIZE+xx;
      if(shown(j,after&&mark[j]===stamp?fill:indices[j])===c)return false;
    }
    return true;
  };
  for(const j of cells){
    const X=j%SIZE,Y=(j-X)/SIZE;
    for(let t=-1;t<=1;t++)for(let u=-1;u<=1;u++){
      const x=X+u,y=Y+t;
      if(x<0||y<0||x>=SIZE||y>=SIZE)continue;
      const k=y*SIZE+x;
      if(mark[k]===stamp)continue;
      const c=shown(k,indices[k]);
      if(lone(x,y,c,true)&&!lone(x,y,c,false))return true;
    }
  }
  return false;
}

/**
 * The echo plan for a cover, or null: {place, side, horizon, echoes:[{x, y,
 * w, h, scale, color, pixels, hidden}]} in screen space. x, y, w, h are the
 * whole echo's box; pixels (relative to x, y) are the ones that show, and
 * hidden counts the ones a nearer layer covers.
 * - Settings from echoSettings; fires on chance('echo', chance(1 + w)),
 *   doubled in vista. None on an interior backdrop (ECHO_INTERIORS): a
 *   small replay of the subject on a wall, niche or cave reads as a ghost,
 *   not as a distant object.
 * - Scale k (of the subject's frame scale): up to 3 named attempts for the
 *   lead, largest first (attempt a draws from the a-th third of the settings
 *   range, top down; a larger silhouette reads better), each raised to reach
 *   10 px when the range allows; then followers at .78x each (count 1-3).
 * - Side: opposite the subject's centre (a named draw when centred).
 * - Place 'horizon': standing on scenery.horizon (floor - 8 without one,
 *   else sky); 'sky': in the upper third of the space under the title. A
 *   small deterministic search around the preferred spot.
 * - Depth: an echo is the farthest thing in the picture, so it shows only
 *   on open sky (openSky). Its halo stays open sky too, apart from stars in
 *   the outer rings, so it never touches or cuts a ribbon, ridge line,
 *   planet limb, cloud or building. A horizon echo may stand behind a
 *   nearer layer that hides at most its lowest 40% of rows.
 * - Light: it takes one uniform key-light level of 0 or 1 steps (stageLevels)
 *   over itself and its first ring: never in the vignette's darkened
 *   corners, under a ground shadow or across a pool seam.
 * - Colour: lead near (3), followers far (1), swapped or rejected so that it
 *   differs from the sky under and beside it and from any layer it touches,
 *   and never displays as 2 or 9 once lit.
 * - Rejected also inside the frame margin, under the install bar, overlapping
 *   the subject bounds + 4, another echo + 3, the title rows + 6 or calm, or
 *   where it would strand a lone backdrop pixel.
 */
export function echoPlan(ctx) {
  const v=ctx?.depthVariation,frame=ctx?.frame,indices=ctx?.indices;
  if(!v||!ctx.drawing?.draw||!frame||!finite(frame.scale)||!(frame.scale>0)||!(indices instanceof Uint8Array)||indices.length!==N)return null;
  const settings=echoSettings(ctx.style,ctx.recipe);
  if(!settings||ECHO_INTERIORS.includes(ctx.scenery?.name))return null;
  const w=wildnessOf(ctx),vista=ctx.camera==='vista';
  if(!v.chance('echo',Math.min(1,settings.chance*(1+w)*(vista?2:1))))return null;
  const body=bodyBox(ctx);
  if(!body)return null;
  const box=validBox(ctx.bounds)??body;
  const avoid={left:box.left-ECHO.clear,top:box.top-ECHO.clear,right:box.right+ECHO.clear,bottom:box.bottom+ECHO.clear};
  const calm=typeof ctx.calm==='function'?ctx.calm:()=>false;
  const ceiling=Math.max(ECHO.margin,titleBottom(ctx)+ECHO.title);
  const centre=(body.left+body.right)/2;
  const side=Math.abs(centre-63.5)<4?v.integer('echo-side',0,1):centre>63.5?0:1;   // 0: echoes on the left
  const scenery=ctx.scenery||{};
  let place=settings.place,ground=null;
  if(place==='horizon'){
    ground=finite(scenery.horizon)?scenery.horizon:finite(scenery.floor)?scenery.floor-8:null;
    if(ground===null||ground-ECHO.minHeight<ceiling)place='sky';
  }
  const sky=openSky(ctx),{open,size,base}=sky;
  const large=new Uint8Array(N);
  for(let i=0;i<N;i++)if(size[i]>ECHO.star)large[i]=1;
  const nearLarge=dilateSquare(large,ECHO.halo);
  let levels;
  const levelAt=i=>{if(levels===undefined)levels=stageLevels(ctx);return levels?levels[i]:0;};
  const placed=[],mark=new Int32Array(N),parts=new Int32Array(N),queue=new Int32Array(N);
  let stamp=0;
  // Every visible part of a partly hidden echo keeps at least 4 px.
  const fragments=visible=>{
    for(const start of visible){
      if(parts[start]===stamp)continue;
      let head=0,tail=0;queue[tail++]=start;parts[start]=stamp;
      while(head<tail){
        const j=queue[head++],X=j%SIZE,Y=(j-X)/SIZE;
        for(let t=-1;t<=1;t++)for(let u=-1;u<=1;u++){
          const k=(Y+t)*SIZE+X+u;
          if(mark[k]===stamp&&parts[k]!==stamp){parts[k]=stamp;queue[tail++]=k;}
        }
      }
      if(tail<4)return true;
    }
    return false;
  };
  const fits=(e,x,y,lead)=>{
    const r=x+e.w-1,b=y+e.h-1;
    if(x<ECHO.margin||r>SIZE-1-ECHO.margin||y<ceiling||b>ECHO.bottom)return null;
    if(x<=avoid.right&&r>=avoid.left&&y<=avoid.bottom&&b>=avoid.top)return null;
    for(const o of placed)if(x<=o.x+o.w-1+ECHO.gap&&r>=o.x-ECHO.gap&&y<=o.y+o.h-1+ECHO.gap&&b>=o.y-ECHO.gap)return null;
    // A large scene shape in a horizon echo's lowest rows is a nearer layer:
    // the echo shows above its first pixel in each column. Sky echoes are
    // never hidden.
    const hideRow=place==='horizon'?b+1-Math.floor(ECHO.hide*e.h):SIZE;
    const front=k=>!open[k]&&size[k]>=ECHO.occluder&&k>=hideRow*SIZE;
    const cut=new Int16Array(e.w).fill(SIZE);
    if(hideRow<SIZE)for(let u=0;u<e.w;u++)for(let t=Math.max(y,hideRow);t<=b;t++)if(front(t*SIZE+x+u)){cut[u]=t;break;}
    stamp++;
    const visible=[];
    let top=SIZE,bottom=-1;
    for(const [dx,dy] of e.pixels){
      const X=x+dx,Y=y+dy,j=Y*SIZE+X;
      if(Y>=cut[dx])continue;
      if(!open[j]||calm(X,Y))return null;
      visible.push(j);mark[j]=stamp;
      if(Y<top)top=Y;
      if(Y>bottom)bottom=Y;
    }
    if(visible.length<ECHO.visible*e.pixels.length||bottom-top+1<ECHO.minHeight)return null;
    // The halo: the first ring is open sky or the layer in front; the outer
    // rings may also hold stars.
    const under=new Set(),touch=new Set();
    for(const j of visible){
      under.add(base[j]);
      const X=j%SIZE,Y=(j-X)/SIZE;
      for(let t=-1;t<=1;t++)for(let u=-1;u<=1;u++){
        const k=(Y+t)*SIZE+X+u;
        if(mark[k]===stamp)continue;
        if(open[k])under.add(base[k]);
        else if(front(k))touch.add(indices[k]);
        else return null;
      }
      if(nearLarge[j])for(let t=-ECHO.halo;t<=ECHO.halo;t++)for(let u=-ECHO.halo;u<=ECHO.halo;u++){
        const xx=X+u,yy=Y+t,k=yy*SIZE+xx;
        if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||mark[k]===stamp||open[k]||size[k]<=ECHO.star||front(k))continue;
        return null;
      }
    }
    if(visible.length<e.pixels.length&&fragments(visible))return null;
    // One key-light level over the echo and its first ring.
    const level=levelAt(visible[0]);
    if(level<0||level>ECHO.light)return null;
    for(const j of visible){
      const X=j%SIZE,Y=(j-X)/SIZE;
      for(let t=-1;t<=1;t++)for(let u=-1;u<=1;u++)if(levelAt((Y+t)*SIZE+X+u)!==level)return null;
    }
    let color=null;
    for(const c of lead?[ECHO.near,ECHO.far]:[ECHO.far,ECHO.near]){
      const shown=lighter(c,level);
      if(!under.has(c)&&!touch.has(c)&&shown!==2&&shown!==9){color=c;break;}
    }
    if(color===null||strands(indices,visible,mark,stamp,color))return null;
    return {x,y,w:e.w,h:e.h,scale:e.scale,color,pixels:visible.map(j=>[j%SIZE-x,(j-j%SIZE)/SIZE-y]),hidden:e.pixels.length-visible.length};
  };
  const search=(e,x0,y0,lead)=>{
    for(const [dx,dy] of place==='horizon'?NEAR_HORIZON:NEAR_SKY){
      const found=fits(e,Math.round(x0)+dx,Math.round(y0)+dy,lead);
      if(found)return found;
    }
    return null;
  };
  // The preferred spot: a named point of the free gap on the echo side, on
  // the ground line or in the upper third of the sky.
  const gapLeft=side===0?ECHO.margin:avoid.right+1,gapRight=side===0?avoid.left-1:SIZE-1-ECHO.margin;
  const skyBottom=Math.min(ECHO.bottom,finite(scenery.horizon)?scenery.horizon:ECHO.bottom);
  const preferred=(e,name)=>{
    const room=gapRight-gapLeft+1-e.w;
    const x=room>=0?gapLeft+room*v.range('echo-x:'+name,.25,.75):side===0?gapRight-e.w+1:gapLeft;
    const y=place==='horizon'?ground-e.h+v.integer('echo-sink:'+name,0,2)
      :ceiling+Math.max(0,skyBottom-ceiling)*v.range('echo-y:'+name,.12,.33)-e.h/2;
    return [x,y];
  };
  const hi=settings.scale[1];
  const sized=k=>{
    let e=echoMask(ctx,k,body);
    if(e&&e.h<ECHO.minHeight){const need=k*(ECHO.minHeight+.5)/e.h;if(need<=hi)e=echoMask(ctx,k=need,body);}
    return e&&e.h>=ECHO.minHeight?{...e,scale:k}:null;
  };
  let lead=null;
  for(let a=0;a<3&&!lead;a++){
    // Largest first: attempt a draws from the a-th third of the range, top down.
    const lo=settings.scale[0],third=(hi-lo)/3;
    const e=sized(v.range('echo-scale:'+a,hi-third*(a+1),hi-third*a));
    if(e)lead=search(e,...preferred(e,a),true);
  }
  if(!lead)return null;
  placed.push(lead);
  // Followers recede outward (and up, in the sky) from the previous echo.
  const count=v.integer('echo-count',settings.count[0],settings.count[1]);
  for(let i=1,previous=lead;i<count;i++){
    const e=sized(lead.scale*ECHO.follow**i);
    if(!e)break;
    const x=side===0?previous.x-ECHO.gap-1-e.w:previous.x+previous.w+ECHO.gap+1;
    const y=place==='horizon'?previous.y+previous.h-e.h:previous.y-Math.round(e.h*v.range('echo-rise:'+i,.2,.6));
    const next=search(e,x,y,false);
    if(!next)break;
    placed.push(previous=next);
  }
  return {place,side,horizon:sky.horizon,echoes:placed};
}

/** Paint the echo plan into ctx.indices (background roles 1 and 3 only).
 * Returns {plan, used} with a 0/1 mask of echo pixels, or null. */
export function renderEchoes(ctx) {
  const plan=echoPlan(ctx);
  if(!plan)return null;
  const used=new Uint8Array(N);
  for(const e of plan.echoes)for(const [dx,dy] of e.pixels){const j=(e.y+dy)*SIZE+e.x+dx;ctx.indices[j]=e.color;used[j]=1;}
  return {plan,used};
}

/** Background-role depth (echoes, then motion streaks). The engine calls it
 * for every non-legacy cover after renderBackground and before renderStage.
 * The plans are kept in ctx.depth (ctx only). Returns nothing. */
export function renderDepth(ctx) {
  if(!ctx||ctx.legacy||ctx.compat||!ctx.depthVariation||!(ctx.indices instanceof Uint8Array))return;
  const echoes=renderEchoes(ctx);
  const motion=renderMotion(ctx,echoes?.used??null);
  ctx.depth={echoes:echoes?.plan??null,motion,foreground:null};
}

// ------------------------------------------------------------ foreground --
/** Foreground base chance, heights and widths (px), the topmost row, the
 * focal clearance (Chebyshev px), the band share of the body width and the
 * two colours. */
export const FOREGROUND=Object.freeze({chance:.3,height:Object.freeze([8,24]),width:Object.freeze([14,44]),top:96,focal:3,band:.15,overlap:8,visible:.5,dark:Object.freeze([4,0]),ink:4,rim:1});

// Shapes draw 1 into a local mask whose x = 0 is the shape's INNER end and x
// grows outward to the canvas edge; y is canvas y (bottom edge 128). For
// heaps (rocks, grass, kelp, rubble) the inner end is the band's inner end (at
// the subject's outer 15%): the mass sits there, over the lit ground and the
// subject's corner where the overlap reads, and tapers outward into the dark
// corner. Edge-anchored structures (girders) end on the canvas side edge, W px
// out from their inner end. Edges are clean whole ratios and the smallest
// part is 3 px.
const BOTTOM=128.5;
function rocks(p,v,n,W,H) {
  const count=v.integer(n+'count',2,4);
  for(let i=0,edge=0;i<count&&edge<W-3;i++){
    const h=Math.max(4,Math.round(H*(i?v.range(n+'h'+i,.45,.75)**i:1)));
    const rx=Math.max(3,Math.round(h*v.range(n+'aspect'+i,.9,1.4)));
    const cx=edge+rx-(i?Math.round(rx*.4):0);
    p.ellipse(cx,128,rx,h,1);
    edge=cx+rx;
  }
}
// Tapered blades, built row by row with apex (ax, 128 - h). The frame pass
// and the vignette darken rows 126-127, so the base is BLADE_BASE (row 125),
// the lowest row that shows; rows 126-127 repeat it. Only the tip narrows: a
// 1 px apex, then a 2 px row widening toward the blade's lean (`side` 0
// inward, 1 outward), then at least 3 px all the way down. Blades are at
// least BLADE_MIN (8) px tall, so 6 rows show above the frame ring. Both
// edges step outward at clean ratios a (inward) and b (outward) and never
// back in, so every row holds the rows above it: a blade is one solid
// tapered triangle, with no gaps, 1 px stems or fragments, and every pixel
// below its tip lies in a solid 3x3 block. Blades are solid ink (RIMLESS).
const BLADE_BASE=125;
const LEANS=Object.freeze([[1/8,1/8],[1/6,1/6],[1/4,0],[0,1/4],[1/3,0],[0,1/3],[1/6,1/8]]);
export function bladeRuns(ax,h,a,b,side=a>b?0:1) {
  const top=128-h,runs=[];
  // pl, pr: the 2 px that widen the stem to 3 below the tip, on its side.
  // An upright blade's outer edge steps half a period after the inner one,
  // so the two edges never step out on the same row (no bottle shoulder).
  const pl=side?0:2,pr=2-pl,phase=a===b?.5:0;
  for(let y=top;y<128;y++){
    const d=Math.min(y,BLADE_BASE)-top;
    if(d===0)runs.push([y,ax,ax]);
    else if(d===1)runs.push([y,ax-pl/2,ax+pr/2]);
    else runs.push([y,ax-Math.floor(a*d)-pl,ax+Math.floor(b*d+phase)+pr]);
  }
  return runs;
}
export const BLADE_MIN=8;
// `edge`: the outermost local column inside the frame ring; a blade that
// would cross it moves inward, or is left out when it cannot fit, so no
// sliver of a blade is cut off by the canvas side edge. `lit(lx, y)`: whether
// the backdrop there is brighter than ink and bg0; a blade whose outline
// (its apex and BLADE_LIT of its open contour) does not lie on a lit backdrop
// is left out: in the vignette's dark corner, or across its checker seam, it
// would show only as broken ink fragments.
export const BLADE_LIT=.6;
function bladeShows(runs,lit) {
  if(!lit)return true;
  const own=new Set();
  for(const [y,l,r] of runs)for(let x=l;x<=r;x++)own.add(y*SIZE+x);
  let open=0,shown=0;
  for(const [y,l,r] of runs)if(y<=BLADE_BASE)for(let x=l;x<=r;x++)for(const [u,t] of [[x,y-1],[x-1,y],[x+1,y]]){
    if(own.has(t*SIZE+u))continue;
    open++;if(lit(u,t))shown++;
  }
  const [ty,tx]=runs[0];
  return lit(tx,ty-1)&&shown>=BLADE_LIT*open;
}
// A blade whose top rows (apex, the 2 px row and the first 3 px row) would
// touch a blade drawn before it is left out: it would show only as a 1 px nub
// on its neighbour's flank. Every blade keeps its own point above a notch at
// least 3 rows deep.
const BLADE_OWN=3;
function bladeClear(runs,drawn) {
  for(let k=-1;k<BLADE_OWN;k++){
    const [y,l,r]=runs[Math.max(0,k)],t=k<0?y-1:y;
    for(let x=l-1;x<=r+1;x++)if(drawn.has(t*SIZE+x))return false;
  }
  return true;
}
function blades(p,v,n,W,H,{count,narrow},edge=Infinity,lit=null) {
  const total=v.integer(n+'count',count[0],count[1]),pitch=W/total,drawn=new Set();
  for(let i=0;i<total;i++){
    const h=Math.max(BLADE_MIN,Math.round(H*(1-.6*i/total)*v.range(n+'h'+i,.75,1))),depth=BLADE_BASE-128+h;
    const [a,b]=LEANS[v.integer(n+'lean'+i,0,narrow?3:LEANS.length-1)];
    // An upright blade's tip turns to a named side.
    const side=a>b?0:a<b?1:v.integer(n+'tip'+i,0,1);
    const pl=side?0:2,reach=Math.floor(a*depth)+pl,spread=Math.floor(b*depth+(a===b?.5:0))+2-pl;
    const ax=Math.min(edge-spread,Math.max(reach,Math.round(pitch*(i+.5))+v.integer(n+'x'+i,-1,1)));
    if(ax<reach)continue;
    const runs=bladeRuns(ax,h,a,b,side);
    if(!bladeShows(runs,lit)||!bladeClear(runs,drawn))continue;
    for(const [y,l,r] of runs){p.rect(l,y,r-l+1,1,1);for(let x=l;x<=r;x++)drawn.add(y*SIZE+x);}
  }
}
const grass=(p,v,n,W,H,edge,lit)=>blades(p,v,n,W,H,{count:[4,7],narrow:false},edge,lit);
const kelp=(p,v,n,W,H,edge,lit)=>blades(p,v,n,W,Math.max(H,14),{count:[3,5],narrow:true},edge,lit);
// A heavy steel frame corner, anchored to the canvas edge: an I-beam column
// at the inner end, a beam over it running out past the side edge (cropped
// there) and a solid 1:1 gusset plate in the knee. It reads as one massed
// structure seen close up, never as thin members or a free-standing brace.
function girders(p,v,n,W,H) {
  const top=128-H,post=v.integer(n+'post',5,7),depth=Math.max(5,Math.round(H*v.range(n+'depth',.25,.33)));
  p.rect(0,top,post,H,1);
  p.rect(0,top,W+4,depth,1);
  // The knee plate fills at most 8 px of the opening, so the frame never
  // becomes one black wedge.
  const leg=Math.min(8,H-depth-3,Math.round((H-depth)*v.range(n+'knee',.3,.45)));
  if(leg>=4)p.poly([[post,top+depth],[post+leg,top+depth],[post,top+depth+leg]],1);
}
// Angular chunks, largest at the inner end: a vertical inner flank, a 1:1 or
// 1:2 shoulder, a flat top, a 1:1 drop and a vertical outer flank.
function rubble(p,v,n,W,H) {
  const count=v.integer(n+'count',2,4);
  for(let i=0,x=0;i<count&&x<W-6;i++){
    const h=Math.max(5,Math.round(H*(i?v.range(n+'h'+i,.35,.75):1)));
    const w=Math.min(W-x,Math.max(7,Math.round(h*v.range(n+'w'+i,1,1.7))));
    if(w<7)break;
    const q=v.integer(n+'shoulder'+i,1,2);
    let rise=h-Math.round(h*v.range(n+'flank'+i,.45,.7));
    while(rise>0&&rise*q+4>w)rise--;
    const cx=x+rise*q,d=Math.max(1,Math.min(h-3,Math.round((w-(cx-x))*.45),w-(cx-x)-2));
    p.poly([[x,BOTTOM],[x,128-h+rise],[cx,128-h],[x+w-d,128-h],[x+w,128-h+d],[x+w,BOTTOM]],1);
    x+=w-v.integer(n+'overlap'+i,1,3);
  }
}
// One pass that closes 1 px notches of a 0/1 mask (w x h): an open pixel
// with 3 or 4 set 4-neighbours would read as a lone backdrop pixel pinched
// between two parts. It shapes the depth layer's own mask, never the picture.
function closeNotches(m,w,h) {
  const notches=[];
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;
    if(!m[i]&&(m[i-1]?1:0)+(m[i+1]?1:0)+(m[i-w]?1:0)+(m[i+w]?1:0)>=3)notches.push(i);
  }
  for(const i of notches)m[i]=1;
}

/** Whether shape pixel i of a 0/non-0 mask takes the rim: its up or left
 * neighbour is open, and its outward normal (the sum of its open
 * 8-neighbour offsets; the canvas edge counts as inside) faces the top-left
 * key light, nx + ny < 0. Top and left edges and up-left slopes are rimmed;
 * edges that only graze the light (a 1:1 band falling to the right) are not,
 * so a 3 px band never becomes a rim-ink-rim double line, and a 2:1 top edge
 * keeps an even run of 2 per step. */
export function rimLit(mask,i,size=SIZE) {
  const x=i%size,y=(i-x)/size,open=(u,t)=>u>=0&&t>=0&&u<size&&t<size&&!mask[t*size+u];
  if(!open(x,y-1)&&!open(x-1,y))return false;
  let s=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&open(x+dx,y+dy))s+=dx+dy;
  return s<0;
}

/** Foreground shape builders by scenery.foreground kind. */
export const FOREGROUND_SHAPES=Object.freeze({rocks,grass,kelp,girders,rubble});
// Kinds that always run out past the canvas side edge (a structure, not a
// heap): their outer end sits on the edge, W px from their inner end.
const EDGE_ANCHORED=new Set(['girders']);
// Kinds drawn without a rim: on a 3 px blade a rim leaves 2 px of ink, and a
// role-1 rim on a role-1 backdrop (or on a pale light-mood one) vanishes, so
// the blade would read as the thin stray line the 3 px rule forbids.
export const RIMLESS=Object.freeze(['grass','kelp']);

/**
 * The foreground plan, or null: {kind, mask} with mask 0 empty, 1 ink, 2 rim.
 * - Needs scenery.foreground in FOREGROUND_SHAPES; fires on
 *   chance('foreground', .30(1 + w)), x1.5 in vista. recipe.foreground ===
 *   false opts out; recipe.foreground.chance replaces the .30.
 * - 1-2 silhouettes ('fg-count'): with 2 one per corner, else a named side.
 * - Each stays in its band, x in [0, left + .15w] or [right - .15w, 127] of
 *   the body box, rises 8-24 px from the bottom edge (never above y 96), and
 *   keeps 3 px (Chebyshev) from the focal point. A heap's mass sits at the
 *   band's inner end and tapers outward; girders run W px in from the canvas
 *   side edge and out past it (cropped by both edges); each covers at
 *   most 8 subject rows in any column; at least half of its pixels must lie
 *   on, and half of its open contour border, a backdrop brighter than ink
 *   and bg0 (else it would not read).
 *   An attempt that would strand a lone pixel of a scene line beside it is
 *   skipped. Up to 3 named attempts, each lower.
 * - Ink 4, with a 1 px rim of role 1 on pixels whose up or left neighbour is
 *   outside the shape and whose edge faces the key light (rimLit; the canvas
 *   edge counts as inside). Grass and kelp blades (RIMLESS) are solid ink.
 */
export function foregroundPlan(ctx) {
  const kind=ctx?.scenery?.foreground,v=ctx?.depthVariation,own=ctx?.recipe?.foreground;
  if(typeof kind!=='string'||!Object.hasOwn(FOREGROUND_SHAPES,kind)||!v||own===false||!(ctx.indices instanceof Uint8Array)||ctx.indices.length!==N)return null;
  const chance=own&&typeof own==='object'&&own.chance!==undefined?own.chance:FOREGROUND.chance;
  if(!finite(chance)||chance<0||chance>1)throw Error('recipe.foreground.chance must be a number in [0,1].');
  const w=wildnessOf(ctx),vista=ctx.camera==='vista';
  if(!v.chance('foreground',Math.min(1,chance*(1+w)*(vista?1.5:1))))return null;
  const body=bodyBox(ctx);
  if(!body)return null;
  const bw=body.right-body.left+1,focal=focalOf(ctx,body);
  const bands=[[0,Math.min(SIZE-1,Math.floor(body.left+FOREGROUND.band*bw))],[Math.max(0,Math.ceil(body.right-FOREGROUND.band*bw)),SIZE-1]];
  const sides=v.integer('fg-count',1,2)===2?[0,1]:[v.integer('fg-side',0,1)];
  const mask=new Uint8Array(N),local=new Uint8Array(N),draw=raster(local,SIZE,{pixelArt:true,effects:false});
  const layer=ctx.layer instanceof Uint8Array&&ctx.layer.length===N&&ctx.layer!==ctx.indices?ctx.layer:null;
  const columns=new Uint8Array(SIZE),mark=new Int32Array(N);
  // The frame pass darkens the two outer rings after this layer.
  const frame=Array.isArray(ctx.palette)||ctx.palette instanceof Uint32Array?frameLut(ctx.palette):null;
  let any=false,stamp=0;
  for(const side of sides){
    const [x0,x1]=bands[side],room=x1-x0+1;
    if(room<FOREGROUND.width[0])continue;
    for(let a=0;a<3;a++){
      const n=`fg:${side}:${a}:`,shrink=1-.25*a;
      const H=Math.max(FOREGROUND.height[0],Math.round(v.integer(n+'h',FOREGROUND.height[0],FOREGROUND.height[1])*shrink));
      const W=Math.max(FOREGROUND.width[0],Math.min(room,FOREGROUND.width[1])-v.integer(n+'w',0,6));
      // Local x runs outward from the shape's inner end (the band's inner
      // end, or W px in from the canvas edge for edge-anchored kinds); past
      // the canvas edge the shape is cropped.
      const shift=EDGE_ANCHORED.has(kind)?room-W:0,X=lx=>side===0?x1-shift-lx:x0+shift+lx;
      local.fill(0);
      // The local column of the last canvas column inside the frame ring.
      const edge=side===0?x1-shift-2:SIZE-3-x0-shift;
      const litAt=(lx,y)=>{const x=X(lx);return x>=0&&x<SIZE&&y>=0&&y<SIZE&&!FOREGROUND.dark.includes(ctx.indices[y*SIZE+x]);};
      FOREGROUND_SHAPES[kind](draw,v,n,W,H,edge,litAt);
      closeNotches(local,SIZE,SIZE);
      let ok=true,count=0,over=0,open=0,lit=0;
      const cells=[];
      columns.fill(0);
      for(let i=0;i<N&&ok;i++)if(local[i]){
        const lx=i%SIZE,y=(i-lx)/SIZE,x=X(lx);
        if(x<0||x>=SIZE)continue;
        const j=y*SIZE+x;
        if(x<x0||x>x1||y<FOREGROUND.top||mask[j]||(Math.abs(x-focal[0])<=FOREGROUND.focal&&Math.abs(y-focal[1])<=FOREGROUND.focal))ok=false;
        // Cover at most `overlap` rows of the subject in any column.
        if(layer&&layer[j]<FIRST_MARKER&&++columns[x]>FOREGROUND.overlap)ok=false;
        count++;
        cells.push(j);
        if(!FOREGROUND.dark.includes(ctx.indices[j]))over++;
        // The share of the shape over a backdrop brighter than the darkest
        // roles, and of its open contour (up and both sides) bordering one:
        // an ink shape on ink or bg0 does not read, and one that is only
        // half visible leaves stray tips.
        for(const [u,t] of [[lx,y-1],[lx-1,y],[lx+1,y]]){
          const xx=X(u);
          if(xx<0||xx>=SIZE||t<0||(u>=0&&u<SIZE&&local[t*SIZE+u]))continue;
          open++;
          if(!FOREGROUND.dark.includes(ctx.indices[t*SIZE+xx]))lit++;
        }
      }
      if(!ok||!count||lit<FOREGROUND.visible*open||over<FOREGROUND.visible*count)continue;
      // Cutting a thin scene line (a tile seam, a rail) must not leave a lone
      // pixel of it beside the shape.
      stamp++;
      for(const j of cells)mark[j]=stamp;
      if(strands(ctx.indices,cells,mark,stamp,FOREGROUND.ink,frame))continue;
      for(let i=0;i<N;i++)if(local[i]){const lx=i%SIZE,x=X(lx);if(x>=0&&x<SIZE)mask[i-lx+x]=1;}
      any=true;
      break;
    }
  }
  if(!any)return null;
  // Classify on the bare shape first, so rims never feed each other.
  const rim=[];
  if(!RIMLESS.includes(kind))for(let i=0;i<N;i++)if(mask[i]&&rimLit(mask,i))rim.push(i);
  for(const i of rim)mask[i]=2;
  // A rim is a line: a lone rim pixel (a 1 px blade tip) stays ink.
  for(const i of rim){
    const x=i%SIZE,y=(i-x)/SIZE;
    let line=false;
    for(let dy=-1;dy<=1&&!line;dy++)for(let dx=-1;dx<=1;dx++){
      const u=x+dx,t=y+dy;
      if((dx||dy)&&u>=0&&t>=0&&u<SIZE&&t<SIZE&&mask[t*SIZE+u]===2){line=true;break;}
    }
    if(!line)mask[i]=1;
  }
  return {kind,mask};
}

/** Foreground silhouettes in the bottom corner bands. The engine calls it for
 * every non-legacy cover after the subject composite and before framePass.
 * Diagnostics provenance records them as effect (13). Returns nothing. */
export function renderForeground(ctx) {
  if(!ctx||ctx.legacy||ctx.compat)return;
  const plan=foregroundPlan(ctx);
  if(!plan)return;
  const {indices,provenance}=ctx;
  for(let i=0;i<N;i++)if(plan.mask[i]){
    indices[i]=plan.mask[i]===2?FOREGROUND.rim:FOREGROUND.ink;
    if(provenance)provenance[i]=13;
  }
  if(ctx.depth)ctx.depth.foreground=plan.kind;
}
