// One framing grammar for every subject. Choices use a separate seeded stream
// so composition never consumes a recipe's part/color/background randomness.
// Style rules are recipe metadata (`recipe.composition`, `recipe.adjustPlacement`).
// The engine-18 style tables below are only the fallback for a recipe object
// that does not declare them, so a trimmed or older recipe still works.
//
// Engine-19 cameras. None breaks the frame: every subject stays inside the
// page and title margins.
// - standard: the subject fills most of its area, anywhere in it;
// - vista: a somewhat smaller subject in a bigger scene, kept away from the
//   corners, with its whole body (stand and plinth too) above the install bar;
// - thirds: a mid-size subject pushed into the left or right third.
// Centred and room styles keep the standard camera: a small crest, rune or
// room inside an unchanged frame scene reads as a thumbnail, not a vista.
// No subject's longest side drops below MIN_SUBJECT_PX unless its area
// cannot hold that much (one focal subject, big: cover-art.md rule 3).
import {raster,viewport} from './raster.js';
import {TRANSPARENT} from './quality.js';

const SIZE=128;

export const CAMERAS=Object.freeze(['standard','vista','thirds']);
/** Base camera weights. Non-standard weights grow by (1 + 1.5 * wildness). */
export const CAMERA_WEIGHTS=Object.freeze({standard:70,vista:10,thirds:14});
/** Fractions of the fitted scale per camera: size = lerp(range, sizeT). */
export const CAMERA_SIZES=Object.freeze({standard:Object.freeze([.70,1]),vista:Object.freeze([.60,.78]),thirds:Object.freeze([.66,.86])});
/** Vista re-lerps the horizontal and vertical draws into these spans (a
 * declared meta.vertical wins), so a smaller subject never sits in a corner. */
export const VISTA_SPAN=Object.freeze({horizontal:Object.freeze([.22,.78]),vertical:Object.freeze([.45,.8])});
/** The lowest screen row for a subject's focal point (or bounds centre). The
 * menu's install bar covers y 110-119 (cover-art.md). */
export const INSTALL_BAR_Y=104;
/** Under vista the guarded row is the subject's bottom less VISTA_FOOT rows
 * (or its focal row, if lower), so the bottom stays at or above y 108. */
export const VISTA_FOOT=4;
/** The smallest longest side, in device pixels, of a placed non-room subject.
 * placeSubject raises the size to reach it, up to the full fitted size. */
export const MIN_SUBJECT_PX=52;
/** Scales of the 'translate' and 'quantized' fits, largest first. */
export const FIT_SCALES=Object.freeze([1,.75,.5]);

// Same shape as recipe.composition: {centered, room, sizeRange, vertical,
// cameras, fit, blit}.
// - sizeRange: [lo,hi] for every camera, {camera:[lo,hi]} (other cameras keep
//   CAMERA_SIZES), or false to keep the raw engine-18 draw .62-1.
// - vertical: [lo,hi].
// - cameras: {camera:weight}, replacing CAMERA_WEIGHTS; a missing camera gets 0.
// - fit: 'scale' (default), 'translate' or 'quantized'.
// - blit:false always draws an aligned subject again instead of moving its
//   pixels. Use it for device patterns whose period is not 2.
// The mascot recipe frames itself in cover space. Its varied composition stays
// exactly as in engine 18 until the recipe declares its own metadata.
const LEGACY_COMPOSITION=Object.freeze({
  mascot:{cameras:{standard:1},sizeRange:false},
  heraldry:{centered:true},glyphs:{centered:true},
  dungeons:{room:true,sizeRange:[.88,1]},
  buildings:{sizeRange:{standard:[.80,1]},vertical:[.45,1]},
  islands:{sizeRange:{standard:[.72,1]}},
});

/** The composition metadata that applies to a style: `recipe.composition`
 * when the recipe declares it (it replaces the style table as a whole), else
 * the engine-18 table for that style id, else {}. */
export function compositionMeta(style,recipe=null) {
  return recipe?.composition??LEGACY_COMPOSITION[style]??{};
}

