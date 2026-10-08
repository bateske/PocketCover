import {createVariation} from './variation.js';
import {cloud,horizonDraws,sky} from './scenes/common.js';
import {SPACE_SCENES} from './scenes/space.js';
import {LAND_SCENES} from './scenes/land.js';
import {INTERIOR_SCENES} from './scenes/interior.js';
import {WATER_SCENES} from './scenes/water.js';
import {STYLE_SCENES} from './scenes/defaults.js';

// Scenery is constructed from seeded geometry, never stored image assets.
// A scene is a function scene(p, r, ctx) with scene.meta =
// {id, sky:'horizon'|'none', titleBand, ground, foreground}. Scenes paint only
// the background roles 0,1,2,3,9 and nothing above `top`, except a titleBand
// scene granted the band (dungeon walls may share the title's vertical space;
// lettering is drawn last). Light driven by recipe traits is the stage pass's.
export {cloud,STYLE_SCENES};
export const SCENES=Object.freeze({...SPACE_SCENES,...LAND_SCENES,...INTERIOR_SCENES,...WATER_SCENES});
const DEFAULT_META=Object.freeze({sky:'horizon',titleBand:false,ground:true,foreground:'none'});

// Engine-18 dispatch for an explicit kind without scene lists: the style and
// archetype overrides, including their r draws, are kept.
function legacyScene(kind,style,archetype,r) {
  if(style==='vehicles')return archetype.includes('submarine')?'underwater':archetype.includes('rover')?'lunar':archetype==='crawler tank'?'battlefield':r(2)?'badlands':'circuit';
  if(style==='buildings')return ['hills','skyline','mist'][r(3)];
  if(style==='islands')return 'stratosphere';
  if(style==='dungeons')return 'catacomb';
  return kind;
}

const resolve=scene=>typeof scene==='function'?scene:typeof scene==='string'?SCENES[scene]??null:null;
/** One scene list entry as {scene, weight, when, titleBand}. Entries are
 * [scene, weight, when?, {titleBand}?] or {scene, weight, when, titleBand};
 * a scene is a function or a SCENES name. */
function entry(item) {
  const [scene,weight,when,options]=Array.isArray(item)?item:[item?.scene,item?.weight,item?.when,item];
  const fn=resolve(scene);
  if(!fn)throw Error('Unknown scene in scene list: '+String(scene?.meta?.id??scene));
  return {scene:fn,weight:Number.isFinite(weight)?weight:1,when:typeof when==='function'?when:null,titleBand:options?.titleBand};
}
/** Number of slots in a dealt scene deck: one block of variants. */
export const SCENE_DECK=12;
/** Expand weights into an n-slot deck of entry indices, in list order: each
 * positive weight gets round(w*n/total) slots and at least one; the largest
 * remainders (then the earlier entry) settle the total to exactly n. With
 * more positive entries than slots, the first n get one slot each. */
export function sceneDeck(weights,n=SCENE_DECK) {
  const live=weights.map((w,i)=>[i,Number.isFinite(w)&&w>0?w:0]).filter(([,w])=>w>0);
  if(!live.length)return [];
  if(live.length>=n)return live.slice(0,n).map(([i])=>i);
  const total=live.reduce((a,[,w])=>a+w,0),rows=live.map(([i,w])=>{const q=w*n/total;return {i,k:Math.max(1,Math.floor(q)),rest:q-Math.floor(q)};});
  let sum=rows.reduce((a,row)=>a+row.k,0);
  const order=[...rows].sort((a,b)=>b.rest-a.rest||a.i-b.i);
  for(let j=0;sum<n;j=(j+1)%order.length){order[j].k++;sum++;}
  // Over by the at-least-one rule: take from the largest counts, last first.
  while(sum>n){const row=rows.filter(q=>q.k>1).sort((a,b)=>b.k-a.k||a.rest-b.rest||b.i-a.i)[0];row.k--;sum--;}
  return rows.flatMap(row=>Array(row.k).fill(row.i));
}
/** Choose from a scene list. `when(traits)` filters first. Only recipe traits
 * and wildness take part, never framing, camera or subject bounds.
 * - With a variation that carries a cycleSeed (title-seeded, as the engine's
 *   recipe variation does), the scene is dealt: the live weights expand to a
 *   12-slot deck (sceneDeck) and variation.cycle('scene-deck', 12) deals one
 *   slot per variant, so every aligned block of 12 variants shows each entry
 *   about weight/total of the time and every positive entry at least once.
 *   The deal does not use wildness (the deck already spreads every entry).
 * - Otherwise variation.weighted('scene', ...), with every entry after the
 *   first weighted x(1 + 2w).
 * Returns the entry or null. */
