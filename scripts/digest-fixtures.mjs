// QA fixtures for scripts/digest.mjs (development only; never imported by the
// cover runtime). Every fixture uses only engine-18 APIs, so the same code runs
// against baseline/engine18 and the current tree. A fixture returns bytes; the
// digest compares them. Equal bytes prove sameness, never artistic quality.
// No fixture writes index 255 inside a group: recipes never do, and engine 19's
// effects:false fast path relies on that invariant.

/** Load the primitive API of one tree. `root` is the URL of its directory. */
export async function loadApi(root) {
  const load=file=>import(new URL(file,root).href);
  const [raster,drawing,materials,masks,variation,geometry,backgrounds,random]=await Promise.all(
    ['raster.js','drawing.js','materials.js','masks.js','variation.js','geometry.js','backgrounds.js','random.js'].map(load));
  return {
    raster:raster.raster,viewport:raster.viewport,part:raster.part,recordDrawing:drawing.recordDrawing,
    dither:materials.dither,ditherTone:materials.ditherTone,outlineMask:masks.outlineMask,dropShadowMask:masks.dropShadowMask,
    createVariation:variation.createVariation,preferredVector:geometry.preferredVector,insidePolygon:geometry.insidePolygon,
    renderBackground:backgrounds.renderBackground,random:random.random,hash:random.hash,
  };
}

const encoder=new TextEncoder();
const json=value=>encoder.encode(JSON.stringify(value));
const f64=values=>new Uint8Array(Float64Array.from(values).buffer);
const i32=values=>new Uint8Array(Int32Array.from(values).buffer);
const image=(size,fill)=>new Uint8Array(size*size).fill(fill);
const intentBytes=intent=>json([...intent].sort((a,b)=>a[0]-b[0]));
function concat(...parts) {
  const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;
  for(const p of parts){out.set(p,at);at+=p.length;}
  return out;
}

