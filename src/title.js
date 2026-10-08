// Cover titles. The engine-18 layout and painter are frozen in legacy.js and
// keep their public names here; the classic mascot (compat) still uses them.
//
// Engine 19 (package E6) dresses every other title as box-art lettering, the
// CHGame house stack, built from 1-bit masks over the title band and painted
// back to front:
//   SH  drop shadow (1,1) in ink, unless a halo is drawn; 1 px pinholes close
//   H   neon only: a solid 8-connected glow ring in 11, then a 4-connected
//       ring on a 50% checker (the falloff); pockets between letters skipped
//   O2  neon only: an outer ink ring
//   O,N the 1 px outline (4-connected) and the 1-3 px notches between letters
//   S,U the extrusion: side faces swept from right edges, under faces swept
//       from bottom edges; a side plane meets its letter in every row it
//       spans (it ends flat on its edge's last face row, so nothing hangs
//       below a foot); never inside a letter's own counters
//   F   the face, in colour bands; seams checker only on runs >= 5 px
//   bevel and 1-2 cream glints, on the thick strokes of fonts 0 and 3 only
// Each step is a per-pixel shift/or/and, the same operations as CHGame's
// on-device maskTitle (which omits the bevel and glints by the owner's choice).
// Role 12 is the title's own colour; recipes, scenes and the stage never paint
// it. Every treatment still paints role 10 inside the title rows.
import {fonts} from './font.js';
import {legacyTitleLayout,legacyDrawTitle} from './legacy.js';
import {extrudeMask,outlineMask,outsideMask} from './masks.js';
import {hash,random} from './random.js';
export {legacyTitleLayout as titleLayout,legacyDrawTitle as drawTitle} from './legacy.js';

