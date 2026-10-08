import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerator} from '../src/engine.js';
import {recordDrawing} from '../src/drawing.js';
import {raster,viewport} from '../src/raster.js';
import {subjectBounds} from '../src/composition.js';
import {createVariation} from '../src/variation.js';
import {BACKGROUND_ROLES} from '../src/roles.js';
import {TRANSPARENT} from '../src/quality.js';
import {ECHO,ECHO_INTERIORS,ECHO_PLACES,FOREGROUND,FOREGROUND_SHAPES,bladeRuns,bodyBox,echoPlan,echoSettings,foregroundPlan,openSky,renderDepth,renderForeground,rimLit} from '../src/depth.js';
import {MOTION,STREAK_COLORS,dilateSquare,motionPlan} from '../src/fx.js';
import {seamPixel,skyRows} from '../src/scenes/common.js';

const SIZE=128,N=SIZE*SIZE;
const ids=['mascot','spaceships','machines','relics','plants','islands','buildings','vehicles','planets','heraldry','glyphs','dungeons'];
const recipes=Object.fromEntries(await Promise.all(ids.map(async id=>[id,(await import(`../src/recipes/${id}.js`)).default])));
const BG=new Set(BACKGROUND_ROLES);

// A probe subject in recipe space: a hull, a cabin, fins and a 1 px mast,
// inside an outlined group, as recipes draw them.
function probeDrawing() {
  const drawing=recordDrawing(),p=drawing.p;
  p.group(q=>{
    q.poly([[64,14],[86,70],[64,62],[42,70]],6);
    q.rect(56,40,16,14,5);
    q.ellipse(64,34,6,8,7);
    q.poly([[42,70],[30,92],[50,80]],5);q.poly([[86,70],[98,92],[78,80]],5);
    q.line(64,4,64,14,7);
  },{outline:2,color:4});
  return drawing;
}
// A title-like calm band: rows 4-43 over columns 14-113.
const titleCalm=(x,y)=>y>=0&&y<=43&&x>=14&&x<=113;
function backdrop(seed,{horizon=90}={}) {
  const indices=new Uint8Array(N);
  for(let i=0;i<N;i++)indices[i]=(i>>7)<horizon?0:1;
  const r=createVariation('backdrop:'+seed);
  for(let k=0;k<14;k++)indices[r.integer('y'+k,46,88)*SIZE+r.integer('x'+k,2,125)]=r.integer('c'+k,0,1)?2:9;
  return indices;
}
// A synthetic hook context (engine-contract 1.2) around the probe subject.
function context({seed='depth-probe',style='spaceships',recipe={echo:{chance:1}},wildness=0,camera='vista',
  frame={x:58,y:52,scale:.42},heading=null,scenery={horizon:90,floor:110,foreground:'none'},indices=null,focal=null,drawing=probeDrawing()}={}) {
  const layer=new Uint8Array(N).fill(TRANSPARENT);
  drawing.draw(viewport(raster(layer,SIZE,{pixelArt:true}),frame));
  const screen={};
  if(heading)screen.heading=heading;
  if(focal)screen.focal=focal;
  indices??=backdrop(seed,{horizon:scenery.horizon??90});
  return {style,recipe,legacy:false,compat:false,look:{wildness},camera,frame,layer,drawing,bounds:subjectBounds(layer),screen,
    scenery:{...scenery},indices,screenRaster:raster(indices,SIZE,{pixelArt:true}),calm:titleCalm,
    layout:{bottom:40,extent:40},titleArt:{extent:40},traits:{archetype:'probe'},depthVariation:createVariation(seed+':depth',{wildness})};
}
const changed=(a,b)=>{const out=[];for(let i=0;i<N;i++)if(a[i]!==b[i])out.push(i);return out;};
const opaque=layer=>{const m=new Uint8Array(N);for(let i=0;i<N;i++)m[i]=layer[i]!==TRANSPARENT?1:0;return m;};

test('echo settings: style defaults, recipe overrides, opt-out and validation',()=>{
  for(const style of ['spaceships','vehicles','buildings','islands','plants','planets'])
    assert.deepEqual(echoSettings(style),{chance:.25,scale:[.18,.35],count:[1,3],place:ECHO_PLACES[style]});
  for(const style of ['mascot','machines','relics','heraldry','glyphs','dungeons'])assert.equal(echoSettings(style),null);
  assert.equal(echoSettings('spaceships',{echo:false}),null);
  assert.equal(echoSettings('glyphs',{echo:{place:'horizon'}}).chance,.25,'a declared echo on a style without a default gets .25');
  assert.deepEqual(echoSettings('vehicles',{echo:{chance:.5,count:[2,2]}}),{chance:.5,scale:[.18,.35],count:[2,2],place:'horizon'});
  for(const echo of [{chance:2},{scale:[.4,.2]},{count:[0,3]},{place:'hero'}])assert.throws(()=>echoSettings('spaceships',{echo}),/recipe.echo/);
  assert.equal(ECHO_PLACES.spaceships,'sky');assert.equal(ECHO_PLACES.vehicles,'horizon');
});

