import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerator,mapTraits} from '../src/engine.js';
import {CAMERAS,CAMERA_SIZES,CAMERA_WEIGHTS,FIT_SCALES,INSTALL_BAR_Y,MIN_SUBJECT_PX,VISTA_FOOT,VISTA_SPAN,adjustPlacement,cameraWeights,chooseComposition,
  compositionMeta,fitComposition,installVertical,placeSubject,subjectBounds} from '../src/composition.js';
import {hash,random} from '../src/random.js';
import {createVariation,dealTier} from '../src/variation.js';
import {recordDrawing} from '../src/drawing.js';
import {layoutTitle} from '../src/title.js';
import {createPalette} from '../src/palette.js';
import {DARKER,LIGHTER} from '../src/roles.js';
import {TRANSPARENT} from '../src/quality.js';
import {filterStyles} from './_lib/styles.js';

const ids=['spaceships','machines','relics','plants','islands','buildings','vehicles','planets','heraldry','glyphs','dungeons'];
const recipes=Object.fromEntries(await Promise.all([...ids,'mascot'].map(async id=>[id,(await import(`../src/recipes/${id}.js`)).default])));
const CENTERED=['heraldry','glyphs'],ROOM=['dungeons'];
const inRange=(v,[lo,hi])=>v>=lo-1e-12&&v<=hi+1e-12;

// The engine's composition stream for a cover, and the wildness the look deals it.
function engineChoice(style,title,variant) {
  const recipe=recipes[style]??{id:style,revision:1},seedTitle=variant?title+' '+variant:title;
  const seedKey=`pocket-cover:${style}:${recipe.revision}:${seedTitle}`;
  const {wildness}=dealTier('pocket-cover:'+style+':'+recipe.revision+':'+title,variant);
  return {choice:chooseComposition(random(hash(seedKey+':composition')),style,{recipe:recipes[style]??null,look:{wildness}}),wildness};
}

test('camera frequencies over 2000 seeds follow the 70/10/14 weights, boosted by wildness',()=>{
  const n=2000;
  for(const [label,wildness] of [['canonical',0],['showcase',.9]]){
    const counts={standard:0,vista:0,thirds:0};
    for(let i=0;i<n;i++)counts[chooseComposition(random(hash('camera-frequency:'+i)),'probe',{look:{wildness}}).camera]++;
    const f=1+1.5*wildness,total=70+24*f;
    for(const [camera,w] of [['standard',70],['vista',10*f],['thirds',14*f]]){
      const p=w/total,sd=Math.sqrt(p*(1-p)/n);
      assert.ok(Math.abs(counts[camera]/n-p)<4*sd,`${label} ${camera}: ${counts[camera]}/${n} vs ${p.toFixed(3)}`);
    }
  }
  // Through the engine's own seed path and the dealt 5/4/2/1 tier deck.
  for(const style of ['spaceships','heraldry','dungeons','buildings']){
    const counts={standard:0,vista:0,thirds:0},expected={standard:0,vista:0,thirds:0};
    const meta=compositionMeta(style,recipes[style]);
    for(let variant=0;variant<n;variant++){
      const {choice,wildness}=engineChoice(style,'Star Patrol',variant);
      counts[choice.camera]++;
      const weights=cameraWeights(meta,wildness),total=weights.reduce((s,[,w])=>s+w,0);
      for(const [camera,w] of weights)expected[camera]+=w/total;
    }
    for(const camera of CAMERAS){
      const p=expected[camera]/n,sd=Math.sqrt(p*(1-p)/n);
      if(p===0)assert.equal(counts[camera],0,`${style} never uses ${camera}`);
      else assert.ok(Math.abs(counts[camera]/n-p)<4*sd+1e-9,`${style} ${camera}: ${counts[camera]}/${n} vs ${p.toFixed(3)}`);
    }
    // A small crest or rune in an unchanged frame scene reads as a thumbnail,
    // so centred styles keep the standard camera, like rooms.
    if(CENTERED.includes(style))assert.equal(counts.standard,n,`${style}: centred styles keep the standard camera`);
    if(ROOM.includes(style))assert.equal(counts.standard,n,`${style}: rooms keep the standard camera`);
    if(!CENTERED.includes(style)&&!ROOM.includes(style))assert.ok(counts.vista>0&&counts.thirds>0,`${style} uses every camera`);
  }
  assert.deepEqual({...CAMERA_WEIGHTS},{standard:70,vista:10,thirds:14});
  assert.deepEqual(Object.fromEntries(CAMERAS.map(c=>[c,[...CAMERA_SIZES[c]]])),{standard:[.70,1],vista:[.60,.78],thirds:[.66,.86]});
  assert.deepEqual(cameraWeights({},.5),[['standard',70],['vista',10*1.75],['thirds',14*1.75]]);
  assert.deepEqual(cameraWeights({centered:true},0),[['standard',70],['vista',0],['thirds',0]]);
  assert.deepEqual(cameraWeights({centered:true,cameras:{standard:5,vista:9,thirds:9}},1),[['standard',5],['vista',0],['thirds',0]]);
  assert.deepEqual(cameraWeights({room:true},1),[['standard',70],['vista',0],['thirds',0]]);
});

