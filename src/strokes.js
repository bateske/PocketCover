// Device-space pixel builders for the engine-19 primitives (inkPath, streak,
// glint, stamp, facetPoly) plus the scanline polygon fill shared with poly().
// Everything here is pure: integer pixel lists in, pixel lists out. raster.js
// writes them through its single put() path, so selection, bounds, intent and
// provenance behave like every other primitive. Sizes are device pixels and
// never scale with a viewport or part.
import {bezier,edgeNormals} from './geometry.js';

const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const pixel=(x,y)=>[Math.round(x)+0,Math.round(y)+0];
const touching=(a,b)=>Math.abs(a[0]-b[0])<=1&&Math.abs(a[1]-b[1])<=1;

/** The colour at arc fraction t: a number is solid; steps [[color,tMax],...]
 * take the first step with t <= tMax, else the last step. */
export function stepColor(colors,t) {
  if(!Array.isArray(colors))return colors;
  for(const [color,tMax] of colors)if(t<=tMax)return color;
  return colors[colors.length-1][0];
}

// The 3-pixel window rule on a stream of 8-adjacent pixels: when a equals c the
// path doubled back, so b and c go; when a and c touch, b is an L-corner (or a
// redundant elbow) and goes. Removal re-checks the new window, so the filter
// needs only the last three kept pixels (a 6-byte window on the device).
function pushInk(out,pixel) {
  if(out.length&&same(out[out.length-1],pixel))return;
  out.push(pixel);
  while(out.length>=3){
    const a=out[out.length-3],c=out[out.length-1];
    if(same(a,c))out.length-=2;
    else if(touching(a,c))out.splice(out.length-2,1);
    else break;
  }
}

/** The pixels of a 1 px ink path through device points (rounded the way dot()
 * and line() round). Each segment is sampled at 6*max(|dx|,|dy|)+1 points, so
 * consecutive samples are 8-adjacent; repeats are skipped and the 3-pixel
 * window rule removes every L-corner. Later repeats of a pixel (crossings) are
 * dropped. Open paths keep both endpoint pixels. Closed paths also apply the
 * rule across the seam. Returns [[x,y],...]. */
export function inkPixels(points,closed=false) {
  const out=[];
  if(!points.length)return out;
  const path=closed&&points.length>2?[...points,points[0]]:points;
  pushInk(out,pixel(path[0][0],path[0][1]));
  for(let s=1;s<path.length;s++){
    const [ax,ay]=path[s-1],[bx,by]=path[s],dx=bx-ax,dy=by-ay,n=6*Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)));
    for(let i=1;i<=n;i++)pushInk(out,pixel(ax+dx*i/n,ay+dy*i/n));
  }
  const seen=new Set(),pixels=[];
  for(const p of out){const key=p[0]*65536+p[1];if(!seen.has(key)){seen.add(key);pixels.push(p);}}
  if(closed&&points.length>2){
    // The seam: treat the list as a cycle and remove any pixel whose cyclic
    // neighbours touch, until none is left (rare; one or two pixels).
    for(let changed=true;changed&&pixels.length>3;){
      changed=false;
      for(let i=0;i<pixels.length&&pixels.length>3;i++){
        const a=pixels[(i+pixels.length-1)%pixels.length],c=pixels[(i+1)%pixels.length];
        if(touching(a,c)){pixels.splice(i,1);changed=true;i--;}
      }
    }
  }
  return pixels;
}

/** Arc-length fraction 0..1 of each pixel along a pixel list. */
export function arcFractions(pixels) {
  const t=new Float64Array(pixels.length);
  for(let i=1;i<pixels.length;i++)t[i]=t[i-1]+Math.hypot(pixels[i][0]-pixels[i-1][0],pixels[i][1]-pixels[i-1][1]);
  const total=t[pixels.length-1]||0;
  if(total>0)for(let i=0;i<t.length;i++)t[i]/=total;
  return t;
}

// Below this radius a tapered band breaks into dots or doubles into a
// staircase, so those stretches are drawn as an L-corner-free 1 px spine.
export const STREAK_THIN=.7;
/** Tapered quadratic streak: a 24-point Bezier root->ctrl->end. A pixel centre
 * (i+.5,j+.5) is covered when min over segments of (distance - r(t)) <= 0
 * (exact ties count as covered), with r interpolated r0 -> r1 along t; it
 * takes the t of that nearest segment. Where r(t) < STREAK_THIN the band would
 * break into dots, so it is replaced by the spine: inkPixels of the curve
 * (pixel centre convention), 1 px with no L-corners. Returns [[x,y,t],...] in
 * row-major order. Radii are device pixels. */
