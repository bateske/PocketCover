// Engine-19 group effects (engine-contract E2): selout, bevel/rim, extrude,
// pixel-exact mirror, pinholes, glints, darken shadows, swept shadows and the
// band edge shade. Small synthetic fixtures; every default stays engine 18.
import test from 'node:test';
import assert from 'node:assert/strict';
import {raster,viewport,part,PROVENANCE} from '../src/raster.js';
import {recordDrawing} from '../src/drawing.js';
import {createGenerator} from '../src/engine.js';
import {effectMargins,mapGroupOptions,darkenOnto} from '../src/group.js';
import {outlineMask,dropShadowMask,sweptShadowMask,shadowPath,outsideMask,erodeMask4,bevelMask,extrudeMask} from '../src/masks.js';
import {DARKER,LIGHTER,DARKEN1,DARKEN2} from '../src/roles.js';
import {hash,random} from '../src/random.js';

const T=255;
const blank=(size,fill=T)=>new Uint8Array(size*size).fill(fill);
function render(draw,options,{size=24,fill=T,intent=new Map(),provenance=null,transform=p=>p,data=blank(size,fill),effects=true}={}) {
  transform(raster(data,size,{pixelArt:true,intent,provenance,effects})).group(draw,options);
  return data;
}
const plain=(draw,{size=24,transform=p=>p}={})=>{const data=blank(size);draw(transform(raster(data,size,{pixelArt:true})));return data;};
const ascii=(data,size)=>Array.from({length:size},(_,y)=>Array.from(data.subarray(y*size,y*size+size),v=>v===T?'.':v===DARKEN1?'m':v===DARKEN2?'M':v.toString(36)).join('')).join('\n');
function components(cells,size,diagonal=false) {
  const seen=new Uint8Array(size*size);let count=0;
  for(let i=0;i<size*size;i++)if(cells[i]&&!seen[i]){
    count++;const queue=[i];seen[i]=1;
    while(queue.length){
      const j=queue.pop(),x=j%size,y=(j-x)/size;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if((!dx&&!dy)||(!diagonal&&dx&&dy))continue;
        const xx=x+dx,yy=y+dy,k=yy*size+xx;
        if(xx>=0&&yy>=0&&xx<size&&yy<size&&cells[k]&&!seen[k]){seen[k]=1;queue.push(k);}
      }
    }
  }
  return count;
}
const boxOf=(mask,size)=>{
  const box={left:size,top:size,right:-1,bottom:-1};
  for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%size,y=(i-x)/size;box.left=Math.min(box.left,x);box.right=Math.max(box.right,x);box.top=Math.min(box.top,y);box.bottom=Math.max(box.bottom,y);}
  return box;
};

test('new options default off: explicit off values, margins and option mapping equal engine 18',()=>{
  const draw=p=>{p.poly([[4,3],[18,5],[15,19],[6,16]],6);p.rect(8,8,3,3,7);p.group(q=>q.rect(12,12,4,4,9),{outline:1});};
  for(const base of [{},{outline:1},{outline:2,shadow:{x:2,y:3}},{edgeShade:{width:2}},{outline:2,exteriorOnly:true,shadow:{}},{shadow:{x:-1,y:2,color:11},effectMask:x=>x<12}]){
    const off={...base,selout:null,bevel:null,extrude:null,mirror:null,pinholes:false,glints:[]};
    assert.deepEqual(render(draw,off),render(draw,base),JSON.stringify(base));
    assert.deepEqual(render(draw,{...base,selout:undefined,bevel:undefined,extrude:undefined,mirror:undefined,glints:undefined}),render(draw,base));
  }
  for(const options of [{},{outline:2},{shadow:{}},{outline:1,shadow:{x:-3,y:-1}},{outline:3,shadow:{x:5,y:0}}]){
    const w=options.outline||0,s=options.shadow,sx=s?(s.x??2):0,sy=s?(s.y??3):0;
    assert.deepEqual(effectMargins(options),{left:Math.max(w,-sx),right:Math.max(w,sx),top:Math.max(w,-sy),bottom:Math.max(w,sy)});
    assert.deepEqual(effectMargins({...options,shadow:s&&{...s,swept:true,color:'darken'}}),effectMargins(options),'a swept or darken shadow reaches as far');
  }
  const options={outline:2,shadow:{x:1,y:1},selout:{lit:'none'},bevel:{},edgeShade:{width:2,mode:'band'},pinholes:true,extrude:{dx:1,dy:1}};
  assert.equal(mapGroupOptions(options,(a,b)=>[a*2,b*2],(a,b)=>[a/2,b/2]),options,'nothing to map returns the same object');
  assert.equal(mapGroupOptions(undefined,()=>[0,0],()=>[0,0]),undefined);
});

