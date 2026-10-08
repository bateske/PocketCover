import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerator} from '../src/engine.js';
import {createVariation} from '../src/variation.js';
import {MOODS,MOOD_NAMES,luma} from '../src/palette.js';
import {DARKER,LIGHTER} from '../src/roles.js';
import {TRANSPARENT} from '../src/quality.js';
import {blazeWedge,bodyBounds,calmArch,capField,defaultGroundShadow,edgeFalloff,frameLut,framePass,renderStage,stageLighter,stagePlan,
  STAGE_KINDS,titleShield,VIGNETTE,VIGNETTE_SHAPES,vignetteSteps} from '../src/stage.js';
import {oklchToRgb} from '../src/palette.js';

const ids=['mascot','spaceships','machines','relics','plants','islands','buildings','vehicles','planets','heraldry','glyphs','dungeons'];
const recipes=await Promise.all(ids.map(async id=>(await import(`../src/recipes/${id}.js`)).default));
const SIZE=128,N=SIZE*SIZE;
const ring=i=>{const x=i%SIZE,y=Math.floor(i/SIZE);return Math.min(x,y,SIZE-1-x,SIZE-1-y);};
// The values reachable from `a` by zero or more DARKER steps: "not lighter".
function darkerChain(a) {
  const seen=new Set([a]);
  for(let c=a;;){c=DARKER[c];if(seen.has(c))break;seen.add(c);}
  return seen;
}
const notLighter=(before,after)=>darkerChain(before).has(after);
const mixBackground=seed=>Uint8Array.from({length:N},(_,i)=>[0,1,3,2,9][(Math.imul(i+seed,2654435761)>>>27)%5]);

// A synthetic hook context: a mood stage, a subject layer, the title
// extent and optional calm mask and screen traits (no recipe returns these
// traits yet, so they are built here).
function context({kinds={pool:1,spot:0,blaze:0,flat:0},pool=1,vignette=2,wildness=0,screen={},calm=null,extent=40,indices=null,
  subject=[50,62,30,38],style='probe',traits={},seed='stage-probe',mood=MOODS.night,scenery=undefined,palette=null}={}) {
  const layer=new Uint8Array(N).fill(TRANSPARENT),[sx,sy,sw,sh]=subject;
  for(let y=sy;y<sy+sh;y++)for(let x=sx;x<sx+sw;x++)layer[y*SIZE+x]=6;
  const moodSpec={...mood,stage:{pool,vignette,kinds}};
  return {style,seedKey:seed,legacy:false,compat:false,look:{moodSpec,wildness},palette:palette??new Uint32Array(15),
    layout:{bottom:extent,extent},titleArt:{extent},calm:calm??(()=>false),traits,layer,
    bounds:{left:sx,top:sy,right:sx+sw-1,bottom:sy+sh-1},screen,...(scenery?{scenery}:{}),
    indices:indices??mixBackground(7),stageVariation:createVariation(seed+':stage',{wildness})};
}
// Darker steps from `before` to `after` along DARKER (0 when unchanged or lighter).
const stepsDown=(before,after)=>{let c=before,n=0;while(c!==after&&n<8){c=DARKER[c];n++;}return c===after?n:0;};
const frameDistance=(x,y)=>Math.min(x,y,SIZE-1-x,SIZE-1-y);
// A wide two-line title footprint reaching both top corners, and its calm
// mask (the footprint plus 3 px, Chebyshev).
const titleRect=[[6,3,122,15],[14,19,113,33]];
const inTitle=(x,y)=>titleRect.some(([x0,y0,x1,y1])=>x>=x0&&x<=x1&&y>=y0&&y<=y1);
const wideCalm=(x,y)=>titleRect.some(([x0,y0,x1,y1])=>x>=x0-3&&x<=x1+3&&y>=y0-3&&y<=y1+3);
const chebyshevTo=(test,x,y,limit=12)=>{for(let d=0;d<=limit;d++)for(let v=y-d;v<=y+d;v++)for(let u=x-d;u<=x+d;u++)if(Math.max(Math.abs(u-x),Math.abs(v-y))===d&&u>=0&&u<SIZE&&v>=0&&v<SIZE&&test(u,v))return d;return limit+1;};
const forced=kind=>Object.fromEntries(STAGE_KINDS.map(k=>[k,k===kind?1:0]));

test('frame rule (hard): luma <= .55 on rows and columns 0-1 and 126-127 in every style, variant and forced mood',()=>{
  let checked=0;
  for(const recipe of recipes)for(const mood of MOOD_NAMES){
    const generator=createGenerator([{...recipe,moods:{[mood]:1}}]);
    for(let variant=0;variant<16;variant++)for(const framing of recipe.id==='mascot'||variant%4?['varied']:['varied','classic']){
      const cover=generator.generateCover('Frame Study',{variant,framing,rgb:false});
      assert.equal(cover.look.mood,mood);
      for(let i=0;i<N;i++){
        const r=ring(i);
        if(r>1)continue;
        const c=cover.indices[i];
        assert.ok(c<cover.palette.length,`${recipe.id} ${mood} v${variant}: index ${c} outside the palette`);
        assert.ok(luma(cover.palette[c])<=.55,`${recipe.id} ${mood} v${variant} ${framing}: frame luma ${luma(cover.palette[c]).toFixed(3)} at ${i%SIZE},${Math.floor(i/SIZE)}`);
        if(r===0)assert.ok(luma(cover.palette[c])<=.45,`${recipe.id} ${mood} v${variant}: ring 0 luma above .45`);
      }
      checked++;
    }
  }
  assert.ok(checked>=12*10*16);
});