const SIZE=128,LINE_WIDTH=116,HALO_WIDTH=112,MAX_BOTTOM=59,BEVEL_MIN=3;
// Every title pixel stays inside columns 2..125 and below row 2 (frame rule).
const SAFE_LEFT=2,SAFE_RIGHT=125,SAFE_TOP=3;
const FONT_ORDER=[0,3,1,2];
// Font 0 draws some punctuation (such as &) with digit shapes; it keeps the
// engine-18 charset. Every other face sets any glyph it actually has.
const FONT0_CHARSET=/^[A-Z0-9 !?.,'-]+$/;
// Presence: a one-line set of fonts 0 and 3 ending above this row is a thin
// strip in the top band; a balanced two-line set is preferred when both of
// its lines are at least PRESENCE_WIDTH px wide.
const PRESENCE_BOTTOM=26,PRESENCE_WIDTH=40;
// The horizon band (chrome) paints only on runs of this many face pixels.
const HORIZON_RUN=5;

const freeze=Object.freeze;
const row=(id,data)=>freeze({id,...data,bands:freeze(data.bands.map(b=>freeze(b))),
  bevel:data.bevel?freeze(data.bevel):null,extrude:data.extrude?freeze(data.extrude):null});

/**
 * Title colour treatments, one plain data row each (a C port can use the same
 * table). Fields:
 * - accentHue [lo,hi] OKLCh degrees or 'complement', tC title chroma
 *   (number | 'max'): read by palette.js buildMoodPalette for roles 10/11/12.
 * - bands [[role, until],...] for fonts 0 and 3: a face row r of a cap height
 *   h takes the first band with (r+.5)/h < until. The last band is never the
 *   extrusion's side or under colour, so the extrusion reads as its own plane.
 * - horizon: index of a band (chrome) that paints only inside horizontal runs
 *   of 5 px or more, inset a pixel from both ends; run ends and narrower
 *   stems take the band below (above, when only the face above continues
 *   them), so the band never joins the outline and no letter is sliced.
 * - foot: a band role that only moods without a forced accent keep (ember's
 *   red 14); with forceAccent that band takes 10.
 * - seams: the first row of a new band checkers the two bands, only where the
 *   horizontal run is at least 5 px and all four neighbours are face (never on
 *   a silhouette edge, never into cream or ink).
 * - bevel [hi, lo] on fonts 0 and 3, or null.
 * - extrude {depth, dx, dy, side, under}, or null. Fonts 1 and 2 (1-2 px
 *   strokes) drop straight down (dx 0, under faces only).
 * - outline (default ink 4); neon adds ring (outer ring) and halo (glow).
 * - glints: at most this many cream glints on font 0; font 3 takes one.
 */
export const TREATMENTS=freeze({
  gilded:row('gilded',{accentHue:[66,82],tC:'max',bands:[[12,.36],[10,1]],seams:true,bevel:[8,11],
    extrude:{depth:2,dx:1,dy:1,side:11,under:4},glints:2}),
  chrome:row('chrome',{accentHue:[195,225],tC:.06,bands:[[12,.38],[13,.54],[11,.62],[10,1]],horizon:2,seams:false,bevel:null,
    extrude:{depth:1,dx:0,dy:1,side:11,under:13},glints:2}),
  neon:row('neon',{accentHue:'complement',tC:'max',bands:[[12,.75],[10,1]],seams:false,bevel:null,
    extrude:null,outline:10,ring:4,halo:11,glints:0}),
  block:row('block',{accentHue:'complement',tC:'max',bands:[[8,.08],[12,.60],[10,1]],seams:false,bevel:null,
    extrude:{depth:3,dx:0,dy:1,side:11,under:11},glints:0}),
  ember:row('ember',{accentHue:[45,62],tC:'max',bands:[[12,.30],[10,.68],[14,1]],foot:14,seams:true,bevel:[8,11],
    extrude:{depth:2,dx:1,dy:1,side:11,under:4},glints:1}),
  ivory:row('ivory',{accentHue:[70,95],tC:.04,bands:[[12,.50],[10,1]],seams:true,bevel:[8,11],
    extrude:{depth:1,dx:1,dy:1,side:11,under:4},glints:1}),
  jade:row('jade',{accentHue:[140,165],tC:'max',bands:[[12,.30],[10,1]],seams:true,bevel:[8,11],
    extrude:{depth:2,dx:1,dy:1,side:11,under:4},glints:2}),
  ice:row('ice',{accentHue:[185,210],tC:'max',bands:[[8,.08],[12,.42],[10,1]],seams:true,bevel:null,
    extrude:{depth:1,dx:1,dy:1,side:11,under:4},glints:2}),
});
export const TREATMENT_NAMES=freeze(Object.keys(TREATMENTS));
// Used when a non-compat title is laid out without a look (tools, tests).
const DEFAULT_TREATMENT=TREATMENTS.gilded;

/** Treatment weights per style (engine-contract E6); recipe.treatments, given
 * as {id:w} or [[id,w],...], replaces a style's row. */
export const STYLE_TREATMENTS=freeze({
  spaceships:freeze({chrome:30,neon:20,ice:15,block:15,gilded:10,ember:5,ivory:5}),
  planets:freeze({neon:25,chrome:20,ice:20,gilded:15,block:10,ember:5,jade:5}),
  machines:freeze({chrome:35,block:25,gilded:15,ember:15,neon:10}),
  relics:freeze({gilded:35,ivory:15,jade:15,ice:15,neon:10,ember:10}),
  plants:freeze({jade:35,gilded:15,ivory:15,neon:15,block:10,ember:10}),
  islands:freeze({ivory:25,gilded:25,jade:20,ice:15,block:15}),
  buildings:freeze({gilded:25,block:25,ivory:20,chrome:15,ember:15}),
  vehicles:freeze({chrome:30,block:25,ember:15,gilded:15,neon:15}),
  heraldry:freeze({gilded:45,ivory:25,ember:15,chrome:15}),
  glyphs:freeze({neon:35,gilded:20,ice:15,jade:15,ember:15}),
  dungeons:freeze({ember:35,gilded:30,ivory:15,block:10,jade:10}),
  mascot:freeze({block:30,gilded:20,jade:15,ice:15,neon:10,ivory:10}),
  default:freeze({gilded:40,chrome:20,block:20,ivory:20}),
});
/** Treatments whose weight is multiplied by (1 + wildness). */
export const WILD_TREATMENTS=freeze(['neon','block','ice']);
/** Variants per dealt treatment block (the tier deck's block). */
export const TREATMENT_DEAL=12;
// Mean wildness of a dealt block (tiers 5/4/2/1 at 0/.2/.5/.9): a dealt
// block's wild treatments are weighted by (1 + this).
const DEAL_WILDNESS=(4*.2+2*.5+.9)/12;

function treatmentPairs(spec) {
  const pairs=Array.isArray(spec)?spec.map(p=>[p?.[0],p?.[1]]):Object.entries(spec??{});
  if(!pairs.length)throw Error('Title treatment weights must not be empty.');
  for(const [id,w] of pairs){
    if(!TREATMENTS[id])throw Error('Unknown title treatment: '+id);
    if(!Number.isFinite(w)||w<0)throw Error('Title treatment weights are finite and nonnegative.');
  }
  return pairs;
}

// The same draw as variation.js weighted(): W=round(w*100), one integer.
function weightedPick(v,name,pairs) {
  if(typeof v.weighted==='function')return v.weighted(name,pairs);
  const W=pairs.map(([,w])=>Math.round(w*100)),total=W.reduce((a,b)=>a+b,0);
  if(total<1)throw Error('Title treatment weights must not all be zero.');
  let k=v.integer(name,0,total-1);
  for(let i=0;i<pairs.length;i++){if(k<W[i])return pairs[i][0];k-=W[i];}
  return pairs[pairs.length-1][0];
}

// One block of 12 dealt treatments, as a line. Counts are the weights'
// largest-remainder shares of 12: the floors always, the leftover slots drawn
// for this block by remainder. The line is then dealt slot by slot so that no
// two neighbours are equal whenever no id has more than 6 slots.
function dealBlock(pairs,key) {
  const r=random(hash(key)),total=pairs.reduce((a,[,w])=>a+w,0);
  if(!(total>0))throw Error('Title treatment weights must not all be zero.');
  // With 3 or more ids no id takes more than 5 slots, so a block can always
  // open away from its predecessor's last entry (see dealTreatment).
  const cap=pairs.length>=3?TREATMENT_DEAL/2-1:TREATMENT_DEAL,share=pairs.map(([,w])=>TREATMENT_DEAL*w/total);
  const ids=pairs.map(([id])=>id),count=share.map(s=>Math.min(cap,Math.floor(s)));
  const rest=share.map((s,i)=>count[i]<cap?Math.round((s-count[i])*1000):0);
  for(let left=TREATMENT_DEAL-count.reduce((a,b)=>a+b,0);left>0;left--){
    let sum=rest.reduce((a,b)=>a+b,0),i=0;
    if(sum<1){i=share.reduce((b,s,k)=>count[k]<cap&&(b<0||s>share[b])?k:b,-1);count[i]++;continue;}
    for(let k=r(sum);k>=rest[i];i++)k-=rest[i];
    count[i]++;rest[i]=0;
  }
  // Slot by slot: a seeded pick weighted by the slots each id has left,
  // among the ids that differ from the previous slot and leave the rest
  // arrangeable (no id above half of the remaining slots, rounded up, and
  // the id just placed not holding exactly that many of an odd remainder).
  // A pick weighs 6 x (slots left)^2, or 1 x (slots left)^2 for the id two
  // slots back: heavy ids spread early instead of crowding the block's end,
  // and the fillers between their slots vary instead of alternating ABAB.
  const line=[];let prev=-1,back=-1;
  for(let m=TREATMENT_DEAL;m>0;m--){
    const ok=i=>{
      if(!count[i]||i===prev)return false;
      count[i]--;const n=m-1,half=Math.ceil(n/2),most=Math.max(0,...count);
      const fine=most<=half&&!(n%2===1&&count[i]===half);count[i]++;return fine;
    };
    let pool=count.map((_,i)=>i).filter(ok);
    if(!pool.length)pool=count.map((_,i)=>i).filter(i=>count[i]&&i!==prev);
    if(!pool.length)pool=count.map((_,i)=>i).filter(i=>count[i]);
    const weight=i=>count[i]*count[i]*(i===back?1:6);
    let k=r(pool.reduce((a,i)=>a+weight(i),0)),pick=pool[0];
    for(const i of pool){if(k<weight(i)){pick=i;break;}k-=weight(i);}
    line.push(ids[pick]);count[pick]--;back=prev;prev=pick;
  }
  return line;
}

/**
 * The dealt treatment of variant `index` (title-seeded `cycleSeed`, without
 * the variant). Every aligned block of 12 variants holds each treatment its
 * weight's share of 12 times (at most 5 when 3 or more treatments have
 * weight), and neighbouring variants differ, across block boundaries too,
 * whenever 3 or more treatments have weight. A block's last entry depends
 * only on that block's seed: when a block would open with its predecessor's
 * last treatment, its first entry moves to the first inner gap with no equal
 * neighbour (one always exists with at most 5 equal entries).
 */
export function dealTreatment(pairs,cycleSeed,index=0) {
  if(!Number.isSafeInteger(index)||index<0)throw Error('A treatment deal needs a nonnegative safe integer index.');
  const block=Math.floor(index/TREATMENT_DEAL),key=String(cycleSeed)+':title-treatment:';
  const line=dealBlock(pairs,key+block);
  if(block>0){
    const last=dealBlock(pairs,key+(block-1))[TREATMENT_DEAL-1];
    if(line[0]===last){
      const first=line.shift();
      const j=line.findIndex((id,k)=>k>0&&id!==first&&line[k-1]!==first);
      line.splice(j>0?j:0,0,first);
    }
  }
  return line[index%TREATMENT_DEAL];
}

/**
 * Choose the title treatment for a cover from the look variation `v`.
 * Weights come from recipe.treatments, else the style's row, else the
 * default row; neon, block and ice are multiplied by (1 + wildness).
 * - When `v` carries a cycleSeed (the engine's title-seeded seed, without the
 *   variant) the treatment is dealt per block of 12 variants at v.index
 *   (dealTreatment), so neighbouring variants never repeat a lettering; a
 *   dealt block weights the wild treatments by its mean wildness. The tier of
 *   the variant does not change its block's deal.
 * - Otherwise one named draw, v.weighted('title-treatment').
 * Returns a fresh copy of the chosen row (with its `id`), or null without a
 * variation.
 */
export function chooseTreatment(v,style,recipe=null,wildness=0) {
  if(!v||typeof v.integer!=='function')return null;
  const dealt=v.cycleSeed!=null;
  const w=dealt?DEAL_WILDNESS:Number.isFinite(wildness)?Math.min(1,Math.max(0,wildness)):0;
  const pairs=treatmentPairs(recipe?.treatments??STYLE_TREATMENTS[style]??STYLE_TREATMENTS.default)
    .map(([id,weight])=>[id,WILD_TREATMENTS.includes(id)?weight*(1+w):weight]);
  const id=dealt?dealTreatment(pairs.filter(([,weight])=>weight>0),v.cycleSeed,v.index??0):weightedPick(v,'title-treatment',pairs);
  return {...TREATMENTS[id]};
}

// ---------------------------------------------------------------- layout --

const glyphOf=(font,c)=>fonts[font]?.[c.charCodeAt(0)-32];
const inked=g=>!!g&&g.slice(4).some(Boolean);
function supports(font,text) {
  if(!fonts[font])return false;
  if(font===0)return FONT0_CHARSET.test(text);
  for(const c of text){const g=glyphOf(font,c);if(!g||(font===3&&c!==' '&&!inked(g)))return false;}
  return true;
}
// A glyph whose rows hold a 1 px gap between two inked pixels (M, W, N...):
// the bold mask m | shift(m,1,0) would close that counter.
function closesWhenBold(font,c) {
  const [,w,,,...bits]=glyphOf(font,c),all=(1<<w)-1;
  return bits.some(b=>(b&(b>>2)&~(b>>1)&all)!==0);
}

/** Line metrics for a font, as legacy measure(); a bold face adds 1 to every
 * glyph's width and advance (the mask is m | shift(m,1,0)). */
function measurer(font,bold) {
  const extra=bold?1:0;
  return line=>{
    let pen=0,left=0,right=0,top=0,bottom=0;
    for(const c of line){const [advance,w,bearing,t,...rows]=glyphOf(font,c);
      left=Math.min(left,pen+bearing);right=Math.max(right,pen+bearing+w+extra);
      top=Math.max(top,t);bottom=Math.max(bottom,rows.length-t);pen+=advance+extra;
    }
    return {width:right-left,left,top,bottom};
  };
}

// Candidate line sets: one line; two lines split at a space (anywhere for
// font 2); three lines at spaces for font 0 when allowed. Fewest lines first,
// then breaks at spaces before breaks inside a word (font 2), then the
// smallest spread of line widths (engine 18's order for 1-2 lines).
function candidateLines(text,font,measure,three) {
  const fits=line=>!!line&&measure(line).width<=LINE_WIDTH;
  const found=[];
  if(fits(text))found.push([text]);
  const cuts=[];for(let i=1;i<text.length;i++)if(font===2||text[i]===' ')cuts.push(i);
  for(const i of cuts){const lines=[text.slice(0,i).trim(),text.slice(i).trim()];if(lines.every(fits))found.push(lines);}
  if(three)for(const i of cuts)for(const j of cuts)if(j>i){
    const lines=[text.slice(0,i).trim(),text.slice(i,j).trim(),text.slice(j).trim()];
    if(lines.every(fits))found.push(lines);
  }
  const spread=lines=>{if(lines.length<2)return 0;const w=lines.map(l=>measure(l).width);return Math.max(...w)-Math.min(...w);};
  // Font 2 may break inside a word, but only when no break at a space fits.
  const words=text.split(' ').length,broken=lines=>lines.join(' ').split(' ').length>words?1:0;
  return found.sort((a,b)=>a.length-b.length||broken(a)-broken(b)||spread(a)-spread(b));
}

// The extrusion a font actually gets: fonts 1 and 2 (1-2 px strokes) drop
// straight down, since a diagonal side face fills their 1 px counters.
function extrusionOf(font,treatment) {
  const ex=treatment.extrude;
  return ex&&ex.dx&&(font===1||font===2)?{...ex,dx:0}:ex;
}

// Spacing for a line set: depth caps by font and fit, gap, line height, bottom.
function arrange(lines,font,measure,treatment,dark) {
  const ex=extrusionOf(font,treatment);
  let depth=ex?ex.depth:0;
  depth=Math.min(depth,font===3?2:font===0?(lines.length===3?1:4):1);
  // Keep the extrusion, outline and shadow inside the frame columns.
  if(ex&&ex.dx)for(const line of lines){
    const {width}=measure(line),first=Math.round((SIZE-width)/2),last=first+width-1;
    depth=Math.min(depth,ex.dx>0?SAFE_RIGHT-2-last:first-SAFE_LEFT-1);
  }
  depth=Math.max(0,depth);
  const metrics=lines.map(measure),top=Math.max(...metrics.map(m=>m.top)),descent=Math.max(...metrics.map(m=>m.bottom));
  const gap=Math.max(3,depth+1),n=lines.length;
  // A dark glow reads as a dirty fringe on a light stage: light moods keep
  // the ink ring and drop shadow instead.
  const halo=!!treatment.halo&&dark&&metrics.every(m=>m.width<=HALO_WIDTH);
  return {top,descent,gap,depth,halo,lineHeight:top+descent+gap,bottom:7+n*(top+descent)+(n-1)*gap};
}

/**
 * Engine-19 title layout for `text` (already normalized and upper-cased by the
 * caller). Options {compat, look, recipe, style}:
 * - compat returns the frozen legacy layout plus the legacy extra fields.
 * - Otherwise fonts are tried in the order 0, 3, 1 (bold when that fits in as
 *   few lines as the regular face and no glyph's 1 px counter would close),
 *   2. Font 0 keeps its charset and may take 3 lines when the text has 2 or
 *   more spaces, except in room styles (recipe.composition.room or dungeons).
 *   Font 3 sets any glyph it has.
 * - Presence: fonts 0 and 3 take a two-line set instead of a single line
 *   ending above row 26 when both lines are at least 40 px wide.
 * - options.fonts (an array of font numbers) replaces the font order, for
 *   studies and tests; options.treatment replaces look.treatment.
 * - The extrusion depth comes from look.treatment (default gilded), capped at
 *   2 for font 3 and 1 for fonts 1, 2 and 3-line font 0; gap = max(3, d+1).
 * - Neon keeps its halo only on dark moods (look.moodSpec.dark not false) and
 *   when every line is 112 px or narrower.
 * Returns {lines, font, measure, top, descent, lineHeight, bottom, gap, depth,
 * bold, halo, treatment, extent, areaTop, roomTop, classicTop}. extent and the
 * area fields are estimates until prepareTitle measures the footprint.
 */
export function layoutTitle(text,options={}) {
  const {compat=false,look=null,recipe=null,style=null,fonts:order=FONT_ORDER}=options??{};
  if(compat){
    const layout=legacyTitleLayout(text),{bottom}=layout;
    return {...layout,gap:3,depth:0,bold:false,extent:bottom,areaTop:bottom+6,roomTop:bottom+4,classicTop:bottom+5};
  }
  const wanted=options?.treatment??look?.treatment;
  const treatment=wanted&&TREATMENTS[wanted.id]?wanted:DEFAULT_TREATMENT;
  const dark=look?.moodSpec?.dark!==false;
  const room=!!recipe?.composition?.room||style==='dungeons';
  const three=!room&&(text.match(/ /g)||[]).length>=2;
  for(const font of order){
    if(!FONT_ORDER.includes(font)||!supports(font,text))continue;
    let choice=null;
    for(const bold of font===1?[true,false]:[false]){
      if(bold&&[...text].some(c=>c!==' '&&closesWhenBold(font,c)))continue;
      const measure=measurer(font,bold),sets=candidateLines(text,font,measure,font===0&&three);
      let pick=null;
      for(const lines of sets){
        const spacing=arrange(lines,font,measure,treatment,dark);
        if(spacing.bottom>MAX_BOTTOM)continue;
        if(!pick)pick={lines,...spacing};
        // Presence: a thin one-line strip gives way to two balanced lines.
        if(pick.lines.length===1&&(font===0||font===3)&&pick.bottom<PRESENCE_BOTTOM&&lines.length===2&&
          lines.every(l=>measure(l).width>=PRESENCE_WIDTH)){pick={lines,...spacing};break;}
        if(pick.lines.length>1||!(font===0||font===3)||pick.bottom>=PRESENCE_BOTTOM)break;
      }
      if(pick&&(!choice||pick.lines.length<choice.lines.length))choice={...pick,measure,bold};
    }
    if(!choice)continue;
    const {lines,measure,bold,top,descent,gap,depth,halo,lineHeight,bottom}=choice;
    // Estimate: last glyph row, extrusion, outline, neon ring, then the two
    // halo rings or the shadow.
    const ex=extrusionOf(font,treatment);
    const extent=bottom-1+depth*Math.max(0,ex?.dy??0)+1+(treatment.ring!=null?1:0)+(halo?2:1);
    return {lines,font,measure,top,descent,lineHeight,bottom,gap,depth,bold,halo,treatment,
      extent,areaTop:Math.max(bottom+6,extent+3),roomTop:Math.max(bottom+4,extent+1),classicTop:Math.max(bottom+5,extent+2)};
  }
  throw Error('Title is too wide.');
}

// ----------------------------------------------------------------- masks --

// Inclusive bounding box of a mask over rows 0..rows-1; null when empty.
function bbox(mask,rows) {
  let left=SIZE,top=SIZE,right=-1,bottom=-1;
  for(let y=0;y<rows;y++)for(let x=0;x<SIZE;x++)if(mask[y*SIZE+x]){
    if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;bottom=y;
  }
  return right<0?null:{left,top,right,bottom};
}
const grow=(b,n)=>({left:Math.max(0,b.left-n),top:Math.max(0,b.top-n),right:Math.min(SIZE-1,b.right+n),bottom:Math.min(SIZE-1,b.bottom+n)});

// Runs of set pixels through each pixel: horizontal (h) and vertical (v).
function runLengths(mask,box) {
  const h=new Uint8Array(mask.length),v=new Uint8Array(mask.length);
  for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;){
    if(!mask[y*SIZE+x]){x++;continue;}
    let end=x;while(end<box.right&&mask[y*SIZE+end+1])end++;
    for(let k=x;k<=end;k++)h[y*SIZE+k]=Math.min(255,end-x+1);
    x=end+1;
  }
  for(let x=box.left;x<=box.right;x++)for(let y=box.top;y<=box.bottom;){
    if(!mask[y*SIZE+x]){y++;continue;}
    let end=y;while(end<box.bottom&&mask[(end+1)*SIZE+x])end++;
    for(let k=y;k<=end;k++)v[k*SIZE+x]=Math.min(255,end-y+1);
    y=end+1;
  }
  return {h,v};
}

