import test from 'node:test';
import assert from 'node:assert/strict';
import {raster} from '../src/raster.js';
import {buildingGeometry} from '../src/recipes/building-geometry.js';
import {generateCover} from '../src/index.js';

function overlappingArchitecture(order) {
  const pixels=new Uint8Array(128*128);
  const g=buildingGeometry(raster(pixels,128,{pixelArt:true,effects:false}));
  const pieces={
    rearWall(){
      const wall=g.box(-12,-12,24,16,0,32,{front:2,side:3,roof:5});
      // A conspicuous facade mark spans both its visible and occluded regions.
      g.panel(wall,'left',4,0,16,30,15);
    },
    rearRoof(){g.pyramid(-14,-14,28,20,32,10,{lit:8,shade:9});},
    nearWing(){
      g.box(-12,8,24,16,0,10,{front:6,side:7,roof:10});
      g.hip(-14,6,28,20,10,6,7,{lit:10,shade:11,top:12});
    },
  };
  for(const piece of order)pieces[piece]();
  return {pixels,...g.render()};
}

test('near eaves occlude a tall rear facade independently of construction order',()=>{
  const permutations=[
    ['rearWall','rearRoof','nearWing'],['rearWall','nearWing','rearRoof'],
    ['rearRoof','rearWall','nearWing'],['rearRoof','nearWing','rearWall'],
    ['nearWing','rearWall','rearRoof'],['nearWing','rearRoof','rearWall'],
  ];
  const reference=overlappingArchitecture(permutations[0]);
  assert.equal(reference.pixels[77*128+60],11,'near roof side covers the rear facade');
  assert.equal(reference.pixels[40*128+60],8,'upper roof remains visible above the near wing');
  for(const order of permutations){
    const image=overlappingArchitecture(order);
    assert.equal(image.painterFallbacks,0);
    assert.deepEqual(image.pixels,reference.pixels,order.join(' → '));
  }
});

test('facade marks share their parent face visibility instead of painting over roofs',()=>{
  const {pixels}=overlappingArchitecture(['nearWing','rearRoof','rearWall']);
  assert.equal(pixels[60*128+60],15,'exposed upper facade retains its mark');
  assert.equal(pixels[77*128+60],11,'the same mark is hidden behind the lower eave');
  assert.equal(pixels[40*128+60],8,'the mark cannot spill onto the upper roof');
});

test('supported building grammars avoid contradictory face orders across seeded families',()=>{
  // This catches shafts passing through observation decks and merlons placed
  // inside round towers. A cycle-free diagnostic is not an artistic judgment.
  const families=new Set();
  for(const title of ['Last Tower','Mason Guild'])for(let variant=0;variant<80;variant++){
    const {traits}=generateCover(title,{style:'buildings',variant});
    families.add(traits.archetype);
    assert.equal(traits.painterFallbacks,0,`${title} / ${variant} / ${traits.archetype}`);
    assert.ok(traits.faces>0);
    assert.ok(traits.horizonY<traits.groundRearScreenY,'the horizon is above even the rear edge of the projected footprint');
  }
  assert.equal(families.size,6);
});
