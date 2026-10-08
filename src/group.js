// Material groups: draw a union of fills, derive every effect from that
// selection, then composite shadow -> outer stroke -> source.
// Effect widths stay device pixels through viewport/part, including nested
// transforms. raster.js builds one group() per surface through createGroup.
//
// Order inside one group() call (engine-contract E2):
//  1. draw into `source` and `mask`;   2. mirror;   3. extrude (into source);
//  4. edgeShade;   5. bevel;   6. glints;
//  7. shadow from mask_eff = mask + extrusion -> paint where effectMask allows;
//  8. outline from mask_eff (selout classes, exteriorOnly, then pinholes);
//  9. composite source over the target;  10. mask_eff to the parent selection.
// Steps 4-6 work on the drawn material (`mask`), not on the extrusion. Every
// option defaults to off, which reproduces engine 18 exactly. Loops run only
// over the bounding box the drawing recorded, grown by each effect's reach.
import {outlineMask,dropShadowMask,sweptShadowMask,bevelMask,erodeMask4,extrudeMask} from './masks.js';
import {dither} from './materials.js';
import {DARKER,LIGHTER,DARKEN1,DARKEN2} from './roles.js';

const TRANSPARENT=255;
// raster.js PROVENANCE kinds (not imported: raster.js imports this module).
const EFFECT=13,GLINT=16;
const EXTRUDE=Object.freeze({dx:1,dy:1,depth:2,side:'darker',under:'darker2',crumbs:true});
// edgeShade band: the checker seam needs material this thick on both axes.
const BAND_SEAM_MIN=5;

// One role step along the fixed tables. Indices beyond the tables keep their
// value; a DARKEN1 marker deepens to DARKEN2.
const darkerOf=c=>c<DARKER.length?DARKER[c]:c===DARKEN1?DARKEN2:c;
const lighterOf=c=>c<LIGHTER.length?LIGHTER[c]:c;
// A colour option: a palette index, or a role step from the colour `c` under it.
const tone=(spec,c)=>spec==='darker'?darkerOf(c):spec==='darker2'?darkerOf(darkerOf(c)):spec==='lighter'?lighterOf(c):spec;
const checkTone=(name,spec,words)=>{
  if(spec==null||words.includes(spec)||(Number.isInteger(spec)&&spec>=0&&spec<TRANSPARENT))return;
  throw Error(`Group option ${name} must be a palette index${words.length?' or '+words.map(w=>`'${w}'`).join(', '):''}.`);
};

/** What a 'darken' write leaves on a pixel that holds `value`: an empty pixel
 * becomes the DARKEN1 marker (DARKEN2 for two steps), a marker deepens to
 * DARKEN2, and a colour steps down DARKER once or twice. The engine resolves
 * markers left in the subject layer against the background when compositing. */
export function darkenOnto(value,steps=1) {
  if(value===TRANSPARENT)return steps>1?DARKEN2:DARKEN1;
  if(value===DARKEN1||value===DARKEN2)return DARKEN2;
  const once=darkerOf(value);
  return steps>1?darkerOf(once):once;
}

const extrudeOptions=e=>({...EXTRUDE,...Object.fromEntries(Object.entries(e).filter(([,v])=>v!==undefined))});

/** Device-pixel margins that one group's outline, shadow and extrusion add
 * around its material, as recordDrawing accumulates them for composition. A
 * swept shadow reaches as far as the drop shadow with the same offset. */
export function effectMargins(options={}) {
  const w=options.outline||0,s=options.shadow,sx=s?(s.x??2):0,sy=s?(s.y??3):0;
  const margins={left:Math.max(w,-sx),right:Math.max(w,sx),top:Math.max(w,-sy),bottom:Math.max(w,sy)};
  if(options.extrude){
    const {dx,dy,depth}=extrudeOptions(options.extrude);
    if(dx>0)margins.right+=depth*dx;else if(dx<0)margins.left-=depth*dx;
    if(dy>0)margins.bottom+=depth*dy;else if(dy<0)margins.top-=depth*dy;
  }
  return margins;
}

