// Cover palettes. The engine-18 palette is frozen in legacy.js and keeps its
// public name here, because the engine, scripts and tests import createPalette
// (the classic mascot still uses it, byte for byte).
//
// Palette v2 (engine 19, package E1): 15 role-indexed colours (roles.js).
// The 11 custom colours (0-3, 5-7, 9-12) are built in OKLCh to lightness
// targets per mood and role, with hues bent toward yellow in the lights and
// away from it in the shadows, gamut-clipped by lowering chroma, then snapped
// to colours the CHGame panel decodes exactly (RGB565). The four fixed menu
// colours are free: black 4, cream 8, grey 13 and red 14. The palette always
// has exactly 15 entries; #FF00FF (the animated rainbow slot) is never emitted.
import {DARKER,LIGHTER} from './roles.js';
export {legacyPalette as createPalette} from './legacy.js';

// CHGame spec/chgame.md: #FF00FF selects animated palette slot 15. Also
// exclude nearby RGB888 values that would collapse to its RGB565 encoding.
export function bootloaderSafeColor(rgb) {
  const red=rgb>>>16&255,green=rgb>>>8&255,blue=rgb&255;
  return red>=248&&green<8&&blue>=248?(rgb&0xffff00)|240:rgb;
}

/** Fixed, free menu colours by role. */
export const FIXED=Object.freeze({4:0x000000,8:0xfff4d6,13:0x808080,14:0xd62020});
/** Roles that hold a custom (budgeted) colour: 11 of them. */
export const CUSTOM_ROLES=Object.freeze([0,1,2,3,5,6,7,9,10,11,12]);

// --- Colour maths (host floats; a device would read a precomputed table) ---

const toLinear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
const toSrgb=c=>c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;
const wrap=h=>((h%360)+360)%360;
const clamp01=v=>Math.min(1,Math.max(0,v));

/** Perceived brightness (.299R + .587G + .114B) / 255 of 0xRRGGBB, in 0..1. */
export function luma(rgb) {return (.299*(rgb>>>16&255)+.587*(rgb>>>8&255)+.114*(rgb&255))/255;}

/** OKLab [L, a, b] of a 0xRRGGBB colour (Ottosson's matrices). */
export function rgbToOklab(rgb) {
  const r=toLinear((rgb>>>16&255)/255),g=toLinear((rgb>>>8&255)/255),b=toLinear((rgb&255)/255);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s];
}

/** OKLCh [L, C, hDeg] of a 0xRRGGBB colour (hue 0 for neutrals). */
export function oklch(rgb) {
  const [L,a,b]=rgbToOklab(rgb),C=Math.hypot(a,b);
  return [L,C,C<1e-7?0:wrap(Math.atan2(b,a)*180/Math.PI)];
}

/** CIE L* (0..100, D65) of a 0xRRGGBB colour: the review scale for the
 * background steps, which OKLab L understates in the near-blacks. */
export function lstar(rgb) {
  const Y=.2126*toLinear((rgb>>>16&255)/255)+.7152*toLinear((rgb>>>8&255)/255)+.0722*toLinear((rgb&255)/255);
  return Y>216/24389?116*Math.cbrt(Y)-16:24389/27*Y;
}

function linearRgb(L,C,hDeg) {
  const h=hDeg*Math.PI/180,a=C*Math.cos(h),b=C*Math.sin(h);
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.2914855480*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s];
}
const inGamut=([r,g,b])=>r>=-1e-7&&r<=1+1e-7&&g>=-1e-7&&g<=1+1e-7&&b>=-1e-7&&b<=1+1e-7;

/** The chroma to use at lightness L and hue h: C itself when displayable,
 * else 10 bisection steps over [0, C] with L fixed. */
export function clipChroma(L,C,hDeg) {
  if(inGamut(linearRgb(L,C,hDeg)))return C;
  let lo=0,hi=C;
  for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(inGamut(linearRgb(L,mid,hDeg)))lo=mid;else hi=mid;}
  return lo;
}

// Channel values the panel shows exactly: CHGame card.md decodes 5-bit red
// and blue as floor(k*255/31) and 6-bit green as floor(k*255/63).
const LEVELS5=Array.from({length:32},(_,k)=>Math.floor(k*255/31));
const LEVELS6=Array.from({length:64},(_,k)=>Math.floor(k*255/63));
function snapChannel(value,levels) {
  const x=clamp01(value)*255;
  let best=0;   // strict < keeps the lower k on ties
  for(let k=1;k<levels.length;k++)if(Math.abs(levels[k]-x)<Math.abs(levels[best]-x))best=k;
  return levels[best];
}

