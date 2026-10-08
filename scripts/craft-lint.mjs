// Craft lint for Pocket Cover (development only, report-only). Pure functions
// over a cover's indices, palette and diagnostics layers; nothing here changes
// pixels or feeds back into the renderer. Ported from CHGame's artkit
// (craft.py orphans/jaggies, lint.py edges/doubled/title strays) with the
// engine-19 exemptions of engine-contract E5.
//
// Diagnostics are not art review: a clean lint says nothing about silhouette,
// lighting or composition. Look at the sheets at 1x and integer enlargements.
//
//   import {lintCover,summarize} from './craft-lint.mjs';
//   const cover=generateCover('Star Patrol',{style:'spaceships',diagnostics:true});
//   summarize(lintCover(cover));
import {DARKER,LIGHTER} from '../src/roles.js';

export const SIZE=128,TRANSPARENT=255;
// raster.js PROVENANCE kinds: ellipse 3, sphere 4, round 6, ring/arc 10,
// sample 11, streak 15 are drawn as curves; line/stroke 8 and inkPath 14 are
// 1-px strokes.
export const CURVE_KINDS=Object.freeze([3,4,6,10,11,15]);
export const STROKE_KINDS=Object.freeze([8,14]);
export const LIMITS=Object.freeze({frameLuma:.55,inkShare:.20,accentShare:.04,creamShare:.03,creamPixels:60,
  specks:10,jaggies:3,ditherSpan:40,ditherDensity:.5,installBar:Object.freeze([110,119]),titleRadius:1,calmRadius:3,
  clusterMin:6,minRows:4});
// CHGame fixed colours (black, cream, grey, red) and the forbidden rainbow key.
export const FIXED_COLOURS=Object.freeze([0x000000,0xfff4d6,0x808080,0xd62020,0xff00ff]);
export const RAINBOW=0xff00ff;
// Overlay colours for lint sheets. None is #FF00FF.
export const MARK_COLOURS=Object.freeze({speck:0xff2020,orphan:0xff9040,intent:0x40e060,jaggie:0xffe020,
  jaggieOther:0x8a8430,lcorner:0x20e0ff});

const finite=v=>typeof v==='number'&&Number.isFinite(v);
const isPoint=v=>Array.isArray(v)&&v.length>=2&&finite(v[0])&&finite(v[1]);
const kindSet=kinds=>{const s=new Uint8Array(256);for(const k of kinds)s[k]=1;return s;};
const round=(v,d=4)=>v==null?null:Math.round(v*10**d)/10**d;

/** Rec. 601 luma of a 0xRRGGBB colour, 0..1 (artkit lint.py). */
export function luma(rgb) {
  return (((rgb>>>16)&255)*.299+((rgb>>>8)&255)*.587+(rgb&255)*.114)/255;
}

/** Binary dilation, `radius` steps of the 4-neighbour cross, or of the full
 * 3x3 square when `diagonal` (artkit pixel.dilate). Returns a new 0/1 mask. */
export function dilate(mask,radius=1,size=SIZE,{diagonal=true}={}) {
  const h=mask.length/size;let out=Uint8Array.from(mask,v=>v?1:0);
  for(let n=0;n<radius;n++){
    const g=out.slice();
    for(let y=0;y<h;y++)for(let x=0;x<size;x++){
      if(!out[y*size+x])continue;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!diagonal&&dx&&dy)continue;
        const nx=x+dx,ny=y+dy;if(nx>=0&&nx<size&&ny>=0&&ny<h)g[ny*size+nx]=1;
      }
    }
    out=g;
  }
  return out;
}

// ---------- orphans ----------
/** [[x,y]] of pixels none of whose 8 neighbours share their colour and none
 * of (+-2,0),(0,+-2) either (craft.py orphans). Off-image counts as
 * different, so regular 50% and 25% dithers are not orphans. */
