import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVariation} from '../src/variation.js';
import {renderBackground} from '../src/backgrounds.js';
import {raster} from '../src/raster.js';
import {random} from '../src/random.js';

test('background layouts vary as indexed geometry with no palette changes',()=>{
  for(const [style,kind,archetype] of [['machines','workshop','signal harvester'],['dungeons','void','treasure vault'],
    ['spaceships','stars','cartoon rocket'],['islands','mist','lighthouse'],['plants','garden','orchid'],
    ['buildings','mist','temple'],['vehicles','workshop','deep sea submarine'],['vehicles','workshop','crawler tank'],['vehicles','workshop','cars']]){
    const signatures=new Set();
    for(let seed=0;seed<12;seed++){
      function draw(){
        const pixels=new Uint8Array(128*128);
        renderBackground(raster(pixels,128,{pixelArt:true}),random(seed),{style,kind,top:28,
          subjectBounds:{left:18,top:40,right:110,bottom:107},traits:{archetype,groundRearScreenY:86},variation:createVariation(seed)});
        return pixels;
      }
      const pixels=draw();assert.deepEqual(pixels,draw());
      signatures.add(createHash('sha256').update(pixels).digest('hex'));
    }
    assert.equal(signatures.size,12,style+' / '+archetype+' changes geometry, not just RGB values');
  }
});