/** Map recipe-space group options into a transformed surface. `forward` and
 * `inverse` map a point (a,b) to [x,y] and back; `{flipX,rotated}` describe
 * the transform. `effectMask` is mapped through `inverse`; `mirror.x` and every
 * `glints[]` point through `forward`, and a flipX swaps the mirror's `from`
 * half. A mirror cannot pass through a rotated part. Returns the same `options`
 * object when nothing needs mapping. */
export function mapGroupOptions(options,forward,inverse,{flipX=false,rotated=false}={}) {
  if(!options||(!options.effectMask&&!options.mirror&&!options.glints))return options;
  const mapped={...options};
  if(options.effectMask)mapped.effectMask=(a,b)=>{const [u,v]=inverse(a,b);return options.effectMask(u,v);};
  if(options.mirror){
    const m=options.mirror,[x]=forward(m.x,0),[skew]=forward(m.x,1);
    if(rotated||Math.abs(skew-x)>1e-9)throw Error('A mirrored group cannot be drawn through a rotated part.');
    mapped.mirror={...m,x,...(flipX?{from:m.from==='right'?'left':'right'}:{})};
  }
  if(options.glints)mapped.glints=options.glints.map(g=>{const [x,y]=forward(g.x,g.y);return {...g,x,y};});
  return mapped;
}

// Disk offsets of radius w ordered by squared distance, then row-major.
const disks=new Map();
function disk(w) {
  if(!disks.has(w)){
    const list=[];
    for(let y=-w;y<=w;y++)for(let x=-w;x<=w;x++)if(x*x+y*y<=w*w)list.push([x,y,x*x+y*y]);
    list.sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0]-b[0]);
    disks.set(w,list);
  }
  return disks.get(w);
}
// Chebyshev square of glint candidates, nearest first, then by (y,x).
const squares=new Map();
function square(reach) {
  if(!squares.has(reach)){
    const list=[];
    for(let y=-reach;y<=reach;y++)for(let x=-reach;x<=reach;x++)list.push([x,y,x*x+y*y]);
    list.sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0]-b[0]);
    squares.set(reach,list);
  }
  return squares.get(reach);
}

// Pixel-exact mirror about the device axis A2/2, A2 = round(2*x): pixel x maps
// to A2-1-x. The `from` half overwrites the other half (pixels, material and
// recorded kinds); the axis column of an odd A2 stays. Intents are not copied.
function mirrorHalf(source,mask,prov,size,box,{x,from='left',shade=null}) {
  if(!Number.isFinite(x))throw Error('A mirror needs a finite axis x.');
  if(from!=='left'&&from!=='right')throw Error("A mirror's source half is 'left' or 'right'.");
  if(shade!=null&&shade!=='darker')throw Error("A mirror shade is null or 'darker'.");
  if(box.right<0)return;
  const A2=Math.round(2*x),right=from==='right';
  const lo=Math.max(0,Math.min(box.left,A2-1-box.right)),hi=Math.min(size-1,Math.max(box.right,A2-1-box.left));
  for(let y=box.top;y<=box.bottom;y++)for(let d=lo;d<=hi;d++){
    if(right?2*d>=A2-1:2*d<=A2-1)continue;
    const s=A2-1-d,i=y*size+d,j=y*size+s,c=s>=0&&s<size?source[j]:TRANSPARENT;
    if(c===TRANSPARENT){source[i]=TRANSPARENT;mask[i]=0;}
    else {source[i]=shade?darkerOf(c):c;mask[i]=mask[j];if(prov)prov[i]=prov[j];}
  }
  box.left=lo;box.right=hi;
}

/** The group() primitive of one raster surface. `env` holds that surface's
 * {target,size,pixelArt,intent,effects,selection,bounds,provenance} plus its
 * `paint(i,c,kind)` writer and the `raster` constructor. */