// Spans round to 9 decimals so metadata ranges reproduce the engine-18 literals
// bit for bit: 1-.80 is 0.19999999999999996 in binary, the engine-18 span .20.
const span=([lo,hi])=>Math.round((hi-lo)*1e9)/1e9;
/** lo + t*(hi-lo), with the span rounded as above. */
export const lerpRange=(range,t)=>range[0]+t*span(range);
const isRange=v=>Array.isArray(v)&&v.length===2&&Number.isFinite(v[0])&&Number.isFinite(v[1]);
const cameraRange=(table,camera)=>{const range=Array.isArray(table)?table:table?.[camera];return isRange(range)?range:null;};
// The size range a camera uses under a meta: the meta's own range, else
// CAMERA_SIZES; null when the meta keeps the raw engine-18 draw.
const sizeRangeOf=(meta,camera)=>meta.sizeRange===false?null:cameraRange(meta.sizeRange,camera)??CAMERA_SIZES[camera]??null;
const clamp01=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;

/** [[camera, weight], ...] in CAMERAS order, for a composition meta and a
 * look wildness in [0,1]. Centred and room styles get neither thirds nor
 * vista. Non-standard weights are multiplied by (1 + 1.5w). */
export function cameraWeights(meta={},wildness=0) {
  const base=meta?.cameras??CAMERA_WEIGHTS,boost=1+1.5*clamp01(wildness);
  return CAMERAS.map(camera=>{
    let w=Number(base[camera]);w=Number.isFinite(w)&&w>0?w:0;
    if(camera!=='standard'&&(meta?.centered||meta?.room))w=0;
    return [camera,camera==='standard'?w:w*boost];
  });
}

// k is one r(10000) draw; the weights are renormalised by their total.
function pickCamera(k,weights) {
  const total=weights.reduce((sum,[,w])=>sum+w,0);
  if(!(total>0))return 'standard';
  const u=k/10000*total;let at=0;
  for(const [camera,w] of weights){at+=w;if(w>0&&u<at)return camera;}
  return weights.findLast(([,w])=>w>0)[0];
}

/** The varied-framing choice from the composition stream `r`:
 * {size, horizontal, vertical, sizeT, camera, fit}.
 * The three engine-18 draws come first (size .62+r(39)/100, horizontal,
 * vertical), then the camera from r(10000). `look.wildness` boosts the
 * non-standard cameras. size = lerp(camera range, sizeT). Thirds maps the
 * horizontal draw h to .3h (h < .5) or .85 + .3(h - .5). Vista re-lerps h
 * and the vertical draw into VISTA_SPAN; meta.vertical wins for any camera. */
export function chooseComposition(r,style,{recipe=null,look=null}={}) {
  const raw=.62+r(39)/100,horizontal=r(1001)/1000,vertical=r(1001)/1000;
  const meta=compositionMeta(style,recipe),sizeT=(raw-.62)/.38;
  const camera=pickCamera(r(10000),cameraWeights(meta,look?.wildness??0));
  const range=sizeRangeOf(meta,camera);
  const choice={size:range?lerpRange(range,sizeT):raw,horizontal,vertical,sizeT,camera,fit:meta.fit??'scale'};
  if(meta.centered)choice.horizontal=.5;
  else if(camera==='thirds')choice.horizontal=horizontal<.5?.3*horizontal:.85+.3*(horizontal-.5);
  else if(camera==='vista')choice.horizontal=lerpRange(VISTA_SPAN.horizontal,horizontal);
  if(isRange(meta.vertical))choice.vertical=lerpRange(meta.vertical,vertical);
  else if(camera==='vista')choice.vertical=lerpRange(VISTA_SPAN.vertical,vertical);
  return choice;
}

// Engine-18 size remaps, used only when the recipe object has no
// `adjustPlacement` key. Sparse hulls retain their clean silhouettes at much
// smaller sizes. They use the composition stream's size, never recipe RNG.
const LEGACY_ADJUST=Object.freeze({
  spaceships(placement,traits) {
    const t=Math.max(0,Math.min(1,(placement.size-.62)/.38));
    if(traits.detailLevel==='simple')placement.size=.28+t*.50;
    else if(traits.detailLevel==='medium')placement.size=.45+t*.50;
  },
  vehicles(placement,traits) {
    if(traits.archetype==='crawler tank')placement.size=.48+(placement.size-.62)/.38*.52;
  },
});