test('echoes and motion paint only background roles, never in calm, and keep clear of the subject',t=>{
  let echoes=0,streaks=0;
  for(let s=0;s<60;s++){
    const heading=[[0,-1],[1,0],[-1,0],[1,-1],[0,1]][s%5];
    const ctx=context({seed:'paint'+s,heading,wildness:[0,.2,.5,.9][s%4],frame:{x:[30,58,70][s%3],y:52+s%5,scale:.42+(s%4)*.04}});
    const before=ctx.indices.slice(),traits=JSON.stringify(ctx.traits);
    assert.equal(renderDepth(ctx),undefined);
    assert.equal(JSON.stringify(ctx.traits),traits,'depth never writes traits');
    const solid=opaque(ctx.layer),near=dilateSquare(solid,MOTION.clear-1),b=ctx.bounds;
    for(const i of changed(before,ctx.indices)){
      const x=i%SIZE,y=i>>7;
      assert.ok(BG.has(ctx.indices[i]),`index ${ctx.indices[i]} at ${x},${y} is not a background role`);
      assert.ok(!ctx.calm(x,y),`calm pixel ${x},${y} changed`);
      assert.ok(!near[i],`depth pixel ${x},${y} within 2 px of the silhouette`);
      assert.ok(x>=2&&y>=2&&x<=125&&y<=125,'off the frame rings');
    }
    const plan=ctx.depth;
    if(plan.echoes){
      echoes++;
      for(const e of plan.echoes.echoes){
        assert.ok(e.h>=ECHO.minHeight,'echoes are at least 10 px tall');
        assert.ok(e.color===ECHO.near||e.color===ECHO.far);
        const r=e.x+e.w-1,bt=e.y+e.h-1;
        assert.ok(r<b.left-ECHO.clear||e.x>b.right+ECHO.clear||bt<b.top-ECHO.clear||e.y>b.bottom+ECHO.clear,'echo overlaps the subject bounds + 4');
        assert.ok(e.y>=40+ECHO.title,'echoes stay below the title rows');
        assert.ok(e.scale>=.18-1e-9&&e.scale<=.35+1e-9);
      }
    }
    if(plan.motion){
      streaks++;
      const n=plan.motion.streaks.length;
      assert.ok(n>=1&&n<=MOTION.count[1]);
      const [dx,dy]=plan.motion.direction,[ux,uy]=plan.motion.heading;
      // Trailing: against the heading, 6-10 degrees off its axis, then snapped
      // by cleanVector (7.1 or 9.5 degrees on axis headings, up to 11.3 on
      // diagonals).
      const cos=-(dx*ux+dy*uy);
      assert.ok(cos>Math.cos(12*Math.PI/180)&&cos<Math.cos(5*Math.PI/180),`streak angle ${Math.acos(cos)*180/Math.PI}`);
      for(const st of plan.motion.streaks){
        const L=Math.hypot(st.end[0]-st.root[0],st.end[1]-st.root[1]);
        assert.ok(L>=MOTION.length[0]-1e-9&&L<=MOTION.length[1]+1e-9);
        assert.ok(st.r0>=1&&st.r0<=1.5&&st.r1===.3);
        for(const [x,y] of st.pixels)assert.ok(STREAK_COLORS.some(([c])=>c===ctx.indices[y*SIZE+x]),'streak colours 9 and 2');
      }
    }
  }
  t.diagnostic(`echoes ${echoes}/60, motion ${streaks}/60`);
  assert.ok(echoes>=30,`echoes placed in ${echoes}/60 probes`);
  assert.ok(streaks>=20,`motion drawn in ${streaks}/60 probes`);
});