test('frameLut: 3 then 2 forced steps, then darker until the luma limit; framePass touches only the two rings',()=>{
  for(const mood of MOOD_NAMES){
    const generator=createGenerator([{...recipes.find(r=>r.id==='planets'),moods:{[mood]:1}}]);
    const {palette}=generator.generateCover('Lut Study',{rgb:false}),[f0,f1]=frameLut(palette);
    for(let c=0;c<15;c++){
      assert.ok(luma(palette[f0[c]])<=.45&&luma(palette[f1[c]])<=.55,`${mood} ${c}`);
      assert.ok(darkerChain(DARKER[DARKER[DARKER[c]]]).has(f0[c])&&darkerChain(DARKER[DARKER[c]]).has(f1[c]));
      assert.ok(f0[c]!==12&&f1[c]!==12&&(f0[c]!==8||c===8)&&f1[c]!==8);
    }
    const indices=mixBackground(3),before=indices.slice();
    assert.equal(framePass({indices,palette,compat:false}),undefined);
    for(let i=0;i<N;i++){
      const r=ring(i);
      assert.equal(indices[i],r===0?f0[before[i]]:r===1?f1[before[i]]:before[i]);
    }
    const compat=before.slice();framePass({indices:compat,palette,compat:true});
    assert.deepEqual(compat,before,'compat covers keep their frame');
  }
  // Indices outside the palette or role tables pass through.
  const [f0]=frameLut(new Uint32Array(12).fill(0xffffff));
  assert.equal(f0[13],13);assert.equal(f0[15],15);
});

test('the stage only steps existing indices along DARKER/LIGHTER chains: never 12, never new cream, deterministic',()=>{
  const all=Uint8Array.from({length:N},(_,i)=>[0,1,2,3,4,5,6,7,8,9,10,11,13,14][(Math.imul(i,40503)>>>7)%14]);
  for(const kind of STAGE_KINDS)for(const wildness of [0,.9]){
    const screen={emitters:[{x:30,y:70,r:12,steps:2}],beams:[{x:10,y:60,dx:2,dy:1,spread:.5,length:90}],aura:{rings:3,steps:2},
      groundShadows:[{kind:'ellipse',x:64,y:101,rx:30,ry:5},{kind:'poly',points:[[40,100],[90,100],[110,110],[60,110]],steps:2},
        {kind:'project',groundY:99,shear:[.5,-.3]},{kind:'line',x0:48,x1:82,y:100}]};
    const ctx=context({kinds:forced(kind),pool:2,vignette:3,wildness,screen,indices:all.slice()});
    const twin=context({kinds:forced(kind),pool:2,vignette:3,wildness,screen,indices:all.slice()});
    const layer=ctx.layer.slice();
    renderStage(ctx);renderStage(twin);
    assert.deepEqual(ctx.indices,twin.indices,`${kind}: deterministic`);
    assert.deepEqual(ctx.layer,layer,'the subject layer is never written');
    let changed=0;
    for(let i=0;i<N;i++){
      const a=all[i],b=ctx.indices[i];
      if(a!==b)changed++;
      assert.ok(b<15,'indices stay < palette length');
      assert.ok(b!==12,'the stage never paints title colour 12');
      assert.ok(b!==8||a===8,'the stage never lightens into cream');
      // b is a or reachable from a along one chain, in either direction.
      let up=a,ok=notLighter(a,b);
      for(let s=0;s<6&&!ok;s++){up=LIGHTER[up];ok=up===b;}
      assert.ok(ok,`${kind}: ${a} -> ${b} is not a chain step at ${i%SIZE},${Math.floor(i/SIZE)}`);
    }
    assert.ok(changed>500,`${kind} changes the stage (${changed})`);
  }
});

