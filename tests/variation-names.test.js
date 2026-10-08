import test from 'node:test';
import assert from 'node:assert/strict';
import {createVariation} from '../src/variation.js';

test('named parameters repeat, vary across seeds, and are independent of evaluation order',()=>{
  const a=createVariation('world'),b=createVariation('world');
  const before=a.integer('leaf-count',2,7);
  for(let i=0;i<40;i++)a.range('unrelated:'+i,-.2,.3);
  assert.equal(a.integer('leaf-count',2,7),before);
  assert.equal(b.integer('leaf-count',2,7),before);
  const counts=new Set();
  for(let seed=0;seed<100;seed++){
    const v=createVariation(seed),n=v.integer('leaf-count',2,7),height=v.range('height',.8,1.2);
    counts.add(n);assert.ok(height>=.8&&height<=1.2);assert.ok(n>=2&&n<=7);
  }
  assert.equal(counts.size,6);
  assert.throws(()=>a.integer('bad',3,2));assert.throws(()=>a.range('bad',0,Infinity));
});