export function createGroup({target,size,pixelArt,intent,effects,selection,bounds,provenance,paint,raster}) {
  const beneath=i=>target?target[i]:TRANSPARENT;
  return (draw,{outline=0,color=4,shadow=null,exteriorOnly=false,edgeShade=null,effectMask=()=>true,
    selout=null,bevel=null,extrude=null,mirror=null,pinholes=false,glints=null}={})=>{
    // Without effects a group is just a union of fills, so it draws straight
    // through with no allocation. Identical output relies on the invariant
    // that no recipe paints 255 (TRANSPARENT) inside a group. A mirror is
    // geometry, not an effect, so it applies (and allocates) in both modes.
    if(!effects&&!mirror){draw(raster(target,size,{pixelArt,intent,effects,selection,bounds,provenance}));return;}
    const source=new Uint8Array(size*size).fill(TRANSPARENT),mask=new Uint8Array(size*size);
    const box={left:size,top:size,right:-1,bottom:-1};
    // A mirrored group records kinds privately so copies carry their own kind.
    const prov=provenance&&mirror?new Uint8Array(size*size):provenance;
    draw(raster(source,size,{pixelArt,intent,effects,selection:mask,bounds:box,provenance:prov}));
    if(mirror)mirrorHalf(source,mask,prov,size,box,mirror);
    const drawn=box.right>=0;
    if(effects){
      // 3. Extrusion: side pixels one role step darker, under pixels two.
      let layer=null;
      if(extrude){
        const {dx,dy,depth,side,under:below,crumbs}=extrudeOptions(extrude);
        checkTone('extrude.side',side,['darker','darker2']);checkTone('extrude.under',below,['darker','darker2']);
        layer=extrudeMask(mask,size,dx,dy,depth,{crumbs,box});
        if(drawn){
          box.left=Math.max(0,box.left+Math.min(0,depth*dx));box.right=Math.min(size-1,box.right+Math.max(0,depth*dx));
          box.top=Math.max(0,box.top+Math.min(0,depth*dy));box.bottom=Math.min(size-1,box.bottom+Math.max(0,depth*dy));
          // Under pixels sit below the drawn material or below other under
          // pixels, scanned along dy; with dy 0 every pixel is side.
          const step=dy<0?-1:1,first=dy<0?box.bottom:box.top,last=dy<0?box.top:box.bottom,back=-step*size;
          for(let y=first;step>0?y<=last:y>=last;y+=step)for(let x=box.left;x<=box.right;x++){
            const i=y*size+x,k=layer[i];if(!k)continue;
            const j=i+back,low=dy!==0&&y-step>=0&&y-step<size&&(mask[j]||layer[j]>>7);
            if(low)layer[i]|=128;
            if(source[i]===TRANSPARENT){
              source[i]=tone(low?below:side,source[i-(k&127)*(dy*size+dx)]);
              if(prov)prov[i]=EFFECT;
            }
          }
        }
      }
      // 4. Edge shade on the lower and right material edge.
      if(edgeShade&&drawn){
        const width=Math.max(1,Math.round(edgeShade.width??2)),mode=edgeShade.mode??'checker';
        if(mode==='band'){
          // d=1 is a solid band and is never dithered; d>=2 a 2x2 checker,
          // only where the material is at least BAND_SEAM_MIN thick across
          // both axes (AGENT_RULES: no dither on parts thinner than 5 px).
          const flat=typeof edgeShade.color==='number'?edgeShade.color:null;
          const span=(x,y,sx,sy)=>{let n=1;
            for(let k=1;n<BAND_SEAM_MIN;k++){const xx=x-k*sx,yy=y-k*sy;if(xx<0||yy<0||!mask[yy*size+xx])break;n++;}
            for(let k=1;n<BAND_SEAM_MIN;k++){const xx=x+k*sx,yy=y+k*sy;if(xx>=size||yy>=size||!mask[yy*size+xx])break;n++;}
            return n>=BAND_SEAM_MIN;};
          for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){
            const i=y*size+x;if(!mask[i])continue;
            let d=0;for(let k=1;k<=width;k++)if(x+k>=size||y+k>=size||!mask[i+k]||!mask[i+k*size]){d=k;break;}
            if(!d||(d>1&&(((x+y)&1)||!span(x,y,1,0)||!span(x,y,0,1))))continue;
            source[i]=d===1&&flat!=null?flat:darkerOf(source[i]);
            if(prov)prov[i]=EFFECT;
          }
        }else if(mode==='checker'){
          dither(raster(source,size,{pixelArt,provenance:prov,provenanceKind:'effect'}),{x:box.left,y:box.top,w:box.right-box.left+1,h:box.bottom-box.top+1,color:edgeShade.color??4,density:edgeShade.density??.5,
            mask:(px,py)=>{
              const x=Math.floor(px),y=Math.floor(py);if(!mask[y*size+x])return false;
              for(let d=1;d<=width;d++)if(x+d>=size||y+d>=size||!mask[y*size+x+d]||!mask[(y+d)*size+x])return true;
              return false;
            }});
        }else throw Error("Edge shade mode is 'checker' or 'band'.");
      }
      // 5. Directional bevel (a rim is {hi:'lighter',lo:null,min:2}).
      if(bevel){
        const {hi='lighter',lo='darker',min=3,exterior=false,from=null}=bevel;
        checkTone('bevel.hi',hi,['lighter','darker']);checkTone('bevel.lo',lo,['lighter','darker']);
        const classes=bevelMask(mask,size,{min,exterior,box});
        if(drawn)for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){
          const i=y*size+x,kind=classes[i];if(!kind)continue;
          const spec=kind===2?lo:hi,c=source[i];
          if(spec==null||(from&&!from.includes(c)))continue;
          source[i]=tone(spec,c);if(prov)prov[i]=EFFECT;
        }
      }
      // 6. Glints: four-point stars inside erode4(mask), registered as intent.
      if(glints?.length){
        const inner=erodeMask4(mask,size,{box});
        for(const g of glints)placeGlint(g,{source,inner,size,prov,intent});
      }
      if(layer&&drawn)for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++)if(layer[y*size+x])mask[y*size+x]=1;
      if(outline||shadow){
        // 7. Shadow, cast by mask_eff.
        if(shadow){
          const sx=shadow.x??2,sy=shadow.y??3,darken=shadow.color==='darken',steps=shadow.steps??1;
          if(steps!==1&&steps!==2)throw Error('Shadow steps are 1 or 2.');
          if(!darken)checkTone('shadow.color',shadow.color,[]);
          const shade=(shadow.swept?sweptShadowMask:dropShadowMask)(mask,size,sx,sy,{box});
          const x0=Math.max(0,box.left+Math.min(0,sx)),x1=Math.min(size-1,box.right+Math.max(0,sx));
          const y0=Math.max(0,box.top+Math.min(0,sy)),y1=Math.min(size-1,box.bottom+Math.max(0,sy));
          const c=shadow.color??4;
          if(drawn)for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
            const i=y*size+x;
            if(shade[i]&&effectMask(x+.5,y+.5))paint(i,darken?darkenOnto(beneath(i),steps):c);
          }
        }
        // 8. Outline around mask_eff, then pinholes.
        if(outline){
          const edge=outlineMask(mask,size,outline,{exteriorOnly,box});
          if(drawn)strokeOutline({edge,mask,source,size,box,outline,color,selout,pinholes,effectMask,paint});
        }
      }
    }
    // 9. Composite. The source's own provenance was recorded as it was drawn;
    // darken markers from nested groups darken what lies under them here.
    if(drawn)for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){
      const i=y*size+x;let c=source[i];if(c===TRANSPARENT)continue;
      if(c===DARKEN1||c===DARKEN2)c=darkenOnto(beneath(i),c===DARKEN1?1:2);
      paint(i,c,prov===provenance?0:prov[i]);
    }
    // 10. Nested groups propagate material occupancy, never their strokes/shadows.
    if(selection&&drawn)for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++)if(mask[y*size+x])selection[y*size+x]=1;
  };
}