export function orphans(indices,size=SIZE,{transparent=null}={}) {
  const h=indices.length/size,out=[],same=(x,y,c)=>x>=0&&x<size&&y>=0&&y<h&&indices[y*size+x]===c;
  for(let y=0;y<h;y++)for(let x=0;x<size;x++){
    const c=indices[y*size+x];if(transparent!=null&&c===transparent)continue;
    let alone=true;
    for(let dy=-1;dy<=1&&alone;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&same(x+dx,y+dy,c)){alone=false;break;}
    if(alone&&!same(x-2,y,c)&&!same(x+2,y,c)&&!same(x,y-2,c)&&!same(x,y+2,c))out.push([x,y]);
  }
  return out;
}

// ---------- jaggies ----------
function kinksOf(runs,alternation) {
  const out=[];
  for(let k=1;k+1<runs.length;k++){
    const [ka,a]=runs[k-1],[kb,b,at]=runs[k],[kc,c]=runs[k+1];
    if(ka!==kb||kb!==kc)continue;
    if(!((b<a&&b<c)||(b>a&&b>c)))continue;
    if(Math.abs(b-a)+Math.abs(b-c)<2)continue;
    // Engine-19 exemption: an even 1-2-1 (or 2-1-2) alternation is a clean
    // in-between slope (pixel-art.md), not a kink.
    if(alternation&&a===c&&Math.abs(b-a)===1)continue;
    out.push(at);
  }
  return out;
}
/** Kinks in a sequence of consecutive same-kind run lengths: indices of each
 * run b, between a and c, that is strictly shorter or strictly longer than
 * both with |b-a|+|b-c| >= 2. `alternation` exempts a===c with |b-a|===1. */
export function runKinks(lengths,{alternation=true}={}) {
  return kinksOf(lengths.map((n,i)=>[0,n,i]),alternation);
}
/** The runs of one monotone edge profile (craft.py _profile_kinks): a step of
 * d>0 is a flat run of length d (kind 0); a stretch of zero steps is a steep
 * run of zeros+1 rows (kind 1). `at` indexes the step. */
export function profileRuns(p) {
  const d=[];for(let i=1;i<p.length;i++)d.push(Math.abs(p[i]-p[i-1]));
  const runs=[];
  for(let i=0;i<d.length;){
    if(d[i]>0){runs.push([0,d[i],i]);i++;}
    else{let j=i;while(j<d.length&&d[j]===0)j++;runs.push([1,j-i+1,i]);i=j;}
  }
  return runs;
}
/** Profile indices where the staircase order breaks. */
export function profileKinks(p,{alternation=true}={}) {
  return p.length<3?[]:kinksOf(profileRuns(p),alternation);
}
/** Split a profile into [start,end) pieces that only grow or only shrink;
 * the next piece starts one row back (craft.py _monotone_pieces). */
export function monotonePieces(p) {
  const pieces=[];let start=0,sign=0;
  for(let i=1;i<p.length;i++){
    const s=Math.sign(p[i]-p[i-1]);
    if(s&&sign&&s!==sign){pieces.push([start,i]);start=i-1;}
    if(s)sign=s;
  }
  pieces.push([start,p.length]);
  return pieces;
}
/** [[x,y]] near kinks on the edge of a boolean shape (craft.py jaggies): the
 * outermost pixel per row on each side, then the same per column. Points are
 * offset by offsetX/offsetY, unique and sorted by x then y. */
