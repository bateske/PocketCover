import test from 'node:test';
import assert from 'node:assert/strict';
import {outlineMask,dropShadowMask} from '../src/masks.js';
import {raster,viewport,part} from '../src/raster.js';
import {recordDrawing} from '../src/drawing.js';
import {dither} from '../src/materials.js';

test('outer strokes expand the original union by exact disk distance, without corner blocks',()=>{
  const size=24,source=new Uint8Array(size*size),p=raster(source,size,{pixelArt:true});
  p.rect(3,4,10,5,1);p.poly([[8,7],[19,16],[8,16]],1);p.rect(10,11,2,2,0);
  const occupied=Array.from(source.keys()).filter(i=>source[i]);
  for(const width of [1,2,3]){
    const edge=outlineMask(source,size,width);
    for(let i=0;i<edge.length;i++){
      const x=i%size,y=Math.floor(i/size);
      const expected=!source[i]&&occupied.some(j=>(x-j%size)**2+(y-Math.floor(j/size))**2<=width**2);
      assert.equal(edge[i],Number(expected),`width ${width} at ${x},${y}`);
    }
  }
  const isolated=new Uint8Array(9*9);isolated[4*9+4]=1;
  assert.equal(outlineMask(isolated,9).reduce((a,b)=>a+b),4,'one pixel has four cardinal border pixels, not eight stacked corner pixels');
  assert.throws(()=>outlineMask(source,size,1.5));
});

test('shadow offsets clip without row wrapping and never include source or stroke inflation',()=>{
  const size=12,source=new Uint8Array(size*size);raster(source,size).rect(0,2,4,6,1);
  for(const [dx,dy]of [[2,3],[-2,-3],[0,0],[20,0]]){
    const shadow=dropShadowMask(source,size,dx,dy);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const sx=x-dx,sy=y-dy;
      assert.equal(shadow[y*size+x],Number(!source[y*size+x]&&sx>=0&&sx<size&&sy>=0&&sy<size&&!!source[sy*size+sx]));
    }
  }
  assert.throws(()=>dropShadowMask(source,size,.5,2));
});

test('groups union overlapping fills and keep source colors above independent shadow and stroke',()=>{
  const size=32,source=new Uint8Array(size*size).fill(255),result=source.slice();
  const draw=p=>{p.rect(5,7,10,8,6);p.rect(11,11,9,8,7);p.dot(6,8,0);};
  draw(raster(source,size,{pixelArt:true}));
  raster(result,size,{pixelArt:true}).group(draw,{outline:2,color:4,shadow:{x:5,y:3,color:11}});
  const mask=Uint8Array.from(source,c=>c!==255),edge=outlineMask(mask,size,2),shadow=dropShadowMask(mask,size,5,3);
  for(let i=0;i<result.length;i++)assert.equal(result[i],source[i]!==255?source[i]:edge[i]?4:shadow[i]?11:255);
  assert.equal(result[11*size+11],7,'no internal seam where the source shapes overlap');
  assert.equal(result[8*size+6],0,'palette zero is opaque material');
});

test('nested part/viewport groups retain final-pixel effect width and intentional details',()=>{
  const size=48,source=new Uint8Array(size*size).fill(255),result=source.slice(),intent=new Map();
  const transformed=p=>part(viewport(p,{x:2,y:3,scale:.7}),{x:4,y:2,scaleX:1.4,scaleY:.8});
  const draw=q=>{q.poly([[7,9],[30,9],[22,33],[7,20]],6);q.detail(35,35,10,'beacon');};
  draw(transformed(raster(source,size,{pixelArt:true})));
  transformed(raster(result,size,{pixelArt:true,intent})).group(draw,{outline:3,color:4});
  const edge=outlineMask(Uint8Array.from(source,c=>c!==255),size,3);
  for(let i=0;i<result.length;i++)assert.equal(result[i],source[i]!==255?source[i]:edge[i]?4:255);
  assert.equal(intent.size,1);const [at]=intent.keys();assert.equal(result[at],10);
});

test('recorded groups replay their selected geometry without re-running the recipe callback',()=>{
  const recorded=recordDrawing();let choices=0;
  recorded.p.group(q=>{choices++;q.rect(4,5,10,12,6);q.group(z=>z.ellipse(18,18,5,5,7),{outline:1});},{outline:2,shadow:{x:3,y:4}});
  const a=new Uint8Array(32*32).fill(255),b=a.slice();
  recorded.draw(raster(a,32,{pixelArt:true}));recorded.draw(raster(b,32,{pixelArt:true}));
  assert.equal(choices,1);assert.deepEqual(a,b);assert.deepEqual(recorded.margins,{left:3,right:4,top:3,bottom:5});
});

