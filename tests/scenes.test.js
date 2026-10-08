import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {raster} from '../src/raster.js';
import {random} from '../src/random.js';
import {createVariation} from '../src/variation.js';
import {renderBackground,chooseScene,sceneDeck,SCENE_DECK,SCENES,STYLE_SCENES} from '../src/backgrounds.js';
import {ridge,sky,starfield} from '../src/scenes/common.js';
import {rayBucket,rayLengths,waveRows} from '../src/scenes/interior.js';
import {createGenerator,generateCover} from '../src/index.js';

const ROLES=new Set([0,1,2,3,9]);
const STYLES=['spaceships','buildings','dungeons'];
const bounds={left:18,top:40,right:110,bottom:107};

function draw(scene,style,seed,{top=28+(seed%3)*8,withBounds=seed%2===0,scenery={}}={}) {
  const data=new Uint8Array(128*128).fill(255);
  const name=renderBackground(raster(data,128,{pixelArt:true}),random(seed),{kind:'void',style,top,
    traits:{archetype:style==='buildings'?'space spire':'cars'},subjectBounds:withBounds?{...bounds}:null,
    variation:createVariation('scenes-test:'+seed,{wildness:(seed%4)/3}),scenes:[[scene,1]],scenery,calm:()=>false,wildness:(seed%4)/3});
  return {data,name,top};
}

test('every scene paints only background roles below the title, and nothing above it unless granted the title band',()=>{
  for(const [id,scene] of Object.entries(SCENES)){
    assert.equal(typeof scene.meta,'object',id+' has metadata');
    assert.ok(['horizon','none'].includes(scene.meta.sky),id+' declares its sky');
    assert.ok(['none','rocks','grass','girders','rubble','kelp'].includes(scene.meta.foreground),id+' declares a foreground kind');
    for(const style of STYLES)for(let seed=0;seed<12;seed++){
      const {data,name,top}=draw(scene,style,seed),label=`${id} / ${style} / ${seed}`;
      assert.equal(name,scene.meta.id,label+' returns its id');
      const band=scene.meta.titleBand&&style==='dungeons';
      for(let i=0;i<data.length;i++){
        const v=data[i];if(v===255)continue;
        assert.ok(ROLES.has(v),`${label}: role ${v} at ${i%128},${Math.floor(i/128)}`);
        if(!band)assert.ok(Math.floor(i/128)>=top,`${label}: painted above the title at ${i%128},${Math.floor(i/128)}`);
      }
    }
  }
});

test('scenes are deterministic and give 12 distinct buffers for 12 seeds',()=>{
  for(const [id,scene] of Object.entries(SCENES))for(const style of STYLES){
    const signatures=new Set();
    for(let seed=0;seed<12;seed++){
      const a=draw(scene,style,seed).data,b=draw(scene,style,seed).data;
      assert.deepEqual(a,b,`${id} / ${style} / ${seed} repeats`);
      signatures.add(createHash('sha256').update(a).digest('hex'));
    }
    assert.equal(signatures.size,12,`${id} / ${style} varies its geometry`);
  }
});

test('the catacomb stays below top+3 except for dungeon rooms',()=>{
  for(let seed=0;seed<24;seed++){
    for(const style of ['relics','plants','heraldry','glyphs']){
      const {data,top}=draw(SCENES.catacomb,style,seed);
      assert.ok(data.slice(0,(top+3)*128).every(v=>v===255),`catacomb / ${style} / ${seed}`);
    }
    assert.ok(draw(SCENES.catacomb,'dungeons',seed,{top:40}).data.slice(0,40*128).some(v=>v!==255),'dungeon walls share the title band');
  }
});

test('renderBackground writes ctx.scenery and returns the scene name',()=>{
  for(const [id,scene] of Object.entries(SCENES)){
    const scenery={},{name}=draw(scene,'spaceships',3,{scenery});
    assert.equal(name,id==='void'?'void':scene.meta.id);
    assert.deepEqual(Object.keys(scenery).sort(),['floor','foreground','horizon','name','sky']);
    assert.equal(scenery.name,scene.meta.id);assert.equal(scenery.sky,scene.meta.sky);assert.equal(scenery.foreground,scene.meta.foreground);
    assert.ok(scenery.horizon===null||Number.isFinite(scenery.horizon));
    assert.ok(scenery.floor===null||Number.isFinite(scenery.floor));
  }
});