export function jaggies(mask,width,height=mask.length/width,{minRows=LIMITS.minRows,alternation=true,offsetX=0,offsetY=0}={}) {
  const found=new Map();
  for(const transpose of [false,true]){
    const R=transpose?width:height,C=transpose?height:width,rows=[],lo=[],hi=[];
    for(let r=0;r<R;r++){
      let first=-1,last=-1;
      for(let c=0;c<C;c++)if(transpose?mask[c*width+r]:mask[r*width+c]){if(first<0)first=c;last=c;}
      if(first>=0){rows.push(r);lo.push(first);hi.push(last);}
    }
    if(rows.length<minRows)continue;
    for(const prof of [lo,hi])for(const [a,b] of monotonePieces(prof)){
      const seg=prof.slice(a,b);
      for(const k of profileKinks(seg,{alternation})){
        const r=rows[a+k],c=seg[k],x=(transpose?r:c)+offsetX,y=(transpose?c:r)+offsetY;
        found.set(x*65536+y,[x,y]);
      }
    }
  }
  return [...found.keys()].sort((a,b)=>a-b).map(k=>found.get(k));
}
/** 4-connected same-colour clusters of at least minSize pixels in a layer,
 * skipping `transparent`. Each is {color, size, left, top, width, height,
 * mask} with a bounding-box mask. */
export function clusters(layer,size=SIZE,{minSize=LIMITS.clusterMin,transparent=TRANSPARENT}={}) {
  const h=layer.length/size,seen=new Uint8Array(layer.length),stack=new Int32Array(layer.length),out=[];
  for(let start=0;start<layer.length;start++){
    const color=layer[start];if(seen[start]||color===transparent)continue;
    let n=0,top=0,members=[];stack[top++]=start;seen[start]=1;
    let left=size,right=-1,up=h,down=-1;
    while(top){
      const i=stack[--top],x=i%size,y=(i-x)/size;members.push(i);n++;
      if(x<left)left=x;if(x>right)right=x;if(y<up)up=y;if(y>down)down=y;
      if(x>0&&!seen[i-1]&&layer[i-1]===color){seen[i-1]=1;stack[top++]=i-1;}
      if(x+1<size&&!seen[i+1]&&layer[i+1]===color){seen[i+1]=1;stack[top++]=i+1;}
      if(y>0&&!seen[i-size]&&layer[i-size]===color){seen[i-size]=1;stack[top++]=i-size;}
      if(y+1<h&&!seen[i+size]&&layer[i+size]===color){seen[i+size]=1;stack[top++]=i+size;}
    }
    if(n<minSize)continue;
    const width=right-left+1,height=down-up+1,mask=new Uint8Array(width*height);
    for(const i of members){const x=i%size,y=(i-x)/size;mask[(y-up)*width+x-left]=1;}
    out.push({color,size:n,left,top:up,width,height,mask});
  }
  return out;
}
/** Jaggies on a subject: the silhouette (layer !== transparent) and every
 * 4-connected colour cluster of 6+ px, alternation-tolerant. With a
 * provenance map, only kinks on curve-drawn pixels (CURVE_KINDS) count
 * (basis 'curve'); without one the silhouette count is the headline (basis
 * 'silhouette'); without a subject layer, clusters of the whole image are
 * used (basis 'image'). */
export function lintJaggies(layer,size=SIZE,{provenance=null,image=null,curveKinds=CURVE_KINDS,minSize=LIMITS.clusterMin}={}) {
  const source=layer??image;
  if(!source)return null;
  const curve=kindSet(curveKinds),onCurve=([x,y])=>!!provenance&&curve[provenance[y*size+x]]===1;
  let silhouette=[],silhouetteStrict=[];
  if(layer){
    const mask=Uint8Array.from(layer,v=>v!==TRANSPARENT?1:0);
    silhouette=jaggies(mask,size);silhouetteStrict=jaggies(mask,size,undefined,{alternation:false});
  }
  const byColour=new Map();
  for(const c of clusters(source,size,{minSize,transparent:layer?TRANSPARENT:-1})){
    const list=byColour.get(c.color)??new Map();
    for(const p of jaggies(c.mask,c.width,c.height,{offsetX:c.left,offsetY:c.top}))list.set(p[0]*65536+p[1],p);
    byColour.set(c.color,list);
  }
  const clusterPoints=[...byColour.values()].flatMap(m=>[...m.values()]);
  const all=[...silhouette,...clusterPoints];
  const curveSilhouette=provenance?silhouette.filter(onCurve).length:null;
  const curveCount=provenance?all.filter(onCurve).length:null;
  const basis=!layer?'image':provenance?'curve':'silhouette';
  const unique=new Map();for(const p of all)unique.set(p[0]*65536+p[1],p);
  const points=[...unique.values()],counted=basis==='curve'?points.filter(onCurve):basis==='silhouette'?silhouette:points;
  return {basis,provenance:!!provenance,count:basis==='curve'?curveCount:basis==='silhouette'?silhouette.length:clusterPoints.length,
    silhouette:silhouette.length,silhouetteStrict:silhouetteStrict.length,clusters:clusterPoints.length,
    curve:curveCount,curveSilhouette,points,counted};
}

