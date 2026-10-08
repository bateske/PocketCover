// Pixel-center sampling, with isolated cardinal tips trimmed from each ellipse.
// Angles are radians. This stays independent of Canvas and antialiasing.
import {createGroup,mapGroupOptions} from './group.js';
import {arcFractions,facetPixels,finitePoints,glintPixels,inkPixels,scanPolygon,stampPixels,stepColor,streakPixels} from './strokes.js';
// Debug-only record of which primitive last wrote each pixel (the raster
// `provenance` option). Group strokes, shadows and edge shading are `effect`.
export const PROVENANCE=Object.freeze({dot:1,rect:2,ellipse:3,sphere:4,poly:5,round:6,superellipse:7,line:8,stroke:8,pipe:9,
  ring:10,arc:10,sample:11,detail:12,effect:13,inkPath:14,streak:15,glint:16,stamp:17,facetPoly:18});
// Options beyond pixelArt/intent/effects/selection:
// - bounds: a mutable {left,top,right,bottom}, created by the caller as
//   {left:size,top:size,right:-1,bottom:-1}; every non-255 write grows it.
// - target may be null when bounds is given: a measure-only sink.
// - provenance: a Uint8Array of PROVENANCE kinds, or null (the default).
// - provenanceKind: a PROVENANCE name forced for every write (internal: the
//   effect surfaces of group()).
export function raster(target, size=128, {pixelArt=false,intent=new Map(),effects=true,selection=null,bounds=null,provenance=null,provenanceKind=null}={}) {
  if(!target&&!bounds)throw Error('A raster without pixels needs a bounds sink.');
  let kind=provenanceKind?PROVENANCE[provenanceKind]??0:0;
  const grow=i=>{
    const x=i%size,y=(i-x)/size;
    if(x<bounds.left)bounds.left=x;if(x>bounds.right)bounds.right=x;if(y<bounds.top)bounds.top=y;if(y>bounds.bottom)bounds.bottom=y;
  };
  // The only two writers. Primitives put: pixels, material selection, bounds
  // and provenance. Group effects and composites paint: never the selection.
  const put=target&&!selection&&!bounds&&!provenance?(i,c)=>{target[i]=c;}:(i,c)=>{
    if(target)target[i]=c;
    if(selection)selection[i]=c!==255;
    if(bounds&&c!==255)grow(i);
    if(provenance)provenance[i]=kind;
  };
  // A zero kind keeps the provenance already recorded (group composites).
  const paint=(i,c,k=PROVENANCE.effect)=>{
    if(target)target[i]=c;
    if(bounds&&c!==255)grow(i);
    if(provenance&&k)provenance[i]=k;
  };
  const dot=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<size&&y>=0&&y<size)put(y*size+x,c);};
  const rect=(x,y,w,h,c)=>{
    if(pixelArt){
      if(!(w>0&&h>0))return;
      const right=Math.round(x+w),bottom=Math.round(y+h);x=Math.round(x);y=Math.round(y);
      w=Math.max(1,right-x);h=Math.max(1,bottom-y);
    }
    for(let j=Math.max(0,Math.ceil(y));j<Math.min(size,y+h);j++)for(let i=Math.max(0,Math.ceil(x));i<Math.min(size,x+w);i++)put(j*size+i,c);
  };
  // Share the same sampled contour between solids and hollow shapes. The legacy
  // mask and tip trimming are unchanged so original mascot pixels stay stable.
  const ellipseMask=(cx,cy,rx,ry,angle)=>{
    const co=Math.cos(angle),si=Math.sin(angle),bx=Math.hypot(rx*co,ry*si),by=Math.hypot(rx*si,ry*co);
    const x0=Math.floor(cx-bx),y0=Math.floor(cy-by),w=Math.ceil(cx+bx)-x0,h=Math.ceil(cy+by)-y0;
    const mask=new Uint8Array(w*h),rows=new Uint16Array(h),cols=new Uint16Array(w);
    let count=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const dx=x+x0+.5-cx,dy=y+y0+.5-cy,u=dx*co+dy*si,v=dy*co-dx*si;
      if(u*u/(rx*rx)+v*v/(ry*ry)<1){mask[y*w+x]=1;rows[y]++;cols[x]++;count++;}
    }
    const remove=(x,y)=>{if(mask[y*w+x]){mask[y*w+x]=0;rows[y]--;cols[x]--;count--;}};
    // At any rotation the outermost occupied row/column should be a short run,
    // never the one-pixel spike produced by sampling the mathematical extrema.
    let changed=true;
    while(changed&&count>4){
      changed=false;
      for(const row of [rows.findIndex(n=>n>0),rows.findLastIndex(n=>n>0)])if(rows[row]===1){
        const x=mask.subarray(row*w,(row+1)*w).indexOf(1);remove(x,row);changed=true;
      }
      for(const col of [cols.findIndex(n=>n>0),cols.findLastIndex(n=>n>0)])if(cols[col]===1){
        for(let y=0;y<h;y++)if(mask[y*w+col]){remove(col,y);changed=true;break;}
      }
    }
    return {mask,x0,y0,w,h,count};
  };
  const ellipse=(cx,cy,rx,ry,c,angle=0)=>{
    if(!(rx>0&&ry>0))return;
    const {mask,x0,y0,w,h,count}=ellipseMask(cx,cy,rx,ry,angle);
    if(pixelArt&&!count){dot(cx-.5,cy-.5,c);return;}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x])dot(x+x0,y+y0,c);
  };
  // Tiny spheres need a symmetric final-grid silhouette. Shade the selected
  // disk through its normal; highlights cannot grow beyond the original disk.
  // Shared by moons, glass and wheels. Four pixels is the minimum
  // readable diameter; no finished bitmap is scaled or filtered.
  const sphere=(cx,cy,radius,colorAt)=>{
    if(!(radius>0))return;
    const diameter=Math.max(4,Math.round(radius*2)),rr=diameter/2;
    cx=Math.round(cx-rr)+rr;cy=Math.round(cy-rr)+rr;
    const {mask,x0,y0,w,h}=ellipseMask(cx,cy,rr,rr,0);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){
      const nx=(x+x0+.5-cx)/rr,ny=(y+y0+.5-cy)/rr,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
      const edge=x===0||y===0||x===w-1||y===h-1||!mask[y*w+x-1]||!mask[y*w+x+1]||!mask[(y-1)*w+x]||!mask[(y+1)*w+x];
      dot(x+x0,y+y0,typeof colorAt==='function'?colorAt(nx,ny,nz,x+x0+.5,y+y0+.5,edge):colorAt);
    }
  };
  const poly=(points,c)=>{
    if(points.length<3)return;
    const lo=Math.max(0,Math.ceil(Math.min(...points.map(p=>p[1])))),hi=Math.min(size-1,Math.max(...points.map(p=>p[1])));
    const left=Math.max(0,Math.ceil(Math.min(...points.map(p=>p[0])))),right=Math.min(size-1,Math.max(...points.map(p=>p[0])));
    // Pixel art fills by scanline: the same crossings and comparison, so the
    // coverage and write order equal the per-pixel test below.
    if(pixelArt&&finitePoints(points)){scanPolygon(points,lo,hi,left,right,(x,y)=>put(y*size+x,c));return;}
    for(let y=lo;y<=hi;y++)for(let x=left;x<=right;x++){
      let inside=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [a,b]=points[i],[d,e]=points[j];
        if((b>y)!==(e>y)&&x<(d-a)*(y-b)/(e-b)+a)inside=!inside;
      }
      if(inside)dot(x,y,c);
    }
  };
  const round=(x,y,w,h,r,c)=>{
    if(pixelArt){
      if(!(w>0&&h>0))return;
      w=Math.max(1,Math.round(x+w)-Math.round(x));h=Math.max(1,Math.round(y+h)-Math.round(y));
    }
    x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);r=Math.min(r,w/2,h/2);
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const dx=Math.max(r-i-.5,i+.5-(w-r),0),dy=Math.max(r-j-.5,j+.5-(h-r),0);
      if(dx*dx+dy*dy<=r*r)dot(x+i,y+j,c);
    }
  };
  // Unlike a capsule, a superellipse keeps long, nearly straight sides and
  // subtly squared ends. Sample in its rotated local coordinates, without AA.
  const superellipse=(cx,cy,rx,ry,n,c,angle=0,clip)=>{
    const co=Math.cos(angle),si=Math.sin(angle),bx=Math.abs(rx*co)+Math.abs(ry*si),by=Math.abs(rx*si)+Math.abs(ry*co);
    for(let y=Math.floor(cy-by);y<cy+by;y++)for(let x=Math.floor(cx-bx);x<cx+bx;x++){
      const dx=x+.5-cx,dy=y+.5-cy;
      if(Math.abs((dx*co+dy*si)/rx)**n+Math.abs((dy*co-dx*si)/ry)**n<=1&&(!clip||clip[y*size+x]))dot(x,y,c);
    }
  };
  // Shared integer strokes: pipes, stems, antennae, architecture and runes.
  const line=(x0,y0,x1,y1,c,width=1)=>{
    x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    // Bresenham's exact-half ties otherwise depend on traversal direction.
    if(pixelArt&&(x0>x1||(x0===x1&&y0>y1))){[x0,x1]=[x1,x0];[y0,y1]=[y1,y0];}
    width=Math.max(1,Math.round(width));const offset=Math.floor(width/2);
    const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
    let error=dx+dy;
    for(;;){rect(x0-offset,y0-offset,width,width,c);if(x0===x1&&y0===y1)break;
      const twice=2*error;if(twice>=dy){error+=dy;x0+=sx;}if(twice<=dx){error+=dx;y0+=sy;}}
  };
  const stroke=(points,c,width=1,closed=false)=>{
    for(let i=1;i<points.length;i++)line(...points[i-1],...points[i],c,width);
    if(closed&&points.length>1)line(...points.at(-1),...points[0],c,width);
  };
  // Orthogonal tubing with a one-device-pixel radius at convex elbows/caps.
  // Only this primitive's source mask is shaped; no finished image is filtered.
  const pipe=(points,c,width=5,radius=1)=>{
    if(radius!==0&&radius!==1)throw Error('Pipe corner radius is zero or one final pixel.');
    for(let i=1;i<points.length;i++)if(points[i][0]!==points[i-1][0]&&points[i][1]!==points[i-1][1])throw Error('Pipes need an orthogonal path.');
    if(!radius||Math.round(width)<3){stroke(points,c,width);return;}
    // Only the stroked path's bounding box can hold path pixels or corners.
    const shape=new Uint8Array(size*size),box={left:size,top:size,right:-1,bottom:-1};
    raster(shape,size,{pixelArt,bounds:box}).stroke(points,1,width);
    for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){
      const i=y*size+x;if(!shape[i])continue;
      const l=x>0&&shape[i-1],r=x+1<size&&shape[i+1],u=y>0&&shape[i-size],d=y+1<size&&shape[i+size];
      const corner=(!l&&!u&&r&&d)||(!r&&!u&&l&&d)||(!l&&!d&&r&&u)||(!r&&!d&&l&&u);
      if(!corner)dot(x,y,c);
    }
  };
  // Hollow ellipse without erasing the picture underneath its opening.
  const ring=(cx,cy,rx,ry,c,width=1,angle=0)=>{
    if(!(rx>0&&ry>0&&width>0))return;
    if(pixelArt){arc(cx,cy,rx,ry,c,width,angle);return;}
    const co=Math.cos(angle),si=Math.sin(angle),bx=Math.hypot(rx*co,ry*si),by=Math.hypot(rx*si,ry*co);
    const ix=Math.max(0,rx-width),iy=Math.max(0,ry-width);
    for(let y=Math.max(0,Math.floor(cy-by));y<Math.min(size,cy+by);y++)for(let x=Math.max(0,Math.floor(cx-bx));x<Math.min(size,cx+bx);x++){
      const dx=x+.5-cx,dy=y+.5-cy,u=dx*co+dy*si,v=dy*co-dx*si;
      if(u*u/(rx*rx)+v*v/(ry*ry)<=1&&(!ix||!iy||u*u/(ix*ix)+v*v/(iy*iy)>=1))dot(x,y,c);
    }
  };
  // Digital ellipse boundary plus an optional thicker analytic inset. Keeping
  // every cardinal boundary pixel prevents thin, eccentric rings breaking up.
  // Angular clipping is currently used only by planets' front/back orbits.
  // Partial arcs need both radii >= 2 final pixels; below this scale the angular
  // cut is ambiguous, so omit the detail. Full rings still support tiny radii.
  // This controls raster continuity, not the artistic quality of arbitrary paths.
  const arc=(cx,cy,rx,ry,c,width=1,angle=0,start=0,end=Math.PI*2)=>{
    if(!(rx>0&&ry>0&&width>0&&end>start))return;
    if(end-start<Math.PI*2&&Math.min(rx,ry)<2)return;
    width=Math.max(1,width);
    const {mask,x0,y0,w,h,count}=ellipseMask(cx,cy,rx,ry,angle);
    if(!count){dot(cx-.5,cy-.5,c);return;}
    const co=Math.cos(angle),si=Math.sin(angle),ix=Math.max(0,rx-width),iy=Math.max(0,ry-width),tau=Math.PI*2;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){
      const dx=x+x0+.5-cx,dy=y+y0+.5-cy,u=dx*co+dy*si,v=dy*co-dx*si;
      if(end-start<tau){
        const a=((Math.atan2(v/ry,u/rx)-start)%tau+tau)%tau;
        if(a>end-start)continue;
      }
      const edge=x===0||y===0||x===w-1||y===h-1||!mask[y*w+x-1]||!mask[y*w+x+1]||!mask[(y-1)*w+x]||!mask[(y+1)*w+x];
      if(edge||!ix||!iy||u*u/(ix*ix)+v*v/(iy*iy)>=1)dot(x+x0,y+y0,c);
    }
  };
  // Continuous material sampling occurs once at each final pixel center. Null
  // skips a pixel; index zero remains a valid paint color. Device coordinates
  // are also forwarded so ordered material patterns survive nested transforms.
  const sample=(x,y,w,h,colorAt)=>{
    if(!(w>0&&h>0))return;
    for(let j=Math.max(0,Math.ceil(y-.5));j<Math.min(size,y+h-.5);j++)for(let i=Math.max(0,Math.ceil(x-.5));i<Math.min(size,x+w-.5);i++){
      const c=colorAt(i+.5,j+.5,i+.5,j+.5);if(c!=null)put(j*size+i,c);
    }
  };
  const detail=(x,y,color,reason)=>{
    if(typeof reason!=='string'||!reason.trim())throw Error('An isolated detail needs a visual reason.');
    dot(x,y,color);x=Math.round(x);y=Math.round(y);
    if(x>=0&&x<size&&y>=0&&y<size)intent.set(y*size+x,{color,reason});
  };
  // ---- Engine-19 device-space primitives (pixel lists from strokes.js) ----
  // One device pixel, with intent when a reason is given (glints, stamps).
  const mark=(x,y,c,reason)=>{
    if(x>=0&&x<size&&y>=0&&y<size){put(y*size+x,c);if(typeof reason==='string'&&reason.trim())intent.set(y*size+x,{color:c,reason});}
  };
  // A 1 px path with no L-corners: colors is an index or [[color,tMax],...]
  // by arc length.
  const inkPath=(points,colors,{closed=false}={})=>{
    const pixels=inkPixels(points,closed),t=Array.isArray(colors)?arcFractions(pixels):null;
    for(let i=0;i<pixels.length;i++)mark(pixels[i][0],pixels[i][1],t?stepColor(colors,t[i]):colors);
  };
  // Tapered quadratic speed line; radii are device pixels, colours by t.
  const streak=(root,ctrl,end,r0,r1,colors)=>{
    for(const [x,y,t] of streakPixels(root,ctrl,end,r0,r1))mark(x,y,stepColor(colors,t));
  };
  // A cross glint at the rounded point; every pixel is registered as intent
  // (reason null: none, as recolor() asks).
  const glint=(x,y,{arms=1,core=8,tip=null,reason='glint',mirrored=false}={})=>{
    x=Math.round(x);y=Math.round(y);
    for(const [dx,dy,c] of glintPixels(arms,core,tip,mirrored))mark(x+dx,y+dy,c,reason);
  };
  // Text-art rows; with a reason, the stamp's colour singletons are intent.
  const stamp=(x,y,rows,map,{anchor='center',reason=null,mirrored=false}={})=>{
    x=Math.round(x);y=Math.round(y);
    for(const [dx,dy,c,isolated] of stampPixels(rows,map,{anchor,mirrored}))mark(x+dx,y+dy,c,isolated?reason:null);
  };
  // poly() coverage with edge-normal lit/mid/dark boundary classes in device
  // space and an optional glint on the most lit vertex.
  const facetPoly=(points,{mid,lit=mid,dark=mid,threshold=.35,light=[-1,-1],glint=null}={})=>{
    if(mid==null)throw Error('A facet polygon needs a mid colour.');
    const colors=[mid,lit??mid,mid,dark??mid],{pixels,glint:at}=facetPixels(points,{threshold,light});
    for(const [x,y,cls] of pixels)mark(x,y,colors[cls]);
    if(glint&&at>=0){const g=glint===true?{}:glint;mark(pixels[at][0],pixels[at][1],g.color??8,g.reason===undefined?'glint':g.reason);}
  };
  // Material groups and their device-pixel effects live in group.js.
  const group=createGroup({target,size,pixelArt,intent,effects,selection,bounds,provenance,paint,raster});
  const api={dot,rect,ellipse,sphere,poly,round,superellipse,line,stroke,pipe,ring,arc,sample,detail,group,inkPath,streak,glint,stamp,facetPoly};
  // Only a provenance record needs to know which public call is drawing;
  // internal calls (line -> rect, ring -> arc, detail -> dot) keep its kind.
  if(provenance&&!kind)for(const name of Object.keys(api))if(PROVENANCE[name]){
    const draw=api[name],k=PROVENANCE[name];
    api[name]=(...args)=>{kind=k;return draw(...args);};
  }
  return api;
}