test('no lightening above the title extent + 2, in the calm mask or its arch, from the light, glows, beams or aura',()=>{
  const extent=44,calm=(x,y)=>x>=20&&x<70&&y>=46&&y<58;
  const screen={emitters:[{x:40,y:46,r:16,steps:2},{x:100,y:30,r:10}],beams:[{x:64,y:120,dx:0,dy:-1,spread:.5,length:120}],aura:{rings:4,steps:2}};
  for(const kind of STAGE_KINDS)for(const subject of [[50,50,30,40],[30,62,60,50],[8,48,110,70]]){
    const ctx=context({kinds:forced(kind),pool:2,vignette:3,wildness:.9,screen,calm,extent,subject,indices:mixBackground(11)});
    const before=ctx.indices.slice();
    renderStage(ctx);
    let lit=0;
    for(let i=0;i<N;i++){
      const x=i%SIZE,y=Math.floor(i/SIZE),b=ctx.indices[i];
      if(y<extent+2+calmArch(x)||calm(x,y))assert.ok(notLighter(before[i],b),`${kind}: lightened ${before[i]} -> ${b} at ${x},${y}`);
      else if(!notLighter(before[i],b))lit++;
    }
    assert.ok(lit>0,`${kind}: the stage still lights below the calm band`);
  }
  // The cap field: 0 above the arch, a graded ramp below it, 0 in the mask.
  const cap=capField({calm},extent+2);
  for(let x=0;x<SIZE;x++){
    const top=extent+2+calmArch(x);
    assert.equal(cap[(top-1)*SIZE+x],0);
    if(x>=16&&x<=73)continue;   // the calm mask and its rings
    assert.equal(cap[top*SIZE+x],(x+top)&1);assert.equal(cap[(top+1)*SIZE+x],1);
    assert.equal(cap[(top+2)*SIZE+x],1+((x+top)&1));assert.equal(cap[(top+3)*SIZE+x],2);
  }
  for(let y=46;y<58;y++)for(let x=20;x<70;x++)assert.equal(cap[y*SIZE+x],0);
  for(let x=19;x<71;x++)assert.ok(cap[58*SIZE+x]<=((x+58)&1),'ring 1 of the calm mask is at most a 0/1 checker');
  // The arch is a clean curve: flat in the middle, run lengths shrinking outward.
  const runs=[];let run=1;
  for(let x=65;x<SIZE;x++){if(calmArch(x)===calmArch(x-1))run++;else{runs.push(run);run=1;}}
  for(let k=1;k<runs.length;k++)assert.ok(runs[k]<=runs[k-1],`arch runs ${runs}`);
  for(let x=0;x<64;x++)assert.equal(calmArch(x),calmArch(127-x));
});

