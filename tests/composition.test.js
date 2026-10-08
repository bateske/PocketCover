import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerator} from '../src/engine.js';
import {TRANSPARENT} from '../src/quality.js';

const ids=['mascot','spaceships','machines','relics','plants','islands','buildings','vehicles','planets','heraldry','glyphs','dungeons'];
const recipes=await Promise.all(ids.map(async id=>(await import(`../src/recipes/${id}.js`)).default));

// Capture the recipe layer before scenery, cleanup, and lettering can hide a
// framing error. Original mascots paint legacy scenery directly; their body
// material indices distinguish the creature from that background.
function observed(recipe) {
  let layer;
  const generator=createGenerator([{...recipe,render(args){
    const traits=recipe.render(args);layer=args.indices.slice();return traits;
  }}]);
  return (title,options={})=>{
    const cover=generator.generateCover(title,{...options,diagnostics:true});
    if(cover.quality.subjectLayer)layer=cover.quality.subjectLayer;
    const occupied=[];
    for(let i=0;i<layer.length;i++)if(recipe.id==='mascot'?[5,6,7].includes(layer[i]):layer[i]!==TRANSPARENT)occupied.push(i);
    assert.ok(occupied.length>0,`${recipe.id} must draw a subject`);
    let left=128,top=128,right=-1,bottom=-1;
    for(const i of occupied){const x=i%128,y=Math.floor(i/128);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    return {cover,layer,occupied,bounds:{left,top,right,bottom,width:right-left+1,height:bottom-top+1,cx:(left+right)/2,cy:(top+bottom)/2}};
  };
}

function assertSafe({cover,bounds},label) {
  const room=cover.style==='dungeons',margin=room?2:4;
  assert.ok(bounds.left>=margin&&bounds.right<128-margin,`${label}: subject crosses side margin ${JSON.stringify(bounds)}`);
  assert.ok(bounds.top>=cover.titleBottom+(room?4:6),`${label}: subject crosses title margin (${cover.titleBottom}) ${JSON.stringify(bounds)}`);
  assert.ok(bounds.bottom<(room?126:123),`${label}: subject crosses bottom margin ${JSON.stringify(bounds)}`);
  if(room)assert.ok(bounds.width>=90,`${label}: room must be at least90px wide`);
}

test('actual rendered subjects stay inside title and page margins across varied framing',()=>{
  for(const recipe of recipes){
    const render=observed(recipe),cameras=new Set();
    for(const title of ['A','Potato Pancake','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<72;variant++){
      const result=render(title,{variant});
      assertSafe(result,`${recipe.id} / ${title} / ${variant}`);
      cameras.add(result.cover.composition.camera);
    }
    // The margins above are checked in every camera a style can use. Centred
    // symbols, like rooms and the mascot, keep the standard camera.
    const fixed=['mascot','dungeons','heraldry','glyphs'].includes(recipe.id);
    assert.deepEqual([...cameras].sort(),fixed?['standard']:['standard','thirds','vista'],`${recipe.id}: cameras`);
  }
  // Seeds that approach canonical recipe limits: elevated island smoke, wide
  // vehicle accessories, long engine exhaust, and leftmost botanical branches.
  for(const [id,variant]of [['islands',90],['vehicles',1199],['spaceships',33],['plants',544]]){
    assertSafe(observed(recipes.find(r=>r.id===id))('Bounds Study',{variant}),`${id} bounds stress ${variant}`);
  }
});

test('style framing varies size and position while honoring centered symbols and large rooms',()=>{
  for(const recipe of recipes){
    const render=observed(recipe),areas=[],xs=[],ys=[];
    for(let variant=0;variant<112;variant++){
      const {bounds}=render('Composition Study',{variant});
      areas.push(bounds.width*bounds.height);xs.push(bounds.cx);ys.push(bounds.cy);
    }
    const centered=['heraldry','glyphs'].includes(recipe.id),large=['buildings','islands','dungeons'].includes(recipe.id);
    assert.ok(Math.max(...areas)/Math.min(...areas)>(large?1.1:2),`${recipe.id}: measured subject area needs a meaningful range`);
    if(centered)assert.ok(xs.every(x=>Math.abs(x-63.5)<=.5),`${recipe.id}: symbols must stay horizontally centered`);
    else if(!large){
      assert.ok(Math.max(...xs)-Math.min(...xs)>=16,`${recipe.id}: actual horizontal centers need at least16px spread`);
      assert.ok(xs.some(x=>x<60)&&xs.some(x=>x>68),`${recipe.id}: subjects must occupy both sides of center`);
    }
    assert.ok(Math.max(...ys)-Math.min(...ys)>=(large?5:14),`${recipe.id}: actual vertical centers need visible variation`);
  }
});

test('composition is deterministic and isolated from recipe random consumption',()=>{
  const make=extra=>createGenerator([{id:'stream-probe',revision:1,background:'void',render({p,r}){
    const width=20+r(12);p.rect(50,35,width,32,6);
    for(let n=0;n<extra;n++)r(1000);
    return {width};
  }}]);
  const short=make(0),long=make(50);
  for(const title of ['A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<24;variant++){
    const a=short.generateCover(title,{variant}),b=long.generateCover(title,{variant});
    assert.deepEqual(b,a,'extra draws inside a recipe must not move, recolor, or relight the same geometry');
    assert.deepEqual(short.generateCover(title,{variant}),a,'repeating a seed reproduces geometry and framing');
    const classic=short.generateCover(title,{variant,framing:'classic'});
    assert.deepEqual(classic.traits,a.traits,'framing must not choose different recipe parts');
    assert.deepEqual(classic.palette,a.palette,'framing must not change the palette');
    assert.equal(classic.composition,null);
  }
});

test('the complete canonical envelope remains visible at extreme title layouts',()=>{
  const render=observed({id:'envelope-probe',revision:1,background:'void',render({p}){
    p.rect(0,-5,128,102,6);return {};
  }});
  const ratios=[];
  for(const title of ['A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<96;variant++){
    const result=render(title,{variant});assertSafe(result,`full envelope / ${title} / ${variant}`);
    const {bounds,occupied}=result;
    assert.equal(occupied.length,bounds.width*bounds.height,'a clipped or broken envelope must not masquerade as a smaller solid rectangle');
    ratios.push(bounds.width/bounds.height);
  }
  assert.ok(ratios.every(r=>r>1.2&&r<1.32),'uniform framing retains the rectangle aspect despite integer quantization');
});

function componentSizes(layer) {
  const seen=new Set(),sizes=[];
  for(let i=0;i<layer.length;i++)if(layer[i]!==TRANSPARENT&&!seen.has(i)){
    const queue=[i];seen.add(i);
    for(let n=0;n<queue.length;n++){
      const at=queue[n],x=at%128,y=Math.floor(at/128);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy,j=yy*128+xx;
        if(xx>=0&&xx<128&&yy>=0&&yy<128&&layer[j]!==TRANSPARENT&&!seen.has(j)){seen.add(j);queue.push(j);}
      }
    }
    sizes.push(queue.length);
  }
  return sizes.sort((a,b)=>a-b);
}

test('composed coordinates preserve semantic single pixels and connected thin attachments',()=>{
  const reason='separate calibration beacon';
  const render=observed({id:'attachment-probe',revision:1,background:'void',render({p}){
    p.rect(48,48,18,17,6);p.line(55,48,55,25,5,1);
    p.detail(104,18,10,reason);return {};
  }});
  for(const title of ['A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<80;variant++){
    const {cover,layer}=render(title,{variant,diagnostics:true});
    const groups=componentSizes(layer);
    assert.equal(groups.length,2,'the mast must join the body, and the beacon must stay separate');
    assert.equal(groups[0],1,'the beacon remains exactly one intentional device pixel');
    assert.equal(cover.quality.removedDetachedPixels,0,'placement must not detach the mast or lose the detail exemption');
    const [beacon]=cover.quality.afterCleanup.detached;
    assert.equal(cover.quality.afterCleanup.detached.length,1);
    assert.equal(beacon.reason,reason);
    assert.equal(cover.indices[beacon.y*128+beacon.x],10,'the marked pixel survives actual composition');
  }
});

test('three-line titles keep every margin when small subjects are lifted to the pixel floor',()=>{
  // The pixel floor (composition.js MIN_SUBJECT_PX) lifts small subjects most
  // under a three-line title, where the area is shortest.
  for(const recipe of recipes){
    const render=observed(recipe);
    for(const title of ['The Last Tower Of Doom','Moss And Magic Forever'])for(let variant=0;variant<24;variant++){
      assertSafe(render(title,{variant}),`${recipe.id} / ${title} / ${variant}`);
    }
  }
});
