import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCover,drawCover,createGenerator} from '../src/index.js';
import {mapTraits} from '../src/engine.js';
import {raster,viewport,PROVENANCE} from '../src/raster.js';
import {hash,random} from '../src/random.js';
import {createPalette} from '../src/palette.js';
import {titleLayout,drawTitle,layoutTitle,prepareTitle} from '../src/title.js';
import {legacyPalette,legacyTitleLayout,legacyDrawTitle} from '../src/legacy.js';
import {recordDrawing} from '../src/drawing.js';
import {createVariation,chooseWildness} from '../src/variation.js';
import {chooseComposition,adjustPlacement,compositionMeta,subjectBounds} from '../src/composition.js';
import {chooseLook} from '../src/look.js';
import {ROLE,BACKGROUND_ROLES,DARKER,LIGHTER,DARKEN1,DARKEN2} from '../src/roles.js';
import {renderStage,framePass} from '../src/stage.js';
import {renderDepth,renderForeground} from '../src/depth.js';
import {TRANSPARENT} from '../src/quality.js';

const ids=['mascot','spaceships','machines','relics','plants','islands','buildings','vehicles','planets','heraldry','glyphs','dungeons'];
const recipes=Object.fromEntries(await Promise.all(ids.map(async id=>[id,(await import(`../src/recipes/${id}.js`)).default])));

// Record a recipe's geometry exactly as the engine hands it a recorder.
function record(recipe,seed) {
  const r=random(hash(seed)),pick=items=>items[r(items.length)];
  const setup=recipe.setup?.({r,pick})||{},layout=layoutTitle('POCKET WORLDS'),drawing=recordDrawing();
  recipe.render({p:drawing.p,r,pick,variation:createVariation(seed+':parameters'),indices:new Uint8Array(128*128).fill(TRANSPARENT),
    layout,palette:createPalette(random(hash(seed+':palette'))),seedTitle:seed,setup,placement:null,look:null,
    lut:{darker:DARKER,lighter:LIGHTER},area:{x:4,y:layout.areaTop,width:120,height:123-layout.areaTop}});
  return drawing;
}
const fixtures=ids.filter(id=>id!=='mascot').flatMap(id=>[0,1].map(n=>({name:`${id}#${n}`,drawing:record(recipes[id],`pipeline:${id}:${n}`)})));
// Replays every group with no effect options at all.
const plain=p=>new Proxy(p,{get:(target,key)=>key==='group'?draw=>target.group(q=>draw(plain(q))):target[key]});

test('rgb:false keeps the indices and omits pixels; drawCover always paints RGB',()=>{
  for(const [style,framing] of [['mascot','classic'],['mascot','varied'],['spaceships','varied'],['dungeons','classic'],['heraldry','varied']]){
    const a=generateCover('Pocket Worlds',{style,framing,variant:3}),b=generateCover('Pocket Worlds',{style,framing,variant:3,rgb:false});
    assert.equal(b.pixels,null);
    assert.deepEqual(b.indices,a.indices,`${style}/${framing}`);
    assert.deepEqual({...b,pixels:a.pixels},a,`${style}/${framing}: only pixels differ`);
  }
  for(const rgb of ['yes',0,1,null])assert.throws(()=>generateCover('Test',{rgb}),/rgb/);
  const image={data:new Uint8ClampedArray(128*128*4)},canvas={getContext:()=>({createImageData:()=>image,putImageData(){}})};
  const cover=drawCover(canvas,'Pocket Worlds',{style:'planets',rgb:false});
  assert.ok(cover.pixels instanceof Uint32Array);
  assert.equal(canvas.width,128);
  assert.equal((image.data[0]<<16)|(image.data[1]<<8)|image.data[2],cover.pixels[0]);
});