test('the sky is a 3-row seam: 25, 50 and 75% rows, flat above and solid below',()=>{
  for(let seed=0;seed<20;seed++){
    const data=new Uint8Array(128*128),r=random(seed),horizon=sky(raster(data,128,{pixelArt:true}),r,30);
    assert.ok(horizon>=77&&horizon<94);
    const count=y=>{let n=0;for(let x=0;x<128;x++)n+=data[y*128+x]===1;return n;};
    for(let y=0;y<horizon-1;y++)assert.equal(count(y),0,'flat above the seam');
    assert.deepEqual([count(horizon-1),count(horizon),count(horizon+1)],[32,64,96]);
    for(let y=horizon+2;y<128;y++)assert.equal(count(y),128,'solid below the seam');
  }
});

test('ridge segments step evenly: clean slopes change the top by at most one per column',()=>{
  for(let seed=0;seed<40;seed++){
    const tops=ridge(raster(new Uint8Array(128*128),128,{pixelArt:true}),random(seed),100,3,6+seed%20,[16,20,24][seed%3]);
    for(let x=1;x<128;x++)assert.ok(Math.abs(tops[x]-tops[x-1])<=1,`seed ${seed} x ${x}`);
    // Every run of equal tops away from the frame edges is at least 2 long
    // (slopes are 1:2, 1:3, 1:4 or flat), so no 1 px stair steps appear.
    const runs=[];let n=1;
    for(let x=1;x<128;x++)if(tops[x]===tops[x-1])n++;else{runs.push(n);n=1;}
    assert.ok(runs.slice(1).every(k=>k>=2),`seed ${seed} runs ${runs}`);
    assert.ok(Math.min(...tops)>=100-(6+seed%20)+1&&Math.max(...tops)<=100);
  }
});

test('stars skip the calm title zone and the subject bounds plus two',()=>{
  const calm=(x,y)=>y<52&&x>30&&x<98;
  for(let seed=0;seed<30;seed++){
    const data=new Uint8Array(128*128).fill(255);
    starfield(raster(data,128,{pixelArt:true}),random(seed),{top:30,bounds:{left:40,top:60,right:90,bottom:100},calm},60);
    for(let i=0;i<data.length;i++)if(data[i]!==255){
      const x=i%128,y=Math.floor(i/128);
      assert.ok(!calm(x,y),`star in calm at ${x},${y}`);
      assert.ok(!(x>=38&&x<=92&&y>=58&&y<=102),`star in the subject bounds at ${x},${y}`);
      assert.ok([2,9].includes(data[i]));
    }
  }
});

test('scene lists filter by traits and weight later entries by wildness',()=>{
  const list=STYLE_SCENES.spaceships,first=list[0][0];
  const share=w=>{let n=0;for(let seed=0;seed<3000;seed++)if(chooseScene(createVariation('w'+seed),list,{},w).scene===first)n++;return n/3000;};
  const calm=share(0),wild=share(1);
  assert.ok(calm>.40&&calm<.51,'stars 5 of 11 at wildness 0: '+calm);
  assert.ok(wild>.17&&wild<.27,'stars 5 of 23 at wildness 1: '+wild);
  const vehicles=STYLE_SCENES.vehicles;
  for(let seed=0;seed<200;seed++){
    const v=createVariation('v'+seed);
    assert.equal(chooseScene(v,vehicles,{archetype:'deep sea submarine'},1).scene,SCENES.underwater);
    assert.ok([SCENES.lunar,SCENES.badlands].includes(chooseScene(v,vehicles,{archetype:'lunar rover'},1).scene));
    assert.ok([SCENES.battlefield,SCENES.badlands,SCENES.hills].includes(chooseScene(v,vehicles,{archetype:'crawler tank'},1).scene));
    assert.ok([SCENES.badlands,SCENES.circuit,SCENES.skylineNight].includes(chooseScene(v,vehicles,{archetype:'cars'},1).scene));
    assert.notEqual(chooseScene(v,STYLE_SCENES.buildings,{archetype:'temple'},1).scene,SCENES.lunar,'lunar only for space spires');
  }
});

const ids=['spaceships','machines','relics','plants','islands','buildings','vehicles','planets','heraldry','glyphs','dungeons'];
const recipes=await Promise.all(ids.map(async id=>(await import(`../src/recipes/${id}.js`)).default));