test('echoes: none without room, for a tiny subject, or under 10 px; deterministic',()=>{
  // A full-width subject leaves no room on either side, above or below.
  const wall=recordDrawing();wall.p.group(q=>q.rect(4,50,120,60,6),{outline:1,color:4});
  for(let s=0;s<8;s++)assert.equal(echoPlan(context({seed:'wide'+s,drawing:wall,frame:{x:0,y:0,scale:1}})),null);
  // A subject so small that .35 of it is under 10 px.
  const tiny=context({seed:'tiny',frame:{x:58,y:60,scale:.2}});
  assert.ok(bodyBox(tiny).bottom-bodyBox(tiny).top+1<ECHO.minHeight/.35);
  assert.equal(echoPlan(tiny),null);
  // Off for styles without echoes, and with chance 0.
  assert.equal(echoPlan(context({style:'heraldry',recipe:{}})),null);
  assert.equal(echoPlan(context({recipe:{echo:{chance:0}}})),null);
  const a=context({seed:'same',heading:[0,-1]}),b=context({seed:'same',heading:[0,-1]});
  renderDepth(a);renderDepth(b);
  assert.deepEqual(a.indices,b.indices);
  assert.ok(a.depth.echoes,'the probe places an echo');
});

test('motion only with a heading and a separate subject layer; streaks stay 3 px clear',t=>{
  const none=context({seed:'still'});
  assert.equal(motionPlan(none),null);
  const legacyLike=context({seed:'legacy',heading:[0,-1]});legacyLike.layer=legacyLike.indices;
  assert.equal(motionPlan(legacyLike),null);
  assert.equal(motionPlan(context({seed:'zero',heading:[0,0]})),null);
  let drawn=0;
  for(let s=0;s<40;s++){
    const ctx=context({seed:'move'+s,heading:[1,-1],wildness:.9,recipe:{echo:false}});
    const plan=motionPlan(ctx);
    if(!plan)continue;
    drawn++;
    const near=dilateSquare(opaque(ctx.layer),MOTION.clear-1),seen=new Set();
    for(const st of plan.streaks)for(const [x,y] of st.pixels){
      assert.ok(!near[y*SIZE+x]);assert.ok(!titleCalm(x,y));
      assert.ok(!seen.has(y*SIZE+x),'streaks never overlap');seen.add(y*SIZE+x);
    }
  }
  t.diagnostic(`motion ${drawn}/40`);
  assert.ok(drawn>=25,`chance .5 + .4w fires in ${drawn}/40`);
});

test('the foreground stays in its bands, at y >= 96, off the focal point, in ink with a role-1 rim',t=>{
  const counts={};
  for(const kind of Object.keys(FOREGROUND_SHAPES))for(let s=0;s<40;s++){
    // A lit backdrop (role 2) so the visibility rule never vetoes; the probe
    // subject composited on top, as the engine has done by step 13.
    const frame={x:[20,40,58][s%3],y:62,scale:.5+(s%3)*.08};
    const ctx=context({seed:kind+s,recipe:{foreground:{chance:1}},scenery:{horizon:90,floor:110,foreground:kind},
      indices:new Uint8Array(N).fill(2),frame,wildness:[0,.5][s%2]});
    // Every fourth probe puts the focal point in the left band, near the bottom.
    if(s%4===0)ctx.screen.focal=[ctx.bounds.left+3,122];
    for(let i=0;i<N;i++)if(ctx.layer[i]!==TRANSPARENT)ctx.indices[i]=ctx.layer[i];
    const before=ctx.indices.slice();
    renderForeground(ctx);
    const diff=changed(before,ctx.indices);
    if(!diff.length)continue;
    counts[kind]=(counts[kind]??0)+1;
    const body=bodyBox(ctx),w=body.right-body.left+1,left=Math.floor(body.left+.15*w),right=Math.ceil(body.right-.15*w);
    const focal=ctx.screen.focal?ctx.screen.focal.map(Math.round):[Math.round((body.left+body.right)/2),Math.round((body.top+body.bottom)/2)];
    const plan=foregroundPlan({...ctx,indices:before});
    assert.ok(plan,'the plan is pure: the same result from the same inputs');
    for(let i=0;i<N;i++){
      const x=i%SIZE,y=i>>7;
      if(!plan.mask[i])continue;
      assert.ok(y>=FOREGROUND.top,`foreground above y 96 at ${x},${y}`);
      assert.ok(x<=left||x>=right,`foreground at x ${x} outside the bands [0,${left}] and [${right},127]`);
      assert.ok(Math.max(Math.abs(x-focal[0]),Math.abs(y-focal[1]))>FOREGROUND.focal,'the focal point stays clear');
      assert.equal(ctx.indices[i],plan.mask[i]===2?FOREGROUND.rim:FOREGROUND.ink);
      // No specks: every pixel has a 4-neighbour in the shape.
      assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([u,t])=>{const xx=x+u,yy=y+t;return xx<0||xx>=SIZE||yy>=SIZE||(yy>=0&&plan.mask[yy*SIZE+xx]);}));
      // The rim faces the key light, on an up- or left-exposed pixel.
      if(plan.mask[i]===2)assert.ok(rimLit(plan.mask,i)&&((y>0&&!plan.mask[i-SIZE])||(x>0&&!plan.mask[i-1])));
    }
    for(const i of diff)assert.ok(plan.mask[i],'only the mask changes');
    // Cropped by the bottom edge: every 4-connected part reaches row 127.
    const seen=new Uint8Array(N);
    for(let i=0;i<N;i++)if(plan.mask[i]&&!seen[i]){
      let bottom=false;const queue=[i];seen[i]=1;
      while(queue.length){
        const j=queue.pop(),x=j%SIZE,y=j>>7;
        if(y===SIZE-1)bottom=true;
        for(const k of [x>0?j-1:-1,x<SIZE-1?j+1:-1,y>0?j-SIZE:-1,y<SIZE-1?j+SIZE:-1])if(k>=0&&plan.mask[k]&&!seen[k]){seen[k]=1;queue.push(k);}
      }
      assert.ok(bottom,`${kind} ${s}: a part floats above the bottom edge`);
    }
  }
  t.diagnostic(JSON.stringify(counts));
  for(const kind of Object.keys(FOREGROUND_SHAPES))assert.ok((counts[kind]??0)>=10,`${kind}: ${counts[kind]??0}/40 foregrounds`);
});