test('measure-sink bounds equal subjectBounds of a real render for recorded fixtures',()=>{
  assert.ok(fixtures.length>=20);
  for(const {name,drawing} of fixtures){
    // The placement probe: 256x256 padded surface, effects off.
    const probe={left:256,top:256,right:-1,bottom:-1},pixels=new Uint8Array(256*256).fill(TRANSPARENT);
    drawing.draw(viewport(raster(null,256,{pixelArt:true,effects:false,bounds:probe}),{x:64,y:64}));
    drawing.draw(viewport(raster(pixels,256,{pixelArt:true,effects:false}),{x:64,y:64}));
    const real=subjectBounds(pixels,256);
    assert.ok(real,`${name} draws something`);
    assert.deepEqual({...probe},real,`${name}: probe`);
    // A final-size render with every group effect also reports its own bounds.
    for(const frame of [{x:0,y:0,scale:1},{x:9.5,y:31.25,scale:.63},{x:-3,y:20,scale:.81}]){
      const layer=new Uint8Array(128*128).fill(TRANSPARENT),bounds={left:128,top:128,right:-1,bottom:-1};
      drawing.draw(viewport(raster(layer,128,{pixelArt:true,bounds}),frame));
      const expected=subjectBounds(layer);
      assert.deepEqual(bounds.right<0?null:{...bounds},expected,`${name}: final ${JSON.stringify(frame)}`);
    }
  }
});

test('an effects:false group equals an effects:true group without effect options',()=>{
  const draw=p=>{
    p.rect(10,10,30,20,6);p.ellipse(40,40,12,8,5,.3);
    p.group(q=>{q.poly([[50,50],[90,52],[70,90]],7);q.line(52,88,96,60,4,2);q.detail(100,100,8,'probe beacon');
      q.group(s=>{s.sample(60,20,20,20,(x,y)=>(x+y)%3<1?9:null);s.ring(80,30,9,6,10,2);});},{});
    p.group(q=>{q.round(20,70,30,20,5,11);q.pipe([[20,100],[60,100],[60,120]],3,5);},{outline:0,color:5,exteriorOnly:true});
  };
  const run=(effects,scene,frame)=>{
    const target=new Uint8Array(128*128).fill(TRANSPARENT),selection=new Uint8Array(128*128),intent=new Map();
    scene(viewport(raster(target,128,{pixelArt:true,effects,selection,intent}),frame));
    return {target,selection,intent:[...intent]};
  };
  for(const frame of [{x:0,y:0,scale:1},{x:5.5,y:3,scale:.73}])
    assert.deepEqual(run(true,draw,frame),run(false,draw,frame),'synthetic groups');
  for(const {name,drawing} of fixtures){
    const frame={x:7.25,y:28,scale:.7};
    const withEffects=run(true,p=>drawing.draw(plain(p)),frame),without=run(false,p=>drawing.draw(p),frame);
    assert.deepEqual(withEffects,without,name);
  }
});

test('Phase-0 aliases are the frozen engine-18 functions',()=>{
  assert.equal(createPalette,legacyPalette);
  assert.equal(titleLayout,legacyTitleLayout);
  assert.equal(drawTitle,legacyDrawTitle);
  for(const title of ['A','POCKET WORLDS','MOSS & MAGIC','THE LAST TOWER OF DOOM','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345']){
    const legacy=legacyTitleLayout(title),layout=layoutTitle(title,{compat:true,style:'spaceships'}),{bottom}=legacy;
    assert.deepEqual({lines:layout.lines,font:layout.font,top:layout.top,lineHeight:layout.lineHeight,bottom:layout.bottom},
      {lines:legacy.lines,font:legacy.font,top:legacy.top,lineHeight:legacy.lineHeight,bottom});
    assert.deepEqual({gap:layout.gap,depth:layout.depth,bold:layout.bold,extent:layout.extent,areaTop:layout.areaTop,roomTop:layout.roomTop,classicTop:layout.classicTop},
      {gap:3,depth:0,bold:false,extent:bottom,areaTop:bottom+6,roomTop:bottom+4,classicTop:bottom+5});
    const art=prepareTitle(layout,{compat:true}),a=new Uint8Array(128*128),b=new Uint8Array(128*128);
    assert.equal(art.footprint,null);assert.equal(art.calm,null);assert.equal(art.extent,bottom);
    art.paint(raster(a,128,{pixelArt:true}),a);legacyDrawTitle(raster(b,128,{pixelArt:true}),legacy);
    assert.deepEqual(a,b,title);
  }
});