function strokeOutline({edge,mask,source,size,box,outline,color,selout,pinholes,effectMask,paint}) {
  const x0=Math.max(0,box.left-outline),x1=Math.min(size-1,box.right+outline);
  const y0=Math.max(0,box.top-outline),y1=Math.min(size-1,box.bottom+outline);
  let lit='darker',litWidth=outline;
  if(selout){
    lit=selout.lit??'darker';litWidth=selout.litWidth??outline;
    checkTone('selout.lit',lit,['none','darker']);
    if(!Number.isInteger(litWidth)||litWidth<0)throw Error('Selective outline litWidth is a nonnegative integer.');
  }
  const offsets=selout?disk(outline):null,reach=litWidth*litWidth;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const i=y*size+x;if(!edge[i]||!effectMask(x+.5,y+.5))continue;
    let c=color;
    if(offsets){
      // Lit only when every nearest material pixel lies below/right (dx+dy>0).
      let best=-1,first=-1,isLit=true;
      for(const [dx,dy,d2] of offsets){
        if(best>=0&&d2>best)break;
        const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size||!mask[yy*size+xx])continue;
        if(best<0){best=d2;first=yy*size+xx;}
        if(dx+dy<=0)isLit=false;
      }
      if(isLit){
        if(lit==='none'||best>reach)continue;
        c=lit==='darker'?darkerOf(source[first]):lit;
      }
    }
    paint(i,c);
  }
  if(!pinholes)return;
  // Background pixels boxed in by material and outline, touching the outline.
  const holes=[],solid=j=>mask[j]||edge[j];
  for(let y=Math.max(1,y0-1);y<=Math.min(size-2,y1+1);y++)for(let x=Math.max(1,x0-1);x<=Math.min(size-2,x1+1);x++){
    const i=y*size+x;if(mask[i]||edge[i])continue;
    if(solid(i-1)&&solid(i+1)&&solid(i-size)&&solid(i+size)&&(edge[i-1]||edge[i+1]||edge[i-size]||edge[i+size]))holes.push(i);
  }
  for(const i of holes)if(effectMask(i%size+.5,(i-i%size)/size+.5))paint(i,color);
}