test('chooseComposition keeps the engine-18 draws first and maps size and position per camera',()=>{
  for(let i=0;i<3000;i++){
    const seed='camera-choice:'+i,r=random(hash(seed));
    const raw=.62+r(39)/100,h=r(1001)/1000,v=r(1001)/1000,k=r(10000);
    for(const style of ['probe',...ids,'mascot']){
      const choice=chooseComposition(random(hash(seed)),style,{recipe:recipes[style]??null,look:{wildness:(i%4)/3}});
      const meta=compositionMeta(style,recipes[style]);
      assert.deepEqual(Object.keys(choice),['size','horizontal','vertical','sizeT','camera','fit']);
      assert.ok(CAMERAS.includes(choice.camera));
      assert.equal(choice.sizeT,(raw-.62)/.38);
      assert.equal(choice.fit,meta.fit??'scale');
      if(style==='mascot'){
        // The mascot frames itself; its varied choice is engine 18 exactly.
        assert.deepEqual([choice.size,choice.horizontal,choice.vertical,choice.camera],[raw,h,v,'standard']);
        continue;
      }
      const range=Array.isArray(meta.sizeRange)?meta.sizeRange:meta.sizeRange?.[choice.camera]??CAMERA_SIZES[choice.camera];
      assert.ok(inRange(choice.size,range),`${style} ${choice.camera} size ${choice.size}`);
      if(meta.centered)assert.equal(choice.horizontal,.5);
      else if(choice.camera==='thirds'){
        assert.equal(choice.horizontal,h<.5?.3*h:.85+.3*(h-.5));
        assert.ok(choice.horizontal<=.15||choice.horizontal>=.85,'thirds sits off centre');
      }else if(choice.camera==='vista'){
        // A vista subject never hides in a corner.
        assert.ok(Math.abs(choice.horizontal-lerp(VISTA_SPAN.horizontal,h))<1e-12);
        assert.ok(inRange(choice.horizontal,[.22,.78]),`vista horizontal ${choice.horizontal}`);
      }else assert.equal(choice.horizontal,h);
      if(meta.vertical)assert.ok(inRange(choice.vertical,meta.vertical));
      else if(choice.camera==='vista'){
        assert.ok(Math.abs(choice.vertical-lerp(VISTA_SPAN.vertical,v))<1e-12);
        assert.ok(inRange(choice.vertical,[.45,.8]),`vista vertical ${choice.vertical}`);
      }else assert.equal(choice.vertical,v);
      if(meta.centered||meta.room)assert.equal(choice.camera,'standard');
    }
    assert.ok(k>=0&&k<10000);
  }
  // Declared camera weights replace the defaults; exclusions still apply.
  const only=camera=>({composition:{cameras:{[camera]:1}}});
  for(let i=0;i<50;i++){
    assert.equal(chooseComposition(random(i),'x',{recipe:only('vista')}).camera,'vista');
    assert.equal(chooseComposition(random(i),'x',{recipe:only('thirds')}).camera,'thirds');
    assert.equal(chooseComposition(random(i),'x',{recipe:{composition:{centered:true,cameras:{thirds:1}}}}).camera,'standard');
    assert.equal(chooseComposition(random(i),'x',{recipe:{composition:{centered:true,cameras:{vista:1}}}}).camera,'standard');
  }
});

