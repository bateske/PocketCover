import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCover} from '../src/index.js';

test('waterways vary both axes and length while leaving banks and bridge landings',()=>{
  const waterways=[];
  for(let variant=0;variant<100;variant++){
    const {traits:t}=generateCover('Deep Vault',{style:'dungeons',variant});
    if(!t.waterway)continue;
    const w=t.waterway;waterways.push(w);
    assert.ok(w.start>=.65&&w.start+w.length<=4.85+1e-8,'long axis stays inside the room');
    assert.ok(w.bank>1&&w.bank+w.width<3.8,'room retains dry side banks');
    assert.ok(w.bridgeStart<w.bank&&w.bridgeEnd>w.bank+w.width,'bridge reaches both banks');
    assert.ok(w.bridgeStart>0&&w.bridgeEnd<5,'bridge stays inside the room');
  }
  assert.deepEqual(new Set(waterways.map(w=>w.axis)),new Set(['x','y']));
  assert.ok(new Set(waterways.map(w=>w.length)).size>=7);
});