/** True when 0xRRGGBB survives RGB565 packing and CHGame decoding unchanged. */
export function isRgb565Exact(rgb) {
  return LEVELS5[rgb>>>19&31]===(rgb>>>16&255)&&LEVELS6[rgb>>>10&63]===(rgb>>>8&255)&&LEVELS5[rgb>>>3&31]===(rgb&255);
}

/** OKLCh to a panel-exact 0xRRGGBB. Chroma is gamut-clipped at fixed L, each
 * channel snaps to the nearest decodable value, a result that would pack to
 * 0xF81F (#FF00FF) drops blue one 5-bit step, and bootloaderSafeColor guards
 * the rest. `C` may be 'max': the gamut limit, capped at .16. */
export function oklchToRgb(L,C,hDeg) {
  L=clamp01(L);hDeg=wrap(hDeg);
  const c=clipChroma(L,C==='max'?.16:Math.max(0,C),hDeg),[r,g,b]=linearRgb(L,c,hDeg).map(v=>toSrgb(clamp01(v)));
  const red=snapChannel(r,LEVELS5),green=snapChannel(g,LEVELS6);
  let blue=snapChannel(b,LEVELS5);
  if(red===255&&green===0&&blue===255)blue=LEVELS5[30];
  return bootloaderSafeColor(red<<16|green<<8|blue);
}

const lightness=rgb=>rgbToOklab(rgb)[0];
const L_CREAM=lightness(FIXED[8]),L_RED=lightness(FIXED[14]);

// --- Moods -------------------------------------------------------------------

/** Mood names, in the column order of STYLE_MOODS. */
export const MOOD_NAMES=Object.freeze(['night','complementary','analogous','dusk','infernal','toxic','neon','monochrome','sepia','pastel']);
/** Moods kept rare: at most 25% of a style row together (its signature mood
 * aside), boosted by (1 + 2 * wildness) only on wild covers (tier 2 and up). */
export const RARE_MOODS=Object.freeze(['infernal','toxic','neon','monochrome','sepia','pastel']);
/** A style's own mood: counted as common in its row and never boosted. */
export const STYLE_SIGNATURES=Object.freeze({dungeons:'infernal',glyphs:'neon',islands:'dusk',plants:'toxic'});
/** Wildness from which rare moods are boosted (variation.js tier 2 = .5). */
export const RARE_BOOST_WILDNESS=.5;

// Ramp roles and positions t (-1 shadow, 0 mid, +1 light). Background values
// are listed in chain order, dark to light: roles 0, 1, 3, 2, 9 (roles.js).
const BG_ROLES=[0,1,3,2,9],BG_T=[-1,-.5,0,.5,1];
const MAIN_ROLES=[5,6,7],MAIN_T=[-1,0,1];
const ACCENT_ROLES=[11,10,12],ACCENT_T=[-1,0,.6];
// OKLab L and chroma targets of the dark stage, which every mood
// starts from. The builder's constraints (below) move them as needed.
// bg0, the sky and void most scenes fill, keeps a visible tint (high chroma
// at L .155, about L* 4) so a mood reads at 1x before the vignette takes it.
const TARGETS={bgL:[.155,.24,.33,.42,.56],bgC:[.08,.075,.07,.07,.05],mainL:[.49,.65,.79],mainC:[.14,.15,.12],
  accentL:[.52,.80],accentC:[.12,.15],titleL:.93};
// Yellow and lime subjects (main hue 70-120) only read as yellow when light:
// a lifted ramp whose shadow bends toward amber (below 100) or green.
const YELLOW=Object.freeze({from:70,to:120,mainL:Object.freeze([.52,.74,.87]),mainC:Object.freeze([.14,.15,.14]),
  shadowTo:[45,150],split:100,bend:35});
/** Smallest OKLab L steps the builder guarantees after RGB565 snapping:
 * background 4->0->1->3->2->9, main 5->6->7->cream, accent 11->10->12. */
export const MIN_STEP=Object.freeze({background:.045,main:.09,accent:.09});
/** Dark stages: smallest CIE L* rises 0->1, 1->3 and 3->2 (2 more where the
 * role's chroma is under .05), with bg1 at L* 10 or more. */
export const BG_LSTAR=Object.freeze({steps:Object.freeze([7,8,8]),lowChroma:2,bg1:10});
/** Every stage is dark: the background's lightest role 9 sits at least this
 * far (OKLab L) under main body 6, so no background role shares the subject's
 * value band. */