test('bounding-box loops equal the full-frame loops on 30 random masks',()=>{
  const size=32;
  for(let n=0;n<30;n++){
    const r=random(hash('group-effects:mask:'+n)),mask=new Uint8Array(size*size),p=raster(mask,size,{pixelArt:true});
    for(let k=0;k<2+r(4);k++){
      const x=r(size)-4,y=r(size)-4,w=1+r(12),h=1+r(12);
      if(r(3))p.rect(x,y,w,h,1);else p.ellipse(x+w/2,y+h/2,w/2,h/2,1);
    }
    if(r(2))for(let k=0;k<r(6);k++)mask[r(size*size)]=0;
    const box=boxOf(mask,size),loose={left:Math.max(0,box.left-3),top:box.top-1,right:box.right+2,bottom:box.bottom+5};
    for(const b of [box,loose]){
      for(const width of [1,2,3])for(const exteriorOnly of [false,true])
        assert.deepEqual(outlineMask(mask,size,width,{exteriorOnly,box:b}),outlineMask(mask,size,width,{exteriorOnly}),`outline ${n} ${width} ${exteriorOnly}`);
      const [sx,sy]=[r(9)-4,r(9)-4];
      assert.deepEqual(dropShadowMask(mask,size,sx,sy,{box:b}),dropShadowMask(mask,size,sx,sy),`shadow ${n}`);
      assert.deepEqual(sweptShadowMask(mask,size,sx,sy,{box:b}),sweptShadowMask(mask,size,sx,sy),`swept ${n}`);
      assert.deepEqual(erodeMask4(mask,size,{box:b}),erodeMask4(mask,size),`erode ${n}`);
      for(const min of [2,3])for(const exterior of [false,true])
        assert.deepEqual(bevelMask(mask,size,{min,exterior,box:b}),bevelMask(mask,size,{min,exterior}),`bevel ${n} ${min} ${exterior}`);
      const dx=r(3)-1,dy=dx?r(3)-1:1-2*r(2),depth=1+r(4);
      for(const crumbs of [true,false])
        assert.deepEqual(extrudeMask(mask,size,dx,dy,depth,{crumbs,box:b}),extrudeMask(mask,size,dx,dy,depth,{crumbs}),`extrude ${n} ${dx},${dy}x${depth}`);
      // The flood agrees inside the region it covers.
      const full=outsideMask(mask,size),local=outsideMask(mask,size,{box:b,pad:2});
      for(let y=Math.max(0,b.top-2);y<=Math.min(size-1,b.bottom+2);y++)for(let x=Math.max(0,b.left-2);x<=Math.min(size-1,b.right+2);x++)
        assert.equal(local[y*size+x],full[y*size+x],`outside ${n} at ${x},${y}`);
    }
  }
});

// Reference selout classes: nearest material pixels in the disk, lit only if
// all of them lie at dx+dy>0; returns {lit,d2,first} or null for non-outline.
function seloutClass(mask,size,width,x,y) {
  let best=Infinity,all=[];
  for(let dy=-width;dy<=width;dy++)for(let dx=-width;dx<=width;dx++){
    const d2=dx*dx+dy*dy,xx=x+dx,yy=y+dy;
    if(d2>width*width||xx<0||yy<0||xx>=size||yy>=size||!mask[yy*size+xx])continue;
    if(d2<best){best=d2;all=[];}
    if(d2===best)all.push([dx,dy,yy*size+xx]);
  }
  if(!all.length)return null;
  all.sort((a,b)=>a[2]-b[2]);
  return {lit:all.every(([dx,dy])=>dx+dy>0),d2:best,first:all[0][2]};
}

test('selout classifies lit (top/left) and dark outline pixels, ties dark, with litWidth',()=>{
  const size=24,square=p=>p.rect(8,8,6,6,6);
  // Square, width 1: top and left rows are lit; nothing else.
  const none=render(square,{outline:1,selout:{lit:'none'}});
  for(let k=8;k<14;k++){
    assert.equal(none[7*size+k],T,'lit top row is omitted');assert.equal(none[k*size+7],T,'lit left column is omitted');
    assert.equal(none[14*size+k],4,'dark bottom row');assert.equal(none[k*size+14],4,'dark right column');
  }
  const darker=render(square,{outline:1,selout:{lit:'darker'}}),indexed=render(square,{outline:1,selout:{lit:9}});
  assert.equal(darker[7*size+10],DARKER[6]);assert.equal(darker[10*size+7],DARKER[6]);assert.equal(darker[14*size+10],4);
  assert.equal(indexed[7*size+10],9);assert.equal(indexed[10*size+14],4);
  // Width 2: the top-left diagonal corner is lit; top-right and bottom-left
  // corners tie (dx+dy=0) and stay dark. litWidth 1 keeps only the cardinal
  // first ring on the lit side.
  const wide=render(square,{outline:2,selout:{lit:'darker'}}),thin=render(square,{outline:2,selout:{lit:'darker',litWidth:1}});
  assert.equal(wide[7*size+7],DARKER[6],'(7,7) nearest (+1,+1): lit');
  assert.equal(wide[7*size+14],4,'(14,7) nearest (-1,+1): a tie is dark');
  assert.equal(wide[14*size+7],4,'(7,14) nearest (+1,-1): a tie is dark');
  assert.equal(wide[6*size+10],DARKER[6],'second lit row');
  assert.equal(thin[6*size+10],T,'litWidth 1 drops the second lit row');
  assert.equal(thin[7*size+7],T,'and the lit diagonal corner (d2=2)');
  assert.equal(thin[7*size+10],DARKER[6]);assert.equal(thin[15*size+10],4,'the dark side keeps width 2');
  // Against the reference on a square, a diamond and a two-colour blob.
  const diamond=p=>{for(let y=-5;y<=5;y++)p.rect(12-(5-Math.abs(y)),12+y,2*(5-Math.abs(y))+1,1,6);};
  const blob=p=>{p.ellipse(11,12,7,5,6);p.rect(4,9,6,3,7);};
  for(const draw of [square,diamond,blob])for(const width of [1,2,3])for(const litWidth of [0,1,width]){
    const mask=Uint8Array.from(plain(draw),v=>v!==T),source=plain(draw),edge=outlineMask(mask,size,width);
    const out=render(draw,{outline:width,color:4,selout:{lit:'darker',litWidth}});
    let lit=0,dark=0;
    for(let i=0;i<size*size;i++){
      if(mask[i]){assert.equal(out[i],source[i]);continue;}
      if(!edge[i]){assert.equal(out[i],T);continue;}
      const c=seloutClass(mask,size,width,i%size,(i-i%size)/size);
      if(c.lit){lit++;assert.equal(out[i],c.d2>litWidth*litWidth?T:DARKER[source[c.first]],`lit ${i%size},${(i-i%size)/size}`);}
      else {dark++;assert.equal(out[i],4);}
    }
    assert.ok(lit>0&&dark>0);
  }
  // In the diamond the top-left edge is lit and the top-right edge is dark.
  const d=render(diamond,{outline:1,selout:{lit:'none'}});
  assert.equal(d[9*size+9],T,'top-left edge');assert.equal(d[9*size+15],4,'top-right edge (tie)');
  assert.equal(d[6*size+12],T,'top vertex');assert.equal(d[18*size+12],4,'bottom vertex');
});