// Each primitive exercised with fractional, clipped, tiny and degenerate input.
const PRIMITIVES={
  dot:p=>{p.dot(3.4,5.6,1);p.dot(10.5,10.5,2);p.dot(-1,4,3);p.dot(47.6,47.4,4);p.dot(20.49,20.5,5);p.dot(48,10,6);p.dot(30,-.6,7);},
  rect:p=>{p.rect(2.3,3.7,10.4,5.2,1);p.rect(-3,-3,6,6,2);p.rect(30.5,30.5,.4,.4,3);p.rect(40,10,20,5,4);p.rect(10,20,0,5,5);p.rect(20.6,36.2,7.7,3.49,6);},
  ellipse:p=>{p.ellipse(24,24,10,6,1);p.ellipse(12.3,30.7,3.2,7.1,2,.6);p.ellipse(40,8,1.2,.7,3);p.ellipse(30,40,.4,.4,4);
    p.ellipse(5,5,8,8,5);p.ellipse(24,24,0,4,6);p.ellipse(38.5,38.5,6.5,2.5,7,2.2);},
  sphere:p=>{const shade=(nx,ny,nz,x,y,edge)=>edge?4:nz>.8?7:nx<0?6:5;
    p.sphere(16,16,7,shade);p.sphere(36,36,1.2,3);p.sphere(40,12,5.5,shade);p.sphere(8,40,2.6,(nx,ny)=>ny<0?2:1);p.sphere(30,30,0,3);},
  poly:p=>{p.poly([[4,4],[40,8],[22,20],[44,40],[6,30]],1);p.poly([[10.3,40.7],[20.6,33.2],[28.9,46.1]],2);
    p.poly([[-5,20],[10,15],[3,50]],3);p.poly([[1,1],[5,5]],4);p.poly([[30,2],[46,2],[46,14],[38,6]],5);},
  round:p=>{p.round(3.2,4.6,20.3,12.7,4,1);p.round(30,30,5,5,10,2);p.round(40,2,10,0,3,3);p.round(6,28,14,9,2.5,4);p.round(26,40,30,10,0,5);},
  superellipse:(p,size)=>{p.superellipse(24,24,14,8,4,1,.3);p.superellipse(10,36,6,6,2.5,2);
    const clip=new Uint8Array(size*size);for(let i=0;i<clip.length;i++)clip[i]=(i%size+Math.floor(i/size))%3?1:0;
    p.superellipse(36,12,9,7,3,3,0,clip);},
  line:p=>{for(const [x,y,w] of [[44,30,1],[30,44,2],[4,30,3],[30,4,1],[4,4,2],[44,44,1],[4,44,3],[44,4,1]])p.line(24,24,x,y,(x+y+w)%7+1,w);
    p.line(10.4,2.6,20.5,7.5,2);p.line(20.5,7.5,10.4,2.6,3);p.line(2,46,46,45,4,1.4);p.line(5,5,5,5,5);},
  stroke:p=>{p.stroke([[4,4],[20,10],[30,30],[10,40]],1,2);p.stroke([[30,4],[44,10],[40,24]],2,1,true);p.stroke([[24,24]],3);p.stroke([[6,44],[40,44]],4,3,true);},
  pipe:p=>{p.pipe([[4,4],[30,4],[30,30],[10,30],[10,44]],1,5,1);p.pipe([[40,4],[40,40]],2,2,1);p.pipe([[36,44],[46,44],[46,20]],3,4,0);p.pipe([[14,14],[22,14],[22,22]],4,3.4,1);},
  ring:p=>{p.ring(24,24,12,8,1,2,.4);p.ring(10,10,4,3,2,1);p.ring(36,36,1,1,3,1);p.ring(30,10,5,5,4,0);p.ring(40,40,9,4,5,3,1.1);},
  arc:p=>{p.arc(24,24,14,9,1,2,.3,.5,3.5);p.arc(10,10,6,5,2);p.arc(40,40,1.5,4,3,1,0,0,2);p.arc(36,12,7,4,4,1,-.4,4,6);p.arc(30,30,.3,.3,5);p.arc(12,38,8,6,6,3,0,1,1);},
  sample:p=>{p.sample(3.3,4.7,30.2,20.1,(x,y,dx,dy)=>(Math.floor(x)+Math.floor(y))%3===0?null:Math.floor(dx*7+dy*3)%5);
    p.sample(30,30,0,4,()=>1);p.sample(36.5,26.5,14,14,(x,y)=>x>y?2:0);},
  detail:p=>{p.detail(5.4,6.6,3,'eye');p.detail(-2,3,4,'off canvas');p.detail(10,10,5,'glint');p.detail(10.4,10.4,6,'overwrite');},
};

// One recipe-space drawing through every primitive viewport/part forward.
function scene(p) {
  p.rect(4.5,50,40.2,6.3,1);p.ellipse(20,20,12,7,2,.5);p.poly([[30,4],[56,10],[44,30],[34,22]],3);p.round(6,32,18,10,3,4);
  p.sphere(48,44,6,(nx,ny,nz,x,y,edge)=>edge?4:nz>.7?7:6);p.line(2,2,58,12,5,2);p.stroke([[10,58],[20,40],[30,58]],6,1.5);
  p.pipe([[36,52],[52,52],[52,36]],7,5,1);p.ring(40,20,8,5,8,1.5,.3);p.arc(14,44,7,5,9,2,0,.4,4.2);
  p.sample(26,28,12,10,(x,y,dx,dy)=>(Math.floor(dx)+Math.floor(dy))&1?10:null);p.dot(57.3,57.6,11);
  if(p.detail)p.detail(21,21,12,'scene glint');
}
const blob=p=>{p.ellipse(24,26,14,10,6);p.rect(30,20,16,14,7);p.ring(24,26,6,4,5,1);};
const holed=p=>p.ring(32,32,16,12,6,4);