// Transform geometry before rasterization: no doubled source pixels or AA.
// Engine-19 primitives map only their points: widths, radii, arms and stamp
// art stay device pixels.
export function viewport(p,{x=0,y=0,scale=1}={}) {
  const X=v=>x+v*scale,Y=v=>y+v*scale,S=v=>v*scale,P=([a,b])=>[X(a),Y(b)];
  return {
    group:(draw,options)=>p.group(q=>draw(viewport(q,{x,y,scale})),mapGroupOptions(options,(a,b)=>[X(a),Y(b)],(a,b)=>[(a-x)/scale,(b-y)/scale])),
    dot:(a,b,c)=>p.dot(X(a),Y(b),c),
    rect:(a,b,w,h,c)=>p.rect(X(a),Y(b),S(w),S(h),c),
    poly:(points,c)=>p.poly(points.map(([a,b])=>[X(a),Y(b)]),c),
    ellipse:(a,b,rx,ry,c,angle=0)=>p.ellipse(X(a),Y(b),S(rx),S(ry),c,angle),
    sphere:(a,b,r,colorAt)=>p.sphere(X(a),Y(b),S(r),colorAt),
    round:(a,b,w,h,r,c)=>p.round(X(a),Y(b),S(w),S(h),S(r),c),
    line:(a,b,d,e,c,w=1)=>p.line(X(a),Y(b),X(d),Y(e),c,S(w)),
    stroke:(points,c,w=1,closed=false)=>p.stroke(points.map(([a,b])=>[X(a),Y(b)]),c,S(w),closed),
    pipe:(points,c,w=5,radius=1)=>p.pipe(points.map(([a,b])=>[X(a),Y(b)]),c,S(w),radius),
    ring:(a,b,rx,ry,c,w=1,angle=0)=>p.ring(X(a),Y(b),S(rx),S(ry),c,S(w),angle),
    arc:(a,b,rx,ry,c,w=1,angle=0,start=0,end=Math.PI*2)=>p.arc(X(a),Y(b),S(rx),S(ry),c,S(w),angle,start,end),
    sample:(a,b,w,h,colorAt)=>p.sample(X(a),Y(b),S(w),S(h),(px,py,dx,dy)=>colorAt((px-x)/scale,(py-y)/scale,dx,dy)),
    ...(p.detail?{detail:(a,b,c,reason)=>p.detail(X(a),Y(b),c,reason)}:{}),
    inkPath:(points,colors,options)=>p.inkPath(points.map(P),colors,options),
    streak:(root,ctrl,end,r0,r1,colors)=>p.streak(P(root),P(ctrl),P(end),r0,r1,colors),
    glint:(a,b,options)=>p.glint(X(a),Y(b),options),
    stamp:(a,b,rows,map,options)=>p.stamp(X(a),Y(b),rows,map,options),
    facetPoly:(points,options)=>p.facetPoly(points.map(P),options),
  };
}

