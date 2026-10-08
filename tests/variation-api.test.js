import test from 'node:test';
import assert from 'node:assert/strict';
import {createVariation,dealTier,chooseWildness,WILDNESS_BY_TIER,TIER_DECK} from '../src/variation.js';
import {hash,random} from '../src/random.js';

// Verbatim engine-18 variation.js (integer and range must hash bit-identically).
function engine18Variation(seed) {
  function integer(name,min,max) {
    if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||max<min||max-min>=0x100000000)
      throw Error('Variation needs an ordered, bounded integer range.');
    return min+random(hash(String(seed)+':'+name))(max-min+1);
  }
  function range(name,min,max,steps=100) {
    if(!Number.isFinite(min)||!Number.isFinite(max)||max<min||!Number.isSafeInteger(steps)||steps<1)
      throw Error('Variation needs a finite range and positive integer steps.');
    return min+(max-min)*integer(name,0,steps)/steps;
  }
  return {integer,range};
}

// Reference implementations written from the contract text.
function fisherYates(items,key) {
  const a=items.slice(),r=random(hash(key));
  for(let i=a.length-1;i>0;i--){const j=r(i+1);[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function referenceCycle(cycleSeed,name,n,index) {
  // Every block is chained to the final (swapped) deal of the block before.
  let previous=null;
  for(let b=0;b<=Math.floor(index/n);b++){
    const a=fisherYates([...Array(n).keys()],cycleSeed+':'+name+':'+b);
    if(b>0&&n>1&&a[0]===previous[n-1])[a[0],a[1]]=[a[1],a[0]];
    previous=a;
  }
  return previous[index%n];
}
function rawDeck(cycleSeed,block) {return fisherYates([0,0,0,0,0,1,1,1,1,2,2,3],cycleSeed+':wild-tier:'+block);}
function referenceTier(cycleSeed,index) {
  const block=Math.floor(index/12),d=rawDeck(cycleSeed,block);
  if(block===0&&d[0]>1){const k=d.findIndex(t=>t<=1);[d[0],d[k]]=[d[k],d[0]];}
  return d[index%12];
}

const STYLES=['spaceships','machines','relics','plants','islands','buildings','vehicles','planets','heraldry','glyphs','dungeons','mascot'];
const cycleSeeds=count=>Array.from({length:count},(_,i)=>`pocket-cover:${STYLES[i%12]}:5:Title ${Math.floor(i/12)}`);
const frequencies=(values,keys)=>Object.fromEntries(keys.map(k=>[k,values.filter(v=>v===k).length/values.length]));

test('integer and range hash exactly as engine 18, whatever the options',()=>{
  const names=['leaf-count','hull','w','n0','kelp-per-bank','x:1'];
  const options=[undefined,{},{wildness:.9,cycleSeed:'pocket-cover:x:5:A',index:13},{wildness:.2,cycleSeed:7,index:0}];
  for(const seed of [...Array(150).keys(),'world','pocket-cover:planets:4:A:parameters']){
    const old=engine18Variation(seed);
    for(const option of options){
      const v=createVariation(seed,option);
      for(const name of names){
        assert.equal(v.integer(name,2,7),old.integer(name,2,7));
        assert.equal(v.integer(name,-50,0x7fffffff),old.integer(name,-50,0x7fffffff));
        assert.equal(v.range(name,.2,.8),old.range(name,.2,.8));
        assert.equal(v.range(name,-3,11,7),old.range(name,-3,11,7));
      }
    }
  }
  const v=createVariation('s');
  assert.throws(()=>v.integer('bad',3,2));assert.throws(()=>v.integer('bad',0,0x100000000));
  assert.throws(()=>v.range('bad',0,Infinity));assert.throws(()=>v.range('bad',0,1,0));
});

test('pick, weighted, chance and wild follow their definitions',()=>{
  const list=['a','b','c','d','e'],entries=[['x',.5],['y',1.25],['z',0],['w',.254]];
  for(let seed=0;seed<400;seed++){
    const v=createVariation(seed,{wildness:.5});
    assert.equal(v.pick('p',list),list[v.integer('p',0,4)]);
    const units=entries.map(([,w])=>Math.round(w*100));let k=v.integer('weight',0,units.reduce((a,b)=>a+b)-1),expected;
    for(let i=0;i<units.length;i++){if(k<units[i]){expected=entries[i][0];break;}k-=units[i];}
    assert.equal(v.weighted('weight',entries),expected);
    assert.notEqual(v.weighted('weight',entries),'z','a zero weight is never chosen');
    assert.equal(v.chance('c',.37),v.integer('c',0,9999)<3700);
    const isWild=v.integer('span:wild?',0,9999)<5000;
    assert.equal(v.wild('span',.8,1.2,1.3,1.9),isWild?v.range('span:wild',1.3,1.9):v.range('span',.8,1.2));
    assert.equal(v.wild('span',.8,1.2,1.3,1.9,7),isWild?v.range('span:wild',1.3,1.9,7):v.range('span',.8,1.2,7));
  }
});

test('the non-wild path of wild equals range',()=>{
  for(let seed=0;seed<500;seed++){
    const tame=createVariation(seed),zero=createVariation(seed,{wildness:0,cycleSeed:'t',index:3});
    for(const name of ['span','height','count:'+seed%7]){
      assert.equal(tame.wild(name,.8,1.2,2,3),tame.range(name,.8,1.2));
      assert.equal(zero.wild(name,-4,9,100,200,9),zero.range(name,-4,9,9));
    }
    const full=createVariation(seed,{wildness:1});
    assert.equal(full.wild('span',.8,1.2,2,3),full.range('span:wild',2,3),'wildness 1 always takes the wild range');
  }
});

test('new functions are deterministic and independent of evaluation order',()=>{
  const options={wildness:.5,cycleSeed:'pocket-cover:relics:5:Moss & Magic',index:17};
  const calls=[
    v=>v.pick('form',['chalice','potion','hourglass','idol']),
    v=>v.weighted('mood',[['night',30],['dusk',20],['neon',5.5],['pastel',.5]]),
    v=>v.chance('broken',.25),
    v=>v.wild('height',.9,1.1,1.3,1.6),
    v=>v.cycle('archetype',7),
    v=>v.cycle('pose',3),
    v=>v.integer('count',2,9),
    v=>v.range('lean',-.2,.2),
  ];
  for(let seed=0;seed<200;seed++){
    const forward=createVariation(seed,options),backward=createVariation(seed,{...options});
    const a=calls.map(call=>call(forward));
    for(let i=0;i<30;i++){backward.range('unrelated:'+i,0,1);backward.cycle('noise:'+i,5);backward.weighted('noise:'+i,[[0,1],[1,2]]);}
    const b=calls.slice().reverse().map(call=>call(backward)).reverse();
    assert.deepEqual(b,a);
    assert.deepEqual(calls.map(call=>call(forward)),a,'repeated calls agree');
  }
  const v=createVariation('s',options);
  assert.equal(v.wildness,.5);assert.equal(v.cycleSeed,options.cycleSeed);assert.equal(v.index,17);
});

test('weighted and chance frequencies over 20,000 seeds are within 1.5 points',()=>{
  const tiers=[],fractional=[],chances=[],wilds=[];
  for(let seed=0;seed<20000;seed++){
    const v=createVariation('pocket-cover:freq:'+seed,{wildness:.2});
    tiers.push(v.weighted('wild-tier',[[0,55],[1,30],[2,12],[3,3]]));
    fractional.push(v.weighted('kind',[['a',.5],['b',1.25],['c',.25],['never',0]]));
    chances.push(v.chance('echo',.3));
    wilds.push(v.wild('span',0,1,10,20)>=10);
  }
  const near=(got,want,label)=>{for(const k in want)assert.ok(Math.abs(got[k]-want[k])<=.015,`${label} ${k}: ${got[k]} vs ${want[k]}`);};
  near(frequencies(tiers,[0,1,2,3]),{0:.55,1:.30,2:.12,3:.03},'tier');
  near(frequencies(fractional,['a','b','c','never']),{a:.25,b:.625,c:.125,never:0},'fractional');
  near(frequencies(chances,[true]),{true:.3},'chance');
  near(frequencies(wilds,[true]),{true:.2},'wild');
});

test('cycle deals every value once per block and never repeats adjacent variants',()=>{
  for(const cycleSeed of ['pocket-cover:spaceships:5:Star Patrol','x',42]){
    for(const name of ['archetype','hull']){
      for(let n=1;n<=13;n++){
        const seq=Array.from({length:n*8+3},(_,index)=>createVariation('seed '+index,{cycleSeed,index}).cycle(name,n));
        for(let b=0;b+n<=seq.length;b+=n)
          assert.deepEqual(seq.slice(b,b+n).sort((p,q)=>p-q),[...Array(n).keys()],`${cycleSeed} ${name} n=${n} block ${b/n}`);
        if(n>1)for(let i=1;i<seq.length;i++)assert.notEqual(seq[i],seq[i-1],`${cycleSeed} ${name} n=${n} at ${i}`);
        seq.forEach((value,index)=>assert.equal(value,referenceCycle(String(cycleSeed),name,n,index)));
        if(n>=4)assert.ok(new Set(Array.from({length:8},(_,b)=>seq.slice(b*n,b*n+n).join())).size>1,'blocks are reshuffled');
      }
    }
  }
  // The deal depends on cycleSeed, name and index only, never on the seed.
  for(let index=0;index<40;index++)
    assert.equal(createVariation('a',{cycleSeed:'t',index}).cycle('form',6),createVariation('b',{cycleSeed:'t',index}).cycle('form',6));
  const order=(cycleSeed,name)=>Array.from({length:6},(_,index)=>createVariation(0,{cycleSeed,index}).cycle(name,6)).join();
  assert.ok(new Set(cycleSeeds(24).map(s=>order(s,'form'))).size>12,'titles get different orders');
  assert.ok(cycleSeeds(24).some(s=>order(s,'form')!==order(s,'pose')),'names are independent');
  const far=createVariation(0,{cycleSeed:'t',index:1e6+3}).cycle('form',7);
  assert.ok(Number.isInteger(far)&&far>=0&&far<7);
  assert.equal(far,referenceCycle('t','form',7,1e6+3));
});

test('cycle without a cycle seed is a plain integer choice',()=>{
  for(let seed=0;seed<200;seed++)for(const index of [0,5,23]){
    const v=createVariation(seed,{index});
    assert.equal(v.cycle('archetype',6),v.integer('archetype',0,5));
    assert.equal(v.cycle('one',1),0);
  }
});

test('the tier deck deals exactly 5/4/2/1 in every block of 12 variants',()=>{
  assert.deepEqual([...WILDNESS_BY_TIER],[0,.2,.5,.9]);assert.ok(Object.isFrozen(WILDNESS_BY_TIER));
  assert.deepEqual([...TIER_DECK],[0,0,0,0,0,1,1,1,1,2,2,3]);assert.ok(Object.isFrozen(TIER_DECK));
  let reshuffled=0;
  for(const cycleSeed of cycleSeeds(300)){
    const tiers=Array.from({length:72},(_,index)=>dealTier(cycleSeed,index));
    for(let b=0;b<6;b++){
      const block=tiers.slice(b*12,b*12+12).map(d=>d.tier);
      assert.deepEqual([0,1,2,3].map(t=>block.filter(x=>x===t).length),[5,4,2,1],`${cycleSeed} block ${b}`);
    }
    tiers.forEach(({tier,wildness},index)=>{
      assert.equal(wildness,WILDNESS_BY_TIER[tier]);
      assert.equal(tier,referenceTier(cycleSeed,index),`${cycleSeed} variant ${index}`);
    });
    if(tiers.slice(0,12).map(d=>d.tier).join()!==tiers.slice(12,24).map(d=>d.tier).join())reshuffled++;
  }
  assert.ok(reshuffled>290,'each block gets a new order');
});

test('variant 0 is always tier 0 or 1',()=>{
  let swapped=0;
  for(const cycleSeed of cycleSeeds(2000)){
    assert.ok(dealTier(cycleSeed,0).tier<=1,cycleSeed);
    assert.ok(dealTier(cycleSeed).tier<=1);
    if(rawDeck(cycleSeed,0)[0]>1)swapped++;
  }
  assert.ok(swapped>300,'the variant-0 rule is exercised');
});

test('tier distribution and determinism of the deal',()=>{
  const at17=[];
  for(const cycleSeed of cycleSeeds(4000))at17.push(dealTier(cycleSeed,17).tier);
  const f=frequencies(at17,[0,1,2,3]),want={0:5/12,1:4/12,2:2/12,3:1/12};
  for(const t in want)assert.ok(Math.abs(f[t]-want[t])<=.03,`tier ${t} at variant 17: ${f[t]}`);
  const seed='pocket-cover:planets:5:Moon Garden';
  const deal=Array.from({length:30},(_,index)=>dealTier(seed,index));
  assert.deepEqual(Array.from({length:30},(_,index)=>dealTier(seed,index)),deal);
  assert.deepEqual(Array.from({length:30},(_,index)=>dealTier(seed,29-index)).reverse(),deal,'order independent');
  deal.forEach((d,index)=>{
    assert.deepEqual(chooseWildness({cycleSeed:seed,index}),d);
    assert.deepEqual(chooseWildness(createVariation('look',{cycleSeed:seed,index})),d);
  });
  assert.deepEqual(dealTier(12345,4),dealTier('12345',4),'number seeds hash as strings');
  assert.deepEqual(chooseWildness(),{tier:0,wildness:0});
  assert.deepEqual(chooseWildness({}),{tier:0,wildness:0});
  assert.deepEqual(chooseWildness(createVariation('look',{index:5})),{tier:0,wildness:0});
});

test('bad arguments throw',()=>{
  for(const options of [{wildness:-.1},{wildness:1.01},{wildness:NaN},{wildness:'0.5'},{index:-1},{index:1.5},{cycleSeed:{}},{cycleSeed:NaN}])
    assert.throws(()=>createVariation('s',options),undefined,JSON.stringify(options));
  assert.equal(createVariation('s',null).wildness,0);
  assert.equal(createVariation('s',{wildness:null,cycleSeed:undefined,index:null}).cycleSeed,null);
  const v=createVariation('s',{cycleSeed:'t',index:3});
  assert.throws(()=>v.pick('p',[]));assert.throws(()=>v.pick('p',null));
  assert.throws(()=>v.weighted('w',[]));assert.throws(()=>v.weighted('w',[[1,-1]]));
  assert.throws(()=>v.weighted('w',[[1,0],[2,.001]]));assert.throws(()=>v.weighted('w',[1,2]));
  assert.throws(()=>v.chance('c',1.2));assert.throws(()=>v.chance('c',NaN));
  assert.throws(()=>v.wild('x',0,1,2,1),undefined,'a bad wild range throws even when the tame path is taken');
  assert.throws(()=>v.wild('x',1,0,2,3));
  for(const n of [0,1.5,-2,65537])assert.throws(()=>v.cycle('c',n));
  for(const args of [[null,0],[undefined,0],['t',-1],['t',2.5],[{},0]])assert.throws(()=>dealTier(...args));
});