test('through the engine: emitters never lighten title rows, and only differ from the plain cover where they shine',()=>{
  const make=emitters=>createGenerator([{id:'calm-probe',revision:1,background:'stars',coordinateSpace:'cover',
    render({p,layout}){p.rect(44,layout.bottom+20,40,30,6);return emitters?{emitters:emitters(layout)}:{};}}]);
  const plain=make(null),glow=make(layout=>[{x:64,y:layout.bottom+4,r:18,steps:2},{x:20,y:layout.bottom-6,r:9}]);
  for(const title of ['A','Calm Study','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<8;variant++){
    const a=plain.generateCover(title,{variant}),b=glow.generateCover(title,{variant});
    let lit=0;
    for(let i=0;i<N;i++){
      const y=Math.floor(i/SIZE),x=i%SIZE;
      if(y<a.titleExtent+2+calmArch(x))assert.equal(b.indices[i],a.indices[i],`${title} v${variant}: title rows changed at ${x},${y}`);
      else if(b.indices[i]!==a.indices[i]){assert.ok(notLighter(b.indices[i],a.indices[i]),'emitters only lighten');lit++;}
    }
    assert.ok(lit>20,`${title} v${variant}: the glow shows (${lit})`);
  }
});

test('the stage never changes pixels the subject covers (outside the frame rings), in both framings',()=>{
  const traits={emitters:[{x:64,y:70,r:30,steps:2}],beams:[{x:64,y:60,dx:1,dy:2,spread:.5,length:80}],aura:{rings:3,steps:2},grounded:true,
    groundShadows:[{kind:'ellipse',x:64,y:96,rx:40,ry:8},{kind:'poly',points:[[30,90],[100,90],[110,100],[40,100]],steps:2},{kind:'project',groundY:96},{kind:'line',x0:40,x1:90,y:95}]};
  for(const coordinateSpace of ['cover',undefined]){
    const generator=createGenerator([{id:'cover-probe',revision:1,background:'void',...(coordinateSpace?{coordinateSpace}:{}),render({p,layout}){
      const top=coordinateSpace?layout.bottom+12:24;
      p.rect(36,top,56,40,6);p.rect(36,top,56,6,7);p.rect(50,top+40,28,8,5);
      p.group(q=>q.rect(70,top+10,10,10,5),{shadow:{x:2,y:3,color:'darken'}});
      return structuredClone(traits);
    }}]);
    for(const framing of ['varied','classic'])for(let variant=0;variant<12;variant++){
      const cover=generator.generateCover('Cover Study',{variant,framing,diagnostics:true}),layer=cover.quality.subjectLayer;
      let covered=0;
      for(let i=0;i<N;i++){
        if(layer[i]>=253||ring(i)<2)continue;
        assert.equal(cover.indices[i],layer[i],`${framing} v${variant} at ${i%SIZE},${Math.floor(i/SIZE)}`);
        covered++;
      }
      assert.ok(covered>1000);
      assert.ok(cover.indices.every(v=>v<cover.palette.length),'indices < palette length');
    }
  }
});

test('the default ground shadow: grounded subjects and the vehicles cars / crawler tank fallback',()=>{
  // Keying, on a synthetic context.
  const box={left:30,top:60,right:99,bottom:100};
  const at=(style,traits,screen={})=>defaultGroundShadow({style,traits,screen,bounds:box});
  const expected={kind:'ellipse',x:64.5+.06*70,y:100,rx:.46*70,ry:Math.max(2,.05*70),core:2,rim:1};
  assert.deepEqual(at('vehicles',{archetype:'cars'}),expected);
  assert.deepEqual(at('vehicles',{archetype:'crawler tank'}),expected);
  assert.deepEqual(at('plants',{grounded:true}),expected);
  assert.deepEqual(at('plants',{},{grounded:true}),expected);
  assert.equal(at('vehicles',{archetype:'deep sea submarine'}),null);
  assert.equal(at('spaceships',{archetype:'cars'}),null,'the fallback is keyed to the vehicles style');
  assert.equal(at('vehicles',{archetype:'cars'},{grounded:false}),null,'an explicit grounded:false wins');
  assert.equal(at('vehicles',{archetype:'cars'},{groundShadows:[{kind:'line',x0:1,x1:2,y:3}]}),null,'own shadows opt out');
  assert.equal(defaultGroundShadow({style:'vehicles',traits:{archetype:'cars'},screen:{},bounds:null}),null);
  // Through the engine: a 'vehicles' probe whose only difference is an
  // off-canvas shadow that opts out of the default.
  const make=optOut=>createGenerator([{id:'vehicles',revision:1,background:'void',render({p}){
    p.rect(30,40,68,20,6);p.rect(44,30,36,10,7);for(const x of [40,84])p.ellipse(x,62,6,6,5);
    return {archetype:'cars',...(optOut?{groundShadows:[{kind:'line',x0:0,x1:1,y:-500}]}:{})};
  }}]);
  const withShadow=make(false),without=make(true);
  for(const framing of ['varied','classic'])for(let variant=0;variant<8;variant++){
    const a=withShadow.generateCover('Shadow Study',{variant,framing,diagnostics:true}),b=without.generateCover('Shadow Study',{variant,framing,diagnostics:true});
    const body=bodyBounds({layer:a.quality.subjectLayer,indices:a.indices}),w=body.right-body.left+1;
    const shadow={x:(body.left+body.right)/2+.06*w,y:body.bottom,rx:.46*w,ry:Math.max(2,.05*w)};
    let darker=0,core=0;
    for(let i=0;i<N;i++){
      if(a.indices[i]===b.indices[i])continue;
      const x=i%SIZE,y=Math.floor(i/SIZE);
      assert.ok(notLighter(b.indices[i],a.indices[i]),'the shadow only darkens');
      assert.ok(Math.abs(x-shadow.x)<=shadow.rx+1&&Math.abs(y-shadow.y)<=shadow.ry+1,`${framing} v${variant}: change outside the shadow at ${x},${y}`);
      darker++;
      if(y>body.bottom&&a.indices[i]===DARKER[DARKER[b.indices[i]]])core++;
    }
    assert.ok(darker>=Math.floor(shadow.rx),`${framing} v${variant}: the shadow shows below the car (${darker})`);
    // Varied framing still has backgrounds.js's ink contact ellipse over the
    // core until E9 removes it; classic framing never had it.
    if(framing==='classic')assert.ok(core>0,`classic v${variant}: a two-step core sits under the car`);
  }
});

test('stage plan: kinds from the mood, the light around the subject, grounded pools and the calm roof',()=>{
  const counts=Object.fromEntries(STAGE_KINDS.map(k=>[k,0]));
  for(let n=0;n<400;n++){
    const plan=stagePlan(context({kinds:{pool:6,spot:2,blaze:1,flat:1},seed:'plan '+n}));
    counts[plan.kind]++;
  }
  // Dark moods never deal 'flat' (palette.js MOODS: every dark stage gets a key light).
  for(const name of MOOD_NAMES)if(MOODS[name].dark)for(let n=0;n<50;n++)assert.notEqual(stagePlan(context({kinds:MOODS[name].stage.kinds,seed:'dark '+n})).kind,'flat',name);
  for(const k of STAGE_KINDS)assert.ok(counts[k]>0,`kind ${k} is dealt (${JSON.stringify(counts)})`);
  assert.ok(counts.pool>counts.blaze&&counts.pool>counts.spot);
  for(const kind of STAGE_KINDS)assert.equal(stagePlan(context({kinds:forced(kind)})).kind,kind);
  // Light centre and radii follow the spec for a subject clear of the title.
  const plan=stagePlan(context({subject:[40,70,40,30],extent:20}));
  assert.deepEqual([plan.cx,plan.cy,plan.rx,plan.ry],[59.5-.12*40,84.5-.15*30,36,28]);
  const focal=stagePlan(context({subject:[40,70,40,30],extent:20,screen:{focal:[70,90]}}));
  assert.deepEqual([focal.cx,focal.cy],[70,90]);
  const grounded=stagePlan(context({subject:[40,70,40,30],extent:20,traits:{grounded:true}}));
  assert.equal(grounded.cy,99-grounded.ry/2);
  // A tall subject's pool is squashed under the calm band, its bottom kept.
  const tall=stagePlan(context({subject:[30,50,60,72],extent:40}));
  assert.ok(tall.cy-1.1*tall.ry>=tall.calmTop+3-1e-9,'the pool stays below the calm band');
  const raw=Math.max(22,.58*72)+6,rawCy=85.5-.15*72;
  assert.ok(Math.abs(tall.cy+tall.ry-(rawCy+raw))<1e-9,'the pool keeps its bottom edge');
  // rx shrinks with ry, so a squashed wide pool keeps an arched top.
  assert.ok(tall.ry<raw&&Math.abs(tall.rx-Math.max(28,(Math.max(28,.62*60)+8)*tall.ry/raw))<1e-9,'rx shrinks with the squash');
  // No mood stage, legacy or compat: no plan, and renderStage leaves indices alone.
  for(const patch of [{look:null},{legacy:true},{compat:true}]){
    const ctx={...context(),...patch},before=ctx.indices.slice();
    assert.equal(stagePlan(ctx),null);renderStage(ctx);assert.deepEqual(ctx.indices,before);
  }
});

// Side of the largest square of pixels that each differ from their right and
// lower neighbours: about 2 for a 2 px seam of any slope, 3-4 where two seams
// cross, and 14 or more for engine 18's screen-door sky bands.
function checkerSquare(v) {
  const dp=new Int32Array(N);let best=0;
  for(let y=SIZE-2;y>=0;y--)for(let x=SIZE-2;x>=0;x--){
    const i=y*SIZE+x;
    if(v[i]!==v[i+1]&&v[i]!==v[i+SIZE]){dp[i]=1+Math.min(dp[i+1],dp[i+SIZE],dp[i+SIZE+1]);best=Math.max(best,dp[i]);}
  }
  return best;
}
test('seams stay narrow: 2 px checker seams at plateau boundaries, never a wide dither band',()=>{
  for(const kind of STAGE_KINDS)for(const subject of [[50,62,30,38],[10,50,108,70],[60,90,20,20],[20,40,90,80]])for(let n=0;n<4;n++){
    const seed='seam '+kind+subject+n;
    const both=context({kinds:forced(kind),pool:2,vignette:3,subject,indices:new Uint8Array(N).fill(1),extent:30,seed});
    renderStage(both);
    assert.ok(checkerSquare(both.indices)<=4,`${kind} ${subject} ${n}: a wide checker area (${checkerSquare(both.indices)})`);
    const single=context({kinds:forced(kind),pool:1,vignette:0,subject,indices:new Uint8Array(N).fill(1),extent:30,seed});
    renderStage(single);
    assert.ok(checkerSquare(single.indices)<=3,`${kind} ${subject} ${n}: a single seam wider than 3 px (${checkerSquare(single.indices)})`);
  }
  // The seam band itself: on a flat background with no vignette, every
  // changed pixel's 2 px neighbourhood is either solid or a true checker.
  const ctx=context({kinds:forced('pool'),vignette:0,indices:new Uint8Array(N).fill(1),extent:20,subject:[44,60,40,40]});
  renderStage(ctx);
  const lit=ctx.indices.reduce((n,v)=>n+(v===3),0),seam=[...ctx.indices].filter((v,i)=>i%SIZE<SIZE-1&&v!==ctx.indices[i+1]).length;
  assert.ok(lit>2000&&seam<lit/4,`a solid pool with a thin seam (${lit} lit, ${seam} seam pairs)`);
});

test('blaze wedges: twelve sectors on axes and 1:2 / 2:1 diagonals, parity kept by a half turn',()=>{
  const seen=new Set();
  for(let y=-40;y<=40;y++)for(let x=-40;x<=40;x++){
    if(!x&&!y)continue;
    const k=blazeWedge(x,y);seen.add(k);
    assert.equal(blazeWedge(-x,-y)&1,k&1,'a half turn keeps parity');
    assert.equal(blazeWedge(-x,-y),(k+6)%12,'a half turn adds six wedges');
  }
  assert.equal(seen.size,12);
  // Boundaries: +x, the 2:1 and 1:2 diagonals, +y.
  assert.equal(blazeWedge(10,0),0);assert.equal(blazeWedge(10,4),0);assert.equal(blazeWedge(10,5),1);
  assert.equal(blazeWedge(5,10),1);assert.equal(blazeWedge(4,10),2);assert.equal(blazeWedge(0,10),3);
});

test('aura rings hug the subject, exclude it, and end in a checker ring',()=>{
  const ctx=context({kinds:forced('flat'),vignette:0,screen:{aura:{rings:3,steps:1}},indices:new Uint8Array(N).fill(1),subject:[50,70,20,20]});
  renderStage(ctx);
  for(let y=60;y<100;y++)for(let x=40;x<80;x++){
    const i=y*SIZE+x,dx=Math.max(50-x,0,x-69),dy=Math.max(70-y,0,y-89),d2=dx*dx+dy*dy;
    const expected=ctx.layer[i]!==TRANSPARENT?1:d2===0?1:d2<=4?3:d2<=9?((x+y)&1?3:1):1;
    assert.equal(ctx.indices[i],expected,`aura at ${x},${y}`);
  }
});

// Plans with each vignette shape, found by seed (the 'vignette' draw).
function planWithShape(shape,options={}) {
  for(let n=0;n<200;n++){
    const ctx=context({kinds:forced('flat'),vignette:3,indices:new Uint8Array(N).fill(3),seed:'shape '+shape+n,...options});
    const plan=stagePlan(ctx);
    if(plan.vignetteShape===shape)return {ctx,plan,seed:'shape '+shape+n};
  }
  throw Error('shape not dealt: '+shape);
}

test('the vignette hugs the frame: corners and edges fall off in plateaus, the centre and title band stay open',()=>{
  for(const shape of Object.keys(VIGNETTE_SHAPES)){
    const {ctx,plan}=planWithShape(shape);
    assert.equal(plan.vignette,3);assert.deepEqual(plan.vradii,[...VIGNETTE.steps]);
    const steps=vignetteSteps(plan);
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const s=steps[y*SIZE+x];
      if(!s)continue;
      // Never a lens: every darkened pixel lies within 18 px of the frame
      // (the engine-18 circle darkened (19,19)), and the open centre holds.
      assert.ok(frameDistance(x,y)<=18,`${shape}: step ${s} at ${x},${y}, ${frameDistance(x,y)} px from the frame`);
      assert.ok(Math.hypot(x-63.5,y-64)>44,`${shape}: the centre is darkened at ${x},${y}`);
      // The title band between the title's usual ends stays open.
      assert.ok(!(y<=40&&x>=16&&x<=111),`${shape}: the title band is darkened at ${x},${y}`);
    }
    // Plateaus: the bottom corners fall at least two steps, at least as deep
    // as the edge midpoints beside them.
    for(const [x,y] of [[3,124],[124,124]]){
      const corner=steps[y*SIZE+x];
      assert.ok(corner>=2,`${shape}: corner ${x},${y} falls ${corner}`);
      assert.ok(corner>=steps[64*SIZE+x]&&corner>=steps[y*SIZE+64],`${shape}: corner vs edges`);
    }
    // Through renderStage on a flat background: seams stay 2 px.
    renderStage(ctx);
    assert.ok(checkerSquare(ctx.indices)<=4,`${shape}: a wide checker (${checkerSquare(ctx.indices)})`);
  }
  // Every shape is dealt for dark moods.
  const seen=new Set();
  for(let n=0;n<120;n++)seen.add(stagePlan(context({seed:'deal '+n})).vignetteShape);
  assert.deepEqual([...seen].sort(),['corners','floor','sides']);
});