test('the foreground: off without a foreground scene, opted out, or on an unlit backdrop',()=>{
  const lit=()=>new Uint8Array(N).fill(2);
  assert.equal(foregroundPlan(context({scenery:{foreground:'none'},indices:lit(),recipe:{foreground:{chance:1}}})),null);
  assert.equal(foregroundPlan(context({scenery:{foreground:'rocks'},indices:lit(),recipe:{foreground:false}})),null);
  assert.equal(foregroundPlan(context({scenery:{foreground:'rocks'},indices:lit(),recipe:{foreground:{chance:0}}})),null);
  assert.throws(()=>foregroundPlan(context({scenery:{foreground:'rocks'},indices:lit(),recipe:{foreground:{chance:3}}})),/chance/);
  // Ink on ink does not read: an all-ink backdrop gets no foreground.
  for(let s=0;s<10;s++)assert.equal(foregroundPlan(context({seed:'dark'+s,scenery:{foreground:'grass'},indices:new Uint8Array(N).fill(4),recipe:{foreground:{chance:1}}})),null);
  // Legacy and compat contexts are untouched.
  for(const flag of ['legacy','compat']){
    const ctx={...context({heading:[0,-1],scenery:{foreground:'rocks'},indices:lit(),recipe:{echo:{chance:1},foreground:{chance:1}}}),[flag]:true};
    const copy=ctx.indices.slice();renderDepth(ctx);renderForeground(ctx);
    assert.deepEqual(ctx.indices,copy);
  }
});

// Full pipeline: a cover with forced depth layers against the same cover
// with them off. Only background pixels change; the subject and the title
// are never covered by echoes or streaks.
const forced=recipe=>({...recipe,echo:{chance:1},foreground:false,render:args=>({...(recipe.render(args)||{}),heading:[0,-1]})});
const plain=recipe=>({...recipe,echo:false,foreground:false});
test('pipeline: echoes and streaks change only background pixels, never the subject or title',t=>{
  let touched=0;
  for(const style of ['spaceships','vehicles','plants','planets','islands','buildings']){
    const on=createGenerator([forced(recipes[style])]),off=createGenerator([plain(recipes[style])]);
    for(let variant=0;variant<6;variant++){
      const a=on.generateCover('Depth Study',{variant,style,diagnostics:true}),b=off.generateCover('Depth Study',{variant,style,diagnostics:true});
      assert.deepEqual(a.quality.subjectLayer,b.quality.subjectLayer,'the subject layer is unchanged');
      const diff=changed(a.indices,b.indices);
      if(diff.length)touched++;
      for(const i of diff){
        assert.equal(a.quality.subjectLayer[i],TRANSPARENT,`${style} v${variant}: a subject pixel changed`);
        assert.ok(!a.quality.titleMask?.[i],`${style} v${variant}: a title pixel changed`);
        assert.ok(BG.has(a.indices[i])||a.indices[i]===4,`${style} v${variant}: index ${a.indices[i]}`);
      }
    }
  }
  t.diagnostic(`touched ${touched}/36`);
  assert.ok(touched>=18,`depth layers on ${touched}/36 covers`);
});