export const BG_SUBJECT_GAP=.15;
/** The highest OKLab L any background role may take: no high-key grounds. */
export const BG_MAX_L=.55;
/** Every background role sits at least this far (OKLab L) under main shadow
 * 5, the subject's darkest material tone: the ground never shares its value. */
export const BG_SHADOW_GAP=.06;
// How far main 5 may rise over its target to make room for the background ramp.
const BG_SHADOW_LIFT=.015;
// Room left under MAIN5_MAX so main 5 keeps a window wide enough for its chroma.
const BG_SHADOW_ROOM=.02;
/** A background hue within BG_HUE_NEAR degrees of the main hue (monochrome,
 * infernal, sepia...) scales its chroma by BG_QUIET_CHROMA, so the subject
 * parts from it by saturation as well as value. The subject keeps its chroma. */
export const BG_HUE_NEAR=45,BG_QUIET_CHROMA=.5;
/** Dark stages: main shadow 5 sits at least this far (OKLab L) above bg2. */
export const SUBJECT_GAP=.08;
/** Least hue distances (degrees) of the title accent from the main and the
 * background hue. */
export const HUE_GAP=Object.freeze({main:45,bg:40});
// The highest main shadow 5 that still leaves accent 11 room below red 14.
const ACCENT_LIFT=.01,MAIN5_MAX=L_RED-.02-ACCENT_LIFT-.01,BG2_MAX=MAIN5_MAX-SUBJECT_GAP-.01;

/** Accent chroma [role 11, role 10] of the low-chroma title treatments, used
 * when a treatment row carries no `accentC` of its own (title.js rows do not). */
export const TREATMENT_CHROMA=Object.freeze({ivory:Object.freeze([.05,.04]),chrome:Object.freeze([.035,.045])});

const frozen=Object.freeze;
const STAGE=frozen({pool:1,vignette:2,kinds:frozen({pool:7,spot:2,blaze:1,flat:0})});
const stage=(pool,vignette,kinds)=>frozen({pool,vignette,kinds:frozen(kinds)});
const mood=(id,row)=>frozen({id,dark:true,stage:STAGE,bendScale:1,chroma:1,subjectChroma:1,...row});

// Hue rules: ['abs',lo,hi] an absolute range (hi < lo wraps through 0); ['pick',
// [lo,hi],...] one of several absolute ranges; ['off',lo,hi] the main hue plus
// an offset; ['side',lo,hi] the main hue plus or minus an offset; ['main',lo,hi]
// the main hue with an optional offset. `accent` is the mood's own title hue,
// used only when the cover has no title treatment ('split' is engine 18's
// scheme: opposite the main/background midpoint; 'complement' is main + 180
// +- 30). A treatment's hue always wins, so its name matches its colour.
// Optional target overrides: bgL, bgC, mainL, mainC, accentL, accentC, titleL;
// `chroma` scales the background and main chroma, `accentChroma` the title
// ramp (default chroma * subjectChroma), `subjectChroma` the main and accent
// ramps; `glow` gives role 9 its own hue, chroma and L; `darkTitle` makes the
// title the darkest saturated ramp on a light stage. `light` and `shade` are
// the mood's key-light and shadow hue attractors for the main ramp (default
// bendHue's 100 and 25/285), so a mood also lights the subject its own way.
/** Mood data rows. `stage` {pool, vignette, kinds} is for the stage pass (E7);
 * every mood is `dark` (engine 19 has no light stage). Dark stages never take
 * the 'flat' light: every one gets a key light. */