test('bevel lights thick runs only, lo wins at corners; rim, from and exterior',()=>{
  const size=14;
  // 6x6 block (x2-7, y2-7) with a 2-pixel arm (x8-11, y4-5).
  const shape=p=>{p.rect(2,2,6,6,6);p.rect(8,4,4,2,6);};
  const expected={
    2:'111112',3:'100002',4:'1000000002',5:'1000000002',6:'100002',7:'222222'};
  const classes=bevelMask(Uint8Array.from(plain(shape,{size}),v=>v!==T),size,{min:3});
  for(const [y,row] of Object.entries(expected))for(let k=0;k<row.length;k++)assert.equal(classes[y*size+2+k],Number(row[k]),`class at ${2+k},${y}`);
  const out=render(shape,{bevel:{}},{size});
  for(const [y,row] of Object.entries(expected))for(let k=0;k<row.length;k++)
    assert.equal(out[y*size+2+k],[6,LIGHTER[6],DARKER[6]][row[k]],`bevel at ${2+k},${y}`);
  // min 2 makes the 2-pixel arm thick: its top lights and its bottom darkens.
  const two=render(shape,{bevel:{min:2}},{size});
  assert.equal(two[4*size+9],LIGHTER[6]);assert.equal(two[5*size+9],DARKER[6]);
  assert.equal(out[4*size+9],6,'min 3 leaves the thin arm flat');assert.equal(out[5*size+9],6);
  // Rim = bevel with lo:null: lit edges only; a corner where lo wins stays.
  const rim=render(shape,{bevel:{hi:'lighter',lo:null,min:2}},{size});
  assert.equal(rim[2*size+3],LIGHTER[6]);assert.equal(rim[7*size+2],6,'lo wins at the lower-left corner, so the rim leaves it');
  assert.equal(rim[7*size+4],6);assert.equal(rim[3*size+7],6);
  // Explicit colours and the from filter.
  const fixed=render(p=>{shape(p);p.dot(4,2,9);},{bevel:{hi:8,lo:4,from:[6]}},{size});
  assert.equal(fixed[2*size+3],8);assert.equal(fixed[7*size+3],4);assert.equal(fixed[2*size+4],9,'only listed colours change');
  // exterior:true keeps the walls of an enclosed opening flat.
  const ring=p=>{p.rect(2,2,9,9,6);p.rect(5,5,3,3,T);};
  const inner=render(ring,{bevel:{}},{size}),outer=render(ring,{bevel:{exterior:true}},{size});
  assert.equal(inner[4*size+6],DARKER[6],'the pixel above the opening is lo');assert.equal(inner[8*size+6],LIGHTER[6]);
  assert.equal(outer[4*size+6],6);assert.equal(outer[8*size+6],6);assert.equal(outer[2*size+6],LIGHTER[6]);assert.equal(outer[10*size+6],DARKER[6]);
});