test('the title shield: one flat vignette value around the title, rising one step per 2 px, never within 4 px of it',()=>{
  for(const shape of Object.keys(VIGNETTE_SHAPES))for(const kind of STAGE_KINDS){
    const {seed}=planWithShape(shape,{calm:wideCalm,extent:33,kinds:forced(kind),pool:2});
    const ctx=context({kinds:forced(kind),vignette:3,pool:2,indices:new Uint8Array(N).fill(3),calm:wideCalm,extent:33,seed});
    assert.equal(stagePlan(ctx).vignetteShape,shape);
    const before=ctx.indices.slice();
    renderStage(ctx);
    let darkened=0;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const i=y*SIZE+x,d=chebyshevTo(inTitle,x,y),down=stepsDown(before[i],ctx.indices[i]);
      if(d<=4)assert.equal(ctx.indices[i],before[i],`${shape}/${kind}: changed ${d} px from the title at ${x},${y}`);
      // Outside the calm mask (d > 3) the vignette may rise one step per 2 px.
      else if(down)assert.ok(down<=Math.ceil((d-4)/2),`${shape}/${kind}: ${down} steps ${d} px from the title at ${x},${y}`);
      if(down)darkened++;
    }
    assert.ok(darkened>100,`${shape}/${kind}: the vignette still frames the cover (${darkened})`);
  }
  // The shield fills the calm mask per row and measures chessboard distance.
  const mask=new Uint8Array(N);for(const x of [10,11,40,41])mask[20*SIZE+x]=1;
  const shield=titleShield(mask);
  for(let x=10;x<=41;x++)assert.equal(shield.dist[20*SIZE+x],0,'row-filled');
  assert.equal(shield.dist[23*SIZE+25],3);assert.equal(shield.dist[20*SIZE+44],3);assert.equal(shield.dist[17*SIZE+7],3);
  assert.equal(titleShield(new Uint8Array(N)),null);
});