test('pipeline: depth never reads the recipe stream (extra recipe draws change nothing)',()=>{
  // Two probe recipes with the same drawing; the second burns recipe RNG.
  const probe=(burn)=>({id:'spaceships',label:'Probe',revision:1,echo:{chance:1},foreground:{chance:1},
    render({p,r}){
      if(burn)for(let k=0;k<37;k++)r(1000);
      p.group(q=>{q.poly([[64,30],[84,96],[64,86],[44,96]],6);q.rect(56,60,16,14,5);},{outline:2,color:4});
      return {archetype:'probe',heading:[1,-1],focal:[64,70]};
    }});
  const a=createGenerator([probe(false)]),b=createGenerator([probe(true)]);
  for(const framing of ['varied','classic'])for(let variant=0;variant<12;variant++){
    const x=a.generateCover('Burn Test',{variant,framing}),y=b.generateCover('Burn Test',{variant,framing});
    assert.deepEqual(x.indices,y.indices,`${framing} v${variant}`);
  }
});

test('pipeline: the foreground stays in the bottom corner bands of real covers',t=>{
  let drawn=0;
  for(const style of ['plants','buildings','machines','dungeons','vehicles']){
    const on=createGenerator([{...recipes[style],foreground:{chance:1}}]),off=createGenerator([{...recipes[style],foreground:false}]);
    for(let variant=0;variant<8;variant++){
      const a=on.generateCover('Moss & Magic',{variant,style,diagnostics:true}),b=off.generateCover('Moss & Magic',{variant,style});
      const diff=changed(a.indices,b.indices);
      if(!diff.length)continue;
      drawn++;
      const layer=a.quality.subjectLayer;
      let left=SIZE,right=-1;
      for(let i=0;i<N;i++)if(layer[i]<253){const x=i%SIZE;if(x<left)left=x;if(x>right)right=x;}
      const w=right-left+1;
      for(const i of diff){
        const x=i%SIZE,y=i>>7;
        assert.ok(y>=96,`${style} v${variant}: foreground at y ${y}`);
        assert.ok(x<=Math.floor(left+.15*w)||x>=Math.ceil(right-.15*w),`${style} v${variant}: foreground at x ${x}`);
        assert.ok(a.indices[i]===4||a.indices[i]===1||y<2||y>125||x<2||x>125,'ink or rim (frame rings may darken)');
      }
    }
  }
  t.diagnostic(`foregrounds ${drawn}/40`);
  assert.ok(drawn>=8,`foregrounds on ${drawn}/40 covers`);
});

test('natural frequency: echo styles get echoes on some covers, other styles none',t=>{
  const counts={};
  for(const style of ['spaceships','plants','heraldry','glyphs']){
    const on=createGenerator([recipes[style]]),off=createGenerator([{...recipes[style],echo:false,foreground:false}]);
    counts[style]=0;
    for(let variant=0;variant<24;variant++){
      const a=on.generateCover('Star Patrol',{variant,style}),b=off.generateCover('Star Patrol',{variant,style});
      if(changed(a.indices,b.indices).length)counts[style]++;
    }
  }
  t.diagnostic(JSON.stringify(counts));
  assert.ok(counts.spaceships>=2&&counts.spaceships<=16,`spaceships ${counts.spaceships}/24`);
  assert.ok(counts.plants>=2&&counts.plants<=16,`plants ${counts.plants}/24`);
  // Heraldry and glyphs have no echoes, and their scenes no foreground kind
  // except the catacomb's rubble.
  assert.ok(counts.heraldry<=12&&counts.glyphs<=12);
});

// A horizon-sky scene: the shared sky (0, a 3-row seam, 1 below) with a
// ribbon band (2 over a 9 edge) across the upper right, a ridge of 3 with a
// 2 rim rising across the left horizon, and 1 px stars of 2.
function sceneBackdrop(seed,{horizon=88}={}) {
  const indices=new Uint8Array(N),p=raster(indices,SIZE,{pixelArt:true}),r=createVariation('scene:'+seed);
  skyRows(p,0,horizon,1);
  for(let x=64;x<SIZE;x++){const y=46+(x>>2);indices[y*SIZE+x]=9;indices[(y-1)*SIZE+x]=2;indices[(y-2)*SIZE+x]=2;}
  for(let x=0;x<56;x++){const top=horizon-3-Math.floor(Math.min(x,55-x)/3);for(let y=top;y<SIZE;y++)indices[y*SIZE+x]=y===top?2:3;}
  for(let k=0;k<12;k++)indices[r.integer('y'+k,46,80)*SIZE+r.integer('x'+k,2,125)]=2;
  return indices;
}