export const MOODS=frozen({
  // Moonlit navy: the deepest, most saturated blue field, a warm lamp title.
  night:mood('night',{bg:['abs',230,270],accent:['abs',25,60],bgL:[.155,.24,.33,.42,.53],bgC:[.09,.085,.08,.08,.06]}),
  complementary:mood('complementary',{bg:['off',150,210],accent:'split',bgC:[.07,.075,.08,.08,.05]}),
  // A mid-value ground near the subject's hue.
  analogous:mood('analogous',{bg:['side',30,50],accent:'complement',bgL:[.165,.25,.34,.425,.60],bgC:[.06,.06,.065,.07,.05]}),
  // Violet sky over a warm horizon glow; sunset lights, purple shadows.
  dusk:mood('dusk',{bg:['abs',285,335],accent:['abs',20,50],bgL:[.155,.24,.33,.42,.62],bgC:[.09,.08,.08,.09,.09],
    glow:frozen({hue:frozen([45,70]),C:.10}),light:60,shade:300,stage:stage(1,2,{pool:7,spot:0,blaze:3,flat:0})}),
  // Ember-red field with an ember glow; fire-lit subject, gold-fire title.
  infernal:mood('infernal',{bg:['abs',0,30],accent:['abs',45,70],bgC:[.10,.10,.10,.10,.14],
    glow:frozen({hue:frozen([35,55]),C:.14}),light:55,bendScale:1.2}),
  // Acid-green field and light, a magenta pop title.
  toxic:mood('toxic',{bg:['abs',115,145],accent:['abs',300,330],bgC:[.08,.085,.09,.09,.08],light:125,bendScale:1.2}),
  // Magenta, cyan or acid subjects glowing on deep violet-navy.
  neon:mood('neon',{main:['pick',[300,335],[175,200],[135,150]],bg:['abs',260,290],accent:'complement',
    bgL:[.12,.215,.305,.395,.52],bgC:[.08,.07,.065,.07,.06],mainL:[.49,.68,.80],mainC:[.22,.22,.22],accentL:[.52,.82],accentC:[.20,.20],titleL:.94,
    bendScale:.5,stage:stage(2,3,{pool:4,spot:3,blaze:3,flat:0})}),
  monochrome:mood('monochrome',{bg:['main'],accent:['main',-10,10]}),
  // A brown photograph (background and subject); the title keeps full chroma.
  sepia:mood('sepia',{main:['abs',25,95],bg:['abs',45,70],accent:['abs',170,190],bgC:[.12,.12,.12,.12,.08],chroma:.55,accentChroma:1,bendScale:.7}),
  // Soft pastel subject (light, low chroma) on a deep, muted complementary
  // field. Engine 19 has no light stage: every background stays dark.
  pastel:mood('pastel',{bg:['off',150,210],accent:'split',bgL:[.15,.235,.325,.415,.50],bgC:[.05,.05,.05,.05,.035],
    mainL:[.52,.69,.80],mainC:[.07,.08,.07],accentL:[.55,.86],accentC:[.10,.12],titleL:.95}),
});

/** Mood weights per style in MOOD_NAMES order; every row sums to 100, rare
 * moods (the style's signature aside) total 25 or less. Pastel (now a dark
 * stage) is reachable only through a recipe's `moods` meta.
 * A recipe's `moods` meta replaces its row. */
export const STYLE_MOODS=frozen({
  spaceships:frozen([28,28,12,12,3,3,8,4,2,0]),
  planets:frozen([28,26,12,14,4,4,8,3,1,0]),
  machines:frozen([24,25,14,15,4,4,3,3,8,0]),
  relics:frozen([24,22,18,13,5,3,6,6,3,0]),
  plants:frozen([20,18,18,16,3,12,6,4,3,0]),
  islands:frozen([16,23,16,28,2,3,4,4,4,0]),
  buildings:frozen([24,20,14,22,4,3,5,4,4,0]),
  vehicles:frozen([22,22,14,22,5,3,6,3,3,0]),
  heraldry:frozen([26,28,14,10,5,2,4,6,5,0]),
  glyphs:frozen([28,16,14,10,5,4,16,6,1,0]),
  dungeons:frozen([24,12,12,10,22,6,4,5,5,0]),
  mascot:frozen([24,24,16,18,2,4,5,5,2,0]),
  default:frozen([30,26,12,12,4,4,4,4,4,0]),
});

// The weighted scan of engine-contract E4 (W = round(w*100), k = integer(name,
// 0, sum W - 1), cumulative pick), kept local so the mood choice needs only
// `integer` from the variation it is given.
function weightedPick(v,name,pairs) {
  const W=pairs.map(([,w])=>Math.round(Math.max(0,w)*100)),total=W.reduce((a,b)=>a+b,0);
  if(!total)throw Error('A weighted choice needs a positive weight.');
  let k=v.integer(name,0,total-1);
  for(let i=0;i<pairs.length;i++){if(k<W[i])return pairs[i][0];k-=W[i];}
  return pairs[pairs.length-1][0];
}

/** A recipe's `moods` meta as weights in MOOD_NAMES order. Accepts an array of
 * 10 numbers, an object {mood: weight} or an array of [mood, weight] pairs;
 * returns null for null or undefined. */