test('light moods: one centred corner-only step; uncovered edges step down in the frame pass instead of boxing',()=>{
  for(const kind of ['pool','flat']){
    const ctx=context({kinds:forced(kind),mood:{...MOODS.pastel,dark:false},vignette:3,indices:new Uint8Array(N).fill(3),calm:wideCalm,extent:33});
    const plan=stagePlan(ctx);
    assert.equal(plan.light,true);assert.equal(plan.vignette,1);assert.equal(plan.vignetteShape,'corners');assert.equal(plan.vx,VIGNETTE.x);
    const before=ctx.indices.slice();
    renderStage(ctx);
    const corners=[0,0,0,0];
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const down=stepsDown(before[y*SIZE+x],ctx.indices[y*SIZE+x]);
      assert.ok(down<=1,`${kind}: ${down} steps at ${x},${y}`);
      if(!down)continue;
      // Corners only: near a corner, never down the middle of an edge.
      const cx=Math.min(x,SIZE-1-x),cy=Math.min(y,SIZE-1-y);
      assert.ok(cx+cy<=34&&Math.min(cx,cy)<=10,`${kind}: light-mood step away from the corners at ${x},${y}`);
      corners[(x<64?0:1)+(y<64?0:2)]++;
    }
    assert.ok(corners[2]>20&&corners[3]>20,`${kind}: both bottom corners fall (${corners})`);
  }
  // The frame pass on a light mood: rings 0-1 as always; ring 2 steps on a
  // 1 px checker on flat background, away from the calm mask and the
  // subject; with no stage the corners also fall one step.
  const palette=createGenerator([{...recipes.find(r=>r.id==='planets'),moods:{pastel:1}}]).generateCover('Edge Study',{rgb:false}).palette;
  const [f0,f1]=frameLut(palette);
  for(const staged of [false,true]){
    const ctx=context({mood:{...MOODS.pastel,dark:false},indices:new Uint8Array(N).fill(3),calm:wideCalm,extent:33,palette});
    if(staged)ctx.stage={};
    const before=ctx.indices.slice();
    framePass(ctx);
    let ring2=0;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const i=y*SIZE+x,r=ring(i),a=before[i],b=ctx.indices[i],nearCorner=Math.min(x,SIZE-1-x)+Math.min(y,SIZE-1-y)<=34;
      if(r===0){assert.equal(b,f0[a]);continue;}
      if(r===1){assert.equal(b,f1[a]);continue;}
      if(wideCalm(x,y)||ctx.layer[i]!==TRANSPARENT){assert.equal(b,a,`calm and subject untouched at ${x},${y}`);continue;}
      if(b!==a)assert.equal(b,DARKER[a],`one step at ${x},${y}`);
      if(r===2){
        if((x+y)&1){assert.equal(b,DARKER[a],`ring 2 checker at ${x},${y}`);ring2++;}
        else if(staged||!nearCorner)assert.equal(b,a,`ring 2 checker gap at ${x},${y}`);
      }else if(staged||!nearCorner)assert.equal(b,a,`ring 3+ kept at ${x},${y}`);
    }
    assert.ok(ring2>150,`ring 2 checker (${ring2})`);
  }
  // A dark staged cover and a bare context keep everything past ring 1.
  for(const ctx of [{...context({indices:new Uint8Array(N).fill(3),palette}),stage:{}},{indices:new Uint8Array(N).fill(3),palette}]){
    const before=ctx.indices.slice();framePass(ctx);
    for(let i=0;i<N;i++)if(ring(i)>1)assert.equal(ctx.indices[i],before[i]);
  }
});