test('extrude splits side and under pixels, removes crumbs, and becomes material',()=>{
  const size=16;
  // Rectangle x4-9, y4-7 in colour 7, extruded (1,1) by 2.
  const rect=p=>p.rect(4,4,6,4,7);
  const out=render(rect,{extrude:{dx:1,dy:1,depth:2}},{size});
  const side=DARKER[7],under=DARKER[DARKER[7]];
  const expect=(x,y)=>{
    if(x>=4&&x<=9&&y>=4&&y<=7)return 7;
    if(y===8&&x>=5&&x<=9)return under;
    if(y===9&&x>=6&&x<=9)return under;
    if(x===10&&y>=5&&y<=9)return side;
    if(x===11&&y>=6&&y<=9)return side;
    return T;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)assert.equal(out[y*size+x],expect(x,y),`extrude at ${x},${y}\n${ascii(out,size)}`);
  // Against the light (-1,-1): "under" faces lie against dy, scanned upward.
  const up=render(p=>p.rect(4,4,5,4,7),{extrude:{dx:-1,dy:-1,depth:1}},{size});
  assert.deepEqual(Array.from(up.subarray(3*size+3,3*size+9)),[side,under,under,under,under,T]);
  for(let y=4;y<7;y++)assert.equal(up[y*size+3],side);
  assert.equal(up[7*size+3],T);
  // Explicit side/under colours.
  const coloured=render(rect,{extrude:{dx:1,dy:1,depth:2,side:13,under:14}},{size});
  assert.equal(coloured[8*size+6],14);assert.equal(coloured[6*size+10],13);
  // Colour comes from the nearest step k that hits the material.
  const twoTone=render(p=>{p.rect(4,4,6,4,6);p.rect(9,4,1,4,7);},{extrude:{dx:1,dy:0,depth:2}},{size});
  assert.equal(twoTone[5*size+10],DARKER[7],'k=1 reads the column right beside it');
  // A 2:1 diagonal leaves lone stair pixels under it; they are crumbs.
  const slope=p=>{for(let y=0;y<5;y++)p.rect(2+2*y,3+y,13-2*y,1,6);};
  const mask=Uint8Array.from(plain(slope,{size}),v=>v!==T);
  const kept=extrudeMask(mask,size,1,1,1,{crumbs:false}),clean=extrudeMask(mask,size,1,1,1);
  for(let y=0;y<4;y++){assert.equal(kept[(4+y)*size+3+2*y],1,'stair pixel');assert.equal(clean[(4+y)*size+3+2*y],0,'is a crumb');}
  // ...except a pixel that plugs a hole under material above and left.
  const holed=p=>{p.rect(4,4,3,3,6);p.dot(5,5,T);};
  const plug=extrudeMask(Uint8Array.from(plain(holed,{size}),v=>v!==T),size,1,1,1);
  assert.equal(plug[5*size+5],1,'pinhole plug is kept');
  assert.equal(render(holed,{extrude:{depth:1}},{size})[5*size+5],DARKER[DARKER[6]],'plugged as an under pixel');
  // mask_eff: shadow and outline wrap the extrusion; the parent selects it.
  const selection=new Uint8Array(size*size),parent=blank(size);
  raster(parent,size,{pixelArt:true,selection}).group(rect,{extrude:{depth:2},outline:1,shadow:{x:1,y:1,color:3}});
  assert.equal(parent[10*size+10],4,'outline below the extrusion');assert.equal(parent[9*size+12],4,'and right of it');
  assert.equal(parent[10*size+12],3,'the extrusion casts the shadow beyond its outline');
  assert.equal(parent[8*size+4],4,'no extrusion at the lower-left start: outline under the face');
  for(let i=0;i<size*size;i++)assert.equal(selection[i],Number(expect(i%size,(i-i%size)/size)!==T),'selection = mask + extrusion');
  // Margins add the extrusion on its own sides.
  assert.deepEqual(effectMargins({outline:1,extrude:{dx:1,dy:1,depth:2}}),{left:1,right:3,top:1,bottom:3});
  assert.deepEqual(effectMargins({outline:1,shadow:{x:2,y:3},extrude:{dx:-1,dy:1,depth:3}}),{left:4,right:2,top:1,bottom:6});
  const recorded=recordDrawing();recorded.p.group(rect,{extrude:{dx:0,dy:-1,depth:4}});
  assert.deepEqual(recorded.margins,{left:0,right:0,top:4,bottom:0});
  assert.throws(()=>render(rect,{extrude:{dx:0,dy:0}}),/not both zero/);assert.throws(()=>render(rect,{extrude:{depth:5}}),/1 to 4/);
});

test('extrusion reads the drawn face; edgeShade and bevel then shade only the face',()=>{
  const size=16,rect=p=>p.rect(4,4,6,4,7);
  const out=render(rect,{extrude:{dx:0,dy:1,depth:1},bevel:{min:2}},{size});
  assert.equal(out[7*size+6],DARKER[7],'the face edge is beveled lo');
  assert.equal(out[8*size+6],DARKER[DARKER[7]],'the extrusion takes the unbeveled face colour');
  const band=render(rect,{extrude:{dx:0,dy:1,depth:1},edgeShade:{width:1,mode:'band'}},{size});
  assert.equal(band[7*size+6],DARKER[7]);assert.equal(band[8*size+6],DARKER[DARKER[7]]);
});

function forwardX(steps,a) {
  for(const s of [...steps].reverse())a=s.kind==='viewport'?s.x+a*s.scale:s.x+(s.flipX?-1:1)*a*s.scaleX;
  return a;
}
const compose=steps=>p=>steps.reduce((q,s)=>s.kind==='viewport'?viewport(q,s):part(q,s),p);