test('scene choice is identical in a single-recipe generator and in both framings',()=>{
  for(const recipe of recipes){
    const alone=createGenerator([recipe]),seen=new Set();
    for(let variant=0;variant<12;variant++){
      const full=generateCover('Scene Study',{style:recipe.id,variant}),solo=alone.generateCover('Scene Study',{variant});
      const classic=generateCover('Scene Study',{style:recipe.id,variant,framing:'classic'});
      assert.equal(solo.traits.background,full.traits.background,`${recipe.id} / ${variant}`);
      assert.equal(classic.traits.background,full.traits.background,`${recipe.id} / ${variant}: framing must not choose the scene`);
      assert.deepEqual(classic.traits.sceneryParameters,full.traits.sceneryParameters);
      assert.ok(Object.values(SCENES).some(s=>s.meta.id===full.traits.background),`${recipe.id} uses a registered scene`);
      seen.add(full.traits.background);
    }
    // Dungeon rooms choose among the three far-wall backdrops.
    if(recipe.id==='dungeons')assert.ok([...seen].every(id=>['catacomb','crypt','cavern'].includes(id)),[...seen].join());
  }
});

test('submarines are always underwater and other vehicles never are',()=>{
  let subs=0;
  for(let variant=0;variant<140;variant++){
    const {traits}=generateCover('Deep Patrol',{style:'vehicles',variant});
    if(traits.archetype.includes('submarine')){subs++;assert.equal(traits.background,'underwater');}
    else assert.notEqual(traits.background,'underwater');
  }
  assert.ok(subs>12);
});

// ---- Phase-1.5 fixes: dealt scenes, the depth value plan, calm walls,
// clean sunburst and aurora edges. ----

test('scene decks expand weights into exactly 12 slots, every positive entry at least once',()=>{
  for(const weights of [[5,2,2,1,1],[5,2,1,1],[1],[1,1,1],[3,1,1],[7,2,1,1,1],[4,4,3,1],[1,0,2],[30,1]]){
    const deck=sceneDeck(weights),total=weights.reduce((a,b)=>a+b,0);
    assert.equal(deck.length,SCENE_DECK,String(weights));
    weights.forEach((w,i)=>{
      const n=deck.filter(k=>k===i).length;
      if(w>0){
        assert.ok(n>=1,`${weights}: entry ${i}`);
        assert.ok(n===1||Math.abs(n-w*SCENE_DECK/total)<1+1e-9,`${weights}: entry ${i} has ${n}`);
      }
      else assert.equal(n,0);
    });
  }
  assert.deepEqual(sceneDeck(Array(14).fill(1)),Array.from({length:12},(_,i)=>i));
  assert.deepEqual(sceneDeck([0,0]),[]);
});

test('a title-seeded variation deals scenes per block of 12 variants',()=>{
  const lists=Object.entries(STYLE_SCENES).filter(([style])=>style!=='vehicles').map(([style,list])=>[style,list,{archetype:'temple'}]);
  for(const archetype of ['deep sea submarine','lunar rover','crawler tank','cars'])lists.push(['vehicles',STYLE_SCENES.vehicles,{archetype}]);
  for(const [style,list,traits] of lists)for(const seed of ['Deep Vault','A','Moss & Magic']){
    const live=list.filter(e=>!e[2]||e[2](traits)),deck=sceneDeck(live.map(e=>e[1]));
    for(let block=0;block<2;block++){
      const counts=new Map();
      for(let index=block*12;index<block*12+12;index++){
        const v=createVariation(`deal:${style}:${seed}:${index}`,{cycleSeed:`pocket-cover:${style}:9:${seed}`,index});
        const chosen=chooseScene(v,list,traits,(index%4)/3).scene;
        counts.set(chosen,(counts.get(chosen)??0)+1);
      }
      live.forEach((e,i)=>assert.equal(counts.get(e[0])??0,deck.filter(k=>k===i).length,`${style} ${traits.archetype} ${seed} block ${block}: ${e[0].meta.id}`));
      if(style!=='dungeons')assert.ok((counts.get(SCENES.catacomb)??0)<=12/8,`${style}: catacomb at most 1 in 8`);
      if(style==='heraldry')assert.ok(counts.get(SCENES.stars)>=1,'heraldry keeps a non-interior scene in every block');
      if(style==='dungeons')assert.equal(counts.size,3);
    }
  }
});

const placed=(seed,bottom)=>({left:22+seed%9,top:Math.max(48,bottom-50),right:104-seed%7,bottom});
function stageDraw(scene,style,seed,{bottom=100+(seed%6)*3,top=26+(seed%3)*8,calm=()=>false,extent=null}={}) {
  const data=new Uint8Array(128*128),b=placed(seed,bottom);
  renderBackground(raster(data,128,{pixelArt:true}),random(seed),{kind:'void',style,top,traits:{archetype:style==='vehicles'?'crawler tank':'orchid'},
    subjectBounds:b,variation:createVariation('value-plan:'+seed),scenes:[[scene,1,null,{titleBand:style==='dungeons'}]],scenery:{},calm,extent:extent??top+2});
  return {data,b,top};
}
const at=(d,x,y)=>x<0||x>127||y<0||y>127?-1:d[y*128+x];