test('the engine-19 skeleton adds titleExtent, look and diagnostic provenance only',()=>{
  const kinds=new Set(Object.values(PROVENANCE));
  for(const style of ids)for(const framing of ['varied','classic']){
    const cover=generateCover('Star Patrol',{style,framing,variant:5,diagnostics:true}),plainCover=generateCover('Star Patrol',{style,framing,variant:5});
    const compat=style==='mascot'&&framing==='classic';
    if(compat)assert.equal(cover.titleExtent,cover.titleBottom);
    else assert.ok(cover.titleExtent>=cover.titleBottom&&cover.titleExtent<=cover.titleBottom+5,'titleExtent is the stack footprint row');
    if(compat)assert.equal(cover.look,null,'the classic mascot has no engine-19 look');
    else assert.deepEqual(Object.keys(cover.look),['mood','tier','wildness','treatment','mainHue','bgHue','accentHue']);
    if(compat)assert.equal(cover.quality.titleMask,undefined);
    else assert.ok(cover.quality.titleMask instanceof Uint8Array&&cover.quality.titleMask.length===128*128,'E6 exposes the title footprint');
    assert.equal(plainCover.quality.provenance,undefined,'provenance is diagnostics-only');
    assert.deepEqual(plainCover.indices,cover.indices,'diagnostics never change pixels');
    if(style==='mascot'){assert.equal(cover.quality.provenance,undefined,'never for the legacy mascot');continue;}
    const {provenance,subjectLayer}=cover.quality;
    assert.ok(provenance instanceof Uint8Array&&provenance.length===128*128);
    for(let i=0;i<provenance.length;i++){
      assert.ok(provenance[i]===0||kinds.has(provenance[i]),`${style}: unknown kind ${provenance[i]}`);
      if(subjectLayer[i]!==TRANSPARENT)assert.ok(provenance[i]>0,`${style}/${framing}: subject pixel ${i} has no kind`);
    }
    for(const i of cover.indices)assert.ok(i!==DARKEN1&&i!==DARKEN2&&i<cover.palette.length);
  }
});

test('recipes receive look, lut and area; the composite resolves darken markers',()=>{
  let args;
  const probe=createGenerator([{id:'args-probe',revision:1,background:'void',render(a){args=a;a.p.rect(30,40,40,30,6);return {};}}]);
  for(const title of ['A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345']){
    const cover=probe.generateCover(title,{variant:2}),bottom=cover.titleBottom;
    assert.equal(args.look,cover.look,'recipes receive look.summary');assert.equal(typeof args.look.mood,'string');
    assert.equal(args.lut.darker,DARKER);assert.equal(args.lut.lighter,LIGHTER);
    assert.deepEqual(args.area,{x:4,y:bottom+6,width:120,height:117-bottom});
    assert.equal(args.layout.areaTop,bottom+6);
  }
  const marked=marker=>createGenerator([{id:'marker-probe',revision:1,background:'void',coordinateSpace:'cover',render({p}){
    p.rect(40,64,30,20,6);if(marker)p.rect(70,64,8,20,marker);return {};
  }}]);
  for(let variant=0;variant<6;variant++){
    const base=marked(null).generateCover('Marker Study',{variant,framing:'classic'});
    for(const [marker,steps] of [[DARKEN1,1],[DARKEN2,2]]){
      const cover=marked(marker).generateCover('Marker Study',{variant,framing:'classic',diagnostics:true});
      let darkened=0;
      for(let i=0;i<cover.indices.length;i++){
        const x=i%128,y=Math.floor(i/128),inMarker=x>=70&&x<78&&y>=64&&y<84;
        let expected=base.indices[i];if(inMarker)for(let s=0;s<steps;s++)expected=DARKER[expected];
        assert.equal(cover.indices[i],expected,`marker ${marker} at ${x},${y}`);
        if(inMarker)darkened++;
      }
      assert.equal(darkened,160);
      assert.equal(cover.quality.removedDetachedPixels,0);
    }
  }
});

// Verbatim engine-18 chooseComposition, the reference for recipe metadata.
function engine18Composition(r,style) {
  const choice={size:.62+r(39)/100,horizontal:r(1001)/1000,vertical:r(1001)/1000};
  if(style==='heraldry'||style==='glyphs')choice.horizontal=.5;
  if(style==='dungeons')choice.size=.88+(choice.size-.62)/.38*.12;
  if(style==='buildings'){choice.size=.80+(choice.size-.62)/.38*.20;choice.vertical=.45+choice.vertical*.55;}
  if(style==='islands')choice.size=.72+(choice.size-.62)/.38*.28;
  return choice;
}