export function moodWeights(spec) {
  if(spec==null)return null;
  if(Array.isArray(spec)&&spec.every(w=>typeof w==='number')){
    if(spec.length!==MOOD_NAMES.length)throw Error('Mood weights need one number per mood.');
    return spec;
  }
  const weights=MOOD_NAMES.map(()=>0);
  for(const [name,w] of Array.isArray(spec)?spec:Object.entries(spec)){
    const i=MOOD_NAMES.indexOf(name);
    if(i<0)throw Error('Unknown mood: '+name);
    weights[i]=w;
  }
  return weights;
}

/** The multiplier chooseMood applies to `name` for `style` at `wildness`:
 * (1 + 2w) for a rare mood that is not the style's signature, from tier 2
 * (wildness .5) up; 1 otherwise. */
export function moodBoost(name,style,wildness=0) {
  const w=Number.isFinite(wildness)?wildness:0;
  return w>=RARE_BOOST_WILDNESS&&RARE_MOODS.includes(name)&&STYLE_SIGNATURES[style]!==name?1+2*w:1;
}

/** Choose a cover's mood name from the look variation `v`: weights from
 * `recipe.moods`, else STYLE_MOODS[style], else the default row, times
 * moodBoost (one named draw, 'mood'). */
export function chooseMood(v,style,recipe=null,wildness=0) {
  const row=moodWeights(recipe?.moods)??STYLE_MOODS[style]??STYLE_MOODS.default;
  return weightedPick(v,'mood',MOOD_NAMES.map((name,i)=>[name,row[i]*moodBoost(name,style,wildness)]));
}

// --- Hues --------------------------------------------------------------------

const shortest=(from,to)=>((to-from)%360+540)%360-180;
const arc=(a,b)=>Math.abs(shortest(a,b));
const span=(lo,hi)=>{const out=[];for(let h=lo,end=hi<lo?hi+360:hi;h<=end;h++)out.push(wrap(h));return out;};

/** Bend hue `h` at ramp position t (-1 shadow .. +1 light) by at most
 * bend*|t| degrees, never past the attractor: 100 deg for lights; for
 * shadows 25 deg when h is in [20,110), otherwise 285 deg. */
export function bendHue(h,t,bend) {
  h=wrap(h);
  if(!t||!bend)return h;
  const d=shortest(h,t>0?100:h>=20&&h<110?25:285);
  return wrap(h+Math.sign(d)*Math.min(Math.abs(d),bend*Math.abs(t)));
}
// Bend toward an explicit attractor (the yellow shadows).
const bendTo=(h,to,bend)=>{const d=shortest(h,to);return wrap(h+Math.sign(d)*Math.min(Math.abs(d),bend));};

function ruleHue(v,rule,name,main) {
  const [kind,lo,hi]=rule;
  if(kind==='abs')return wrap(v.integer(name,lo,hi<lo?hi+360:hi));   // [350,10] wraps through 0
  if(kind==='pick'){const [a,b]=rule[1+v.integer(name+'-band',0,rule.length-2)];return wrap(v.integer(name,a,b<a?b+360:b));}
  if(kind==='off')return wrap(main+v.integer(name+'-offset',lo,hi));
  if(kind==='side')return wrap(main+(v.integer(name+'-side',0,1)?1:-1)*v.integer(name+'-offset',lo,hi));
  if(kind==='main')return wrap(main+(lo==null?0:v.integer(name+'-offset',lo,hi)));
  throw Error('Unknown hue rule: '+kind);
}
// Every hue an absolute rule can give (null for the main-relative rules).
function ruleDomain(rule) {
  if(rule[0]==='abs')return span(rule[1],rule[2]);
  if(rule[0]==='pick')return rule.slice(1).flatMap(([a,b])=>span(a,b));
  return null;
}
const ANY_HUE=frozen(['abs',0,359]);
const moodSpec=mood=>{
  const spec=typeof mood==='string'?MOODS[mood]:mood;
  if(!spec||MOODS[spec.id]!==spec)throw Error('Unknown mood: '+mood);
  return spec;
};
// The accent rule of a cover: the treatment's hue, else the mood's own.
const accentRule=(spec,treatment)=>treatment?.accentHue==null?spec.accent
  :treatment.accentHue==='complement'?'complement':['abs',...treatment.accentHue];

/**
 * Whether title treatment `treatment` suits mood `mood`: false when its accent
 * range (midpoint) is within HUE_GAP.bg of more than half the mood's absolute
 * background range, or within HUE_GAP.main of every main hue the mood allows.
 * Treatments without a hue range ('complement', none) suit every mood. look.js
 * zeroes the weight of a treatment that does not suit the cover's mood, so
 * buildMoodPalette never has to move a treatment's accent.
 */