test('openSky: the horizon seam, the open sky and the size of each scene shape',()=>{
  const indices=sceneBackdrop('sky',{horizon:88}),sky=openSky({indices,scenery:{sky:'horizon'}});
  assert.equal(sky.horizon,88);
  for(let x=0;x<SIZE;x++){
    assert.equal(sky.base[40*SIZE+x],0);
    for(let k=0;k<3;k++)assert.equal(sky.base[(87+k)*SIZE+x],seamPixel(x,k+1)?1:0);
    assert.equal(sky.base[100*SIZE+x],1);
  }
  for(let i=0;i<N;i++)assert.equal(sky.open[i],indices[i]===sky.base[i]?1:0);
  // The ribbon and the ridge are large shapes; a lone star has size 1.
  assert.ok(sky.size[(46+(100>>2))*SIZE+100]>100,'the ribbon is one large shape');
  assert.ok(sky.size[90*SIZE+20]>500,'the ridge is one large shape');
  for(let i=0;i<N;i++)if(indices[i]===2&&sky.size[i]===1)return;
  assert.fail('no lone star found');
});

test('echoes: only on open sky, a 3 px halo clear of scene shapes, behind a nearer layer at most',t=>{
  let sky=0,horizon=0,hidden=0;
  for(const style of ['spaceships','buildings'])for(let s=0;s<30;s++){
    const scenery={horizon:88,floor:110,foreground:'none',sky:'horizon'};
    const ctx=context({seed:style+'halo'+s,style,scenery,indices:sceneBackdrop(style+s),frame:{x:[44,58,70][s%3],y:50+s%4,scale:.4+(s%3)*.04}});
    const before=ctx.indices.slice(),open=openSky(ctx),plan=echoPlan(ctx);
    if(!plan)continue;
    if(plan.place==='sky')sky++;else horizon++;
    for(const e of plan.echoes){
      const painted=new Set(e.pixels.map(([dx,dy])=>(e.y+dy)*SIZE+e.x+dx));
      if(e.hidden){hidden++;assert.equal(plan.place,'horizon','only horizon echoes stand behind a layer');}
      assert.ok(e.pixels.length>=ECHO.visible*(e.pixels.length+e.hidden));
      const hideRow=e.y+e.h-Math.floor(ECHO.hide*e.h);
      for(const j of painted){
        assert.ok(open.open[j],`echo pixel ${j%SIZE},${j>>7} over a scene shape (${before[j]})`);
        const X=j%SIZE,Y=j>>7;
        for(let v=-ECHO.halo;v<=ECHO.halo;v++)for(let u=-ECHO.halo;u<=ECHO.halo;u++){
          const k=(Y+v)*SIZE+X+u;
          if(painted.has(k)||open.open[k])continue;
          const front=plan.place==='horizon'&&open.size[k]>=ECHO.occluder&&Y+v>=hideRow;
          if(Math.max(Math.abs(u),Math.abs(v))===1)assert.ok(front,`echo touches a scene pixel at ${X+u},${Y+v}`);
          else assert.ok(front||open.size[k]<=ECHO.star,`a scene shape within 3 px of the echo at ${X+u},${Y+v}`);
        }
      }
      // The colour differs from the sky under it: 1 or 3 above a 0 sky.
      assert.ok(e.color===ECHO.near||e.color===ECHO.far);
      for(const j of painted)assert.notEqual(open.base[j],e.color);
    }
  }
  t.diagnostic(`sky ${sky}/30, horizon ${horizon}/30, partly hidden ${hidden}`);
  assert.ok(sky>=12,`sky echoes in ${sky}/30`);
  assert.ok(horizon>=6,`horizon echoes in ${horizon}/30`);
});