// An ellipse (rx, ry, angle) under axis scales and an optional reflection:
// the device major/minor radii, their angle and the parameter phase shift.
function ovalOf(rx,ry,angle,scaleX,scaleY,sign) {
  const c=Math.cos(angle),s=Math.sin(angle),a=scaleX**2*(rx*rx*c*c+ry*ry*s*s),
    b=sign*scaleX*scaleY*(rx*rx-ry*ry)*c*s,d=scaleY**2*(rx*rx*s*s+ry*ry*c*c);
  const discriminant=Math.hypot(a-d,2*b),turn=Math.atan2(2*b,a-d)/2;
  const major=Math.sqrt((a+d+discriminant)/2),minor=Math.sqrt(Math.max(0,(a+d-discriminant)/2));
  const u=sign*scaleX*rx*c,v=scaleY*rx*s;
  const phase=Math.atan2((-Math.sin(turn)*u+Math.cos(turn)*v)/minor,(Math.cos(turn)*u+Math.sin(turn)*v)/major);
  return [major,minor,turn,phase];
}
// A reflected part mirrors the anchoring of glints and stamps, never their art.
const mirrorAnchor=(options,flipX)=>flipX?{...options,mirrored:!options?.mirrored}:options;

// Positive axis scales let recipes place a reusable part relative to an anchor.
// Rotated ellipses are transformed analytically, never stretched as bitmaps.
// rotate:[dx,dy] turns the part to a whole-ratio direction (see rotatedPart).
export function part(p,{x=0,y=0,scaleX=1,scaleY=1,flipX=false,rotate=null}={}) {
  if(!(scaleX>0&&scaleY>0))throw Error('Part scales must be positive.');
  if(rotate!=null)return rotatedPart(p,{x,y,scaleX,scaleY,flipX,rotate});
  const sign=flipX?-1:1,X=v=>x+sign*v*scaleX,Y=v=>y+v*scaleY,S=v=>v*Math.min(scaleX,scaleY);
  const L=(a,w)=>Math.min(X(a),X(a+w)),P=([a,b])=>[X(a),Y(b)];
  const oval=(rx,ry,angle)=>ovalOf(rx,ry,angle,scaleX,scaleY,sign);
  return {
    group:(draw,options)=>p.group(q=>draw(part(q,{x,y,scaleX,scaleY,flipX})),mapGroupOptions(options,(a,b)=>[X(a),Y(b)],(a,b)=>[(a-x)/(sign*scaleX),(b-y)/scaleY],{flipX})),
    dot:(a,b,c)=>p.dot(X(a),Y(b),c),
    rect:(a,b,w,h,c)=>p.rect(L(a,w),Y(b),w*scaleX,h*scaleY,c),
    poly:(points,c)=>p.poly(points.map(([a,b])=>[X(a),Y(b)]),c),
    line:(a,b,d,e,c,w=1)=>p.line(X(a),Y(b),X(d),Y(e),c,S(w)),
    stroke:(points,c,w=1,closed=false)=>p.stroke(points.map(([a,b])=>[X(a),Y(b)]),c,S(w),closed),
    pipe:(points,c,w=5,radius=1)=>p.pipe(points.map(([a,b])=>[X(a),Y(b)]),c,S(w),radius),
    round:(a,b,w,h,r,c)=>p.round(L(a,w),Y(b),w*scaleX,h*scaleY,S(r),c),
    ellipse:(a,b,rx,ry,c,angle=0)=>{const [u,v,t]=oval(rx,ry,angle);p.ellipse(X(a),Y(b),u,v,c,t);},
    sphere:(a,b,r,colorAt)=>p.sphere(X(a),Y(b),S(r),colorAt),
    ring:(a,b,rx,ry,c,w=1,angle=0)=>{const [u,v,t]=oval(rx,ry,angle);p.ring(X(a),Y(b),u,v,c,S(w),t);},
    arc:(a,b,rx,ry,c,w=1,angle=0,start=0,end=Math.PI*2)=>{const [u,v,t,phase]=oval(rx,ry,angle);p.arc(X(a),Y(b),u,v,c,S(w),t,flipX?phase-end:start+phase,flipX?phase-start:end+phase);},
    sample:(a,b,w,h,colorAt)=>p.sample(L(a,w),Y(b),w*scaleX,h*scaleY,(px,py,dx,dy)=>colorAt((px-x)/(sign*scaleX),(py-y)/scaleY,dx,dy)),
    ...(p.detail?{detail:(a,b,c,reason)=>p.detail(X(a),Y(b),c,reason)}:{}),
    inkPath:(points,colors,options)=>p.inkPath(points.map(P),colors,options),
    streak:(root,ctrl,end,r0,r1,colors)=>p.streak(P(root),P(ctrl),P(end),r0,r1,colors),
    glint:(a,b,options)=>p.glint(X(a),Y(b),mirrorAnchor(options,flipX)),
    stamp:(a,b,rows,map,options)=>p.stamp(X(a),Y(b),rows,map,mirrorAnchor(options,flipX)),
    facetPoly:(points,options)=>p.facetPoly(points.map(P),options),
  };
}