function placeGlint(g,{source,inner,size,prov,intent}) {
  const {x,y,size:arm=1,from=null,reach=4,core=8,tip=null,reason='glint'}=g;
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('A glint needs a finite position.');
  if(!Number.isInteger(arm)||arm<1||arm>4)throw Error('Glint arms are 1 to 4 pixels.');
  if(!Number.isInteger(reach)||reach<0)throw Error('Glint reach is a nonnegative integer.');
  if(typeof reason!=='string'||!reason.trim())throw Error('A glint needs a visual reason.');
  checkTone('glint.core',core,[]);checkTone('glint.tip',tip,['lighter','darker']);
  const cx=Math.round(x),cy=Math.round(y),fits=(px,py)=>px>=0&&py>=0&&px<size&&py<size&&inner[py*size+px]===1;
  for(const [ox,oy] of square(reach)){
    const px=cx+ox,py=cy+oy;
    if(!fits(px,py)||(from&&!from.includes(source[py*size+px])))continue;
    let room=true;
    for(let k=1;k<=arm&&room;k++)room=fits(px-k,py)&&fits(px+k,py)&&fits(px,py-k)&&fits(px,py+k);
    if(!room)continue;
    const pixels=[[py*size+px,core]];
    for(let k=1;k<=arm;k++)for(const [ax,ay] of [[-k,0],[k,0],[0,-k],[0,k]]){
      const i=(py+ay)*size+px+ax;pixels.push([i,k===arm&&arm>1&&tip!=null?tone(tip,source[i]):core]);
    }
    for(const [i,c] of pixels){source[i]=c;if(prov)prov[i]=GLINT;intent.set(i,{color:c,reason});}
    return;
  }
}