test('mirror is pixel-exact about the device axis through viewport and part transforms',()=>{
  const size=64;
  const draw=p=>{p.poly([[6,4],[21,2],[33,11],[27,30],[13,25]],6);p.rect(9,14,5,3,7);p.ellipse(28,20,3,2,9);};
  const cases=[
    [],
    [{kind:'viewport',x:1.3,y:2,scale:.7}],
    [{kind:'viewport',x:4.1,y:1,scale:1.37}],
    [{kind:'viewport',x:2,y:3,scale:.55},{kind:'part',x:44,y:3,scaleX:1.3,scaleY:.9,flipX:true}],
    [{kind:'part',x:52,y:2,scaleX:1.15,scaleY:1,flipX:true},{kind:'viewport',x:0,y:0,scale:.83}],
    [{kind:'viewport',x:-3.7,y:5,scale:1.21},{kind:'part',x:1,y:0,scaleX:.66,scaleY:1.4}],
  ];
  const parity=new Set();
  for(const axis of [20,19.5,21.25])for(const steps of cases){
    const transform=compose(steps),flip=steps.filter(s=>s.flipX).length%2===1;
    const A2=Math.round(2*forwardX(steps,axis));parity.add(A2&1);
    const before=plain(draw,{size,transform});
    for(const from of ['left','right'])for(const shade of [null,'darker']){
      const intent=new Map();
      const out=render(q=>{draw(q);q.detail(axis-12,8,10,'beacon');},{mirror:{x:axis,from,shade}},{size,transform,intent});
      const keepLeft=(from==='left')!==flip,label=`${JSON.stringify(steps)} axis ${axis} ${from} ${shade}`;
      let copied=0;
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const i=y*size+x,m=A2-1-x;
        const source=keepLeft?2*x<=A2-1:2*x>=A2-1;
        if(source){if(intent.size===0||!intent.has(i))assert.equal(out[i],before[i]===T?T:before[i],`kept half ${label} at ${x},${y}`);continue;}
        const s=m>=0&&m<size?out[y*size+m]:T;
        assert.equal(out[i],s===T?T:shade?DARKER[s]:s,`mirrored ${label} at ${x},${y}`);
        if(s!==T)copied++;
      }
      assert.ok(copied>50,`${label}: the copied half is not empty`);
      assert.equal(intent.size,1,'intents are not mirrored');
    }
  }
  assert.deepEqual([...parity].sort(),[0,1],'both odd and even device axes are exercised');
});

test('mirror maps through recordings and the probe, and refuses rotated parts',()=>{
  const size=48,draw=p=>{p.rect(4,6,9,12,6);p.rect(13,10,3,3,7);};
  const recorded=recordDrawing();recorded.p.group(draw,{mirror:{x:16},outline:1});
  const a=blank(size),b=blank(size),t=p=>part(viewport(p,{x:3,y:2,scale:.8}),{x:40,y:0,scaleX:1.2,scaleY:1,flipX:true});
  recorded.draw(t(raster(a,size,{pixelArt:true})));
  t(raster(b,size,{pixelArt:true})).group(draw,{mirror:{x:16},outline:1});
  assert.deepEqual(a,b,'a replayed recording maps the axis like a live draw');
  // A measure-only probe (effects:false) applies the mirror geometry.
  const probe={left:size,top:size,right:-1,bottom:-1};
  raster(null,size,{pixelArt:true,effects:false,bounds:probe}).group(draw,{mirror:{x:16},outline:3,shadow:{}});
  assert.deepEqual(probe,{left:4,top:6,right:27,bottom:17});
  const sink=blank(size),selection=new Uint8Array(size*size);
  raster(sink,size,{pixelArt:true,effects:false,selection}).group(draw,{mirror:{x:16},outline:3});
  assert.equal(sink.filter(v=>v===4).length,0,'no effects without effects');
  assert.equal(selection.reduce((n,v)=>n+v,0),sink.filter(v=>v!==T).length);
  // Mapping: x through forward, from swapped under flipX, glints mapped.
  const options={mirror:{x:10,from:'left'},glints:[{x:2,y:3}]};
  const mapped=mapGroupOptions(options,(u,v)=>[30-u*2,v+1],(u,v)=>[(30-u)/2,v-1],{flipX:true});
  assert.deepEqual(mapped.mirror,{x:10,from:'right'});assert.deepEqual(mapped.glints,[{x:26,y:4}]);
  assert.deepEqual(options.mirror,{x:10,from:'left'},'the caller options are not mutated');
  assert.equal(mapGroupOptions({mirror:{x:1,from:'right'}},(u,v)=>[u,v],(u,v)=>[u,v],{flipX:true}).mirror.from,'left');
  assert.throws(()=>mapGroupOptions({mirror:{x:1}},(u,v)=>[u,v],(u,v)=>[u,v],{rotated:true}),/rotated/);
  assert.throws(()=>mapGroupOptions({mirror:{x:1}},(u,v)=>[u-v,u+v],(u,v)=>[u,v]),/rotated/,'a skewed forward map is refused too');
  assert.doesNotThrow(()=>mapGroupOptions({glints:[{x:1,y:1}]},(u,v)=>[u-v,u+v],(u,v)=>[u,v],{rotated:true}));
  assert.throws(()=>render(draw,{mirror:{}},{size}),/finite axis/);
});