test('composition metadata reproduces the engine-18 style rules for every possible draw',()=>{
  // Every value r(39) and r(1001) can return, with the camera draw r(10000)
  // at each standard/vista/thirds boundary, through the recipe metadata and
  // through the fallback table a recipe without metadata uses. The standard
  // camera keeps the engine-18 rules. Styles without their own size range use
  // the engine-19 standard range [.70,1]; the mascot keeps the raw draw.
  const ownSize=['mascot','dungeons','buildings','islands'];
  for(const id of [...ids,'probe']){
    const recipe=recipes[id]??{id};
    const {composition,...old}=recipe;
    for(let s=0;s<39;s++)for(let v=0;v<1001;v+=v<990?7:1)for(const k of [0,6999,7000,7446,7447,8139,8140,8510,8511,8599,8600,9999]){
      const draws=()=>{const values=[s,1000-v,v,k];return n=>values.shift()%n;};
      const choice=chooseComposition(draws(),id,{recipe});
      assert.deepEqual(chooseComposition(draws(),id,{recipe:old}),choice,`${id} fallback ${s}/${v}/${k}`);
      assert.deepEqual(chooseComposition(draws(),id),choice,`${id} no recipe ${s}/${v}/${k}`);
      if(id==='heraldry'||id==='glyphs')assert.equal(choice.camera,'standard',`${id} is centred`);
      if(id==='dungeons'||id==='mascot')assert.equal(choice.camera,'standard',`${id} keeps the standard camera`);
      if(choice.camera!=='standard')continue;
      const expected=engine18Composition(draws(),id);
      if(!ownSize.includes(id))expected.size=.70+(.62+s/100-.62)/.38*.3;
      assert.deepEqual({size:choice.size,horizontal:choice.horizontal,vertical:choice.vertical},expected,`${id} ${s}/${v}/${k}`);
    }
  }
  assert.equal(compositionMeta('dungeons',recipes.dungeons).room,true);
  assert.equal(compositionMeta('dungeons',{id:'dungeons'}).room,true);
  assert.deepEqual(compositionMeta('heraldry',{id:'heraldry',composition:{}}),{},'declared metadata replaces the table');
  assert.deepEqual(compositionMeta('probe',{id:'probe'}),{});
});

test('recipe adjustPlacement hooks match the engine-18 size remaps',()=>{
  const cases=[['spaceships',{detailLevel:'simple'}],['spaceships',{detailLevel:'medium'}],['spaceships',{detailLevel:'full'}],
    ['vehicles',{archetype:'crawler tank'}],['vehicles',{archetype:'cars'}],['planets',{detailLevel:'simple'}]];
  for(const [id,traits] of cases)for(let s=0;s<39;s++){
    const size=.62+s/100,placement=()=>({size,horizontal:.3,vertical:.6});
    const expected=placement();
    if(id==='spaceships'){const t=Math.max(0,Math.min(1,(size-.62)/.38));if(traits.detailLevel==='simple')expected.size=.28+t*.50;else if(traits.detailLevel==='medium')expected.size=.45+t*.50;}
    if(id==='vehicles'&&traits.archetype==='crawler tank')expected.size=.48+(size-.62)/.38*.52;
    const {adjustPlacement:hook,...old}=recipes[id];
    assert.deepEqual(adjustPlacement(placement(),id,traits,recipes[id]),expected,`${id} hook`);
    assert.deepEqual(adjustPlacement(placement(),id,traits,old),expected,`${id} fallback`);
    assert.deepEqual(adjustPlacement(placement(),id,traits,{...recipes[id],adjustPlacement:null}),placement(),`${id} opt-out`);
  }
  assert.equal(adjustPlacement(null,'spaceships',{detailLevel:'simple'},recipes.spaceships),null,'classic framing has no placement');
  // A trimmed recipe object without the new metadata draws the same covers.
  // Buildings' own adjustPlacement now centres the subject (user note), so it is not an engine-18 remap.
  for(const id of ['spaceships','vehicles','dungeons','islands','heraldry']){
    const {composition,adjustPlacement:hook,...old}=recipes[id];
    const current=createGenerator([recipes[id]]),previous=createGenerator([old]);
    for(let variant=0;variant<4;variant++)
      assert.deepEqual(previous.generateCover('Old Recipe',{variant}),current.generateCover('Old Recipe',{variant}),`${id} ${variant}`);
  }
});