test('an outer shadow ignores the strokes and shadows of nested groups',()=>{
  const size=32,data=new Uint8Array(size*size).fill(255);
  raster(data,size,{pixelArt:true}).group(q=>{
    q.group(z=>z.rect(8,8,5,5,6),{outline:3,color:4,shadow:{x:-3,y:-3,color:5}});
  },{shadow:{x:10,y:10,color:11}});
  for(let y=15;y<26;y++)for(let x=15;x<26;x++)assert.equal(data[y*size+x],x>=18&&x<23&&y>=18&&y<23?11:255);
});

test('one-bit material patterns have exact coverage and checker half-tone alternates every pixel',()=>{
  for(const pattern of ['checker','lines','crosshatch','ordered'])for(const density of [0,.25,.5,.75,1]){
    const data=new Uint8Array(16*16);
    dither(raster(data,16,{pixelArt:true}),{x:0,y:0,w:16,h:16,color:1,pattern,density});
    assert.equal(data.reduce((a,b)=>a+b),256*density,`${pattern} coverage ${density}`);
    if(pattern==='checker'&&density===.5)for(let y=0;y<15;y++)for(let x=0;x<15;x++){
      assert.notEqual(data[y*16+x],data[y*16+x+1]);assert.notEqual(data[y*16+x],data[(y+1)*16+x]);
    }
  }
});

test('exterior outlines preserve enclosed openings, including diagonal joins',()=>{
  const size=11,source=new Uint8Array(size*size),p=raster(source,size);
  p.rect(2,2,7,7,1);p.rect(3,3,5,5,0);
  const ordinary=outlineMask(source,size,2),exterior=outlineMask(source,size,2,{exteriorOnly:true});
  for(let y=3;y<8;y++)for(let x=3;x<8;x++)assert.equal(exterior[y*size+x],0,'a closed opening keeps its full size');
  assert.equal(ordinary[3*size+5],1,'the ordinary contour also borders the opening');
  assert.equal(exterior[1*size+5],1,'the visible exterior still receives a contour');

  const diamond=new Uint8Array(size*size);
  for(const [x,y]of [[5,2],[4,3],[3,4],[2,5],[3,6],[4,7],[5,8],[6,7],[7,6],[8,5],[7,4],[6,3]])diamond[y*size+x]=1;
  const closed=outlineMask(diamond,size,1,{exteriorOnly:true});
  assert.equal(closed[3*size+5],0,'corner-touching material pixels close the interior');
  assert.equal(closed[1*size+5],1);
  diamond[2*size+5]=0;
  const open=outlineMask(diamond,size,1,{exteriorOnly:true});
  assert.equal(open[3*size+5],1,'a real gap connects the opening to outside space');
});

test('rounded orthogonal pipes trim one pixel from convex caps and elbows without disconnecting the path',()=>{
  const size=24,points=[[5,5],[15,5],[15,15]],square=new Uint8Array(size*size).fill(9),rounded=square.slice(),reversed=square.slice();
  raster(square,size,{pixelArt:true}).pipe(points,6,5,0);
  raster(rounded,size,{pixelArt:true}).pipe(points,6,5,1);
  raster(reversed,size,{pixelArt:true}).pipe([...points].reverse(),6,5,1);
  assert.deepEqual(rounded,reversed,'path traversal cannot change the silhouette');
  const cuts=Array.from(square.keys()).filter(i=>square[i]!==rounded[i]).map(i=>[i%size,Math.floor(i/size)]);
  assert.deepEqual(cuts,[[3,3],[17,3],[3,7],[13,17],[17,17]],'only the five convex corners of this L are trimmed');
  for(const [x,y]of [[16,3],[17,4],[13,7],[14,8],[15,5],[15,15]])assert.equal(rounded[y*size+x],6);
  assert.equal(rounded[3*size+17],9,'corner removal preserves the existing background');
  const occupied=Array.from(rounded.keys()).filter(i=>rounded[i]===6),seen=new Set([occupied[0]]),queue=[occupied[0]];
  for(let head=0;head<queue.length;head++){
    const i=queue[head],x=i%size,y=Math.floor(i/size);
    for(const j of [x?i-1:-1,x+1<size?i+1:-1,y?i-size:-1,y+1<size?i+size:-1])if(j>=0&&rounded[j]===6&&!seen.has(j)){seen.add(j);queue.push(j);}
  }
  assert.equal(seen.size,occupied.length,'the rounded pipe stays cardinally connected');
});

test('thin pipes retain their complete stroke and reject unsupported paths',()=>{
  const size=24,points=[[4,4],[15,4],[15,18]];
  for(const width of [1,2]){
    const expected=new Uint8Array(size*size),actual=expected.slice();
    raster(expected,size,{pixelArt:true}).stroke(points,1,width);
    raster(actual,size,{pixelArt:true}).pipe(points,1,width,1);
    assert.deepEqual(actual,expected,`a ${width}-pixel tube has no room for a corner cut`);
  }
  const p=raster(new Uint8Array(size*size),size,{pixelArt:true});
  assert.throws(()=>p.pipe([[4,4],[15,8]],1,5),/orthogonal/);
  assert.throws(()=>p.pipe(points,1,5,2),/zero or one final pixel/);
});