test('mirror copies record their own primitive kinds in diagnostics',()=>{
  const size=32,provenance=new Uint8Array(size*size),data=blank(size);
  raster(data,size,{pixelArt:true,provenance}).group(p=>{p.rect(4,4,6,6,6);p.ellipse(12,8,2,2,7);},{mirror:{x:16},outline:1});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;if(data[i]===T){assert.equal(provenance[i],0);continue;}
    assert.ok(provenance[i]>0);assert.equal(provenance[i],provenance[y*size+31-x],`kind mirrored at ${x},${y}`);
  }
  assert.equal(provenance[6*size+6],PROVENANCE.rect);assert.equal(provenance[6*size+25],PROVENANCE.rect);
  assert.equal(provenance[3*size+6],PROVENANCE.effect);
});

test('pinholes fill a trapped background pixel but keep deliberate one-pixel holes',()=>{
  const size=16,cell=p=>{p.rect(3,3,9,9,6);p.rect(6,6,3,3,T);},single=p=>{p.rect(3,3,7,7,6);p.dot(6,6,T);};
  const open=render(cell,{outline:1},{size}),filled=render(cell,{outline:1,pinholes:true},{size});
  assert.equal(open[7*size+7],T,'the centre of a 3x3 opening is not within the outline');
  assert.equal(filled[7*size+7],4,'pinholes paints it in the outline colour');
  let changes=0;for(let i=0;i<size*size;i++)if(open[i]!==filled[i])changes++;
  assert.equal(changes,1);
  assert.equal(render(cell,{outline:1,pinholes:true,color:2},{size})[7*size+7],2);
  assert.equal(render(cell,{outline:1,pinholes:true,effectMask:()=>false},{size})[7*size+7],T,'effectMask clips pinholes');
  // exteriorOnly keeps enclosed openings, including one-pixel holes.
  assert.equal(render(single,{outline:1,exteriorOnly:true,pinholes:true},{size})[6*size+6],T,'deliberate 1 px hole stays open');
  assert.equal(render(cell,{outline:1,exteriorOnly:true,pinholes:true},{size})[7*size+7],T);
  // A 3x4 opening keeps its 1x2 centre: only single trapped pixels fill.
  const tall=render(p=>{p.rect(3,3,9,10,6);p.rect(6,6,3,4,T);},{outline:1,pinholes:true},{size});
  assert.equal(tall[7*size+7],T);assert.equal(tall[8*size+7],T);
});

test('glints sit inside erode4(mask), nearest first, and register intent',()=>{
  const size=24,rect=p=>p.rect(4,4,12,10,6);
  const intent=new Map(),out=render(rect,{glints:[{x:4,y:4}]},{size,intent});
  const star=[[6,6],[5,6],[7,6],[6,5],[6,7]];
  for(const [x,y] of star){assert.equal(out[y*size+x],8);assert.deepEqual(intent.get(y*size+x),{color:8,reason:'glint'});}
  assert.equal(intent.size,5);assert.equal(out[5*size+5],6);
  const mask=Uint8Array.from(plain(rect,{size}),v=>v!==T),inner=erodeMask4(mask,size);
  for(const i of intent.keys())assert.equal(inner[i],1,'every glint pixel lies in erode4(mask)');
  // Size 2 with a lighter tip.
  const big=new Map(),two=render(rect,{glints:[{x:4,y:4,size:2,tip:'lighter',core:8,reason:'sparkle'}]},{size,intent:big});
  assert.equal(two[7*size+7],8);assert.equal(two[7*size+6],8);assert.equal(two[7*size+5],LIGHTER[6]);assert.equal(two[9*size+7],LIGHTER[6]);
  assert.deepEqual(big.get(7*size+5),{color:LIGHTER[6],reason:'sparkle'});assert.equal(big.size,9);
  // from: only centres of a listed colour; ties order by (y,x).
  const patch=p=>{rect(p);p.rect(10,8,3,3,7);};
  const picked=render(patch,{glints:[{x:9,y:8,from:[7]}]},{size});
  assert.equal(picked[8*size+10],8,'the first colour-7 centre at distance 1');
  const tie=render(rect,{glints:[{x:10,y:9}]},{size}),tieIntent=new Map();render(rect,{glints:[{x:10.4,y:9.4}]},{size,intent:tieIntent});
  assert.equal(tie[9*size+10],8);assert.ok(tieIntent.has(9*size+10),'positions round like dots');
  // No room within reach: nothing is painted or registered.
  const none=new Map(),bar=render(p=>p.rect(2,10,20,3,6),{glints:[{x:12,y:4,reach:4}]},{size,intent:none});
  assert.equal(none.size,0);assert.deepEqual(bar,plain(p=>p.rect(2,10,20,3,6),{size}));
  // Glint points map through viewport like any recipe coordinate.
  const mapped=new Map();render(p=>p.rect(0,0,20,16,6),{glints:[{x:10,y:8}]},{size,intent:mapped,transform:p=>viewport(p,{x:2,y:3,scale:.5})});
  assert.ok(mapped.has(7*size+7),'(10,8) maps to device (7,7)');
  // Glints are drawn after the bevel and survive the composite.
  const lit=render(rect,{bevel:{},glints:[{x:9,y:9}]},{size});assert.equal(lit[9*size+9],8);assert.equal(lit[4*size+9],LIGHTER[6]);
  const kinds=new Uint8Array(size*size);render(rect,{glints:[{x:9,y:9}]},{size,provenance:kinds});
  assert.equal(kinds[9*size+9],PROVENANCE.glint);
});