// ---------- L-corners ----------
/** Elbows of L-corners on 1-px strokes: 2x2 windows with exactly three
 * pixels of one colour, all drawn as strokes (provenance in STROKE_KINDS)
 * and each having at most `maxNeighbours` same-colour neighbours (4-connected
 * by default: a 1-px stroke pixel has at most two). Without provenance every
 * thin L inside `mask` (or the whole image) counts. Returns [[x,y]]. */
export function lCorners(indices,size=SIZE,{provenance=null,kinds=STROKE_KINDS,mask=null,connectivity=4,maxNeighbours=2}={}) {
  const h=indices.length/size,stroke=kindSet(kinds),out=new Map();
  const neighbours=i=>{
    const x=i%size,y=(i-x)/size,c=indices[i];let n=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if((!dx&&!dy)||(connectivity===4&&dx&&dy))continue;
      const nx=x+dx,ny=y+dy;if(nx>=0&&nx<size&&ny>=0&&ny<h&&indices[ny*size+nx]===c)n++;
    }
    return n;
  };
  for(let y=0;y+1<h;y++)for(let x=0;x+1<size;x++){
    const w=[y*size+x,y*size+x+1,(y+1)*size+x,(y+1)*size+x+1],v=w.map(i=>indices[i]);
    // The odd one out: three equal values and one different.
    let odd=-1;
    for(let k=0;k<4;k++){const others=w.map((_,j)=>j).filter(j=>j!==k);if(others.every(j=>v[j]===v[others[0]])&&v[k]!==v[others[0]]){odd=k;break;}}
    if(odd<0)continue;
    const three=w.filter((_,k)=>k!==odd);
    if(provenance&&!three.every(i=>stroke[provenance[i]]))continue;
    if(mask&&!three.every(i=>mask[i]))continue;
    if(!three.every(i=>neighbours(i)<=maxNeighbours))continue;
    const elbow=w[3-odd],ex=elbow%size;out.set(elbow,[ex,(elbow-ex)/size]);
  }
  return [...out.keys()].sort((a,b)=>a-b).map(k=>out.get(k));
}

// ---------- frame, title, calm ----------
/** Rows and columns 0-1 and size-2..size-1: pixel count, how many exceed
 * `limit` luma, and the maximum luma. */
export function frameRule(indices,palette,size=SIZE,{limit=LIMITS.frameLuma}={}) {
  let pixels=0,over=0,max=0;const points=[];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    if(x>1&&x<size-2&&y>1&&y<size-2)continue;
    const l=luma(palette[indices[y*size+x]]??0);pixels++;
    if(l>max)max=l;if(l>limit){over++;points.push([x,y]);}
  }
  return {pixels,over,max:round(max),limit,points};
}
/** Index-12 (title-only) pixels outside dilate(titleMask, radius). Without a
 * mask the check is skipped (checked:false) and only the total is given. */
export function titleColour(indices,titleMask,size=SIZE,{index=12,radius=LIMITS.titleRadius}={}) {
  let total=0;for(const v of indices)if(v===index)total++;
  if(!titleMask)return {checked:false,index,total,stray:null,points:[]};
  const area=dilate(titleMask,radius,size),points=[];
  for(let i=0;i<indices.length;i++)if(indices[i]===index&&!area[i])points.push([i%size,Math.floor(i/size)]);
  return {checked:true,index,total,stray:points.length,points};
}
/** Background pixels of index 2 or 9 (the light background roles) inside
 * dilate(title, 3) but outside the title itself. */