export function streakPixels(root,ctrl,end,r0,r1) {
  r0=Math.max(0,+r0||0);r1=Math.max(0,+r1||0);
  const curve=bezier(root,ctrl,end,24),segments=curve.length-1;
  const nearest=(cx,cy)=>{
    let best=Infinity,bestT=0,bestR=0;
    for(let k=0;k<segments;k++){
      const [ax,ay]=curve[k],[bx,by]=curve[k+1],dx=bx-ax,dy=by-ay,length2=dx*dx+dy*dy;
      const s=length2>0?Math.max(0,Math.min(1,((cx-ax)*dx+(cy-ay)*dy)/length2)):0;
      const t=(k+s)/segments,r=r0+(r1-r0)*t,value=Math.hypot(cx-ax-s*dx,cy-ay-s*dy)-r;
      if(value<best){best=value;bestT=t;bestR=r;}
    }
    return [best,bestT,bestR];
  };
  const covered=new Map();
  const reach=Math.max(r0,r1)+1;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const [x,y] of curve){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(Math.max(r0,r1)>=STREAK_THIN)
    for(let j=Math.floor(top-reach);j<=Math.ceil(bottom+reach);j++)for(let i=Math.floor(left-reach);i<=Math.ceil(right+reach);i++){
      const [value,t,r]=nearest(i+.5,j+.5);
      if(value<=1e-9&&r>=STREAK_THIN)covered.set(j*65536+i,[i,j,t]);
    }
  if(Math.min(r0,r1)<STREAK_THIN)
    for(const [i,j] of inkPixels(curve.map(([x,y])=>[x-.5,y-.5]))){
      const [,t,r]=nearest(i+.5,j+.5);
      if(r<STREAK_THIN&&!covered.has(j*65536+i))covered.set(j*65536+i,[i,j,t]);
    }
  return [...covered.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
}

/** Offsets [dx,dy,color] of a cross glint. arms is a length for all four arms
 * or [up,right,down,left]; the last pixel of an arm longer than 1 is `tip`
 * when given. `mirrored` (a flipX part) swaps the right and left arms. */
export function glintPixels(arms=1,core=8,tip=null,mirrored=false) {
  let [up,right,down,left]=Array.isArray(arms)?arms:[arms,arms,arms,arms];
  if(mirrored)[right,left]=[left,right];
  const out=[[0,0,core]];
  for(const [dx,dy,length] of [[0,-1,up],[1,0,right],[0,1,down],[-1,0,left]]){
    const n=Math.max(0,Math.floor(length||0));
    for(let k=1;k<=n;k++)out.push([dx*k,dy*k,k===n&&n>1&&tip!=null?tip:core]);
  }
  return out;
}

/** Pixels [dx,dy,color,isolated] of a text-art stamp relative to the anchor
 * pixel. rows: strings (or one string with newlines); '.' and ' ' are
 * transparent; map turns every other character into a colour (unknown
 * characters throw). anchor: 'center' (odd sizes centre exactly), 'topleft'
 * or 'topright'. `mirrored` (a flipX part) mirrors the anchoring only; the
 * art is never mirrored, so its lighting stays in device space. `isolated`
 * marks pixels with no same-colour 8-neighbour inside the stamp. */
export function stampPixels(rows,map,{anchor='center',mirrored=false}={}) {
  if(typeof rows==='string')rows=rows.split('\n');
  const h=rows.length,w=Math.max(0,...rows.map(r=>r.length)),grid=[];
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const ch=rows[j][i];
    if(ch===undefined||ch==='.'||ch===' ')continue;
    const color=map?.[ch];
    if(color==null)throw Error(`Stamp character "${ch}" has no colour.`);
    grid.push([i,j,color]);
  }
  let side=anchor==='topright'?'right':anchor==='topleft'?'left':'center';
  if(mirrored&&side!=='center')side=side==='left'?'right':'left';
  const x0=side==='left'?0:side==='right'?w-1:mirrored?Math.ceil((w-1)/2):Math.floor((w-1)/2);
  const y0=anchor==='center'?Math.floor((h-1)/2):0;
  const at=new Map(grid.map(([i,j,c])=>[j*65536+i,c]));
  return grid.map(([i,j,c])=>{
    let isolated=true;
    for(let dy=-1;dy<=1&&isolated;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&at.get((j+dy)*65536+i+dx)===c){isolated=false;break;}
    return [i-x0,j-y0,c,isolated];
  });
}

/** Scanline form of poly()'s inside test: point (x,y) on the integer grid is
 * inside when an odd number of edges cross row y to its right, with exactly
 * poly()'s crossing expression and comparison, so coverage is identical.
 * Calls visit(x,y) in row-major order for lo<=y<=hi, left<=x<=right.
 * Points must be finite (callers keep the per-pixel test otherwise). */