const echoOnly=(recipe,on)=>({...recipe,echo:on?{chance:1}:false,foreground:false});
test('pipeline: echoes never fall in the darkened vignette, and show one or two steps above the sky',t=>{
  let covers=0;
  for(const style of ['spaceships','islands','planets','plants','buildings','vehicles']){
    const on=createGenerator([echoOnly(recipes[style],true)]),off=createGenerator([echoOnly(recipes[style],false)]);
    for(let variant=0;variant<8;variant++){
      const a=on.generateCover('Depth Study',{variant,style}),b=off.generateCover('Depth Study',{variant,style});
      const diff=changed(a.indices,b.indices);
      if(!diff.length)continue;
      covers++;
      for(const i of diff){
        assert.notEqual(b.indices[i],4,`${style} v${variant}: an echo over vignette ink at ${i%SIZE},${i>>7}`);
        assert.ok(a.indices[i]===1||a.indices[i]===3,`${style} v${variant}: echo shown as ${a.indices[i]}`);
      }
    }
  }
  t.diagnostic(`echo covers ${covers}/48`);
  assert.ok(covers>=12,`echoes on ${covers}/48 forced covers`);
});

test('girders: one massed frame per side, run out past the canvas side edge, no member under 3 px',t=>{
  let drawn=0;
  for(let s=0;s<40;s++){
    const ctx=context({seed:'girder'+s,recipe:{foreground:{chance:1}},scenery:{horizon:90,floor:110,foreground:'girders'},
      indices:new Uint8Array(N).fill(2),frame:{x:[20,40,58][s%3],y:62,scale:.5+(s%3)*.08}});
    const plan=foregroundPlan(ctx);
    if(!plan)continue;
    drawn++;
    const m=plan.mask,inside=(x,y)=>x>=0&&y>=0&&x<SIZE&&y<SIZE&&m[y*SIZE+x];
    for(let i=0;i<N;i++)if(m[i]){
      const x=i%SIZE,y=i>>7;
      let solid=false;
      for(let oy=-2;oy<=0&&!solid;oy++)for(let ox=-2;ox<=0&&!solid;ox++){
        let full=true;
        for(let v=0;v<3&&full;v++)for(let u=0;u<3&&full;u++)full=inside(x+ox+u,y+oy+v);
        solid=full;
      }
      assert.ok(solid,`girder ${s}: a member under 3 px at ${x},${y}`);
    }
    // Each side's frame reaches the bottom edge and its own side edge.
    for(const [lo,hi,edge] of [[0,63,0],[64,127,127]]){
      let any=false,atEdge=false;
      for(let y=0;y<SIZE;y++)for(let x=lo;x<=hi;x++)if(m[y*SIZE+x]){any=true;if(x===edge)atEdge=true;}
      if(any)assert.ok(atEdge,`girder ${s}: the frame on the ${edge?'right':'left'} stops short of the side edge`);
    }
  }
  t.diagnostic(`girders ${drawn}/40`);
  assert.ok(drawn>=20);
});

test('echoes: none on interior backdrops (catacomb, crypt, cavern, workshop, circuit, void), where they read as ghosts',t=>{
  assert.deepEqual([...ECHO_INTERIORS].sort(),['catacomb','cavern','circuit','crypt','void','workshop']);
  let open=0;
  for(let s=0;s<20;s++){
    if(echoPlan(context({seed:'interior'+s,scenery:{name:'hills',horizon:90,floor:110,foreground:'none'}})))open++;
    for(const name of ECHO_INTERIORS)assert.equal(echoPlan(context({seed:'interior'+s,scenery:{name,horizon:90,floor:110,foreground:'none'}})),null,name);
  }
  assert.ok(open>=10,`echoes on ${open}/20 open-sky probes`);
  // Real covers: forcing echoes changes nothing on an interior scene.
  let interiors=0;
  for(const style of ['plants','spaceships','vehicles']){
    const on=createGenerator([{...recipes[style],echo:{chance:1}}]),off=createGenerator([{...recipes[style],echo:false}]);
    for(let variant=0;variant<24;variant++){
      const a=on.generateCover('Alien Garden',{variant,style});
      if(!ECHO_INTERIORS.includes(a.traits.background))continue;
      interiors++;
      assert.deepEqual(a.indices,off.generateCover('Alien Garden',{variant,style}).indices,`${style} v${variant} ${a.traits.background}`);
    }
  }
  t.diagnostic(`interior covers ${interiors}`);
});