test('darken shadows write 254/253 markers or step colours, and composite through parents',()=>{
  assert.equal(darkenOnto(T),DARKEN1);assert.equal(darkenOnto(T,2),DARKEN2);
  assert.equal(darkenOnto(DARKEN1),DARKEN2);assert.equal(darkenOnto(DARKEN2),DARKEN2);assert.equal(darkenOnto(DARKEN1,2),DARKEN2);
  for(let v=0;v<DARKER.length;v++){assert.equal(darkenOnto(v),DARKER[v]);assert.equal(darkenOnto(v,2),DARKER[DARKER[v]]);}
  const size=20,rect=p=>p.rect(4,4,6,6,6);
  const base=()=>{const d=blank(size);for(let y=0;y<size;y++)for(let x=10;x<size;x++)d[y*size+x]=9;d[12*size+8]=DARKEN1;return d;};
  for(const steps of [1,2]){
    const out=render(rect,{shadow:{x:3,y:3,color:'darken',steps}},{size,data:base()}),shade=dropShadowMask(Uint8Array.from(plain(rect,{size}),v=>v!==T),size,3,3);
    const before=base();let markers=0,stepped=0;
    for(let i=0;i<size*size;i++){
      if(!shade[i]){assert.equal(out[i],plain(rect,{size})[i]!==T?6:before[i]);continue;}
      const v=before[i],want=v===T?(steps>1?DARKEN2:DARKEN1):v===DARKEN1?DARKEN2:steps>1?DARKER[DARKER[v]]:DARKER[v];
      assert.equal(out[i],want,`steps ${steps} at ${i%size},${(i-i%size)/size}`);
      if(v===T)markers++;else if(v===9)stepped++;
    }
    assert.ok(markers>0&&stepped>0);assert.equal(out[12*size+8],DARKEN2,'an existing marker deepens');
  }
  // A nested darken shadow: over the parent's material it steps the colour at
  // once; over empty source it stays a marker until the parent composites.
  const nested=render(q=>{
    q.rect(2,2,8,8,9);
    q.group(z=>z.rect(3,3,3,3,6),{shadow:{x:2,y:2,color:'darken'}});
    q.group(z=>z.rect(8,8,3,3,7),{shadow:{x:2,y:2,color:'darken'}});
  },{outline:1,color:4},{size,data:blank(size,3)});
  assert.equal(nested[6*size+6],DARKER[9],'stepped inside the parent source');
  assert.equal(nested[12*size+12],DARKER[3],'marker resolved onto the parent target');
  assert.equal(nested[11*size+10],4,'a marker over the parent outline darkens ink to ink');
  assert.equal(nested[4*size+4],6);assert.equal(nested[9*size+9],7);
  assert.ok(!nested.includes(DARKEN1)&&!nested.includes(DARKEN2));
  assert.throws(()=>render(rect,{shadow:{color:'darken',steps:3}}),/steps/);
});

test('the engine composite resolves darken shadows from recipes against the scene',()=>{
  const make=(shadowColor,steps,coordinateSpace)=>createGenerator([{id:'darken-probe',revision:1,background:'stars',...(coordinateSpace?{coordinateSpace}:{}),render({p}){
    p.group(q=>{q.rect(40,60,30,20,6);q.rect(50,50,10,10,7);},{shadow:{x:3,y:4,color:shadowColor,steps},...(shadowColor===null?{effectMask:()=>false}:{})});
    return {};
  }}]);
  const clean=cover=>{
    assert.ok(cover.indices.every(v=>v!==DARKEN1&&v!==DARKEN2&&v<cover.palette.length),'no marker leaks into the cover');
  };
  for(const coordinateSpace of ['cover',undefined])for(let variant=0;variant<4;variant++){
    // Classic framing places every variant identically, so a masked-off
    // shadow gives the scene under the shadow exactly.
    const options={variant,framing:'classic',diagnostics:true};
    const base=make(null,2,coordinateSpace).generateCover('Darken Study',options),grey=make(13,2,coordinateSpace).generateCover('Darken Study',options);
    const dark=make('darken',2,coordinateSpace).generateCover('Darken Study',options);
    let shaded=0;
    for(let i=0;i<base.indices.length;i++){
      const shadow=grey.indices[i]===13&&base.indices[i]!==13;
      assert.equal(dark.indices[i],shadow?DARKER[DARKER[base.indices[i]]]:base.indices[i],`${coordinateSpace} classic v${variant} at ${i%128},${Math.floor(i/128)}`);
      if(shadow)shaded++;
    }
    assert.ok(shaded>100);clean(dark);
    assert.ok(dark.quality.subjectLayer.includes(DARKEN2),'the subject layer carries the marker');
    // Varied framing aligns on the layer bounds (shadow included), so compare
    // shadows of equal extent: two steps are DARKER of one step.
    const varied={variant,framing:'varied',diagnostics:true};
    const g=make(13,1,coordinateSpace).generateCover('Darken Study',varied),one=make('darken',1,coordinateSpace).generateCover('Darken Study',varied),two=make('darken',2,coordinateSpace).generateCover('Darken Study',varied);
    let marked=0;
    for(let i=0;i<g.indices.length;i++){
      const shadow=one.quality.subjectLayer[i]===DARKEN1;
      assert.equal(two.quality.subjectLayer[i]===DARKEN2,shadow);
      if(shadow){marked++;assert.equal(g.indices[i],13);assert.equal(two.indices[i],DARKER[one.indices[i]],`varied v${variant} at ${i%128},${Math.floor(i/128)}`);}
      else assert.equal(two.indices[i],one.indices[i]);
    }
    assert.ok(marked>100);clean(one);clean(two);
  }
});