/** After render, let the recipe adjust its varied placement from its traits.
 * Mutates and returns `placement`. Classic framing (null) is untouched.
 * - `traits.sizeRange` ([lo,hi] or {camera:[lo,hi]}) re-lerps the size for
 *   the placement's camera by its sizeT, and no remap runs.
 * - Otherwise the remap runs: `recipe.adjustPlacement(placement, traits,
 *   {style, camera, sizeT})` when the recipe has that key (null opts out),
 *   else the engine-18 table for the style. The hook sees the engine-18 size
 *   draw (.62-1) as `placement.size`. A size it changes is scaled by the top
 *   of the camera's size range (standard 1, vista .78, thirds .86) and then
 *   clamped into that range, so a remap never drops below the camera's
 *   floor. A meta with sizeRange:false keeps the hook's size as is.
 * - A placement without a camera (the engine-18 shape) goes to the hook as is. */
export function adjustPlacement(placement,style,traits,recipe=null) {
  if(!placement)return placement;
  const {camera}=placement,sized=!!camera&&Number.isFinite(placement.sizeT);
  const range=sized?cameraRange(traits?.sizeRange,camera):null;
  if(range){placement.size=lerpRange(range,placement.sizeT);return placement;}
  const hook=recipe&&'adjustPlacement' in recipe?(typeof recipe.adjustPlacement==='function'?recipe.adjustPlacement.bind(recipe):null):LEGACY_ADJUST[style]??null;
  if(!hook)return placement;
  if(!sized){hook(placement,traits,{style});return placement;}
  // The view notices any size assignment, even one that keeps the value.
  let size=.62+.38*placement.sizeT,remapped=false;
  const view={...placement};
  Object.defineProperty(view,'size',{enumerable:true,get:()=>size,set:value=>{size=value;remapped=true;}});
  hook(view,traits,{style,camera,sizeT:placement.sizeT});
  for(const key of Object.keys(view))if(key!=='size'&&view[key]!==placement[key])placement[key]=view[key];
  if(remapped){
    const camRange=sizeRangeOf(compositionMeta(style,recipe),camera);
    placement.size=camRange?Math.max(camRange[0],Math.min(camRange[1],size*camRange[1])):size;
  }
  return placement;
}

/** Transform geometry before rasterization. Bounds include attachments and a
 * safety margin; extra room permits more movement when a subject is smaller.
 * - fit 'scale' (the default is choice.fit, else 'scale') is the engine-18 formula.
 * - Pixel-exact recipes use 'translate' (scale 1) or 'quantized' (the largest
 *   of 1, .75 and .5 not above the fitted scale). Both round x and y to
 *   integers. When the subject would not fit at that scale, either falls back
 *   to a smaller exact scale, then to the fitted scale. */
export function fitComposition(bounds,area,choice,{fit=choice.fit??'scale'}={}) {
  const most=Math.min(area.width/bounds.width,area.height/bounds.height),fitted=most*choice.size;
  let scale=fitted;
  if(fit==='translate'||fit==='quantized'){
    const limit=fit==='translate'?Math.max(1,fitted):fitted;
    scale=FIT_SCALES.find(q=>q<=limit&&q<=most)??fitted;
  }else if(fit!=='scale')throw Error("Composition fit is 'scale', 'translate' or 'quantized'.");
  const x=area.x+(area.width-bounds.width*scale)*choice.horizontal-bounds.x*scale;
  const y=area.y+(area.height-bounds.height*scale)*choice.vertical-bounds.y*scale;
  return fit==='scale'?{x,y,scale}:{x:Math.round(x),y:Math.round(y),scale};
}

/** The vertical fraction that keeps a subject's focal row at or above
 * INSTALL_BAR_Y: min(vertical, (104 - f*h - box.y) / (box.height - h)).
 * h is the subject's scaled height and f its focal row as a fraction of h
 * (.5 for the centre). The vertical is unchanged when box.height <= h, and
 * never goes below 0. */
export function installVertical(vertical,box,h,f=.5) {
  const free=box.height-h;
  if(!(free>0))return vertical;
  return Math.min(vertical,Math.max(0,(INSTALL_BAR_Y-f*h-box.y)/free));
}

const isPoint=v=>Array.isArray(v)&&v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]);

