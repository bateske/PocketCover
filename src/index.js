import {createGenerator} from './engine.js';
import mascot from './recipes/mascot.js';
import spaceships from './recipes/spaceships.js';
import machines from './recipes/machines.js';
import relics from './recipes/relics.js';
import plants from './recipes/plants.js';
import islands from './recipes/islands.js';
import buildings from './recipes/buildings.js';
import vehicles from './recipes/vehicles.js';
import planets from './recipes/planets.js';
import heraldry from './recipes/heraldry.js';
import glyphs from './recipes/glyphs.js';
import dungeons from './recipes/dungeons.js';

export {createGenerator,VERSION,SIZE} from './engine.js';
export const {generateCover,drawCover,styles}=createGenerator([
  mascot,spaceships,machines,relics,plants,islands,buildings,vehicles,planets,heraldry,glyphs,dungeons,
],{defaultStyle:'mascot'});