export function calmZone(indices,titleMask,size=SIZE,{layer=null,colours=[2,9],radius=LIMITS.calmRadius}={}) {
  if(!titleMask)return {checked:false,pixels:null,points:[]};
  const zone=dilate(titleMask,radius,size),points=[];
  for(let i=0;i<indices.length;i++){
    if(!zone[i]||titleMask[i]||(layer&&layer[i]!==TRANSPARENT))continue;
    if(colours.includes(indices[i]))points.push([i%size,Math.floor(i/size)]);
  }
  return {checked:true,pixels:points.length,points};
}
/** The focal point (or the subject bounding-box centre) inside the install
 * bar rows, y 110-119. */
export function installBar({focal=null,bounds=null,range=LIMITS.installBar}={}) {
  let source=null,x=null,y=null;
  if(isPoint(focal)){source='focal';[x,y]=focal;}
  else if(bounds&&finite(bounds.left)&&bounds.right>=bounds.left){source='bounds';x=(bounds.left+bounds.right)/2;y=(bounds.top+bounds.bottom)/2;}
  return {source,x:round(x,2),y:round(y,2),hit:y!=null&&y>=range[0]&&y<=range[1]+.999};
}

// ---------- dither ----------
/** Checkerboard 2x2 windows [a b; b a]. Rows where some `span`-px stretch is
 * more than `density` checker are flagged; pairs whose colours are not one
 * DARKER/LIGHTER step apart are off-ramp; windows touching the subject's
 * silhouette edge are counted when a layer is given. */
export function ditherBudget(indices,size=SIZE,{span=LIMITS.ditherSpan,density=LIMITS.ditherDensity,layer=null,darker=DARKER,lighter=LIGHTER}={}) {
  const h=indices.length/size,checker=new Uint8Array(indices.length),pairs=new Map(),offPairs={};
  const neighbour=(a,b)=>darker[a]===b||lighter[a]===b||darker[b]===a||lighter[b]===a;
  const edge=i=>{
    if(!layer||layer[i]===TRANSPARENT)return false;
    const x=i%size,y=(i-x)/size;
    return x===0||y===0||x===size-1||y===h-1||layer[i-1]===TRANSPARENT||layer[i+1]===TRANSPARENT||layer[i-size]===TRANSPARENT||layer[i+size]===TRANSPARENT;
  };
  let windows=0,offPairWindows=0,edgeWindows=0;
  for(let y=0;y+1<h;y++)for(let x=0;x+1<size;x++){
    const i=y*size+x,a=indices[i],b=indices[i+1];
    if(a===b||indices[i+size]!==b||indices[i+size+1]!==a)continue;
    windows++;checker[i]=checker[i+1]=checker[i+size]=checker[i+size+1]=1;
    const key=Math.min(a,b)+'/'+Math.max(a,b);pairs.set(key,(pairs.get(key)??0)+1);
    if(!neighbour(a,b)){offPairWindows++;offPairs[key]=(offPairs[key]??0)+1;}
    if(layer&&(edge(i)||edge(i+1)||edge(i+size)||edge(i+size+1)))edgeWindows++;
  }
  const rows=[];
  for(let y=0;y<h&&span<=size;y++){
    let n=0;const row=y*size;
    for(let x=0;x<span;x++)n+=checker[row+x];
    let flagged=n>density*span;
    for(let x=span;x<size&&!flagged;x++){n+=checker[row+x]-checker[row+x-span];flagged=n>density*span;}
    if(flagged)rows.push(y);
  }
  let pixels=0;for(const v of checker)pixels+=v;
  return {windows,pixels,rows,offPairWindows,offPairs,edgeWindows:layer?edgeWindows:null,pairs:Object.fromEntries([...pairs].sort())};
}