/** About ninety primitive, transform, group, dither and variation cases. */
export function fixtures(api) {
  const {raster,viewport,part,recordDrawing,dither,ditherTone,outlineMask,dropShadowMask,createVariation,preferredVector,insidePolygon,random,hash}=api;
  const out=[];
  const add=(name,size,run)=>{
    let bytes;
    try{bytes=run();}catch(error){bytes=encoder.encode('ERROR: '+(error?.message||error));}
    out.push({name,size,bytes});
  };
  for(const pixelArt of [false,true]){
    const mode=pixelArt?'pixel':'legacy';
    for(const [name,draw] of Object.entries(PRIMITIVES))add(`prim/${name}/${mode}`,48,()=>{
      const target=image(48,9),intent=new Map();draw(raster(target,48,{pixelArt,intent}),48);
      return name==='detail'?concat(target,intentBytes(intent)):target;
    });
    add(`prim/selection/${mode}`,48,()=>{
      const target=image(48,9),selection=new Uint8Array(48*48),p=raster(target,48,{pixelArt,selection});
      for(const draw of Object.values(PRIMITIVES))draw(p,48);
      return concat(target,selection);
    });
  }
  // Transforms: recipe geometry is mapped before rasterization.
  const transformed=(pixelArt,wrap)=>{const target=image(96,0),intent=new Map();scene(wrap(raster(target,96,{pixelArt,intent})));return concat(target,intentBytes(intent));};
  for(const scale of [.63,.73,1.3])add(`xform/viewport-${scale}`,96,()=>transformed(true,p=>viewport(p,{x:5.3,y:7.1,scale})));
  add('xform/viewport-0.73/legacy',96,()=>transformed(false,p=>viewport(p,{x:5.3,y:7.1,scale:.73})));
  for(const scale of [.63,.73,1.3])for(const flipX of [false,true])
    add(`xform/part-${scale}${flipX?'-flip':''}`,96,()=>transformed(true,p=>part(p,{x:flipX?88:6,y:6,scaleX:scale,scaleY:scale,flipX})));
  add('xform/part-aniso-flip',96,()=>transformed(true,p=>part(p,{x:80,y:4,scaleX:.73,scaleY:1.3,flipX:true})));
  add('xform/part-in-viewport',96,()=>transformed(true,p=>part(viewport(p,{x:2.5,y:3.5,scale:.8}),{x:70,y:10,scaleX:1.1,scaleY:.9,flipX:true})));
  // Groups: device-pixel effects derived from the untouched material selection.
  const grouped=(run,{pixelArt=true,effects=true,fill=255}={})=>{const target=image(64,fill),intent=new Map();run(raster(target,64,{pixelArt,intent,effects}));return concat(target,intentBytes(intent));};
  add('group/outline-1',64,()=>grouped(p=>p.group(blob,{outline:1})));
  add('group/outline-2-color',64,()=>grouped(p=>p.group(blob,{outline:2,color:3})));
  add('group/outline-3',64,()=>grouped(p=>p.group(blob,{outline:3})));
  add('group/shadow-default',64,()=>grouped(p=>p.group(blob,{shadow:{}})));
  add('group/shadow-custom',64,()=>grouped(p=>p.group(blob,{outline:1,shadow:{x:-2,y:3,color:2}})));
  add('group/exterior-only',64,()=>grouped(p=>p.group(holed,{outline:2,exteriorOnly:true})));
  add('group/edgeshade',64,()=>grouped(p=>p.group(blob,{edgeShade:{width:2,color:4,density:.5}})));
  add('group/edgeshade-thin',64,()=>grouped(p=>p.group(blob,{outline:1,edgeShade:{width:1,density:.25,color:3}})));
  add('group/effect-mask',64,()=>grouped(p=>p.group(blob,{outline:2,shadow:{x:2,y:2},effectMask:x=>x<32})));
  add('group/nested',64,()=>grouped(p=>p.group(q=>{q.group(blob,{outline:1,color:2});q.rect(40,44,14,8,8);q.detail(50,48,9,'nested rivet');},{outline:2,shadow:{}})));
  add('group/effects-false',64,()=>grouped(p=>p.group(blob,{outline:2,shadow:{},edgeShade:{width:2}}),{effects:false}));
  add('group/viewport-mask',64,()=>grouped(p=>viewport(p,{x:3.5,y:2.25,scale:.73}).group(blob,{outline:1,shadow:{x:1,y:2},effectMask:(x,y)=>y<30})));
  add('group/part-flip-mask',64,()=>grouped(p=>part(p,{x:60,y:4,scaleX:.9,scaleY:1.1,flipX:true}).group(blob,{outline:2,effectMask:x=>x>20})));
  add('group/legacy',64,()=>grouped(p=>p.group(blob,{outline:2,shadow:{x:1,y:1}}),{pixelArt:false,fill:0}));
  add('group/on-paint',64,()=>grouped(p=>{p.rect(0,40,64,24,1);p.group(blob,{outline:1,shadow:{x:2,y:3}});},{fill:0}));
  add('group/selection',64,()=>{
    const target=image(64,255),selection=new Uint8Array(64*64),p=raster(target,64,{pixelArt:true,selection});
    p.group(blob,{outline:1,shadow:{}});p.dot(60,60,3);return concat(target,selection);
  });
  // Dither: four patterns at five densities, then phase, cell, mask and transforms.
  for(const pattern of ['checker','lines','crosshatch','ordered'])for(const density of [0,.25,.4,.65,1])
    add(`dither/${pattern}-${density}`,32,()=>{const target=image(32,0);dither(raster(target,32,{pixelArt:true}),{x:1,y:2,w:29,h:27,color:5,density,pattern});return target;});
  add('dither/cell-phase-mask-viewport',64,()=>{
    const target=image(64,0);
    dither(viewport(raster(target,64,{pixelArt:true}),{x:2,y:3,scale:.73}),{x:4,y:4,w:40,h:36,color:3,density:(x)=>x/44,
      mask:(x,y)=>((x-24)/18)**2+((y-22)/16)**2<1,cell:2,phase:1,pattern:'checker'});
    return target;
  });
  add('dither/lines-crosshatch-part',64,()=>{
    const target=image(64,0),p=part(raster(target,64,{pixelArt:true}),{x:60,y:2,scaleX:.8,scaleY:1.2,flipX:true});
    dither(p,{x:2,y:2,w:30,h:20,color:2,density:(x,y)=>y/22,pattern:'lines'});
    dither(p,{x:30,y:24,w:40,h:22,color:6,density:.6,pattern:'crosshatch',phase:3});
    return target;
  });
  add('material/ditherTone',0,()=>{
    const values=[];
    for(const ramp of [[1,2,3],[5,6,7,8],[4]])for(let i=0;i<=28;i++)for(const [x,y] of [[0,0],[1,0],[0,1],[1,1],[2.7,3.2],[-1,-2]])
      values.push(ditherTone(-.2+i*.05,ramp,x,y));
    return Uint8Array.from(values);
  });
  add('variation/integer-range',0,()=>{
    const seeds=['pocket-cover:spaceships:4:Star Patrol:parameters',42,'world'],ints=[],ranges=[];
    for(let i=0;i<1000;i++){const v=createVariation(seeds[i%3]);ints.push(v.integer('n'+i,-5,5+i%50));ranges.push(v.range('r'+i,-1.5,2.5,1+i%200));}
    return concat(i32(ints),f64(ranges));
  });
  add('drawing/record-replay',96,()=>{
    const recording=recordDrawing();scene(recording.p);recording.p.group(blob,{outline:2,shadow:{x:-1,y:3}});
    recording.p.group(q=>q.group(holed,{outline:1}),{outline:3,shadow:{x:2,y:-1}});
    const target=image(96,255),intent=new Map();recording.draw(viewport(raster(target,96,{pixelArt:true,intent}),{x:10,y:12,scale:.8}));
    return concat(target,json(recording.margins),intentBytes(intent));
  });
  add('drawing/probe',128,()=>{
    const recording=recordDrawing();scene(recording.p);recording.p.group(blob,{outline:2,shadow:{}});
    const probe=image(128,255);recording.draw(viewport(raster(probe,128,{pixelArt:true,effects:false}),{x:30,y:30}));
    return probe;
  });
  const shape=()=>{const source=new Uint8Array(40*40),p=raster(source,40,{pixelArt:true});p.ring(20,20,12,9,1,3);p.dot(3,3,1);p.rect(30,30,6,2,1);return source;};
  add('masks/outline',0,()=>{const source=shape(),parts=[];for(let w=0;w<=3;w++)for(const exteriorOnly of [false,true])parts.push(outlineMask(source,40,w,{exteriorOnly}));return concat(...parts);});
  add('masks/drop-shadow',0,()=>{const source=shape();return concat(...[[2,3],[-2,1],[0,0],[5,-4]].map(([x,y])=>dropShadowMask(source,40,x,y)));});
  add('geometry/vectors-polygon',0,()=>{
    const vectors=[],inside=[],poly=[[4,4],[30,6],[18,16],[36,34],[6,26]];
    for(let dx=-30;dx<=30;dx+=3)for(let dy=-30;dy<=30;dy+=3)vectors.push(...preferredVector(dx,dy));
    for(let y=0;y<40;y++)for(let x=0;x<40;x++)inside.push(insidePolygon(x+.5,y+.5,poly)?1:0);
    return concat(f64(vectors),Uint8Array.from(inside));
  });
  add('random/hash-stream',0,()=>{
    const values=[];
    for(const text of ['','a','pocket-cover:2:Moon Meadow','pocket-cover:spaceships:4:Star Patrol 3:palette'])values.push(hash(text));
    for(const seed of [0,1,134,0x7fffffff,hash('stream')]){const r=random(seed);for(let i=0;i<50;i++)values.push(r(1+i*37));}
    return new Uint8Array(Uint32Array.from(values).buffer);
  });
  return out;
}