// Whole-ratio rotations only: their straight edges rasterize as even runs.
const ROTATIONS=new Set(['2,1','1,1','1,2']);
// Rotated vertices are irrational, so straight edges never pass exactly through
// the integer grid, except edges from an integer anchor. A fixed sub-1e-6
// offset along (4,3), parallel to no allowed edge direction, resolves those
// exact ties the same way along the whole edge, so float noise cannot break a
// 2:1 edge's runs. It is far below one pixel.
const NUDGE_X=2**-20,NUDGE_Y=3*2**-22;
/** part() turned by a whole-ratio vector [dx,dy]: (2,1), (1,1), (1,2) and
 * their sign variants (anything else throws). c=dx/h, s=dy/h. Local points
 * are scaled (and reflected by flipX) first, then turned clockwise on screen
 * by atan2(dy,dx). rect becomes a 4-point poly; round and sample sample the
 * turned box through the inverse transform; ellipse, ring and arc add the
 * angle; sphere moves only its centre; pipe falls back to stroke; group
 * options go through mapGroupOptions with rotated:true. Device sizes
 * (outlines, glints, stamps, streak radii, inkPath) are unchanged. */
function rotatedPart(p,{x,y,scaleX,scaleY,flipX,rotate}) {
  const [rx,ry]=Array.isArray(rotate)?rotate:[];
  if(!Number.isInteger(rx)||!Number.isInteger(ry)||!ROTATIONS.has(Math.abs(rx)+','+Math.abs(ry)))
    throw Error('Part rotation must be a whole-ratio vector: (2,1), (1,1) or (1,2) with any signs.');
  const h=Math.hypot(rx,ry),c=rx/h,s=ry/h,theta=Math.atan2(ry,rx),sign=flipX?-1:1,S=v=>v*Math.min(scaleX,scaleY);
  const F=(a,b)=>{const u=sign*a*scaleX,v=b*scaleY;return [x+c*u-s*v+NUDGE_X,y+s*u+c*v+NUDGE_Y];};
  const I=(px,py)=>{const du=px-x-NUDGE_X,dv=py-y-NUDGE_Y;return [(c*du+s*dv)/(sign*scaleX),(c*dv-s*du)/scaleY];};
  const P=([a,b])=>F(a,b),oval=(rx,ry,angle)=>ovalOf(rx,ry,angle,scaleX,scaleY,sign);
  // Sample the turned box [a,a+w) x [b,b+h) through the inverse transform.
  const box=(a,b,w,h,colorAt)=>{
    if(!(w>0&&h>0))return;
    const corners=[F(a,b),F(a+w,b),F(a+w,b+h),F(a,b+h)],xs=corners.map(q=>q[0]),ys=corners.map(q=>q[1]);
    const left=Math.min(...xs),top=Math.min(...ys);
    p.sample(left,top,Math.max(...xs)-left,Math.max(...ys)-top,(px,py,dx,dy)=>{
      const [u,v]=I(px,py);
      return u>=a&&u<a+w&&v>=b&&v<b+h?colorAt(u,v,dx,dy):null;
    });
  };
  return {
    group:(draw,options)=>p.group(q=>draw(part(q,{x,y,scaleX,scaleY,flipX,rotate})),mapGroupOptions(options,F,I,{flipX,rotated:true})),
    dot:(a,b,color)=>p.dot(...F(a,b),color),
    rect:(a,b,w,h,color)=>{if(w>0&&h>0)p.poly([F(a,b),F(a+w,b),F(a+w,b+h),F(a,b+h)],color);},
    poly:(points,color)=>p.poly(points.map(P),color),
    line:(a,b,d,e,color,w=1)=>p.line(...F(a,b),...F(d,e),color,S(w)),
    stroke:(points,color,w=1,closed=false)=>p.stroke(points.map(P),color,S(w),closed),
    pipe:(points,color,w=5)=>p.stroke(points.map(P),color,S(w)),
    round:(a,b,w,h,r,color)=>{
      r=Math.min(r,w/2,h/2);
      box(a,b,w,h,(u,v)=>{
        const i=u-a,j=v-b,dx=Math.max(r-i,i-(w-r),0),dy=Math.max(r-j,j-(h-r),0);
        return dx*dx+dy*dy<=r*r?color:null;
      });
    },
    ellipse:(a,b,rx,ry,color,angle=0)=>{const [u,v,t]=oval(rx,ry,angle);p.ellipse(...F(a,b),u,v,color,t+theta);},
    sphere:(a,b,r,colorAt)=>p.sphere(...F(a,b),S(r),colorAt),
    ring:(a,b,rx,ry,color,w=1,angle=0)=>{const [u,v,t]=oval(rx,ry,angle);p.ring(...F(a,b),u,v,color,S(w),t+theta);},
    arc:(a,b,rx,ry,color,w=1,angle=0,start=0,end=Math.PI*2)=>{const [u,v,t,phase]=oval(rx,ry,angle);p.arc(...F(a,b),u,v,color,S(w),t+theta,flipX?phase-end:start+phase,flipX?phase-start:end+phase);},
    sample:box,
    ...(p.detail?{detail:(a,b,color,reason)=>p.detail(...F(a,b),color,reason)}:{}),
    inkPath:(points,colors,options)=>p.inkPath(points.map(P),colors,options),
    streak:(root,ctrl,end,r0,r1,colors)=>p.streak(P(root),P(ctrl),P(end),r0,r1,colors),
    glint:(a,b,options)=>p.glint(...F(a,b),mirrorAnchor(options,flipX)),
    stamp:(a,b,rows,map,options)=>p.stamp(...F(a,b),rows,map,mirrorAnchor(options,flipX)),
    facetPoly:(points,options)=>p.facetPoly(points.map(P),options),
  };
}