/** 8x8 tiles with 3+ colours that equal a 2x nearest enlargement at offset
 * 0 or 1 (artkit lint.py "doubled"). */
export function doubledTiles(indices,size=SIZE) {
  const out=[];
  for(let ty=0;ty<size;ty+=8)for(let tx=0;tx<size;tx+=8){
    const colours=new Set();for(let y=ty;y<ty+8;y++)for(let x=tx;x<tx+8;x++)colours.add(indices[y*size+x]);
    if(colours.size<3)continue;
    let hit=false;
    for(const ox of [0,1])for(const oy of [0,1]){
      if(hit||tx+ox+8>size||ty+oy+8>size)continue;
      let ok=true;
      for(let y=0;y<8&&ok;y++)for(let x=0;x<8;x++){const X=tx+ox,Y=ty+oy;if(indices[(Y+y)*size+X+x]!==indices[(Y+(y&~1))*size+X+(x&~1)]){ok=false;break;}}
      hit=ok;
    }
    if(hit)out.push([tx,ty]);
  }
  return out;
}

// ---------- covers ----------
/** Replay a title.js that exports titleLayout/drawTitle (the engine-18 API,
 * kept as legacy aliases) onto an empty mask; null when the module lacks it.
 * Only valid while the engine still paints that title. */
export function replayTitleMask(titleModule,title,size=SIZE) {
  if(!titleModule?.titleLayout||!titleModule?.drawTitle)return null;
  const mask=new Uint8Array(size*size);
  const p={dot:(x,y)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<size&&y>=0&&y<size)mask[y*size+x]=1;}};
  titleModule.drawTitle(p,titleModule.titleLayout(String(title).toUpperCase()));
  return mask;
}
/** traits.focal in screen space: mascot is drawn in cover space, other styles
 * map through the varied frame in cover.composition; null otherwise. */
export function screenFocal(cover) {
  const f=cover?.traits?.focal;if(!isPoint(f))return null;
  if(cover.style==='mascot')return [f[0],f[1]];
  const c=cover.composition;
  return c&&finite(c.x)&&finite(c.y)&&finite(c.scale)?[c.x+f[0]*c.scale,c.y+f[1]*c.scale]:null;
}
function intentOf(quality) {
  const out=new Map();
  for(const list of [quality?.beforeCleanup?.detached,quality?.beforeCleanup?.colorSingletons])
    for(const p of list??[])if(p.reason)out.set(p.y*SIZE+p.x,{color:p.color,reason:p.reason});
  return out;
}

/**
 * Lint one cover generated with diagnostics:true. Uses cover.indices,
 * cover.palette, quality.subjectLayer, quality.provenance,
 * quality.titleMask and quality.beforeCleanup/afterCleanup when present.
 * Options: titleMask (any source, for title/background layering and the calm
 * zone; default quality.titleMask), titleMaskSource, titleColourMask (the
 * index-12 check; default quality.titleMask only), focal (screen space;
 * default screenFocal(cover)). Returns plain data plus `marks` point lists.
 */
