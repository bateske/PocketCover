import {hash,random} from './random.js';

// Named, bounded choices. Adding one parameter never shifts the choices of
// another. Call while constructing geometry, never inside a pixel sampler.
// Reuse a name for shared dimensions; add an instance suffix for repeated parts.
// Every function is stateless: a result depends only on the seed, the options
// and the call's own name and arguments, never on evaluation order.
// `options` is {wildness=0, cycleSeed=null, index=0}:
// - wildness in [0,1] opens the wild ranges of wild();
// - cycleSeed (title-seeded, without the variant) and index (the variant)
//   drive cycle(); with no cycleSeed, cycle() is a plain integer().
// integer and range hash exactly as in engine 18, whatever the options.
export function createVariation(seed,options={}) {
  const {wildness:w,cycleSeed:cs,index:ix}=options??{};
  const wildness=w??0,cycleSeed=cs??null,index=ix??0;
  if(!Number.isFinite(wildness)||wildness<0||wildness>1)throw Error('Variation wildness must be a number from 0 to 1.');
  if(cycleSeed!==null&&!isSeed(cycleSeed))throw Error('Variation cycleSeed must be a string, a number or null.');
  checkIndex(index);
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
  // One uniform item of a non-empty list.
  function pick(name,list) {
    if(!list||!Number.isSafeInteger(list.length)||list.length<1)throw Error('Variation pick needs a non-empty list.');
    return list[integer(name,0,list.length-1)];
  }
  // [[value,weight],...]; weights >= 0 count in hundredths (Math.round(w*100)).
  function weighted(name,entries) {
    if(!Array.isArray(entries)||!entries.length)throw Error('Variation weighted needs [[value, weight], ...].');
    let total=0;
    const units=entries.map(entry=>{
      const weight=Array.isArray(entry)?entry[1]:NaN;
      if(!Number.isFinite(weight)||weight<0)throw Error('Variation weights must be finite and nonnegative.');
      const u=Math.round(weight*100);total+=u;return u;
    });
    if(total<1)throw Error('Variation weighted needs a positive total weight.');
    let k=integer(name,0,total-1);
    for(let i=0;i<entries.length;i++){if(k<units[i])return entries[i][0];k-=units[i];}
  }
  // True with probability p, in steps of 1/10000.
  function chance(name,p) {
    if(!Number.isFinite(p)||p<0||p>1)throw Error('Variation chance needs a probability from 0 to 1.');
    return integer(name,0,9999)<Math.round(p*10000);
  }
  // range(name,min,max) normally; with probability `wildness`, the wild range
  // instead. At wildness 0 it equals range(name,min,max,steps) exactly.
  function wild(name,min,max,wildMin,wildMax,steps=100) {
    checkRange(min,max,steps);checkRange(wildMin,wildMax,steps);
    return wildness>0&&integer(name+':wild?',0,9999)<Math.round(wildness*10000)
      ?range(name+':wild',wildMin,wildMax,steps):range(name,min,max,steps);
  }
  // Deal 0..n-1 so that every block of n consecutive variants (index) holds
  // each value once, in a per-block title-seeded order; adjacent variants
  // always differ (n>=2), across block boundaries too.
  function cycle(name,n) {
    if(!Number.isSafeInteger(n)||n<1||n>MAX_CYCLE)throw Error('Variation cycle needs an integer length from 1 to '+MAX_CYCLE+'.');
    if(cycleSeed===null)return integer(name,0,n-1);
    if(n===1)return 0;
    const key=String(cycleSeed)+':'+name+':';
    // For n===2 the boundary rule makes every block repeat block 0's order.
    const block=n===2?0:Math.floor(index/n),deal=shuffle(identity(n),key+block);
    // The swap moves positions 0 and 1 only, so for n>=3 the previous block's
    // last value is the one of its unswapped shuffle.
    if(block>0&&deal[0]===shuffle(identity(n),key+(block-1))[n-1])swap(deal,0,1);
    return deal[index%n];
  }
  return {integer,range,pick,weighted,chance,wild,cycle,wildness,cycleSeed,index};
}

/** Wildness of each tier: 0 canonical, 1 bold, 2 wild, 3 showcase. */
export const WILDNESS_BY_TIER=Object.freeze([0,.2,.5,.9]);
/** Tiers dealt to every block of 12 consecutive variants: 5/4/2/1. */
export const TIER_DECK=Object.freeze([0,0,0,0,0,1,1,1,1,2,2,3]);

/**
 * Engine-19 wildness tier of one variant (user decision, replacing the spec's
 * per-cover 55/30/12/3 draw). The deck is reshuffled for each block of 12
 * variants by random(hash(cycleSeed+':wild-tier:'+block)); variant 0 always
 * gets tier 0 or 1. `cycleSeed` is title-seeded and must not contain the
 * variant, e.g. 'pocket-cover:'+style+':'+revision+':'+title.
 * @returns {{tier:number,wildness:number}}
 */
export function dealTier(cycleSeed,index=0) {
  if(!isSeed(cycleSeed))throw Error('A wildness deal needs a string or number cycle seed.');
  checkIndex(index);
  const size=TIER_DECK.length,block=Math.floor(index/size);
  const deck=shuffle(TIER_DECK.slice(),String(cycleSeed)+':wild-tier:'+block);
  if(block===0&&deck[0]>1)swap(deck,0,deck.findIndex(tier=>tier<2));
  const tier=deck[index%size];
  return {tier,wildness:WILDNESS_BY_TIER[tier]};
}

/** Tier for a source carrying {cycleSeed, index}: an options object or a
 * variation. Without a cycle seed every cover is canonical, {tier:0,wildness:0}. */
export function chooseWildness(source) {
  const cycleSeed=source?.cycleSeed??null;
  return cycleSeed===null?{tier:0,wildness:0}:dealTier(cycleSeed,source.index??0);
}

const MAX_CYCLE=65536;
function isSeed(value) {return typeof value==='string'||Number.isFinite(value);}
function checkIndex(index) {
  if(!Number.isSafeInteger(index)||index<0)throw Error('Variation index must be a nonnegative safe integer.');
}
function checkRange(min,max,steps) {
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<min||!Number.isSafeInteger(steps)||steps<1)
    throw Error('Variation needs a finite range and positive integer steps.');
}
function identity(n) {const a=new Array(n);for(let i=0;i<n;i++)a[i]=i;return a;}
function swap(a,i,j) {const t=a[i];a[i]=a[j];a[j]=t;}
// Fisher-Yates in place, from the last position down: j = r(i+1).
function shuffle(a,key) {
  const r=random(hash(key));
  for(let i=a.length-1;i>0;i--)swap(a,i,r(i+1));
  return a;
}