// The face colour bands for a font: fonts 0 and 3 use the treatment's rows
// (a foot band takes 10 when the mood forces the accent); font 1 takes its
// first band that is neither cream nor ink, then 10 (two bands, no seams);
// font 2 is [12,.6][10,1], so the 10 band is never a lone bottom pixel on its
// 1 px strokes.
function faceBands(font,treatment,forced) {
  if(font===0||font===3)return forced&&treatment.foot!=null
    ?treatment.bands.map(([c,until])=>[c===treatment.foot?10:c,until]):treatment.bands;
  if(font===2)return [[12,.6],[10,1]];
  const first=treatment.bands.find(([c])=>c!==8&&c!==4)??[12,.5];
  return [[first[0],first[1]],[10,1]];
}

// mask plus its Euclidean radius-3 dilation (x*x+y*y <= 9), the same set as
// mask | outlineMask(mask,128,3), from row spans: |dx|<=3 on the row,
// |dx|<=2 one and two rows away, dx=0 three rows away.
function dilateDisk3(mask,rows) {
  const out=new Uint8Array(mask.length),h2=new Uint8Array(mask.length),h3=new Uint8Array(mask.length);
  for(let y=0;y<rows;y++)for(let x=0;x<SIZE;x++){
    const i=y*SIZE+x;if(!mask[i])continue;
    for(let dx=-3;dx<=3;dx++){const xx=x+dx;if(xx<0||xx>=SIZE)continue;h3[i+dx]=1;if(dx>=-2&&dx<=2)h2[i+dx]=1;}
  }
  const last=Math.min(SIZE,rows+3);
  for(let y=0;y<last;y++)for(let x=0;x<SIZE;x++){
    const i=y*SIZE+x,at=(k,a)=>y+k>=0&&y+k<SIZE&&a[i+k*SIZE];
    if(h3[i]||at(-1,h2)||at(1,h2)||at(-2,h2)||at(2,h2)||at(-3,mask)||at(3,mask))out[i]=1;
  }
  return out;
}