/** Render a recorded subject into `layer` and return its final frame.
 * `frame` is the classic frame, used as is when there is no placement.
 * With a placement:
 * 1. Measure the recording with a bounds-only sink.
 * 2. Not for rooms: raise the size until the longest side reaches
 *    MIN_SUBJECT_PX (at most the full fitted size), then clamp the vertical
 *    choice above the install bar.
 * 3. Fit it into `area` minus the drawing's effect margins, and render.
 * 4. Align the measured silhouette ('scale' fit only), keeping the focal point
 *    (traits.focal, else the bounds centre; under vista also the bottom row
 *    less VISTA_FOOT) at or above INSTALL_BAR_Y. An
 *    odd shift on an axis that is not centred moves one pixel less (or more)
 *    when the subject stays inside `area` and above the install bar.
 * 5. Apply the remaining shift. When it is even on both axes and the subject
 *    is clear of the canvas edges, the pixels, intent keys and provenance
 *    move; otherwise the subject renders again. Both paths give the same
 *    bytes, because cover patterns repeat every 2 device pixels (checker).
 *    `composition.blit:false` (or `blit:false` here) always renders again.
 * The placement's size and vertical record the values used. `layer`, `intent` and
 * `provenance` (a Uint8Array or null) are cleared before every render. */
export function placeSubject({drawing,placement=null,area,room=false,frame,layer,intent,provenance=null,traits=null,recipe=null,style=null,look=null,blit=null}) {
  const meta=compositionMeta(style,recipe),fit=placement?.fit??'scale';
  const focal=isPoint(traits?.focal)?traits.focal:null;
  let probe=null,margins=null;
  if(placement){
    // Measure fills on a padded surface, then transform geometry, not a
    // finished bitmap. Constant-width effects get their own device margin.
    // The probe is a measure-only sink: no pixels, no group buffers.
    const sink={left:256,top:256,right:-1,bottom:-1};
    drawing.draw(viewport(raster(null,256,{pixelArt:true,effects:false,bounds:sink}),{x:64,y:64}));
    const m=drawing.margins;
    if(sink.right>=0){
      const bounds={x:sink.left-64,y:sink.top-64,width:sink.right-sink.left+1,height:sink.bottom-sink.top+1};
      const safe={x:area.x+m.left+1,y:area.y+m.top+1,width:area.width-m.left-m.right-2,height:area.height-m.top-m.bottom-2};
      const choice={...placement};
      // Rooms are intentionally wide: the grammar keeps the walls short
      // enough to honor this minimum beneath even three title lines.
      if(room){const maxScale=Math.min(safe.width/bounds.width,safe.height/bounds.height);choice.size=Math.max(choice.size,94/(bounds.width*maxScale));choice.size=Math.min(1,choice.size);}
      else{
        // Pixel floor: the longest side reaches MIN_SUBJECT_PX when the area
        // can hold it (else the full fitted size). A three-line title leaves
        // a short area, so there the floor lifts every camera toward full size.
        const longest=Math.max(bounds.width,bounds.height)*Math.min(safe.width/bounds.width,safe.height/bounds.height);
        if(longest*choice.size<MIN_SUBJECT_PX)choice.size=placement.size=Math.max(choice.size,Math.min(1,MIN_SUBJECT_PX/longest));
        // Install bar. The alignment finally places a 'scale' fit in `area`;
        // the exact fits keep their position in `safe`. Vista guards the
        // subject's foot as well as its focal row.
        const scale=fitComposition(bounds,safe,{...choice,horizontal:0,vertical:0},{fit}).scale,h=bounds.height*scale;
        let f=focal?Math.max(0,Math.min(1,(focal[1]-bounds.y)/bounds.height)):.5;
        if(placement.camera==='vista'&&h>VISTA_FOOT)f=Math.max(f,(h-VISTA_FOOT)/h);
        choice.vertical=placement.vertical=installVertical(choice.vertical,fit==='scale'?area:safe,h,f);
      }
      frame=fitComposition(bounds,safe,choice,{fit});
      probe=bounds;margins=m;
    }
  }
  const render=()=>{
    layer.fill(TRANSPARENT);intent.clear();if(provenance)provenance.fill(0);
    drawing.draw(viewport(raster(layer,SIZE,{pixelArt:true,intent,provenance}),frame));
  };
  render();
  if(placement){
    const bounds=subjectBounds(layer);
    if(bounds){
      let dx=0,dy=0;
      if(fit==='scale'){
        // Pixel rounding can move a contour by one pixel. Align the measured
        // final silhouette and clamp translation without cropping its pixels.
        const width=bounds.right-bounds.left+1,height=bounds.bottom-bounds.top+1;
        dx=Math.round(area.x+(area.width-width)*placement.horizontal)-bounds.left;
        dy=Math.round(area.y+(area.height-height)*placement.vertical)-bounds.top;
      }
      // The measured focal row stays at or above the install bar (under vista,
      // the bottom row less VISTA_FOOT too); the title margin wins if a
      // subject is too tall for both.
      let y=focal?frame.y+focal[1]*frame.scale:(bounds.top+bounds.bottom)/2;
      if(placement.camera==='vista')y=Math.max(y,bounds.bottom-VISTA_FOOT);
      if(!room){const most=Math.floor(INSTALL_BAR_Y-y);if(dy>most)dy=Math.max(area.y-bounds.top,most);}
      // Prefer even shifts, which can move pixels instead of drawing again:
      // an odd shift on a free axis moves one pixel less (else one more)
      // when the subject still stays inside the area and above the install
      // bar. A centred axis keeps its exact alignment.
      const lowest=Math.max(INSTALL_BAR_Y,y+dy);
      if(!meta.centered)dx=evenShift(dx,e=>bounds.left+e>=area.x&&bounds.right+e<area.x+area.width);
      dy=evenShift(dy,e=>bounds.top+e>=area.y&&bounds.bottom+e<area.y+area.height&&(room||y+e<=lowest));
      if(dx||dy){
        const shift=(blit??meta.blit??true)&&canShift(bounds,dx,dy,probe,margins,frame);
        frame.x+=dx;frame.y+=dy;
        if(shift)shiftSubject(layer,intent,provenance,bounds,dx,dy);
        else render();
      }
    }
  }
  return frame;
}