test('pipe widths scale through nested transforms but their corner radius stays one device pixel',()=>{
  const size=80,points=[[5,5],[15,5],[15,15]],actual=new Uint8Array(size*size),expected=actual.slice(),square=actual.slice();
  const transformed=part(viewport(raster(actual,size,{pixelArt:true}),{x:2,y:3,scale:2}),{x:4,y:2,scaleX:1.5,scaleY:1});
  transformed.pipe(points,1,5,1);
  const devicePath=[[25,17],[55,17],[55,37]];
  raster(expected,size,{pixelArt:true}).pipe(devicePath,1,10,1);
  raster(square,size,{pixelArt:true}).pipe(devicePath,1,10,0);
  assert.deepEqual(actual,expected);
  assert.equal(square.reduce((n,v,i)=>n+(v!==actual[i]),0),5,'enlargement still removes just one pixel at each convex corner');
  assert.equal(actual[12*size+59],0);assert.equal(actual[12*size+58],1);assert.equal(actual[13*size+59],1);
});

test('edge shading stays inside the original material on its lower and right edges',()=>{
  const size=24,draw=p=>{p.rect(5,6,12,10,6);p.rect(7,8,2,2,0);},render=()=>{
    const data=new Uint8Array(size*size).fill(255);
    raster(data,size,{pixelArt:true}).group(draw,{edgeShade:{width:2,color:5,density:.5}});return data;
  };
  const a=render();assert.deepEqual(a,render(),'the shading pattern has no random phase');
  let shadeCount=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const material=x>=5&&x<17&&y>=6&&y<16,band=material&&(x>=15||y>=14),shade=band&&(x+y)%2===0;
    const expected=shade?5:material?(x>=7&&x<9&&y>=8&&y<10?0:6):255;
    assert.equal(a[y*size+x],expected,`shade at ${x},${y}`);if(shade)shadeCount++;
  }
  assert.equal(shadeCount,20,'a two-pixel L-shaped band uses an exact half checker');
});

test('edge shading does not recolor nested outlines or cast shadows',()=>{
  const size=32,plain=new Uint8Array(size*size).fill(255),shaded=plain.slice();
  const draw=p=>p.group(q=>q.rect(10,10,8,8,6),{outline:3,color:4,shadow:{x:6,y:5,color:11}});
  raster(plain,size,{pixelArt:true}).group(draw);
  raster(shaded,size,{pixelArt:true}).group(draw,{edgeShade:{width:2,color:10,density:1}});
  let changes=0;
  for(let i=0;i<plain.length;i++)if(plain[i]!==shaded[i]){
    const x=i%size,y=Math.floor(i/size);changes++;
    assert.equal(plain[i],6,'only material may receive the edge shade');assert.equal(shaded[i],10);
    assert.ok(x>=16||y>=16,'only the lower/right material band changes');
  }
  assert.equal(changes,28);
  assert.ok(plain.includes(4));assert.ok(plain.includes(11),'the fixture exercises both child effects');
});

test('recorded effect masks clip stroke and shadow in recipe coordinates through part and viewport',()=>{
  const size=64,blank=()=>new Uint8Array(size*size).fill(255),source=blank(),full=blank(),clipped=blank();
  const transformed=p=>part(viewport(p,{x:5,y:7,scale:1.5}),{x:4,y:2,scaleX:2,scaleY:.5});
  const draw=p=>p.rect(4,4,8,12,6),allowed=(x,y)=>x<13.5&&y<17&&!(x>=6&&x<8);
  const options={outline:2,color:4,shadow:{x:5,y:4,color:11}};
  draw(transformed(raster(source,size,{pixelArt:true})));
  transformed(raster(full,size,{pixelArt:true})).group(draw,options);
  const recorded=recordDrawing();let recipes=0;
  recorded.p.group(p=>{recipes++;draw(p);},{...options,effectMask:allowed});
  recorded.draw(transformed(raster(clipped,size,{pixelArt:true})));
  const again=blank();recorded.draw(transformed(raster(again,size,{pixelArt:true})));assert.deepEqual(clipped,again);assert.equal(recipes,1);
  const kept={4:0,11:0},cut={4:0,11:0};let protectedMaterial=0;
  for(let i=0;i<clipped.length;i++){
    const localX=(i%size+.5-11)/3,localY=(Math.floor(i/size)+.5-10)/.75,visible=allowed(localX,localY);
    const expected=source[i]!==255?source[i]:visible?full[i]:255;
    assert.equal(clipped[i],expected,`masked effect at ${i%size},${Math.floor(i/size)}`);
    if(source[i]!==255&&!visible)protectedMaterial++;
    if(source[i]===255&&(full[i]===4||full[i]===11))(visible?kept:cut)[full[i]]++;
  }
  assert.ok(protectedMaterial>0,'the mask must never erase source colors');
  for(const color of [4,11]){assert.ok(kept[color]>0,`some color ${color} effect remains`);assert.ok(cut[color]>0,`some color ${color} effect is clipped`);}
});