test('stage kinds follow the scene: no blaze over a ground or radial scene; radial stages keep one corner step',()=>{
  const kinds={pool:1,spot:0,blaze:50,flat:0};
  for(const [name,blaze] of [['hills',false],['workshop',false],['void',true],['stars',true],['stratosphere',true],['sunburst',false],['warp',false],[undefined,true]]){
    let blazes=0;
    for(let n=0;n<40;n++){
      const plan=stagePlan(context({kinds,scenery:name?{name}:undefined,seed:'scene '+name+n}));
      if(plan.kind==='blaze')blazes++;
      if(plan.kind==='blaze'||name==='sunburst'||name==='warp'){assert.equal(plan.radial,true);assert.deepEqual(plan.vradii,[VIGNETTE.corner]);}
    }
    assert.equal(blazes>0,blaze,`${name}: blaze ${blazes}`);
  }
  // A mood whose only kind is barred falls back to a pool.
  assert.equal(stagePlan(context({kinds:forced('blaze'),scenery:{name:'hills'}})).kind,'pool');
});

test('radial scenes get no pool: its weight moves to the spot on dark moods and to flat light on light moods',()=>{
  // A pool's elliptical edge across sunburst or warp wedges reads as dartboard rings.
  for(const name of ['sunburst','warp'])for(const mood of MOOD_NAMES){
    const spec=MOODS[mood].stage,seen=new Set();
    for(let n=0;n<40;n++)seen.add(stagePlan(context({kinds:spec.kinds,mood:MOODS[mood],scenery:{name},seed:'radial '+mood+n})).kind);
    assert.ok(!seen.has('pool')&&!seen.has('blaze'),`${name} / ${mood}: ${[...seen]}`);
    if(MOODS[mood].dark)assert.ok(seen.has('spot')&&!seen.has('flat'),`${name} / ${mood}: a dark radial stage keeps a key light (${[...seen]})`);
    else assert.ok(!seen.has('spot'),`${name} / ${mood}: ${[...seen]}`);
  }
  // Other scenes still deal the pool.
  const kinds=MOODS.night.stage.kinds;let pools=0;
  for(let n=0;n<40;n++)if(stagePlan(context({kinds,scenery:{name:'void'},seed:'void '+n})).kind==='pool')pools++;
  assert.ok(pools>0);
});