export function lintCover(cover,options={}) {
  const size=SIZE,{indices,palette}=cover,q=cover.quality??{};
  const layer=q.subjectLayer??null,provenance=q.provenance??null;
  const titleMask=options.titleMask!==undefined?options.titleMask:q.titleMask??null;
  const titleMaskSource=options.titleMaskSource??(titleMask?(q.titleMask&&titleMask===q.titleMask?'quality.titleMask':'option'):null);
  const titleColourMask=options.titleColourMask!==undefined?options.titleColourMask:q.titleMask??null;
  const focal=options.focal!==undefined?options.focal:screenFocal(cover);
  const intent=intentOf(q);
  const isSubject=i=>!!layer&&layer[i]!==TRANSPARENT,isTitle=i=>!!titleMask&&!!titleMask[i];

  // Subject material pixels: occupied and not a 253/254 darken marker.
  let subject=0,markers=0,ink=0,accent=0,cream=0,creamBackground=0;
  for(let i=0;i<indices.length;i++){
    if(isSubject(i)){
      if(layer[i]>=253){markers++;continue;}
      subject++;const v=indices[i];
      if(v===4)ink++;else if(v===10||v===11)accent++;else if(v===8)cream++;
    }else if(indices[i]===8&&!isTitle(i))creamBackground++;
  }
  const share=n=>layer&&subject?round(n/subject):null;

  const lone=orphans(indices,size),orphan={subject:0,background:0,title:0,intent:0,specks:0},intentList=[],marks={speck:[],orphan:[],intent:[]};
  for(const [x,y] of lone){
    const i=y*size+x;
    if(isTitle(i)){if(titleMask[i]===2){orphan.intent++;intentList.push({x,y,color:indices[i],reason:'title glint'});marks.intent.push([x,y]);}else{orphan.title++;marks.orphan.push([x,y]);}continue;}
    if(isSubject(i)){
      orphan.subject++;const mark=intent.get(i);
      if(mark&&mark.color===indices[i]){orphan.intent++;intentList.push({x,y,color:indices[i],reason:mark.reason});marks.intent.push([x,y]);}
      else{orphan.specks++;marks.speck.push([x,y]);}
    }else{orphan.background++;marks.orphan.push([x,y]);}
  }
  if(!layer)orphan.specks=null;

  const jag=lintJaggies(layer,size,{provenance,image:layer?null:indices});
  // Strokes are known only from provenance; thin Ls of any origin are information.
  const anyL=lCorners(indices,size,{mask:layer?Uint8Array.from(layer,v=>v!==TRANSPARENT?1:0):null});
  const lc=provenance?lCorners(indices,size,{provenance}):null;
  const frame=frameRule(indices,palette,size);
  const title=titleColour(indices,titleColourMask,size);
  const calm=calmZone(indices,titleMask,size,{layer});
  const dither=ditherBudget(indices,size,{layer});
  const bar=installBar({focal,bounds:q.bounds??null});
  const doubled=doubledTiles(indices,size);

  const used=new Set(indices),own=new Set();let outOfRange=0,rainbow=0;
  for(const v of used)if(v>=palette.length)outOfRange+=indices.filter(c=>c===v).length;else if(!FIXED_COLOURS.includes(palette[v]))own.add(palette[v]);
  for(const v of indices)if(palette[v]===RAINBOW)rainbow++;
  const detachedUnmarked=q.afterCleanup?.detached?q.afterCleanup.detached.filter(p=>!p.reason).length:null;

  const counted=new Set((jag?.counted??[]).map(([x,y])=>x*65536+y));
  return {
    style:cover.style,title:cover.title,variant:cover.variant,framing:cover.framing,version:cover.version,
    layers:{subject:!!layer,provenance:!!provenance,titleMask:titleMaskSource},
    subject:{pixels:layer?subject:null,markers:layer?markers:null},
    orphans:{...orphan,total:lone.length,intentPixels:intentList},
    jaggies:jag&&{basis:jag.basis,count:jag.count,silhouette:jag.silhouette,silhouetteStrict:jag.silhouetteStrict,
      clusters:jag.clusters,curve:jag.curve,curveSilhouette:jag.curveSilhouette},
    lCorners:{basis:provenance?'stroke':null,count:lc?lc.length:null,any:anyL.length,anyBasis:layer?'subject':'image'},
    frame:{pixels:frame.pixels,over:frame.over,max:frame.max,limit:frame.limit},
    titleColour:{checked:title.checked,total:title.total,stray:title.stray},
    accent:{pixels:layer?accent:null,share:share(accent)},
    ink:{pixels:layer?ink:null,share:share(ink)},
    dither:{windows:dither.windows,pixels:dither.pixels,rows:dither.rows.length,rowList:dither.rows,
      offPairWindows:dither.offPairWindows,offPairs:dither.offPairs,edgeWindows:dither.edgeWindows},
    cream:{subject:layer?cream:null,share:share(cream),
      over:layer?(subject?cream/subject>LIMITS.creamShare:false)||cream>LIMITS.creamPixels:null,background:layer?creamBackground:null},
    installBar:bar,
    calm:{checked:calm.checked,pixels:calm.pixels},
    doubled:doubled.length,
    hard:{ownColours:own.size,rainbow,outOfRange,title12Stray:title.stray,frameOver:frame.over,detachedUnmarked},
    marks:{...marks,jaggie:(jag?.points??[]).filter(([x,y])=>counted.has(x*65536+y)),
      jaggieOther:(jag?.points??[]).filter(([x,y])=>!counted.has(x*65536+y)),lcorner:lc??[],lcornerAny:anyL,
      frame:frame.points,titleStray:title.points,calm:calm.points},
  };
}