function setArea(layout,extent) {
  layout.extent=extent;
  layout.areaTop=Math.max(layout.bottom+6,extent+3);
  layout.roomTop=Math.max(layout.bottom+4,extent+1);
  layout.classicTop=Math.max(layout.bottom+5,extent+2);
}

/**
 * Prepare the title stack for `layout` (from layoutTitle). With compat, or a
 * legacy layout, it returns {footprint:null, calm:null, extent:bottom,
 * paint(screen) = legacyDrawTitle}. Otherwise it builds every mask once and
 * returns {footprint, calm, extent, glints, paint(screen, indices)}:
 * - footprint: Uint8Array(128*128), 1 on every title pixel and 2 on the
 *   registered glint pixels (deliberate details, not specks);
 * - calm: footprint plus its 3 px Euclidean dilation (stage and scenes);
 * - extent: the footprint's lowest row;
 * - glints: [{x, y, size}] as placed;
 * - masks: the stack's 1-bit masks {face, extrude, under, side, notch,
 *   outline, ring, halo, glow, shadow, pinhole} (null when unused), for
 *   tools and tests; side and under hold the extrusion pixels painted in
 *   the side and under colours (each side pixel reaches its letter's face
 *   along -dx in its own row through side pixels only), halo the whole glow footprint and glow its
 *   solid inner ring, pinhole the 1 px holes closed in ink;
 * - paint writes role indices into `indices` (or screen.dot without it).
 * It also sets layout.extent, areaTop = max(bottom+6, extent+3), roomTop =
 * max(bottom+4, extent+1) and classicTop = max(bottom+5, extent+2), which the
 * engine reads afterwards. Options {compat, look}: the glints are placed with
 * look.variation ('title-glint:0', 'title-glint:1'); look.moodSpec.forceAccent
 * turns a treatment's foot band into 10.
 */