test('spot: a solid tip under the calm band, a cone leaning from the top left on clean 1:4 and 1:2 edges',()=>{
  const ctx=context({kinds:forced('spot'),vignette:0,indices:new Uint8Array(N).fill(1),extent:30,subject:[50,70,40,30]});
  const plan=stagePlan(ctx),[ax,ay]=plan.apex;
  assert.ok(ax<plan.cx,'the apex sits left of the light centre');
  assert.equal(ay,plan.calmTop+3+calmArch(Math.round(ax)));
  renderStage(ctx);
  const lit=(x,y)=>ctx.indices[y*SIZE+x]===3,rows=[];
  for(let y=0;y<SIZE;y++){let lo=-1,hi=-1;for(let x=0;x<SIZE;x++)if(lit(x,y)){if(lo<0)lo=x;hi=x;}rows.push([lo,hi]);}
  const first=rows.findIndex(([lo])=>lo>=0);
  assert.equal(first,ay,'the cone starts at the apex row');
  let run=0;for(let x=0;x<SIZE;x++)if(lit(x,first)){let k=x;while(k<SIZE&&lit(k,first))k++;run=Math.max(run,k-x);x=k;}
  assert.ok(run>=2,`the tip is a run, not a lone pixel (${run})`);
  // Edges: the right edge moves 1 px per 2 rows, the left 1 px per 4.
  const [lo1,hi1]=rows[ay+8],[lo2,hi2]=rows[ay+48];
  assert.ok(Math.abs((hi2-hi1)-20)<=1,`right edge ${hi1} -> ${hi2}`);
  assert.ok(Math.abs((lo1-lo2)-10)<=1,`left edge ${lo1} -> ${lo2}`);
});

test('blaze: rays end in their own seam under the calm band, never cut on one row',()=>{
  for(const subject of [[40,70,50,40],[20,48,90,70]]){
    const ctx=context({kinds:forced('blaze'),vignette:0,indices:new Uint8Array(N).fill(1),extent:30,subject});
    const plan=stagePlan(ctx);
    assert.ok(plan.blazeRy<=Math.max(12,plan.cy-plan.calmTop-4)+1e-9&&plan.blazeRy<=plan.blazeR);
    renderStage(ctx);
    for(let i=0;i<N;i++){const y=Math.floor(i/SIZE);if(ctx.indices[i]!==1)assert.ok(y>=Math.floor(plan.cy-plan.blazeRy)-1,`blaze above its ellipse at ${i%SIZE},${y}`);}
  }
});

test('stageLighter keeps background light in its family; floors are lit and never sink into the vignette',()=>{
  const palette=new Uint32Array(15);
  palette[2]=oklchToRgb(.36,.06,300);palette[9]=oklchToRgb(.62,.09,60);
  assert.equal(stageLighter(palette)[2],2,'dusk-style ochre glow: 2 stays 2');
  palette[9]=oklchToRgb(.62,.05,320);
  assert.equal(stageLighter(palette),LIGHTER,'same family: 2 -> 9');
  assert.equal(stageLighter(new Uint32Array(15)),LIGHTER,'neutral palettes keep the table');
  // A subject on a floor (its own off-canvas shadow opts out of the default
  // one): a floor ellipse, no floor-shaped vignette, and around the subject's
  // foot the floor is never darker than the scene.
  for(let n=0;n<12;n++){
    const screen={groundShadows:[{kind:'line',x0:0,x1:1,y:-50}]};
    const ctx=context({kinds:forced('flat'),vignette:3,indices:new Uint8Array(N).fill(3),subject:[20,80,88,40],screen,seed:'floor '+n});
    const plan=stagePlan(ctx);
    assert.ok(plan.floor&&plan.vignetteShape!=='floor');
    assert.deepEqual([plan.floor.y,plan.floor.ry],[121,6]);
    const before=ctx.indices.slice();
    renderStage(ctx);
    let lifted=0;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const i=y*SIZE+x,dx=(x-plan.floor.x)/plan.floor.rx,dy=(y-plan.floor.y)/plan.floor.ry;
      if(ring(i)<2||dx*dx+dy*dy>.5)continue;
      assert.ok(notLighter(ctx.indices[i],before[i]),`floor darkened at ${x},${y}`);
      if(ctx.indices[i]!==before[i])lifted++;
    }
    assert.ok(lifted>40,`the floor is lit (${lifted})`);
  }
});