/** One flat row of headline numbers for tables and labels. */
export function summarize(result) {
  const r=result;
  return {specks:r.orphans.specks,orphansSubject:r.orphans.subject,orphansBackground:r.orphans.background,orphansTitle:r.orphans.title,
    intent:r.orphans.intent,jaggies:r.jaggies?.count??null,jaggiesBasis:r.jaggies?.basis??null,jaggiesSilhouette:r.jaggies?.silhouette??null,
    jaggiesStrict:r.jaggies?.silhouetteStrict??null,jaggiesCurveSilhouette:r.jaggies?.curveSilhouette??null,lCorners:r.lCorners.count,lCornersAny:r.lCorners.any,frameOver:r.frame.over,frameMax:r.frame.max,
    title12Stray:r.titleColour.stray,accentShare:r.accent.share,inkShare:r.ink.share,ditherRows:r.dither.rows,
    ditherOffPairs:r.dither.offPairWindows,ditherEdge:r.dither.edgeWindows,creamShare:r.cream.share,creamOver:r.cream.over,
    creamBackground:r.cream.background,installBar:r.installBar.hit,calm:r.calm.pixels,doubled:r.doubled,
    ownColours:r.hard.ownColours,rainbow:r.hard.rainbow,outOfRange:r.hard.outOfRange,detachedUnmarked:r.hard.detachedUnmarked};
}
/** Per-key aggregate of summarize() rows: the mean of numbers, the count of
 * true booleans, a shared string or 'mixed'; null when every row is null. */
export function aggregate(rows) {
  const out={};
  for(const key of Object.keys(rows[0]??{})){
    const values=rows.map(r=>r[key]).filter(v=>v!=null);
    if(!values.length){out[key]=null;continue;}
    if(typeof values[0]==='boolean')out[key]=values.filter(Boolean).length;
    else if(typeof values[0]==='number')out[key]=round(values.reduce((a,b)=>a+b,0)/values.length,3);
    else out[key]=values.every(v=>v===values[0])?values[0]:'mixed';
  }
  out.covers=rows.length;
  return out;
}

/** Mark lint points on an RGB image holding a cover drawn at (x0,y0) with
 * integer `scale`: at 3x or more a ring inside each pixel cell, below that
 * the whole cell. Later kinds draw over earlier ones. */
export function overlayMarks(img,width,x0,y0,scale,marks,{kinds=['jaggieOther','jaggie','lcorner','orphan','intent','speck']}={}) {
  const H=img.length/width;
  for(const kind of kinds){
    const color=MARK_COLOURS[kind];if(color==null)continue;
    for(const [px,py] of marks[kind]??[]){
      const cx=x0+px*scale,cy=y0+py*scale;
      for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++){
        if(scale>=3&&xx>0&&yy>0&&xx<scale-1&&yy<scale-1)continue;
        const X=cx+xx,Y=cy+yy;if(X>=0&&X<width&&Y>=0&&Y<H)img[Y*width+X]=color;
      }
    }
  }
}