// Scenery archetypes from tests/procedural-contract.test.js.
const SCENERY_ARCHETYPES={machines:'signal harvester',dungeons:'treasure vault',spaceships:'cartoon rocket',islands:'lighthouse',
  plants:'orchid',buildings:'temple',vehicles:'deep sea submarine'};
const CONTRACT_CASES=[['machines','workshop','signal harvester'],['dungeons','void','treasure vault'],['spaceships','stars','cartoon rocket'],
  ['islands','mist','lighthouse'],['plants','garden','orchid'],['buildings','mist','temple'],['vehicles','workshop','deep sea submarine'],
  ['vehicles','workshop','crawler tank'],['vehicles','workshop','cars']];
export const SCENERY_KINDS=['stars','garden','mist','workshop','void'];

/** renderBackground cases as {name, style, run()}; run returns {indices, traits, result}. */
export function sceneryCases(styles) {
  const bounds={left:18,top:40,right:110,bottom:107},cases=[];
  const bounded=(style,kind,archetype,seed)=>({name:`${style}/${kind}/${archetype||'-'}/seed${seed}`,style,
    run:api=>{
      const indices=new Uint8Array(128*128),traits={...(archetype?{archetype}:{}),groundRearScreenY:86};
      const result=api.renderBackground(api.raster(indices,128,{pixelArt:true}),api.random(seed),
        {style,kind,top:28,subjectBounds:{...bounds},traits,variation:api.createVariation(seed)});
      return {indices,traits,result};
    }});
  for(const style of styles)for(const kind of SCENERY_KINDS)for(let seed=0;seed<6;seed++)cases.push(bounded(style,kind,SCENERY_ARCHETYPES[style]||'',seed));
  if(styles.includes('vehicles'))for(const archetype of ['crawler tank','cars','lunar rover'])for(const kind of SCENERY_KINDS)for(let seed=0;seed<6;seed++)
    cases.push(bounded('vehicles',kind,archetype,seed));
  for(const [style,kind,archetype] of CONTRACT_CASES)if(styles.includes(style))for(let seed=6;seed<12;seed++)cases.push(bounded(style,kind,archetype,seed));
  // tests/variation.test.js: no subject bounds, a taller title, default variation.
  for(const style of styles)for(const kind of SCENERY_KINDS)cases.push({name:`${style}/${kind}/unbounded/seed134`,style,
    run:api=>{
      const indices=new Uint8Array(128*128);indices.fill(255,0,36*128);
      const traits={archetype:'deep sea submarine'};
      const result=api.renderBackground(api.raster(indices,128,{pixelArt:true}),api.random(134),{kind,style,traits,top:36});
      return {indices,traits,result};
    }});
  return cases;
}