test('adjustPlacement: traits.sizeRange per camera, and the legacy remaps scaled and clamped into each camera range',()=>{
  for(let s=0;s<39;s++){
    const sizeT=s/38,make=camera=>({size:lerp(CAMERA_SIZES[camera],sizeT),horizontal:.4,vertical:.6,sizeT,camera,fit:'scale'});
    for(const camera of CAMERAS){
      const own=adjustPlacement(make(camera),'spaceships',{detailLevel:'simple',sizeRange:{[camera]:[.3,.5]}},recipes.spaceships);
      assert.ok(Math.abs(own.size-(.3+sizeT*.2))<1e-12,'traits.sizeRange wins over the remap');
      const all=adjustPlacement(make(camera),'planets',{sizeRange:[.2,.4]},recipes.planets);
      assert.ok(Math.abs(all.size-(.2+sizeT*.2))<1e-12,'an array range applies to every camera');
      // A remapped size scales by the camera's top end and never leaves the
      // camera's range: a remap cannot shrink a ship below the camera floor.
      const [lo0,hi0]=CAMERA_SIZES[camera];
      for(const [style,traits,lo,span] of [['spaceships',{detailLevel:'simple'},.28,.5],['spaceships',{detailLevel:'medium'},.45,.5],['vehicles',{archetype:'crawler tank'},.48,.52]]){
        for(const recipe of [recipes[style],(({adjustPlacement:_,...old})=>old)(recipes[style])]){
          const placed=adjustPlacement(make(camera),style,traits,recipe);
          const expected=Math.max(lo0,Math.min(hi0,(lo+sizeT*span)*hi0));
          assert.ok(Math.abs(placed.size-expected)<1e-9,`${style} ${camera} ${s}: ${placed.size}`);
          assert.ok(inRange(placed.size,CAMERA_SIZES[camera]),`${style} ${camera}: remap inside the camera range`);
          assert.equal(placed.camera,camera);assert.equal(placed.horizontal,.4);
        }
      }
      const full=make(camera);
      assert.equal(adjustPlacement(make(camera),'spaceships',{detailLevel:'full'},recipes.spaceships).size,full.size,'no remap keeps the camera size');
      // sizeRange:false keeps the hook's own size; a declared range clamps it.
      const tiny={adjustPlacement(p){p.size=.3;}};
      assert.equal(adjustPlacement(make(camera),'x',{},{...tiny,composition:{sizeRange:false}}).size,.3);
      assert.equal(adjustPlacement(make(camera),'x',{},{...tiny,composition:{sizeRange:[.5,.9]}}).size,.5);
    }
  }
});
function lerp([lo,hi],t){return lo+t*Math.round((hi-lo)*1e9)/1e9;}

test('fitComposition: translate and quantized fits give integer frames at exact scales',()=>{
  const area={x:4,y:30,width:120,height:93};
  for(let i=0;i<500;i++){
    const r=random(hash('fit:'+i)),bounds={x:r(40)-20,y:r(40)-20,width:10+r(130),height:10+r(100)};
    const choice={size:.48+r(53)/100,horizontal:r(1001)/1000,vertical:r(1001)/1000};
    const most=Math.min(area.width/bounds.width,area.height/bounds.height),fitted=most*choice.size;
    const scaled=fitComposition(bounds,area,choice);
    assert.deepEqual(scaled,fitComposition(bounds,area,{...choice,fit:'scale'}));
    for(const fit of ['translate','quantized']){
      const frame=fitComposition(bounds,area,choice,{fit});
      assert.ok(Number.isInteger(frame.x)&&Number.isInteger(frame.y),`${fit} frame ${JSON.stringify(frame)}`);
      const expected=fit==='translate'?(most>=1?1:FIT_SCALES.find(q=>q<=most)??fitted):FIT_SCALES.find(q=>q<=fitted)??fitted;
      assert.equal(frame.scale,expected,`${fit} scale`);
      if(frame.scale<=most){
        assert.ok(frame.x+bounds.x*frame.scale>=area.x-.5&&frame.x+(bounds.x+bounds.width)*frame.scale<=area.x+area.width+.5);
        assert.ok(frame.y+bounds.y*frame.scale>=area.y-.5&&frame.y+(bounds.y+bounds.height)*frame.scale<=area.y+area.height+.5);
      }
    }
    assert.deepEqual(fitComposition(bounds,area,{...choice,fit:'translate'}),fitComposition(bounds,area,choice,{fit:'translate'}),'choice.fit is the default');
  }
  assert.throws(()=>fitComposition({x:0,y:0,width:10,height:10},area,{size:1,horizontal:0,vertical:0},{fit:'crop'}),/fit/);
});

