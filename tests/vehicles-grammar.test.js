import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCover} from '../src/index.js';

test('vehicle grammar varies independent hull proportions, wakes and rover equipment',()=>{
  const subs=[],rovers=[],cars=[],tanks=[];
  for(let variant=0;variant<140;variant++){
    const c=generateCover('Exploration Fleet',{style:'vehicles',variant});
    if(c.traits.archetype.includes('submarine'))subs.push(c.traits);
    if(c.traits.archetype.includes('rover'))rovers.push(c.traits);
    if(c.traits.archetype==='cars')cars.push(c.traits);
    if(c.traits.archetype==='crawler tank')tanks.push(c.traits);
    assert.notEqual(c.traits.archetype,'hover skiff');
  }
  assert.ok(subs.length>12&&rovers.length>12);
  assert.ok(new Set(subs.map(t=>t.dimensions.length)).size>8);
  assert.ok(new Set(subs.map(t=>t.dimensions.height)).size>8);
  assert.equal(new Set(subs.map(t=>t.profile)).size,3);
  assert.ok(new Set(subs.map(t=>t.bubbles)).size>=4);
  assert.equal(new Set(subs.map(t=>t.bubblePattern)).size,3);
  assert.ok(subs.every(t=>t.background==='underwater'));
  assert.ok(rovers.some(t=>t.equipment.includes('spoiler'))&&rovers.some(t=>!t.equipment.includes('spoiler')));
  assert.ok(new Set(rovers.map(t=>t.wheelCount)).size>=3);
  assert.equal(new Set(cars.map(t=>t.profile)).size,5);
  assert.equal(new Set(tanks.map(t=>t.profile)).size,4);
  assert.ok(cars.every(t=>t.wheelCount===2&&t.equipment.includes('road tires')));
  assert.equal(new Set(tanks.map(t=>t.facing)).size,2);
  assert.equal(new Set(tanks.map(t=>t.dimensions.chassis)).size,2);
  const barrels=tanks.filter(t=>t.dimensions.barrelLength).map(t=>t.dimensions.barrelLength);
  assert.ok(Math.max(...barrels)/Math.min(...barrels)>3);
  assert.ok(tanks.filter(t=>t.profile==='rocket carrier').every(t=>t.dimensions.barrelLength===0));
});