export function treatmentFits(mood,treatment) {
  const spec=moodSpec(mood),rule=accentRule(spec,treatment);
  if(!Array.isArray(rule)||!treatment)return true;
  const [lo,hi]=treatment.accentHue,mid=wrap(lo+((hi<lo?hi+360:hi)-lo)/2);
  const bg=ruleDomain(spec.bg);
  if(bg&&bg.filter(h=>arc(h,mid)>=HUE_GAP.bg).length*2<bg.length)return false;
  const main=ruleDomain(spec.main??ANY_HUE);
  return main.some(h=>arc(h,mid)>=HUE_GAP.main);
}

// --- Ramps -------------------------------------------------------------------

// Snap one role, nudging its lightness target in .0025 steps until the
// measured L lies in [min, max] (hard: chain order and step sizes survive
// RGB565 rounding), then until `soft(rgb)` (+1 lighter, -1 darker, 0 fine) is
// met inside that range. A soft goal that would leave the range keeps the last
// colour inside it.
function solve(L,C,h,min=0,max=1,soft=null) {
  // A window narrower than the RGB565 steps at this chroma retries greyer.
  // A soft goal RGB565 rounding cannot meet at full chroma may be met at 3/4.
  let first=null;
  for(const k of [1,.75,.5,.25]){
    const rgb=solveAt(L,C*k,h,min,max,soft);
    if(rgb===null)continue;
    if(!soft||!soft(rgb)||k<1)return first??rgb;
    first=rgb;
    const alt=solveAt(L,C*.75,h,min,max,soft);
    return alt!==null&&!soft(alt)?alt:rgb;
  }
  // Last resort: grey, and if even that cannot fit, the hard minimum wins (chain order first).
  return solveAt(L,0,h,min,max,soft)??solveAt(L,0,h,min,Math.max(max,min+.03),null)??oklchToRgb(Math.min(max,Math.max(min,L)),0,h);
}
function solveAt(L,C,h,min,max,soft) {
  let target=Math.min(max,Math.max(min,L)),rgb=0,inside=null;
  for(let i=0;i<240;i++){
    rgb=oklchToRgb(target,C,h);
    const l=lightness(rgb);
    let d=l<min?1:l>max?-1:0;
    if(d){if(inside!==null)return inside;}
    else{inside=rgb;d=soft?soft(rgb):0;if(!d)return rgb;}
    const next=clamp01(target+d*.0025);
    if(next===target)break;
    target=next;
  }
  return inside;
}

/**
 * Build a mood palette and report the hues it used. Every draw is a named
 * `v.integer` call, so the result never depends on evaluation order.
 * - `mood`: a MOODS name or row (default 'complementary').
 * - `treatment`: null, or a title treatment row {id, accentHue:[lo,hi]|
 *   'complement', tC:number|'max', accentC?:[c11,c10]}; null uses the mood's
 *   own accent and tC 'max'. A treatment's accent hue always wins.
 * - `wildness` (default v.wildness or 0) widens the hue bend by 30w degrees.
 *
 * Hues: an absolute accent (a treatment range or the mood's own) keeps the
 * main hue HUE_GAP.main and the background HUE_GAP.bg away from it, by
 * redrawing them from the hues that are ('main-hue-avoid', 'bg-hue-avoid');
 * a main-relative accent ('complement', 'split') moves instead
 * ('accent-avoid').
 * Values: the background chain rises by MIN_STEP and, on dark stages, by the
 * BG_LSTAR steps; main 5 stays SUBJECT_GAP above bg2; on light-title stages
 * the subject's light 7 stays under title 10 (yellow subjects: under 12 - .06);
 * pastel's dark title keeps 12 at least .15 under bg0 and 10 .2 under bg1.
 * @returns {{palette:Uint32Array, mood:string, mainHue:number, bgHue:number, accentHue:number, bend:number}}
 */