// Cover-level probes: a pixel-exact rectangle sprite and a small subject.
const sprite=fit=>createGenerator([{id:'sprite-probe',revision:1,background:'void',composition:{fit},render({p}){
  p.rect(10,10,40,24,6);p.rect(14,14,4,4,7);p.detail(30,8,10,'antenna light');p.rect(20,34,20,3,5);return {};
}}]);

test('translate and quantized fits place a pixel-exact subject on an integer frame',()=>{
  for(const fit of ['translate','quantized'])for(const title of ['A','Moss & Magic','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<40;variant++){
    const cover=sprite(fit).generateCover(title,{variant,diagnostics:true}),{x,y,scale}=cover.composition;
    assert.ok(Number.isInteger(x)&&Number.isInteger(y),`${fit} ${title} ${variant}: ${x},${y}`);
    assert.ok(FIT_SCALES.includes(scale),`${fit} scale ${scale}`);
    if(fit==='translate')assert.equal(scale,1);
    const layer=cover.quality.subjectLayer,b=subjectBounds(layer);
    assert.ok(b.left>=4&&b.right<124&&b.top>=cover.titleBottom+6&&b.bottom<123,`${fit}: margins ${JSON.stringify(b)}`);
    if(scale===1){
      // Every recipe pixel lands on exactly one device pixel.
      assert.equal(layer[(y+10)*128+x+10],6);assert.equal(layer[(y+14)*128+x+14],7);assert.equal(layer[(y+17)*128+x+17],7);
      assert.equal(layer[(y+18)*128+x+18],6);assert.equal(layer[(y+8)*128+x+30],10);
      assert.deepEqual(b,{left:x+10,top:y+8,right:x+49,bottom:y+36});
    }
  }
});

test('centred styles keep the standard camera and stay centred within .5 px',()=>{
  for(const style of filterStyles(CENTERED)){
    const generator=createGenerator([recipes[style]]),seen=new Set();
    for(const title of ['Star Patrol','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<48;variant++){
      const cover=generator.generateCover(title,{variant}),{left,right}=cover.quality.bounds;
      seen.add(cover.composition.camera);
      assert.equal(cover.composition.camera,'standard',`${style} ${title} ${variant}`);
      assert.ok(Math.abs((left+right)/2-63.5)<=.5,`${style} ${title} ${variant}: centre ${(left+right)/2}`);
    }
    assert.deepEqual([...seen],['standard'],`${style}: cameras ${[...seen]}`);
  }
});

// The title area's top, as the engine computes it from the layout fields.
const areaTopOf=cover=>Math.max(cover.titleBottom+6,cover.titleExtent+3);

test('no placed subject is a lump: the longest side reaches MIN_SUBJECT_PX unless the area cannot hold it',()=>{
  for(const style of filterStyles(ids.filter(id=>!ROOM.includes(id)))){
    const generator=createGenerator([recipes[style]]);
    for(const title of ['Star Patrol','Moss & Magic','The Last Tower Of Doom'])for(let variant=0;variant<24;variant++){
      const cover=generator.generateCover(title,{variant}),{left,top,right,bottom}=cover.quality.bounds;
      const longest=Math.max(right-left+1,bottom-top+1);
      assert.ok(longest>=MIN_SUBJECT_PX-1||cover.composition.size===1,`${style} ${title} ${variant}: ${longest}px (${cover.composition.camera} ${cover.composition.size})`);
    }
  }
  // A recipe that asks for a tiny size is lifted to the floor, and the
  // placement records the size used. Margins still hold.
  const small=createGenerator([{id:'small-probe',revision:1,background:'void',render({p}){
    p.rect(40,40,30,20,6);p.rect(44,44,6,6,7);return {sizeRange:[.2,.3]};
  }}]);
  for(const title of ['A','Moss & Magic','The Last Tower Of Doom'])for(let variant=0;variant<24;variant++){
    const cover=small.generateCover(title,{variant}),b=cover.quality.bounds,longest=Math.max(b.right-b.left+1,b.bottom-b.top+1);
    assert.ok(longest>=MIN_SUBJECT_PX-1&&longest<=MIN_SUBJECT_PX+2,`small probe ${title} ${variant}: ${longest}px`);
    assert.ok(cover.composition.size>.3&&cover.composition.size<=1,'the recorded size is the lifted one');
    assert.ok(b.left>=4&&b.right<124&&b.top>=cover.titleBottom+6&&b.bottom<123,`small probe margins ${JSON.stringify(b)}`);
  }
});

test('vista keeps a subject off the corners and its whole body above the install bar',()=>{
  let vistas=0;
  for(const style of filterStyles(ids.filter(id=>!ROOM.includes(id)&&!CENTERED.includes(id)))){
    const generator=createGenerator([recipes[style]]);
    for(const title of ['Star Patrol','A','The Last Tower Of Doom'])for(let variant=0;variant<48;variant++){
      const cover=generator.generateCover(title,{variant});
      if(cover.composition.camera!=='vista')continue;
      vistas++;
      const {top,bottom}=cover.quality.bounds;
      // The title margin wins when a subject is too tall for both.
      assert.ok(bottom<=INSTALL_BAR_Y+VISTA_FOOT||top<=areaTopOf(cover)+1,`${style} ${title} ${variant}: vista bottom ${bottom}, top ${top}`);
      assert.ok(inRange(cover.composition.horizontal,VISTA_SPAN.horizontal));
    }
  }
  if(filterStyles(ids).length===ids.length)assert.ok(vistas>=40,`vista exercised (${vistas})`);
  // A tall probe with a plinth: the plinth clears the bar too.
  const plinth=createGenerator([{id:'plinth-probe',revision:1,background:'void',composition:{cameras:{vista:1}},render({p}){
    p.rect(52,20,24,60,6);p.rect(44,80,40,8,5);return {};
  }}]);
  for(const title of ['A','Moss & Magic'])for(let variant=0;variant<32;variant++){
    const cover=plinth.generateCover(title,{variant}),{top,bottom}=cover.quality.bounds;
    assert.equal(cover.composition.camera,'vista');
    assert.ok(bottom<=INSTALL_BAR_Y+VISTA_FOOT||top<=areaTopOf(cover)+1,`plinth ${title} ${variant}: ${bottom}`);
  }
});

test('the measured focal point stays clear of the install bar for every non-room cover',()=>{
  for(const style of filterStyles(ids.filter(id=>!ROOM.includes(id)))){
    const generator=createGenerator([recipes[style]]);
    for(const title of ['Star Patrol','A'])for(let variant=0;variant<24;variant++){
      const cover=generator.generateCover(title,{variant}),{top,bottom}=cover.quality.bounds;
      const focal=mapTraits(cover.traits,cover.composition).focal,y=focal?focal[1]:(top+bottom)/2;
      assert.ok(y<=INSTALL_BAR_Y+1.5,`${style} ${title} ${variant}: focal row ${y} (${cover.composition.camera})`);
      assert.ok(!('camera' in cover.traits),'the camera never enters traits');
      assert.ok(CAMERAS.includes(cover.composition.camera));
    }
  }
  // A wide, short subject (its fitted height stays small), with and without
  // a focal trait near its base.
  for(const focal of [null,[50,50]]){
    const generator=createGenerator([{id:'low-probe',revision:1,background:'void',render({p}){
      p.rect(0,40,100,12,6);return focal?{focal}:{};
    }}]);
    let clamped=0;
    for(const title of ['A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'])for(let variant=0;variant<64;variant++){
      const cover=generator.generateCover(title,{variant}),{top,bottom}=cover.quality.bounds;
      const y=focal?mapTraits(cover.traits,cover.composition).focal[1]:(top+bottom)/2;
      assert.ok(y<=INSTALL_BAR_Y+(focal?0:.5),`low probe ${title} ${variant}: ${y}`);
      assert.ok(top>=cover.titleBottom+6,'the title margin still holds');
      if(y>=INSTALL_BAR_Y-1)clamped++;
    }
    assert.ok(clamped>10,'the clamp is exercised');
  }
  assert.equal(installVertical(1,{y:40,height:83},20),(104-10-40)/63);
  assert.equal(installVertical(.2,{y:40,height:83},20),.2);
  assert.equal(installVertical(.9,{y:40,height:20},20),.9,'no free room leaves the vertical alone');
  assert.equal(installVertical(1,{y:100,height:23},10),0,'never above the area');
});

// Record a recipe's drawing the way the engine hands it a recorder.
function record(recipe,seed,layout) {
  const r=random(hash(seed)),pick=items=>items[r(items.length)];
  const setup=recipe.setup?.({r,pick})||{},drawing=recordDrawing();
  const traits=recipe.render({p:drawing.p,r,pick,variation:createVariation(seed+':parameters'),indices:new Uint8Array(128*128).fill(TRANSPARENT),
    layout,palette:createPalette(random(hash(seed+':palette'))),seedTitle:seed,setup,placement:null,look:null,
    lut:{darker:DARKER,lighter:LIGHTER},area:{x:4,y:layout.areaTop,width:120,height:123-layout.areaTop}})||{};
  return {drawing,traits};
}

test('moving the aligned subject equals drawing it again: pixels, provenance, intent order and frame',()=>{
  let moved=0,redrawn=0,still=0;
  for(const style of filterStyles(ids)){
    const recipe=recipes[style],room=!!compositionMeta(style,recipe).room;
    for(const [n,title] of ['POCKET WORLDS','A','MOSS & MAGIC','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345'].entries()){
      const layout=layoutTitle(title);
      const area=room?{x:2,y:layout.roomTop,width:124,height:126-layout.roomTop}:{x:4,y:layout.areaTop,width:120,height:123-layout.areaTop};
      for(let i=0;i<6;i++){
        const {drawing,traits}=record(recipe,`blit:${style}:${n}:${i}`,layout);
        for(let k=0;k<4;k++){
          const placement=chooseComposition(random(hash(`blit:${style}:${n}:${i}:${k}`)),style,{recipe,look:{wildness:k/3}});
          adjustPlacement(placement,style,traits,recipe);
          const run=blit=>{
            let draws=0;const counted={margins:drawing.margins,draw:t=>{draws++;drawing.draw(t);}};
            const layer=new Uint8Array(128*128),intent=new Map(),provenance=new Uint8Array(128*128),place={...placement};
            const frame=placeSubject({drawing:counted,placement:place,area,room,frame:{x:0,y:0,scale:1},layer,intent,provenance,traits,recipe,style,blit});
            return {draws,out:{frame,layer,provenance,intent:[...intent],vertical:place.vertical}};
          };
          const a=run(null),b=run(false);
          assert.deepEqual(a.out,b.out,`${style} ${title} ${i}/${k}`);
          assert.deepEqual(run(null).out,a.out,'deterministic');
          if(a.draws===2&&b.draws===3)moved++;else if(b.draws===3)redrawn++;else still++;
        }
      }
    }
  }
  if(filterStyles(ids).length===ids.length){
    assert.ok(moved>=150,`the pixel move path ran ${moved} times (redrawn ${redrawn}, no shift ${still})`);
    assert.ok(redrawn<moved,'most shifts move pixels instead of drawing again');
  }
});

test('covers are byte-identical whether the subject moves or is drawn again',()=>{
  for(const style of filterStyles(ids)){
    const recipe=recipes[style];
    const moving=createGenerator([recipe]),drawing=createGenerator([{...recipe,composition:{...compositionMeta(style,recipe),blit:false}}]);
    for(const title of ['Star Patrol','Moss & Magic'])for(let variant=0;variant<8;variant++){
      const a=moving.generateCover(title,{variant,diagnostics:true}),b=drawing.generateCover(title,{variant,diagnostics:true});
      assert.deepEqual(a,b,`${style} ${title} ${variant}`);
    }
  }
  // An intentional single pixel and its reason survive a move.
  const reason='separate calibration beacon';
  const probe=createGenerator([{id:'beacon-probe',revision:1,background:'void',render({p}){p.rect(48,48,18,17,6);p.detail(104,18,10,reason);return {};}}]);
  for(let variant=0;variant<40;variant++){
    const cover=probe.generateCover('Beacon Study',{variant,diagnostics:true}),[beacon]=cover.quality.afterCleanup.detached;
    assert.equal(beacon.reason,reason);assert.equal(cover.indices[beacon.y*128+beacon.x],10);
    assert.equal(cover.quality.removedDetachedPixels,0);
  }
});

test('the camera is recorded in the composition output, never in traits; classic framing has none',()=>{
  for(const style of filterStyles(ids)){
    const generator=createGenerator([recipes[style]]);
    for(let variant=0;variant<6;variant++){
      const varied=generator.generateCover('Camera Study',{variant}),classic=generator.generateCover('Camera Study',{variant,framing:'classic'});
      assert.ok(CAMERAS.includes(varied.composition.camera));
      assert.equal(varied.composition.fit,compositionMeta(style,recipes[style]).fit??'scale');
      assert.ok(Number.isFinite(varied.composition.sizeT));
      assert.equal(classic.composition,null);
      for(const cover of [varied,classic])assert.ok(!('camera' in cover.traits)&&!('sizeT' in cover.traits));
      assert.equal(varied.look.camera,undefined,'the look stays framing-independent');
    }
  }
});