test('swept shadows stay attached on steep and thin edges; flat edges keep their depth',()=>{
  assert.deepEqual(shadowPath(2,3),[[1,1],[1,2],[2,3]]);assert.deepEqual(shadowPath(0,0),[]);
  assert.deepEqual(shadowPath(-3,0),[[-1,0],[-2,0],[-3,0]]);assert.deepEqual(shadowPath(1,-2).at(-1),[1,-2]);
  const size=32;
  // A steep 1-pixel stroke leaning against the light.
  const stroke=new Uint8Array(size*size);raster(stroke,size,{pixelArt:true}).line(16,4,12,20,1);
  const drop=dropShadowMask(stroke,size,2,3),swept=sweptShadowMask(stroke,size,2,3);
  const union=(a,b)=>Uint8Array.from(a,(v,i)=>v|b[i]);
  assert.ok(components(union(stroke,drop),size,true)>1,'a single drop offset detaches the shadow');
  assert.equal(components(union(stroke,swept),size,false),1,'the swept shadow joins the stroke cardinally');
  for(let i=0;i<size*size;i++){if(drop[i])assert.equal(swept[i],1,'swept contains the drop shadow');if(stroke[i])assert.equal(swept[i],0);}
  // A steep solid edge: no gap opens between the shape and its swept shadow.
  const wedge=new Uint8Array(size*size);raster(wedge,size,{pixelArt:true}).poly([[6,4],[12,4],[8,28],[6,28]],1);
  const sw=sweptShadowMask(wedge,size,3,3);
  assert.equal(components(union(wedge,sw),size,false),1);
  // A flat bottom edge keeps exactly the drop depth (3 rows).
  const slab=new Uint8Array(size*size);raster(slab,size,{pixelArt:true}).rect(4,4,20,6,1);
  const a=dropShadowMask(slab,size,2,3),b=sweptShadowMask(slab,size,2,3);
  for(let y=10;y<16;y++)assert.equal(b[y*size+14],a[y*size+14],`depth row ${y}`);
  // In a group, swept and darken combine; numeric colours still work.
  const g=render(p=>p.line(16,4,12,20,6),{shadow:{x:2,y:3,swept:true,color:5}},{size});
  for(let i=0;i<size*size;i++)assert.equal(g[i],stroke[i]?6:swept[i]?5:T);
});

test('edgeShade band: a solid one-pixel edge, never dithered, then a checker seam',()=>{
  const size=24,rect=p=>p.rect(5,6,12,10,6);
  for(const width of [2,3])for(const color of [undefined,4]){
    const out=render(rect,{edgeShade:{width,mode:'band',...(color==null?{}:{color})}},{size});
    let edge=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=y*size+x,inside=x>=5&&x<17&&y>=6&&y<16;
      if(!inside){assert.equal(out[i],T);continue;}
      const d=Math.min(17-x,16-y);
      if(d===1){edge++;assert.equal(out[i],color??DARKER[6],`d=1 at ${x},${y} is solid`);}
      else if(d<=width)assert.equal(out[i],(x+y)&1?6:DARKER[6],`d=${d} at ${x},${y}`);
      else assert.equal(out[i],6);
    }
    assert.equal(edge,21,'the whole lower/right edge is shaded');
  }
  // Parts thinner than 5 px get the solid edge but never the checker seam.
  for(const [w,h] of [[4,12],[12,3],[2,2]]){
    const thin=render(p=>p.rect(5,5,w,h,6),{edgeShade:{width:3,mode:'band'}},{size});
    for(let y=5;y<5+h;y++)for(let x=5;x<5+w;x++){
      const d=Math.min(5+w-x,5+h-y);
      assert.equal(thin[y*size+x],d===1?DARKER[6]:6,`${w}x${h} part at ${x},${y}`);
    }
  }
  // Per-colour steps follow DARKER of each source colour.
  const two=render(p=>{p.rect(5,6,12,10,6);p.rect(12,6,5,10,7);},{edgeShade:{width:2,mode:'band'}},{size});
  assert.equal(two[10*size+16],DARKER[7]);assert.equal(two[15*size+8],DARKER[6]);
  // The checker mode is unchanged and the band records effect provenance.
  const kinds=new Uint8Array(size*size);render(rect,{edgeShade:{mode:'band'}},{size,provenance:kinds});
  assert.equal(kinds[15*size+8],PROVENANCE.effect);assert.equal(kinds[8*size+8],PROVENANCE.rect);
  assert.deepEqual(render(rect,{edgeShade:{width:2,color:5,density:.5,mode:'checker'}},{size}),render(rect,{edgeShade:{width:2,color:5,density:.5}},{size}));
  assert.throws(()=>render(rect,{edgeShade:{mode:'stripes'}},{size}),/checker' or 'band/);
});