export function scanPolygon(points,lo,hi,left,right,visit) {
  const n=points.length,cross=new Float64Array(n);
  for(let y=lo;y<=hi;y++){
    let m=0;
    for(let i=0,j=n-1;i<n;j=i++){
      const [a,b]=points[i],[d,e]=points[j];
      if((b>y)!==(e>y))cross[m++]=(d-a)*(y-b)/(e-b)+a;
    }
    if(!m)continue;
    for(let i=1;i<m;i++){const v=cross[i];let k=i-1;while(k>=0&&cross[k]>v){cross[k+1]=cross[k];k--;}cross[k+1]=v;}
    // inside(x) = parity of #{x < cross}, i.e. of m - #{cross <= x}.
    for(let x=left,k=0;x<=right;x++){while(k<m&&cross[k]<=x)k++;if((m-k)&1)visit(x,y);}
  }
}
export const finitePoints=points=>points.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));

const segmentDistance2=(x,y,[ax,ay],[bx,by])=>{
  const dx=bx-ax,dy=by-ay,length2=dx*dx+dy*dy;
  const s=length2>0?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length2)):0;
  return (x-ax-s*dx)**2+(y-ay-s*dy)**2;
};
/** Classified pixels of an edge-lit polygon: [[x,y,cls],...] in row-major
 * order with cls 0 interior, 1 lit, 2 mid edge, 3 dark, plus `glint`, the index
 * into that list of the glint pixel (or -1). Coverage is poly()'s inside test.
 * A boundary pixel (inside, with a 4-neighbour outside) takes the class of its
 * nearest edge: the edge's outward device normal n (sign from the shoelace
 * area, so it survives flipX) scores s = n.L for the unit direction L toward
 * the light; lit when s > threshold, dark when s < -threshold. Ties between
 * equidistant edges take the higher score. The glint is the boundary pixel
 * nearest the vertex whose bisector normal scores highest (ties: topmost). */
export function facetPixels(points,{threshold=.35,light=[-1,-1]}={}) {
  const result={pixels:[],glint:-1};
  if(points.length<3||!finitePoints(points))return result;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const lo=Math.ceil(minY),hi=Math.floor(maxY),left=Math.ceil(minX),right=Math.floor(maxX);
  if(hi<lo||right<left)return result;
  const w=right-left+3,mask=new Uint8Array(w*(hi-lo+3));
  scanPolygon(points,lo,hi,left,right,(x,y)=>{mask[(y-lo+1)*w+x-left+1]=1;});
  const length=Math.hypot(light[0],light[1])||1,lx=light[0]/length,ly=light[1]/length;
  const normals=edgeNormals(points),scores=normals.map(([nx,ny])=>nx*lx+ny*ly);
  const classes=scores.map(s=>s>threshold?1:s<-threshold?3:2);
  const n=points.length;
  let vertex=0,bestScore=-Infinity;
  for(let i=0;i<n;i++){
    const [ax,ay]=normals[(i+n-1)%n],[bx,by]=normals[i],vx=ax+bx,vy=ay+by,l=Math.hypot(vx,vy);
    const score=l>0?(vx*lx+vy*ly)/l:-Infinity;
    // Equal scores (a diamond under a 45-degree light) prefer the top vertex.
    if(score>bestScore+1e-9||(score>=bestScore-1e-9&&points[i][1]<points[vertex][1])){bestScore=Math.max(score,bestScore);vertex=i;}
  }
  let glintDistance=Infinity;
  for(let y=lo;y<=hi;y++)for(let x=left;x<=right;x++){
    const k=(y-lo+1)*w+x-left+1;
    if(!mask[k])continue;
    let cls=0;
    if(!mask[k-1]||!mask[k+1]||!mask[k-w]||!mask[k+w]){
      let best=Infinity,bestScore=-Infinity;
      // Equidistant edges (corners) take the brighter class, so the result
      // does not depend on the vertex order.
      for(let e=0;e<n;e++){
        const d=segmentDistance2(x,y,points[e],points[(e+1)%n]);
        if(d<best-1e-9||(d<=best+1e-9&&scores[e]>bestScore)){best=Math.min(d,best);bestScore=scores[e];cls=classes[e];}
      }
      const d=(x-points[vertex][0])**2+(y-points[vertex][1])**2;
      if(d<glintDistance){glintDistance=d;result.glint=result.pixels.length;}
    }
    result.pixels.push([x,y,cls]);
  }
  return result;
}
