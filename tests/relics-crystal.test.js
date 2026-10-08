import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCover} from '../src/index.js';

test('crystal balls are single spheres seated in their cradle',()=>{
  let count=0;
  for(let variant=0;variant<180;variant++){
    const {traits:t}=generateCover('Lost Relic',{style:'relics',variant});
    if(t.archetype!=='crystal'||t.gemCut!=='cabochon')continue;
    count++;
    const {pieces,base}=t.clusterGeometry,main=pieces.at(-1);
    assert.equal(pieces.length,1);assert.equal(main.w,main.h);
    assert.ok(main.y+main.h>=base,'main orb is embedded in the socket');
  }
  assert.ok(count>=5);
});