export function chooseScene(variation,list,traits={},wildness=0) {
  const live=list.map(entry).filter(e=>!e.when||e.when(traits));
  if(!live.length)return null;
  if(variation.cycleSeed!=null&&typeof variation.cycle==='function'){
    const deck=sceneDeck(live.map(e=>e.weight));
    if(deck.length===SCENE_DECK)return live[deck[variation.cycle('scene-deck',SCENE_DECK)]];
  }
  const index=variation.weighted('scene',live.map((e,i)=>[i,i?e.weight*(1+2*wildness):e.weight]));
  return live[index];
}

export function renderBackground(p,r,{kind,style,traits={},top,subjectBounds,variation=createVariation(r(0x100000000)),
  scenes=null,scenery=null,calm=null,subjectLayer=null,look=null,camera=null,wildness=null,extent=null}) {
  // Counts are selected once per composition, not re-rolled in loop conditions.
  const counts={kelp:variation.integer('kelp-per-bank',2,4),rocks:variation.integer('seabed-rocks',2,6),
    ruins:variation.integer('ruins',2,4),craters:variation.integer('craters',3,7),clouds:variation.integer('clouds',1,3)};
  traits.sceneryParameters=counts;
  const archetype=traits.archetype||'';
  const bounds=subjectBounds&&['left','top','right','bottom'].every(key=>Number.isFinite(subjectBounds[key]))?subjectBounds:null;
  const centerX=bounds?(bounds.left+bounds.right+1)/2:64,subjectWidth=bounds?bounds.right-bounds.left+1:128;
  const w=Math.max(0,Math.min(1,Number.isFinite(wildness)?wildness:Number.isFinite(variation.wildness)?variation.wildness:0));
  // A recipe's list, else the style table in a pipeline call (one that hands
  // over a scenery sink); otherwise the explicit kind, as in engine 18.
  const list=Array.isArray(scenes)&&scenes.length?scenes:scenery&&typeof scenery==='object'&&STYLE_SCENES[style]?STYLE_SCENES[style]:null;
  const chosen=list?chooseScene(variation,list,traits,w):null;
  const scene=chosen?chosen.scene:SCENES[legacyScene(kind,style,archetype,r)]??SCENES.void;
  const meta={...DEFAULT_META,...scene.meta};
  const titleBand=!!meta.titleBand&&(chosen?.titleBand??style==='dungeons');
  const horizon=meta.sky==='none'?horizonDraws(r):sky(p,r,top);
  let floor=bounds?Math.max(top+8,Math.min(125,bounds.bottom+1)):109+r(7);
  // Interior floors put the subject's feet midway down the floor plane, not
  // on its far edge: the room is flavour behind the subject, not a wall.
  if(meta.midFloor&&bounds)floor=Math.max(top+14,Math.min(bounds.bottom-8,2*bounds.bottom-127));
  const ctx={top,floor,bounds,centerX,subjectWidth,traits,variation,counts,calm:typeof calm==='function'?calm:null,camera:camera??null,
    mood:look?.mood??null,wildness:w,subjectLayer,titleBand,horizon,skyHorizon:meta.sky==='none'?null:horizon,style,extent:Number.isFinite(extent)?extent:top};
  const out=scene(p,r,ctx)||{};
  const sink=scenery&&typeof scenery==='object'?scenery:{};
  sink.name=meta.id;
  sink.horizon=out.horizon!==undefined?out.horizon:meta.sky==='none'?null:horizon;
  sink.floor=out.floor!==undefined?out.floor:floor;
  sink.foreground=meta.foreground;
  sink.sky=meta.sky;
  return meta.id;
}