test('mapTraits maps recipe-space light traits into screen space without aliasing',()=>{
  const traits={focal:[10,20],emitters:[{x:4,y:8,r:6,steps:2},{x:'bad'}],lamp:{x:2,y:2},
    beams:[{x:0,y:10,dx:1,dy:-2,spread:.3,length:40}],heading:[1,0],aura:{rings:2,steps:1},grounded:true,
    groundShadows:[{kind:'ellipse',x:50,y:90,rx:20,ry:4,core:2,rim:1},{kind:'poly',points:[[0,0],[10,0],[10,10]],steps:1},
      {kind:'project',groundY:100,shear:[.5,.25],steps:1},{kind:'line',x0:10,x1:30,y:96},{kind:'unknown'}],archetype:'probe'};
  const before=JSON.stringify(traits),screen=mapTraits(traits,{x:10,y:30,scale:.5});
  assert.deepEqual(screen,{focal:[15,40],emitters:[{x:12,y:34,r:3,steps:2}],lamp:{x:11,y:31},
    beams:[{x:10,y:35,dx:1,dy:-2,spread:.3,length:20}],heading:[1,0],aura:{rings:2,steps:1},grounded:true,
    groundShadows:[{kind:'ellipse',x:35,y:75,rx:10,ry:2,core:2,rim:1},{kind:'poly',points:[[10,30],[15,30],[15,35]],steps:1},
      {kind:'project',groundY:80,shear:[.5,.25],steps:1},{kind:'line',x0:15,x1:25,y:78}]});
  assert.equal(JSON.stringify(traits),before,'traits are never modified');
  assert.notEqual(screen.heading,traits.heading);assert.notEqual(screen.aura,traits.aura);
  assert.deepEqual(mapTraits({aura:'halo',focal:[1],heading:'left'},{x:0,y:0,scale:1}),{},'malformed keys are skipped');
});

test('roles, look and pass stubs hold their Phase-0 contract',()=>{
  assert.equal(DARKER.length,15);assert.equal(LIGHTER.length,15);
  assert.equal(Object.values(ROLE).length,15);assert.ok(Object.values(ROLE).every(i=>i>=0&&i<15),'no rainbow role');
  assert.deepEqual([DARKEN1,DARKEN2],[254,253]);
  assert.deepEqual([...BACKGROUND_ROLES],[0,1,2,3,9]);
  // Background chain, dark to light: 4 -> 0 -> 1 -> 3 -> 2 -> 9.
  const chain=[4,0,1,3,2,9];
  for(let i=1;i<chain.length;i++){assert.equal(LIGHTER[chain[i-1]],chain[i]);assert.equal(DARKER[chain[i]],chain[i-1]);}
  for(let c=0;c<15;c++)if(c!==8&&c!==12)assert.ok(LIGHTER[c]!==8&&LIGHTER[c]!==12,`LIGHTER[${c}]`);
  for(const seedKey of ['pocket-cover:planets:4:A','pocket-cover:relics:4:Moss & Magic 3']){
    const look=chooseLook({r:random(1),seedKey,legacy:false,style:'planets'});
    assert.equal(look.palette.length,15);assert.equal(typeof look.summary.mood,'string');
    assert.deepEqual(chooseLook({r:random(2),seedKey,legacy:false,style:'planets'}).palette,look.palette,'the look never reads r');
  }
  const r1=random(7),r2=random(7);
  assert.deepEqual(chooseLook({r:r1,seedKey:'x',legacy:true,compat:true}).palette,legacyPalette(r2),'the classic mascot palette draws from r');
  assert.equal(r1(1000),r2(1000));
  const r3=random(7),r4=random(7);chooseLook({r:r3,seedKey:'x',legacy:true,compat:false});legacyPalette(r4);
  assert.equal(r3(1000),r4(1000),'the varied mascot still draws and discards the legacy palette');
  assert.deepEqual(chooseWildness(),{tier:0,wildness:0});
  const a=createVariation('seed'),b=createVariation('seed',{wildness:.9,cycleSeed:'pocket-cover:x',index:7});
  for(let i=0;i<20;i++)assert.equal(b.integer('n'+i,0,999),a.integer('n'+i,0,999));
  assert.equal(b.range('w',.2,.8),a.range('w',.2,.8));
  for(const pass of [renderStage,framePass,renderDepth,renderForeground]){
    const indices=new Uint8Array(128*128).fill(3),copy=indices.slice();
    assert.equal(pass({indices,palette:createPalette(random(3)),lut:{darker:DARKER,lighter:LIGHTER}}),undefined);
    // E7: framePass darkens rows/columns 0-1 and 126-127 (tests/stage.test.js); everything else stays.
    for(let i=0;i<indices.length;i++){const x=i%128,y=i>>7;if(pass!==framePass||Math.min(x,y,127-x,127-y)>1)assert.equal(indices[i],copy[i]);}
  }
});