export function prepareTitle(layout,options={}) {
  const {compat=false,look=null}=options??{};
  const treatment=layout?.treatment;
  if(compat||!treatment)return {footprint:null,calm:null,extent:layout.bottom,paint:screen=>legacyDrawTitle(screen,layout)};
  const N=SIZE*SIZE,{font,lines,measure,top,lineHeight,depth,bold,halo}=layout;
  const descent=layout.descent??lineHeight-layout.gap-top;
  // Every mask lives in the title band: rows 0..rows-1 (M pixels).
  const rows=Math.min(SIZE,layout.bottom+depth+8),M=rows*SIZE;
  // F: the face, placed exactly like the legacy title, with a letter-id map.
  const F=new Uint8Array(N),id=new Uint8Array(N);
  const cap=glyphOf(font,'H'),capTop=cap[3],capH=cap.length-4;
  const bands=faceBands(font,treatment,!!look?.moodSpec?.forceAccent);
  const rowBand=new Int8Array(SIZE).fill(-1),rowSeam=new Uint8Array(SIZE);
  const lineRows=[];
  let letter=0;
  lines.forEach((line,li)=>{
    const y=7+top+li*lineHeight,bounds=measure(line);
    let x=Math.round((SIZE-bounds.width)/2)-bounds.left;
    for(const ch of line){
      const [advance,w,left,t,...bits]=glyphOf(font,ch);letter++;
      bits.forEach((b,j)=>{for(let i=0;i<w;i++)if(b&(1<<(w-1-i)))for(let k=0;k<=(bold?1:0);k++){
        const px=x+left+i+k,py=y-t+j;
        if(px>=0&&px<SIZE&&py>=0&&py<SIZE){F[py*SIZE+px]=1;id[py*SIZE+px]=letter;}
      }});
      x+=advance+(bold?1:0);
    }
    letter++;
    // Bands by the row within the line's cap height; a seam on a new band.
    const y0=y-top,y1=y+descent-1,c0=y-capTop;
    lineRows.push([y0,y1]);
    for(let yy=Math.max(0,y0);yy<=Math.min(SIZE-1,y1);yy++){
      const r=Math.max(0,yy-c0);let b=bands.findIndex(([,until])=>(r+.5)/capH<until);if(b<0)b=bands.length-1;
      rowBand[yy]=b;
      if(yy>y0&&rowBand[yy-1]>=0&&rowBand[yy-1]!==b)rowSeam[yy]=1;
    }
  });
  const box=bbox(F,rows);
  if(!box){setArea(layout,layout.bottom);return {footprint:new Uint8Array(N),calm:new Uint8Array(N),extent:layout.bottom,glints:[],paint(){}};}
  const run=runLengths(F,box);
  // The face's exterior (4-connected background), over the box grown by the
  // extrusion's reach; beyond that region every pixel is outside.
  const ex=extrusionOf(font,treatment),extruded=!!ex&&depth>0;
  const reach=depth+2,outside=outsideMask(F,SIZE,{box,pad:reach});
  const region=grow(box,reach);
  const exterior=i=>{const x=i%SIZE,y=(i-x)/SIZE;return x<region.left||x>region.right||y<region.top||y>region.bottom||!!outside[i];};

  // E: the extrusion (masks.js extrudeMask with its crumb rule). It never
  // lands in a counter of its own letter: a pixel enclosed by the face is
  // dropped, and so is a pocket pixel: for a diagonal extrusion one whose
  // next pixel along dx is its own letter's face (the 1 px gaps of M and W;
  // a face below is a stroke that juts out, so a side face may rest on it),
  // for a straight drop one whose next pixel along dy is its own face, or
  // with its own face on both sides (a 1 px slot) and no extrusion below to
  // continue into. Dropped pixels close in the outline instead.
  const E=new Uint8Array(N),U=new Uint8Array(N),side=new Uint8Array(N);
  if(extruded){
    const K=extrudeMask(F,SIZE,ex.dx,ex.dy,depth,{crumbs:true,box});
    for(let i=0;i<M;i++)if(K[i]){
      const own=id[i-K[i]*(ex.dy*SIZE+ex.dx)],mine=j=>j>=0&&j<N&&F[j]&&id[j]===own;
      const below=i+ex.dy*SIZE,open=below>=0&&below<N&&K[below];
      if(!exterior(i)||(ex.dx?mine(i+ex.dx):(mine(below)||(mine(i-1)&&mine(i+1)&&!open))))continue;
      E[i]=1;id[i]=own;
    }
    // Faces by their generating edge, in sweep order (along dy, then dx).
    // Under: directly below (along dy) the face or another under pixel, the
    // sweep of a bottom edge. Side: the sweep of a right (dx) edge, kept only
    // in the rows of the face it continues: the pixel at (x-dx,y) is its own
    // letter's face or side. So a side plane ends flat on the last face row
    // of its edge, and every side pixel meets its letter in its own row;
    // the corner diagonal below a foot (and the sweep of a stem down a notch
    // and past the baseline) is under, never a hanging strand or a tip cut
    // off by ink. A 1 px step of a rounded corner (an under pixel between its
    // letter's face on the left and above and the diagonal sweep on the
    // right) joins the side plane, so the plane follows the corner.
    const sy=ex.dy*SIZE,sx=ex.dx;
    const ys=ex.dy<0?rows-1:0,ye=ex.dy<0?-1:rows,yi=ex.dy<0?-1:1;
    const xs=ex.dx<0?SIZE-1:0,xe=ex.dx<0?-1:SIZE,xi=ex.dx<0?-1:1;
    const at=(j,a)=>j>=0&&j<N&&a[j],mine=(j,k)=>at(j,F)&&id[j]===k;
    for(let y=ys;y!==ye;y+=yi)for(let x=xs;x!==xe;x+=xi){
      const i=y*SIZE+x;if(!E[i])continue;
      const own=id[i],inRow=x-sx>=0&&x-sx<SIZE,up=i-sy,b=i-sx;
      if(ex.dy&&(at(up,F)||at(up,U))){
        // The step: its face above and to its left, the diagonal sweep of
        // that corner beyond it (an extrusion pixel not under anything).
        const c=i+sx,cx=x+sx;
        if(!sx||!inRow||cx<0||cx>=SIZE||!mine(up,own)||!mine(b,own)||!at(c,E)||id[c]!==own||at(c-sy,F)||at(c-sy,U)){U[i]=1;continue;}
      }
      if(sx&&inRow&&(mine(b,own)||(at(b,side)&&id[b]===own)))side[i]=1;else U[i]=1;
    }
  }
  // N: notches. On each line's rows (down to its extrusion), a short run of
  // background bounded by two different letters is closed in ink.
  const A=new Uint8Array(N),notch=new Uint8Array(N),maxRun=font===0?3:2;
  for(let i=0;i<M;i++)A[i]=F[i]|E[i];
  for(const [y0,y1] of lineRows)for(let y=Math.max(0,y0);y<=Math.min(SIZE-1,y1+depth);y++){
    let prev=-1;
    for(let x=0;x<SIZE;x++){
      const i=y*SIZE+x;if(!A[i])continue;
      const gap=x-prev-1;
      if(prev>=0&&gap>=1&&gap<=maxRun&&id[y*SIZE+prev]!==id[i])for(let k=prev+1;k<x;k++)notch[y*SIZE+k]=1;
      prev=x;
    }
  }
  for(let i=0;i<M;i++)if(notch[i])A[i]=1;
  const boxA=bbox(A,rows);
  // O: the outline; neon adds the outer ring O2 and the halo H: a solid
  // 8-connected ring G, then a 4-connected checker ring. Halo cells with the
  // stack on both sides, within 3 px along a row or a column or 2 px along a
  // diagonal (pockets and channels between letters, and their mouths), stay
  // empty.
  const O=outlineMask(A,SIZE,1,{box:boxA});
  const all=new Uint8Array(N);for(let i=0;i<M;i++)all[i]=A[i]|O[i];
  let O2=null,H=null,G=null;
  if(treatment.ring!=null){
    O2=outlineMask(all,SIZE,1,{box:grow(boxA,1)});
    for(let i=0;i<M;i++)all[i]|=O2[i];
  }
  if(halo){
    H=new Uint8Array(N);G=new Uint8Array(N);const b=grow(boxA,4);
    const has=(x,y)=>x>=0&&y>=0&&x<SIZE&&y<SIZE&&all[y*SIZE+x];
    const near=(x,y,dx,dy)=>has(x+dx,y+dy)||has(x+2*dx,y+2*dy)||(!dx||!dy)&&has(x+3*dx,y+3*dy);
    const pocket=(x,y)=>(near(x,y,-1,0)&&near(x,y,1,0))||(near(x,y,0,-1)&&near(x,y,0,1))||
      (near(x,y,-1,-1)&&near(x,y,1,1))||(near(x,y,1,-1)&&near(x,y,-1,1));
    for(let pass=0;pass<2;pass++){
      const ring=[];
      for(let y=Math.max(1,b.top);y<=Math.min(SIZE-2,b.bottom);y++)for(let x=Math.max(1,b.left);x<=Math.min(SIZE-2,b.right);x++){
        const i=y*SIZE+x;if(all[i]||H[i]||pocket(x,y))continue;
        const near=j=>all[j]||H[j];
        if(near(i-1)||near(i+1)||near(i-SIZE)||near(i+SIZE)||(!pass&&(near(i-SIZE-1)||near(i-SIZE+1)||near(i+SIZE-1)||near(i+SIZE+1))))ring.push(i);
      }
      for(const i of ring){H[i]=1;if(!pass)G[i]=1;}
    }
  }
  // SH: the drop shadow of everything so far, one pixel down and right; a
  // 1 px pinhole of background left with the stack on all four sides closes
  // in it too (CHGame's pinhole repair).
  let SH=null,PH=null;
  if(!halo){
    SH=new Uint8Array(N);PH=new Uint8Array(N);
    for(let i=SIZE+1;i<M;i++)if(i%SIZE&&!all[i]&&all[i-SIZE-1])SH[i]=1;
    const ink=j=>all[j]||SH[j];
    for(let i=SIZE+1;i<M-SIZE;i++){const x=i%SIZE;if(x&&x<SIZE-1&&!ink(i)&&ink(i-1)&&ink(i+1)&&ink(i-SIZE)&&ink(i+SIZE))PH[i]=1;}
  }
  // Bevel on the outer contour only (counters stay flat), lit from the top
  // left: an edge pixel's outward normal is the sum of its outside 8-neighbour
  // offsets; it takes hi when the normal faces the light and lo otherwise (lo
  // wins at the top-right and bottom-left corners). The normal keeps a slope's
  // steps in one class, where a per-axis rule alternates them into specks. It
  // needs a stroke at least BEVEL_MIN thick across the edge, so thin strokes
  // (Round9x13's 3 px, fonts 1 and 2) get none: there it reads as noise.
  const thick=font===0?BEVEL_MIN:SIZE;
  const bevel=new Uint8Array(N);
  if(treatment.bevel&&thick<SIZE){
    const cls=new Uint8Array(N);
    for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){
      const i=y*SIZE+x;if(!F[i])continue;
      if(!outside[i-1]&&!outside[i+1]&&!outside[i-SIZE]&&!outside[i+SIZE])continue;
      let nx=0,ny=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&outside[i+dy*SIZE+dx]){nx+=dx;ny+=dy;}
      if((Math.abs(nx)>=Math.abs(ny)?run.h[i]:run.v[i])>=thick)cls[i]=-(nx+ny)>0?1:2;
    }
    // A bevel edge is a line: a lone hi or lo pixel (no 8-neighbour of its
    // class, e.g. a 1 px step) keeps the face colour instead of a speck.
    for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){
      const i=y*SIZE+x,k=cls[i];if(!k)continue;
      for(let dy=-1;dy<=1&&!bevel[i];dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&cls[i+dy*SIZE+dx]===k){bevel[i]=k;break;}
    }
  }
  // F: banded face colours. Seams checker only inside runs of 5+ px with face
  // (not bevel) above and below, never into cream or ink. A cream band row
  // needs a run of 2+ px (no lone cream specks). A horizon band (chrome)
  // paints only inside runs of 5+ px, a pixel in from both ends, so a face
  // pixel meets the outline on each side and no letter is cut in two; run
  // ends and narrower stems take the band below, or the band above when only
  // the face above continues them (no lone end pixel).
  const face=new Uint8Array(N),seams=treatment.seams&&(font===0||font===3);
  const horizon=font===0||font===3?treatment.horizon??-1:-1;
  const plain=j=>F[j]&&!bevel[j];
  for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){
    const i=y*SIZE+x;if(!F[i])continue;
    const b=Math.max(0,rowBand[y]);let c=bands[b][0];
    if(seams&&rowSeam[y]&&run.h[i]>=5&&F[i-1]&&F[i+1]&&plain(i-SIZE)&&plain(i+SIZE)&&!((x+y)&1)){
      const upper=bands[rowBand[y-1]][0];
      if(upper!==8&&upper!==4&&c!==8&&c!==4)c=upper;
    }
    if(c===8&&run.h[i]<2)c=bands[Math.min(bands.length-1,b+1)][0];
    if(b===horizon&&!(run.h[i]>=HORIZON_RUN&&F[i-1]&&F[i+1]))c=bands[!F[i+SIZE]&&F[i-SIZE]?Math.max(0,b-1):Math.min(bands.length-1,b+1)][0];
    face[i]=bevel[i]?treatment.bevel[bevel[i]-1]:c;
  }
  // Colours, back to front; 255 leaves the cover untouched. Notches, and the
  // outline pixels between two letters, are ink, so letters stay apart even
  // under a coloured (neon) outline.
  const colour=new Uint8Array(N).fill(255),footprint=new Uint8Array(N);
  // A coloured (neon) outline only on fonts 0 and 3: on thin strokes it fills
  // the counters and merges the letters, so fonts 1 and 2 keep ink.
  const outlineColour=font===0||font===3?treatment.outline??4:4;
  const inSafe=i=>{const x=i%SIZE;return x>=SAFE_LEFT&&x<=SAFE_RIGHT&&i>=SAFE_TOP*SIZE;};
  const put=(i,c)=>{if(inSafe(i)){colour[i]=c;footprint[i]=1;}};
  // A coloured outline (neon) runs only round the outside of single letters:
  // pixels in counters, between two letters or over a notch stay ink.
  const exteriorA=outlineColour!==4?outsideMask(A,SIZE,{box:boxA,pad:2}):null;
  const lit=i=>{
    if(!exteriorA[i])return false;
    let one=0;
    for(const j of [i-1,i+1,i-SIZE,i+SIZE]){const k=A[j]&&!notch[j]?id[j]:0;if(!k)continue;if(one&&k!==one)return false;one=k;}
    return one>0;
  };
  // Side faces: an extrusion pixel that touches another letter's face parts
  // the two letters in ink, and side pixels left with no four-connected path
  // to their own letter's face (crumbs under a parted gap) are ink too.
  const queue=[];
  if(extruded)for(let i=SIZE;i<M-SIZE;i++){
    if(!side[i])continue;
    let parted=false,touches=false;
    for(const j of [i-1,i+1,i-SIZE,i+SIZE])if(F[j]){if(id[j]!==id[i])parted=true;else touches=true;}
    if(parted){side[i]=0;continue;}
    if(touches){side[i]=2;queue.push(i);}
  }
  while(queue.length){const i=queue.pop();for(const j of [i-1,i+1,i-SIZE,i+SIZE])if(side[j]===1&&id[j]===id[i]){side[j]=2;queue.push(j);}}
  // A parted pixel breaks its row: what follows it along dx no longer meets
  // its own letter in that row and is ink too.
  if(extruded&&ex.dx)for(let y=1;y<rows-1;y++)for(let x=ex.dx<0?SIZE-2:1;x>0&&x<SIZE-1;x+=ex.dx<0?-1:1){
    const i=y*SIZE+x,b=i-ex.dx;
    if(side[i]===2&&!((F[b]||side[b]===2)&&id[b]===id[i]))side[i]=4;
  }
  // A side pixel with no side neighbour at all (a 1 px crumb) is ink too.
  if(extruded)for(let i=SIZE+1;i<M-SIZE-1;i++)if(side[i]===2){
    let alone=true;
    for(const j of [i-1,i+1,i-SIZE,i+SIZE,i-SIZE-1,i-SIZE+1,i+SIZE-1,i+SIZE+1])if(side[j]===2||side[j]===3){alone=false;break;}
    if(alone)side[i]=3;
  }
  for(let i=0;i<M;i++)if(side[i]!==2)side[i]=0;
  // A coloured under face (straight drops) never leaves a lone pixel: an
  // under pixel with no under 8-neighbour (a 1 px step of a curve) is ink.
  if(extruded&&ex.under!==4){
    const lone=[];
    for(let i=SIZE+1;i<M-SIZE-1;i++)if(U[i]){
      let alone=true;
      for(const j of [i-1,i+1,i-SIZE,i+SIZE,i-SIZE-1,i-SIZE+1,i+SIZE-1,i+SIZE+1])if(U[j]){alone=false;break;}
      if(alone)lone.push(i);
    }
    for(const i of lone)U[i]=0;
  }
  for(let i=0;i<M;i++){
    if(SH?.[i]||PH?.[i])put(i,4);
    else if(H?.[i]){if(inSafe(i)){footprint[i]=1;if(G[i]||!((i%SIZE+((i/SIZE)|0))&1))colour[i]=treatment.halo;}}
    else if(O2?.[i])put(i,treatment.ring);
    else if(notch[i])put(i,4);
    else if(O[i])put(i,exteriorA&&!lit(i)?4:outlineColour);
    else if(E[i])put(i,U[i]?ex.under:side[i]?ex.side:4);
    else if(F[i])put(i,face[i]);
  }
  // Glints on fonts 0 and 3: a cream star on the lit top-left corner of a
  // stroke at least 3 px thick both ways, in the upper 40% of the cap height,
  // whose top edge faces open sky (no face above it in the line: never an
  // aperture or a lower foot). The arms stay on that letter's face.
  const glints=[],count=font===0?treatment.glints|0:font===3?Math.min(1,treatment.glints|0):0;
  if(count>0){
    const candidates=[];
    lines.forEach((_,li)=>{
      const y=7+top+li*lineHeight,c0=y-capTop,y0=Math.max(0,y-top);
      for(let yy=Math.max(box.top,SAFE_TOP+1,c0);yy<Math.min(box.bottom+1,c0+.4*capH);yy++)for(let x=box.left;x<=box.right;x++){
        const i=yy*SIZE+x;
        if(!F[i]||run.h[i]<3||run.v[i]<3)continue;
        // A square corner: the top edge runs 3 px right, the left edge 3 px down.
        let corner=true;
        for(let k=0;k<3&&corner;k++)corner=F[i+k]&&outside[i+k-SIZE]&&F[i+k*SIZE]&&outside[i+k*SIZE-1];
        for(let k=0;k<3&&corner;k++)for(let yu=yy-1;yu>=y0&&corner;yu--)if(F[yu*SIZE+x+k])corner=false;
        if(corner)candidates.push([x,yy]);
      }
    });
    const v=look?.variation??null;
    for(let g=0;g<count;g++){
      const pool=g?candidates.filter(([x])=>glints.every(p=>Math.abs(p.x-x)>=24)):candidates;
      if(!pool.length)break;
      const [x,y]=pool[v?v.integer('title-glint:'+g,0,pool.length-1):(pool.length-1)>>1];
      const size=font===0&&run.h[y*SIZE+x]>=4&&run.v[y*SIZE+x]>=4?2:1;
      glints.push({x,y,size});
      const own=id[y*SIZE+x],mine=j=>F[j]&&id[j]===own;
      const star=[[0,0,8]];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])for(let k=1;k<=size;k++)star.push([dx*k,dy*k,k<size?8:12]);
      for(const [dx,dy,c] of star){
        const px=x+dx,py=y+dy,i=py*SIZE+px;
        if(px<1||px>=SIZE-1||py<1||py>=SIZE-1||!inSafe(i)||!mine(i))continue;
        colour[i]=c;footprint[i]=2;
      }
    }
  }
  // Calm zone and extent; then the area fields the engine reads next.
  const calm=dilateDisk3(footprint,rows);
  let extent=layout.bottom;
  for(let i=M-1;i>=0;i--)if(footprint[i]){extent=(i/SIZE)|0;break;}
  setArea(layout,extent);
  const end=(extent+1)*SIZE;
  return {footprint,calm,extent,glints,
    masks:{face:F,extrude:E,under:U,side,notch,outline:O,ring:O2,halo:H,glow:G,shadow:SH,pinhole:PH},
    paint(screen,indices){
      for(let i=0;i<end;i++){const c=colour[i];if(c===255)continue;
        if(indices)indices[i]=c;else screen.dot(i%SIZE,(i/SIZE)|0,c);}
    }};
}
