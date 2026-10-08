// Fallback scene lists per style, used until each recipe declares its own
// `scenes` (engine-contract E9). An entry is [scene, weight, when?, options?]:
// `when(traits)` filters on recipe traits only (never framing), and
// options.titleBand lets a titleBand scene use the title's rows.
// With a title-seeded scenery variation the weights become a 12-slot deck
// dealt per block of 12 variants (backgrounds.js chooseScene), so the
// weights below are written as slots out of 12 where that reads simply.
// Outside dungeons the catacomb keeps at most 1 slot in 8 (here 1 in 12),
// so the brick-and-torch backdrop does not make the styles look alike.
import {eclipse,nebula,planetLimb,stars,warp} from './space.js';
import {badlands,battlefield,duskClouds,garden,hills,lunar,mist,skyline,skylineNight,stratosphere} from './land.js';
import {alcove,aurora,catacomb,cavern,circuit,crypt,sunburst,workshop} from './interior.js';
import {underwater} from './water.js';

const archetype=traits=>String(traits?.archetype??'');
const sub=t=>archetype(t).includes('submarine'),rover=t=>archetype(t).includes('rover'),tank=t=>archetype(t)==='crawler tank';
const car=t=>!sub(t)&&!rover(t)&&!tank(t);
const freeze=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));

export const STYLE_SCENES=Object.freeze({
  spaceships:freeze([[stars,5],[nebula,2],[planetLimb,2],[eclipse,1],[warp,1]]),
  planets:freeze([[stars,5],[nebula,2],[eclipse,1],[sunburst,1]]),
  machines:freeze([[workshop,4],[circuit,2],[sunburst,1],[skylineNight,1]]),
  relics:freeze([[alcove,4],[catacomb,1],[crypt,1],[stars,2],[sunburst,2],[underwater,2]]),
  plants:freeze([[garden,7],[lunar,2],[underwater,1],[cavern,1],[catacomb,1]]),
  islands:freeze([[stratosphere,4],[stars,1],[aurora,1],[duskClouds,1]]),
  buildings:freeze([[hills,3],[skyline,3],[mist,3],[skylineNight,1],[lunar,2,t=>archetype(t)==='space spire']]),
  // Heraldry keeps a non-interior scene (stars) in every block of 12.
  heraldry:freeze([[alcove,5],[sunburst,4],[catacomb,1],[stars,2]]),
  glyphs:freeze([[alcove,5],[catacomb,1],[cavern,1],[stars,2],[sunburst,2],[aurora,1]]),
  // Rooms show three far-wall backdrops behind and beside the title band.
  dungeons:freeze([[catacomb,1,null,{titleBand:true}],[crypt,1,null,{titleBand:true}],[cavern,1,null,{titleBand:true}]]),
  vehicles:freeze([
    [underwater,1,sub],
    [lunar,3,rover],[badlands,1,rover],
    [battlefield,3,tank],[badlands,1,tank],[hills,1,tank],
    [badlands,2,car],[circuit,2,car],[skylineNight,1,car]]),
});