export function buildMoodPalette(v,{mood='complementary',treatment=null,wildness=v?.wildness??0}={}) {
  const spec=moodSpec(mood);
  const T={...TARGETS,...spec};
  // Hues. The draws are named, so redraws never disturb the other streams.
  const rule=accentRule(spec,treatment);
  const fixed=Array.isArray(rule)&&rule[0]!=='main'?ruleHue(v,rule,'accent-hue',0):null;
  const mainRule=spec.main??ANY_HUE,bgOf=h=>ruleHue(v,spec.bg,'bg-hue',h),bgFixed=ruleDomain(spec.bg);
  let mainHue=ruleHue(v,mainRule,'main-hue',0);
  if(fixed!==null){
    const ok=h=>arc(h,fixed)>=HUE_GAP.main&&(bgFixed||arc(bgOf(h),fixed)>=HUE_GAP.bg);
    if(!ok(mainHue)){
      const options=ruleDomain(mainRule).filter(ok);
      if(options.length)mainHue=options[v.integer('main-hue-avoid',0,options.length-1)];
    }
  }
  let bgHue=bgOf(mainHue);
  if(fixed!==null&&bgFixed&&arc(bgHue,fixed)<HUE_GAP.bg){
    const options=bgFixed.filter(h=>arc(h,fixed)>=HUE_GAP.bg);
    bgHue=options.length?options[v.integer('bg-hue-avoid',0,options.length-1)]
      :bgFixed.reduce((a,h)=>arc(h,fixed)>arc(a,fixed)?h:a,bgFixed[0]);
  }
  let accentHue=fixed;
  if(fixed===null){
    const base=rule==='complement'?mainHue+180:rule==='split'?Math.round(mainHue+shortest(mainHue,bgHue)/2)+180:null;
    if(base===null)accentHue=ruleHue(v,rule,'accent-hue',mainHue);   // ['main',...]: same-hue by design
    else{
      const reach=rule==='complement'?30:15,ok=o=>arc(base+o,bgHue)>=HUE_GAP.bg&&arc(base+o,mainHue)>=HUE_GAP.main;
      let offset=v.integer('accent-offset',-reach,reach);
      if(!ok(offset)){
        const options=span(-75,75).map(o=>o>180?o-360:o).filter(ok);
        if(options.length)offset=options[v.integer('accent-avoid',0,options.length-1)];
      }
      accentHue=wrap(base+offset);
    }
  }
  const bend=(v.integer('bend',15,45)+Math.round(30*(wildness||0)))*spec.bendScale;
  const subject=spec.chroma*spec.subjectChroma,accentScale=spec.accentChroma??subject;
  const dark=spec.dark!==false,lightTitle=!spec.darkTitle;
  const yellow=subject>=.8&&mainHue>=YELLOW.from&&mainHue<YELLOW.to;
  const palette=new Uint32Array(15);
  for(const role in FIXED)palette[role]=FIXED[role];
  // Background 4 -> 0 -> 1 -> 3 -> 2 -> 9, at half the bend. Dark stages
  // also rise by the BG_LSTAR steps, with bg2 capped so 5 can clear it.
  // The ramp tops out at bgTop: under main 6 by BG_SUBJECT_GAP and low enough
  // that main 5 (capped at MAIN5_MAX) can clear role 9 by BG_SHADOW_GAP.
  const mainL=yellow&&dark?YELLOW.mainL:T.mainL,bgTop=Math.min(BG_MAX_L,mainL[1]-BG_SUBJECT_GAP,Math.min(MAIN5_MAX-BG_SHADOW_ROOM,mainL[0]+BG_SHADOW_LIFT)-BG_SHADOW_GAP);
  // A background near the subject hue goes quiet in chroma (BG_HUE_NEAR).
  const quiet=arc(bgHue,mainHue)<BG_HUE_NEAR,bgQuiet=quiet?BG_QUIET_CHROMA:1;
  // Targets compress toward bgTop; each role's ceiling reserves one step
  // (plus RGB565 slack) per lighter role still to come, so the chain is
  // always feasible and soft L* goals give way at the ceiling.
  const lo=T.bgL[0],top=T.bgL[T.bgL.length-1],n=BG_ROLES.length,reserve=MIN_STEP.background+.0015;
  const hues=BG_ROLES.map((role,i)=>role===9&&spec.glow?v.integer('glow-hue',spec.glow.hue[0],spec.glow.hue[1]):bendHue(bgHue,BG_T[i],bend*.5));
  const chromas=BG_ROLES.map((role,i)=>(role===9&&spec.glow?spec.glow.C:T.bgC[i])*spec.chroma*bgQuiet);
  const ceils=BG_ROLES.map((_,i)=>bgTop-(n-1-i)*reserve);
  let below=0,belowStar=0;
  BG_ROLES.forEach((role,i)=>{
    const h=hues[i],C=chromas[i];
    let soft=null;
    if(dark&&i>=1&&i<=3){
      // A quieted ramp is grey by design: it skips the low-chroma L* bonus.
      const need=Math.max(belowStar+BG_LSTAR.steps[i-1]+(C<.05&&!quiet?BG_LSTAR.lowChroma:0),i===1?BG_LSTAR.bg1:0);
      soft=rgb=>lstar(rgb)<need?1:0;
    }
    const target=top>bgTop?lo+(T.bgL[i]-lo)*(bgTop-lo)/(top-lo):T.bgL[i];
    const ceil=ceils[i];
    palette[role]=solve(Math.min(target,ceil),C,h,below+MIN_STEP.background,dark&&role===2?Math.min(BG2_MAX,ceil):ceil,soft);
    below=lightness(palette[role]);belowStar=lstar(palette[role]);
  });
  const L=role=>lightness(palette[role]);
  // Main 5 -> 6 -> 7, with 7 at least one main step below cream.
  const mainC=yellow?YELLOW.mainC:T.mainC;
  const titleTop=T.titleL,light7=lightTitle?(yellow?titleTop-.06:T.accentL[1]-.02):1;
  below=0;
  MAIN_ROLES.forEach((role,i)=>{
    const min=i===1?Math.max(below+MIN_STEP.main,L(9)+BG_SUBJECT_GAP):i?below+MIN_STEP.main:Math.max(MIN_STEP.background,dark?L(2)+SUBJECT_GAP:0,...BG_ROLES.map(r=>L(r)+BG_SHADOW_GAP));
    const max=i===0?MAIN5_MAX:i===2?Math.min(L_CREAM-MIN_STEP.main,light7):1;
    const h=i===0&&yellow?bendTo(mainHue,YELLOW.shadowTo[mainHue<YELLOW.split?0:1],Math.max(bend,YELLOW.bend))
      :i===0&&spec.shade!=null?bendTo(mainHue,spec.shade,bend):i===2&&spec.light!=null?bendTo(mainHue,spec.light,bend):bendHue(mainHue,MAIN_T[i],bend);
    palette[role]=solve(yellow&&!dark&&i?YELLOW.mainL[i]:mainL[i],mainC[i]*subject,h,min,max);
    below=lightness(palette[role]);
  });
  // Accent 11 -> 10 -> title 12, at .6 of the bend. 11 stays above main
  // shadow 5 (DARKER[11]=5) and below red 14 (DARKER[14]=11).
  const tC=treatment?.tC??'max',accentC=treatment?.accentC??TREATMENT_CHROMA[treatment?.id]??T.accentC;
  ACCENT_ROLES.forEach((role,i)=>{
    // A dark title in the yellow-to-lime band (70-130) would be olive: it
    // turns amber (below 100) or green.
    const base=!lightTitle&&accentHue>=YELLOW.from&&accentHue<YELLOW.to+10?bendTo(accentHue,YELLOW.shadowTo[accentHue<YELLOW.split?0:1],20):accentHue;
    const h=bendHue(base,lightTitle?ACCENT_T[i]:Math.min(0,ACCENT_T[i]),bend*.6),target=i<2?T.accentL[i]:T.titleL;
    const C=i<2?accentC[i]*accentScale:(tC==='max'?clipChroma(target,.16,h):tC)*accentScale;
    let min,max;
    if(i===0){min=L(5)+ACCENT_LIFT;max=L_RED-.02;}
    else if(i===1){min=Math.max(L(11)+MIN_STEP.accent,lightTitle&&!yellow?L(7)+.02:0);max=lightTitle?1:L(1)-.2;}
    else{min=L(10)+MIN_STEP.accent;max=lightTitle?1:L(0)-.15;}
    palette[role]=solve(target,C,h,min,max);
  });
  return {palette,mood:spec.id,mainHue,bgHue,accentHue,bend};
}

/** The 15-entry mood palette (Uint32Array) for look variation `v`; options as
 * buildMoodPalette. There is no rainbow entry and never #FF00FF. */
export function createMoodPalette(v,options={}) {return buildMoodPalette(v,options).palette;}

/** First role whose DARKER or LIGHTER neighbour breaks the OKLab L order
 * (darker must be strictly darker, lighter strictly lighter), or -1. */
export function orderViolation(palette) {
  for(let c=0;c<15;c++){
    if(DARKER[c]!==c&&!(lightness(palette[DARKER[c]])<lightness(palette[c])))return c;
    if(LIGHTER[c]!==c&&!(lightness(palette[LIGHTER[c]])>lightness(palette[c])))return c;
  }
  return -1;
}
