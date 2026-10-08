// Engine-19 cover look: wildness tier, mood, title treatment and palette,
// chosen once per cover from named streams (package E1 owns this module).
// Nothing here reads framing, so classic and varied covers of a style share
// their look; only the classic mascot keeps the frozen engine-18 palette.
import {legacyPalette} from './legacy.js';
import {MOODS,buildMoodPalette,chooseMood,treatmentFits} from './palette.js';
import * as V from './variation.js';
import * as T from './title.js';

const CANONICAL=Object.freeze({tier:0,wildness:0});

// The treatment weights chooseTreatment would use, as [id, w] pairs.
function treatmentRow(style,recipe) {
  const spec=recipe?.treatments??T.STYLE_TREATMENTS?.[style]??T.STYLE_TREATMENTS?.default;
  return spec?Array.isArray(spec)?spec.map(p=>[p?.[0],p?.[1]]):Object.entries(spec):null;
}

/**
 * The title treatment for a cover of mood `mood`: title.js chooseTreatment
 * (one named draw, 'title-treatment') over the style's weights, with the
 * weight of every treatment whose hue does not suit the mood
 * (palette.js treatmentFits) set to 0, so a treatment's name always matches
 * its colour (no gilded title on a gold-green toxic field). When nothing is
 * filtered the call is exactly chooseTreatment(v, style, recipe, wildness);
 * when everything would be, the unfiltered row is used.
 */
export function chooseFittingTreatment(v,style,recipe,wildness,mood) {
  if(!T.chooseTreatment)return null;
  const row=T.TREATMENTS?treatmentRow(style,recipe):null;
  if(row){
    const fitted=row.map(([id,w])=>[id,T.TREATMENTS[id]&&!treatmentFits(mood,T.TREATMENTS[id])?0:w]);
    if(fitted.some(([,w],i)=>w!==row[i][1])&&fitted.some(([,w])=>Math.round(w*100)>0))
      return T.chooseTreatment(v,style,{treatments:fitted},wildness)??null;
  }
  return T.chooseTreatment(v,style,recipe,wildness)??null;
}

/**
 * Choose the cover look. Called by the engine after `recipe.setup` and before
 * `recipe.render`, exactly where engine 18 built its palette, because the
 * mascot palette consumes the recipe stream `r`.
 * - compat (classic mascot): legacyPalette(r), byte for byte; no mood.
 * - varied mascot: legacyPalette(r) is still drawn and discarded, so the
 *   creature and face draws that follow on `r` stay the same.
 * - otherwise: tier and wildness from the title-seeded deck
 *   (variation.dealTier, when the host has it), a look variation
 *   createVariation(seedKey+':look'), the mood, the title treatment that suits
 *   it (chooseFittingTreatment), then the mood palette. All draws are named,
 *   so their order does not matter.
 *
 * @param {{r:Function,seedKey:string,seedTitle?:string,title?:string,variant?:number,
 *   style?:string,recipe?:object,legacy?:boolean,compat?:boolean,framing?:string}} context
 * @returns {{palette:Uint32Array,mood:string|null,moodSpec:object|null,treatment:object|null,
 *   tier:number,wildness:number,variation:object|null,
 *   summary:null|{mood:string,tier:number,wildness:number,treatment:string|null,mainHue:number,bgHue:number,accentHue:number}}}
 */
export function chooseLook({r,seedKey,title='',variant=0,style,recipe=null,legacy=false,compat=false}) {
  if(compat)return {palette:legacyPalette(r),mood:null,moodSpec:null,treatment:null,...CANONICAL,variation:null,summary:null};
  if(legacy)legacyPalette(r);
  // The deck is title-seeded (never the variant) and reshuffled per block.
  const cycleSeed='pocket-cover:'+style+':'+recipe?.revision+':'+title;
  const {tier,wildness}=V.dealTier?V.dealTier(cycleSeed,variant):CANONICAL;
  // cycleSeed/index let title.js deal treatments per block of 12 (cycle()).
  const v=V.createVariation(seedKey+':look',{wildness,cycleSeed,index:variant});
  const mood=chooseMood(v,style,recipe,wildness);
  const treatment=chooseFittingTreatment(v,style,recipe,wildness,mood);
  const built=buildMoodPalette(v,{mood,treatment,wildness});
  return {palette:built.palette,mood,moodSpec:MOODS[mood],treatment,tier,wildness,variation:v,
    summary:{mood,tier,wildness,treatment:treatment?.id??null,mainHue:built.mainHue,bgHue:built.bgHue,accentHue:built.accentHue}};
}