// A pixel of mask m lies in a solid 3x3 block of m.
const solid3=(m,x,y)=>{
  const inside=(u,t)=>u>=0&&t>=0&&u<SIZE&&t<SIZE&&m[t*SIZE+u];
  for(let oy=-2;oy<=0;oy++)for(let ox=-2;ox<=0;ox++){
    let full=true;
    for(let v=0;v<3&&full;v++)for(let u=0;u<3&&full;u++)full=inside(x+ox+u,y+oy+v);
    if(full)return true;
  }
  return false;
};
test('grass and kelp blades: solid tapered triangles, at least 3 px below a tip of at most 2 rows, based on row 125',t=>{
  // The builder: every row below the tip holds the rows above it, is at least
  // 3 px wide, and rows 126-127 (frame and vignette) repeat the row-125 base.
  for(let h=6;h<=24;h++)for(const [a,b] of [[1/8,1/8],[1/6,1/6],[1/4,0],[0,1/4],[1/3,0],[0,1/3],[1/6,1/8]])for(const side of [0,1]){
    const runs=bladeRuns(40,h,a,b,side);
    assert.equal(runs[0][0],128-h);assert.equal(runs.at(-1)[0],127);
    assert.equal(runs[0][2]-runs[0][1],0,'a 1 px apex');
    assert.equal(runs[1][2]-runs[1][1],1,'a 2 px row under the apex');
    for(let k=1;k<runs.length;k++){
      const [y,l,r]=runs[k],[,pl,pr]=runs[k-1];
      assert.ok(l<=pl&&r>=pr,`h ${h} ${a},${b}: row ${y} narrows`);
      if(k>=2)assert.ok(r-l+1>=3,`h ${h} ${a},${b}: row ${y} is ${r-l+1} px`);
      if(y>125)assert.deepEqual([l,r],[runs[k-1][1],runs[k-1][2]],'the base ends on row 125');
    }
  }
  // Planned foregrounds: every pixel lies in a solid 3x3 block, or is a tip
  // pixel with such a block 1 or 2 rows under it in its own column; every
  // part reaches the bottom edge, and none runs into the frame columns.
  const counts={};
  for(const kind of ['grass','kelp'])for(let s=0;s<60;s++){
    const ctx=context({seed:'blade-'+kind+s,recipe:{foreground:{chance:1}},scenery:{horizon:90,floor:110,foreground:kind},
      indices:new Uint8Array(N).fill(2),frame:{x:[20,40,58][s%3],y:62,scale:.5+(s%3)*.08},wildness:[0,.5][s%2]});
    const plan=foregroundPlan(ctx);
    if(!plan)continue;
    counts[kind]=(counts[kind]??0)+1;
    const m=plan.mask;
    // Solid ink: a rim would leave 2 px of ink on a 3 px blade.
    assert.ok(!m.includes(2),`${kind} ${s}: a rim on a blade`);
    for(let i=0;i<N;i++)if(m[i]){
      const x=i%SIZE,y=i>>7;
      assert.ok(x>=2&&x<=125,`${kind} ${s}: a blade crosses the frame column ${x}`);
      if(solid3(m,x,y))continue;
      const tip=[1,2].some(d=>y+d<SIZE&&[...Array(d)].every((_,k)=>m[(y+k+1)*SIZE+x])&&solid3(m,x,y+d));
      assert.ok(tip,`${kind} ${s}: a part under 3 px at ${x},${y}`);
    }
  }
  t.diagnostic(JSON.stringify(counts));
  for(const kind of ['grass','kelp'])assert.ok((counts[kind]??0)>=20,`${kind}: ${counts[kind]??0}/60 foregrounds`);
  // Dark corners (ink, as the vignette leaves them, with a checker seam):
  // a blade whose apex would sit on the dark is left out, so no tip pokes out
  // of the corner as a broken fragment.
  let dark=0;
  for(let s=0;s<60;s++){
    const indices=new Uint8Array(N).fill(2);
    for(let y=88;y<SIZE;y++)for(let x=0;x<SIZE;x++){const d=Math.min(x,127-x);if(d<16||(d<20&&(x+y)&1))indices[y*SIZE+x]=4;}
    const plan=foregroundPlan(context({seed:'dark-corner'+s,recipe:{foreground:{chance:1}},scenery:{horizon:90,floor:110,foreground:'grass'},
      indices,frame:{x:[20,40,58][s%3],y:62,scale:.5+(s%3)*.08}}));
    if(!plan)continue;
    dark++;
    const m=plan.mask,on=(x,y)=>x>=0&&y>=0&&x<SIZE&&y<SIZE&&m[y*SIZE+x];
    for(let i=0;i<N;i++)if(m[i]){
      const x=i%SIZE,y=i>>7;
      if(!on(x,y-1)&&!on(x-1,y)&&!on(x+1,y))assert.notEqual(indices[(y-1)*SIZE+x],4,`grass ${s}: an apex in the dark corner at ${x},${y}`);
    }
  }
  t.diagnostic(`dark-corner grass ${dark}/60`);
  assert.ok(dark>=10);
});