/** A recolouring surface, like viewport: every colour argument, every sample
 * and sphere result (null stays null) and every colour step goes through map
 * (a function, or an array/object lookup where missing entries pass through).
 * group() becomes a plain draw with no effects; detail becomes a mapped dot;
 * glint, stamp and facetPoly glints keep their device shape but register no
 * intent. Echo silhouettes replay a recorded drawing through it. */
export function recolor(p,map) {
  const M=typeof map==='function'?map:c=>map[c]??c;
  const steps=colors=>Array.isArray(colors)?colors.map(([color,t])=>[M(color),t]):M(colors);
  const shade=colorAt=>typeof colorAt==='function'?(...args)=>{const c=colorAt(...args);return c==null?c:M(c);}:M(colorAt);
  const q={
    group:draw=>draw(q),
    dot:(a,b,c)=>p.dot(a,b,M(c)),
    rect:(a,b,w,h,c)=>p.rect(a,b,w,h,M(c)),
    poly:(points,c)=>p.poly(points,M(c)),
    ellipse:(a,b,rx,ry,c,...rest)=>p.ellipse(a,b,rx,ry,M(c),...rest),
    sphere:(a,b,r,colorAt)=>p.sphere(a,b,r,shade(colorAt)),
    round:(a,b,w,h,r,c)=>p.round(a,b,w,h,r,M(c)),
    superellipse:(cx,cy,rx,ry,n,c,...rest)=>p.superellipse(cx,cy,rx,ry,n,M(c),...rest),
    line:(a,b,d,e,c,...rest)=>p.line(a,b,d,e,M(c),...rest),
    stroke:(points,c,...rest)=>p.stroke(points,M(c),...rest),
    pipe:(points,c,...rest)=>p.pipe(points,M(c),...rest),
    ring:(a,b,rx,ry,c,...rest)=>p.ring(a,b,rx,ry,M(c),...rest),
    arc:(a,b,rx,ry,c,...rest)=>p.arc(a,b,rx,ry,M(c),...rest),
    sample:(a,b,w,h,colorAt)=>p.sample(a,b,w,h,shade(colorAt)),
    detail:(a,b,c)=>p.dot(a,b,M(c)),
    inkPath:(points,colors,options)=>p.inkPath(points,steps(colors),options),
    streak:(root,ctrl,end,r0,r1,colors)=>p.streak(root,ctrl,end,r0,r1,steps(colors)),
    glint:(a,b,options={})=>p.glint(a,b,{...options,core:M(options.core??8),tip:options.tip==null?null:M(options.tip),reason:null}),
    stamp:(a,b,rows,map,options={})=>p.stamp(a,b,rows,Object.fromEntries(Object.entries(map).map(([k,c])=>[k,M(c)])),{...options,reason:null}),
    facetPoly:(points,options={})=>{
      const glint=options.glint?{color:M((options.glint===true?{}:options.glint).color??8),reason:null}:options.glint;
      p.facetPoly(points,{...options,mid:M(options.mid),...(options.lit==null?{}:{lit:M(options.lit)}),...(options.dark==null?{}:{dark:M(options.dark)}),glint});
    },
  };
  return q;
}