test('ground scenes stand the subject on a lit floor that is never 0',()=>{
  for(const id of ['hills','mist','lunar','badlands','battlefield','garden','circuit','skylineNight'])for(let seed=0;seed<24;seed++){
    const {data,b}=stageDraw(SCENES[id],'vehicles',seed),floor=b.bottom+1;
    let lit=0,n=0,zeros=0,below=0;
    for(let x=b.left;x<=b.right;x++){n++;if([2,3].includes(at(data,x,floor)))lit++;}
    for(let y=floor;y<126;y++)for(let x=0;x<128;x++){below++;if(at(data,x,y)===0)zeros++;}
    // Rocks may cross the contact row behind the subject; craters keep off it.
    assert.ok(lit/n>=.8,`${id} / ${seed}: the contact row is lit (${lit}/${n})`);
    assert.ok(zeros/below<.03,`${id} / ${seed}: the floor is not 0 (${zeros}/${below})`);
  }
});

test('the near ground is parted from the layer behind it by a value step',()=>{
  for(const id of ['hills','mist','lunar','garden','badlands'])for(let seed=0;seed<24;seed++){
    const {data,b}=stageDraw(SCENES[id],'plants',seed),floor=b.bottom+1;
    for(let x=0;x<128;x++){
      let y=floor;
      while(y>0&&[2,3].includes(at(data,x,y-1)))y--;
      // Above the lit ground's top line: the far layer's dark foot or the sky.
      assert.ok([0,1].includes(at(data,x,y-1)),`${id} / ${seed}: column ${x} row ${y-1} is ${at(data,x,y-1)}`);
    }
  }
});

test('underwater keeps a lit seabed, two kelp depths and no ink-prone 0 near the bottom',()=>{
  for(let seed=0;seed<24;seed++){
    const {data}=stageDraw(SCENES.underwater,seed%2?'vehicles':'relics',seed);
    let zeros=0,bed=0;
    const colours=new Set();
    for(let x=0;x<128;x++){
      for(let y=96;y<125;y++){const c=at(data,x,y);colours.add(c);if(c===0)zeros++;}
      // The bed's top line (or a kelp strand standing on it).
      let y=96;
      while(y<128&&at(data,x,y)===1)y++;
      assert.ok(y<=118,`seed ${seed}: the bed rises at least 10 rows above row 127 at column ${x}`);
    }
    // A lit band of 3 runs across the bed.
    for(let y=100;y<124;y++){let n=0;for(let x=0;x<128;x++)if(at(data,x,y)===3)n++;bed=Math.max(bed,n);}
    assert.ok(bed>=96,`seed ${seed}: the bed is lit 3 (${bed}/128 in its fullest row)`);
    assert.equal(zeros,0,`seed ${seed}: no 0 in the lower water and bed`);
    for(const c of [2,9])assert.ok(colours.has(c),`seed ${seed}: near kelp in 2, lit 9 (${[...colours]})`);
  }
});

test('dungeon walls keep busy texture and light roles out of the calm title margin',()=>{
  // A title box as layoutTitle centres it; calm is its footprint grown by 3,
  // and the walls keep 2 and 9 at least 2 px further out.
  for(const id of ['catacomb','crypt','cavern'])for(const style of ['dungeons','relics','glyphs'])for(let seed=0;seed<24;seed++){
    const w=60+(seed%5)*14,x0=64-w/2,x1=63+w/2,top=40+(seed%3)*6;
    const calm=(x,y)=>x>=x0-3&&x<=x1+3&&y>=5&&y<=top+3;
    const {data}=stageDraw(SCENES[id],style,seed,{top,calm,extent:top});
    for(let y=0;y<top+8;y++)for(let x=0;x<128;x++){
      const c=at(data,x,y);
      if(c!==2&&c!==9)continue;
      assert.ok(!(x>=x0-5&&x<=x1+5&&y<=top+5),`${id} / ${style} / ${seed}: role ${c} at ${x},${y} beside the title`);
    }
  }
});

test('sunburst wedges end on solid runs: no nubs or lone tips',()=>{
  let lone=0;
  for(let seed=0;seed<24;seed++){
    const {data}=stageDraw(SCENES.sunburst,'heraldry',seed,{bottom:96});
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const c=at(data,x,y);
      if(c===2||c===9)continue;
      const n=[at(data,x-1,y),at(data,x+1,y),at(data,x,y-1),at(data,x,y+1)];
      if(!n.includes(c)&&!n.includes(2))lone++;
    }
  }
  assert.ok(lone<=12,`lone wedge pixels over 24 covers: ${lone}`);
});