// d itself when even; else d moved one pixel toward 0, or else one pixel away
// from 0, when `ok` accepts it; else d.
function evenShift(d,ok) {
  if(!(d&1))return d;
  const s=Math.sign(d);
  return ok(d-s)?d-s:ok(d+s)?d+s:d;
}

// A shift copies pixels instead of drawing again only when both paths give the
// same bytes. An even shift keeps every checker phase. Nothing may be clipped
// by the canvas before or after the shift: neither the measured bounds nor the
// probe's full extent, mapped through the frame and grown by the effect
// margins plus 2 px of rounding slack, may reach an edge.
function canShift(bounds,dx,dy,probe,margins,frame) {
  if((dx&1)||(dy&1))return false;
  const clear=(l,t,r,b)=>l>0&&t>0&&r<SIZE-1&&b<SIZE-1;
  if(!clear(bounds.left,bounds.top,bounds.right,bounds.bottom)||!clear(bounds.left+dx,bounds.top+dy,bounds.right+dx,bounds.bottom+dy))return false;
  if(!probe)return true;
  const {x,y,scale}=frame,m=margins;
  const l=x+probe.x*scale-m.left-2,t=y+probe.y*scale-m.top-2,r=x+(probe.x+probe.width)*scale+m.right+2,b=y+(probe.y+probe.height)*scale+m.bottom+2;
  return l>=0&&t>=0&&r<SIZE&&b<SIZE&&l+dx>=0&&t+dy>=0&&r+dx<SIZE&&b+dy<SIZE;
}

// Move the subject layer, its provenance and its intent keys by (dx,dy).
// Everything lies inside `bounds`. Intent keeps its insertion order, as a
// redraw would.
function shiftSubject(layer,intent,provenance,bounds,dx,dy) {
  const {left,top,right,bottom}=bounds,w=right-left+1,h=bottom-top+1,offset=dy*SIZE+dx;
  const move=(plane,empty)=>{
    const copy=new Uint8Array(w*h);
    for(let y=0;y<h;y++){const i=(top+y)*SIZE+left;copy.set(plane.subarray(i,i+w),y*w);plane.fill(empty,i,i+w);}
    for(let y=0;y<h;y++)plane.set(copy.subarray(y*w,y*w+w),(top+y)*SIZE+left+offset);
  };
  move(layer,TRANSPARENT);
  if(provenance)move(provenance,0);
  if(intent.size){
    const entries=[...intent];intent.clear();
    for(const [i,value] of entries){
      const x=i%SIZE+dx,y=(i-i%SIZE)/SIZE+dy;
      if(x>=0&&x<SIZE&&y>=0&&y<SIZE)intent.set(y*SIZE+x,value);
    }
  }
}

// The occupied layer, including its attached base, anchors background floors.
// This scan does not alter pixels or infer a silhouette from their colors.
export function subjectBounds(indices,size=128,transparent=255) {
  let left=size,top=size,right=-1,bottom=-1;
  for(let i=0;i<indices.length;i++)if(indices[i]!==transparent){
    const x=i%size,y=Math.floor(i/size);
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  return right<0?null:{left,top,right,bottom};
}