test('sunburst: flat unlit wedges, staggered ray ends on one plateau tone, no rings, bright parts clear of the title',()=>{
  // Lengths: lit wedges alternate short and long; unlit wedges have none; a
  // ray whose upper edge would rise above the quiet row is shortened to it.
  const L=rayLengths(64,90,1,0,30,44,20);
  for(let k=0;k<16;k++)if(((k+1)&1)!==1)assert.equal(L[k],0);
  const lit=[...L].filter(Boolean);
  assert.equal(lit.length,8);
  const down=[...L].map((v,k)=>[v,k]).filter(([v,k])=>v&&k<8);
  assert.ok(down.some(([v])=>v===30)&&down.some(([v])=>v===44),`downward rays alternate: ${down}`);
  const capped=rayLengths(64,60,1,0,30,44,40);
  for(let k=0;k<16;k++)if(capped[k])for(const d of [[1,0],[2,1],[1,1],[1,2],[0,1],[-1,2],[-1,1],[-2,1],[-1,0],[-2,-1],[-1,-1],[-1,-2],[0,-1],[1,-2],[1,-1],[2,-1]].slice(k,k+2))
    if(d[1]<0)assert.ok(60+capped[k]*d[1]/Math.hypot(...d)>=40-1e-9,`ray ${k} rises above the quiet row`);
  for(let seed=0;seed<24;seed++){
    const top=26+(seed%3)*8,extent=top+2,{data,b}=stageDraw(SCENES.sunburst,'heraldry',seed,{bottom:96,top,extent});
    const cx=Math.round((b.left+b.right+1)/2),cy=Math.round((b.top+b.bottom+1)/2),tones=new Map();
    for(let y=top+3;y<128;y++)for(let x=0;x<128;x++){
      const dx=2*x+1-2*cx,dy=2*y+1-2*cy,d=dx*dx+dy*dy,c=at(data,x,y);
      assert.ok([0,1,3].includes(c),`${seed}: role ${c} at ${x},${y}`);
      if(d<100)continue;
      const k=rayBucket(dx,dy);
      if(!tones.has(k))tones.set(k,new Set());
      tones.get(k).add(c);
      // Bright ray parts stay 4 rows below the calm zone (extent + 3).
      if(c===3)assert.ok(y>=extent+7,`${seed}: bright ray at ${x},${y} beside the title`);
    }
    let lit=0;
    for(const [k,set] of tones){
      // Unlit wedges are one flat tone; lit wedges are 3 then one far plateau tone.
      if(set.has(3))lit++;
      else assert.ok(set.size===1,`${seed}: wedge ${k} mixes ${[...set]}`);
      assert.ok(!(set.has(3)&&set.has(1)&&set.has(0)),`${seed}: wedge ${k} has a ring (${[...set]})`);
    }
    assert.ok(lit>=4,`${seed}: ${lit} bright rays`);
  }
});

test('aurora ribbons follow clean-stepped waves with no comb of seam teeth',()=>{
  for(const period of [64,96,128])for(let amp=1;amp<=10;amp++){
    const t=waveRows(period,amp);
    assert.equal(t.length,period);
    assert.equal(Math.min(...t),-amp);
    assert.equal(Math.max(...t),amp);
    // Per half wave the runs shrink toward the middle and grow toward the crests.
    const half=Array.from(t.slice(0,period/2)),runs=[];
    for(let i=1,n=1;i<=half.length;i++){if(i<half.length&&half[i]===half[i-1])n++;else{runs.push(n);n=1;}}
    const mid=runs.indexOf(Math.min(...runs));
    for(let i=1;i<=mid;i++)assert.ok(runs[i]<=runs[i-1],`${period}/${amp}: ${runs}`);
    for(let i=mid+1;i<runs.length;i++)assert.ok(runs[i]>=runs[i-1],`${period}/${amp}: ${runs}`);
    for(let i=1;i<period;i++)assert.ok(Math.abs(t[i]-t[i-1])<=1);
  }
  let teeth=0;
  for(let seed=0;seed<48;seed++){
    const {data,top}=stageDraw(SCENES.aurora,'islands',seed);
    for(let y=top+3;y<76;y++)for(let x=0;x<128;x++){
      const c=at(data,x,y);
      if(!c)continue;
      if(at(data,x-1,y)!==c&&at(data,x+1,y)!==c&&at(data,x,y-1)!==c&&at(data,x,y+1)===c)teeth++;
    }
  }
  assert.ok(teeth<=96,`ribbon teeth over 48 covers: ${teeth}`);
});
