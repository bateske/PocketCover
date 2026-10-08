import test from 'node:test';
import assert from 'node:assert/strict';
import {raster,viewport,part,recolor} from '../src/raster.js';
import {inkPixels,streakPixels,STREAK_THIN} from '../src/strokes.js';
import {ditherTone,levelTone,shaft,noise2,KEY,lambert} from '../src/materials.js';
import {cleanVector,catenary,bezier,edgeNormals,angleBucket} from '../src/geometry.js';
import {recordDrawing} from '../src/drawing.js';
import {cleanSubject} from '../src/quality.js';
import {random} from '../src/random.js';

const SIZE=96;
const surface=(size=SIZE,options={})=>{const pixels=new Uint8Array(size*size).fill(255),intent=new Map();return {pixels,intent,p:raster(pixels,size,{pixelArt:true,intent,...options})};};
const occupied=(pixels,size=SIZE)=>{const out=[];for(let i=0;i<pixels.length;i++)if(pixels[i]!==255)out.push([i%size,Math.floor(i/size)]);return out;};
function components8(points) {
  const key=([x,y])=>x*4096+y,todo=new Map(points.map(p=>[key(p),p]));let count=0;
  while(todo.size){
    count++;const [first]=todo.values(),stack=[first];todo.delete(key(first));
    while(stack.length){const [x,y]=stack.pop();for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const k=key([x+dx,y+dy]);if(todo.has(k)){stack.push(todo.get(k));todo.delete(k);}}}
  }
  return count;
}
// A 2x2 window holding three pixels of a 1 px stroke is an L-corner.
function lCorners(points) {
  const set=new Set(points.map(([x,y])=>x*4096+y)),has=(x,y)=>set.has(x*4096+y),out=[];
  for(const [x,y] of points)for(const [ox,oy] of [[0,0],[-1,0],[0,-1],[-1,-1]]){
    const a=x+ox,b=y+oy,n=has(a,b)+has(a+1,b)+has(a,b+1)+has(a+1,b+1);
    if(n>=3)out.push([a,b]);
  }
  return out;
}

test('inkPath over 500 random polylines is 8-connected with no L-corners, duplicates or lost endpoints',()=>{
  const r=random(19);
  for(let n=0;n<500;n++){
    // Directions stay within 70 degrees of a base heading, so the path never
    // folds back onto itself; sharp turns up to 140 degrees still occur.
    const base=r(360)*Math.PI/180,count=2+r(5),points=[[90+r(76)+r(10)/10,90+r(76)+r(10)/10]];
    for(let i=1;i<count;i++){
      const angle=base+(r(141)-70)*Math.PI/180,length=2+r(22),[x,y]=points[i-1];
      points.push([x+Math.cos(angle)*length,y+Math.sin(angle)*length]);
    }
    const pixels=inkPixels(points),d=surface(256);d.p.inkPath(points,3);
    const label=JSON.stringify(points);
    const round=v=>Math.round(v)+0;
    assert.deepEqual(pixels[0],points[0].map(round),label);
    assert.deepEqual(pixels.at(-1),points.at(-1).map(round),label);
    assert.equal(new Set(pixels.map(([x,y])=>x*4096+y)).size,pixels.length,'no duplicate pixels '+label);
    for(let i=1;i<pixels.length;i++){
      const dx=Math.abs(pixels[i][0]-pixels[i-1][0]),dy=Math.abs(pixels[i][1]-pixels[i-1][1]);
      assert.ok(Math.max(dx,dy)===1,'consecutive pixels are 8-adjacent '+label);
    }
    const image=occupied(d.pixels,256);
    assert.equal(components8(image),1,'8-connected '+label);
    assert.deepEqual(lCorners(image),[],'no 2x2 window holds three path pixels '+label);
    assert.equal(image.length,pixels.length,'every listed pixel is drawn once');
  }
});

test('inkPath keeps arbitrary polylines connected, closes loops cleanly and colours steps by arc length',()=>{
  const r=random(7);
  for(let n=0;n<200;n++){
    const points=Array.from({length:2+r(5)},()=>[5+r(80)+r(4)/4,5+r(80)+r(4)/4]);
    const pixels=inkPixels(points),set=new Set(pixels.map(([x,y])=>x*4096+y));
    assert.equal(set.size,pixels.length);
    assert.equal(components8(pixels),1,'crossings and fold-backs stay one stroke');
    assert.deepEqual(pixels[0],points[0].map(v=>Math.round(v)+0));
    assert.ok(set.has(Math.round(points.at(-1)[0])*4096+Math.round(points.at(-1)[1])),'the last endpoint is drawn');
  }
  for(const loop of [[[10,10],[40,10],[40,30],[10,30]],[[48,6],[70,20],[48,34],[26,20]],[[20,50],[60,52],[44,80]]]){
    const pixels=inkPixels(loop,true);
    assert.deepEqual(lCorners(pixels),[],'closed loop corners are cut, never L-shaped');
    assert.equal(components8(pixels),1);
    for(let i=0;i<pixels.length;i++){
      const a=pixels[i],b=pixels[(i+1)%pixels.length];
      assert.equal(Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])),1,'the loop closes on itself');
    }
  }
  const d=surface();d.p.inkPath([[5,40],[85,40]],[[1,.25],[2,.5],[3,1]]);
  const row=Array.from({length:81},(_,i)=>d.pixels[40*SIZE+5+i]);
  assert.deepEqual([...new Set(row)],[1,2,3]);
  for(let i=1;i<row.length;i++)assert.ok(row[i]>=row[i-1],'steps follow arc length');
  assert.equal(row.filter(c=>c===1).length,21);
});

test('streak tapers monotonically, keeps a clean 1 px tail and colours by t',()=>{
  for(const y of [20,20.5,20.25])for(const [r0,r1] of [[1.5,.3],[2.2,.5],[1,1],[.9,.3]]){
    const d=surface();d.p.streak([6,y],[40,y],[80,y],r0,r1,6);
    const counts=[];
    for(let x=6;x<80;x++){let n=0;for(let j=0;j<SIZE;j++)if(d.pixels[j*SIZE+x]!==255)n++;counts.push(n);}
    for(let i=1;i<counts.length;i++)assert.ok(counts[i]<=counts[i-1],`taper ${y} ${r0}->${r1} at ${i}: ${counts.join('')}`);
    assert.ok(counts.at(-1)>=1,'the tip reaches the end');
    assert.equal(components8(occupied(d.pixels)),1);
  }
  const r=random(23);
  for(let n=0;n<60;n++){
    const root=[10+r(30),10+r(70)],end=[50+r(40),10+r(70)],ctrl=[(root[0]+end[0])/2+r(21)-10,(root[1]+end[1])/2+r(21)-10];
    const r0=1+r(10)/10,pixels=streakPixels(root,ctrl,end,r0,.3);
    assert.equal(components8(pixels),1,'streak stays one 8-connected shape');
    const tail=pixels.filter(([,,t])=>r0+(.3-r0)*t<STREAK_THIN);
    assert.deepEqual(lCorners(tail),[],'the thin tail has no L-corners');
  }
  const d=surface();d.p.streak([4,40.5],[40,40.5],[90,40.5],1.5,.3,[[7,.3],[6,.65],[5,1]]);
  const colors=[];for(let x=4;x<90;x++)colors.push(d.pixels[40*SIZE+x]);
  assert.deepEqual([...new Set(colors)],[7,6,5],'bands run root to tip');
  const tail=occupied(d.pixels).filter(([x])=>x>70);
  assert.ok(tail.every(([,y])=>y===40),'thin end is a single row');
});

test('glint and stamp draw in device pixels and register intent that cleanup keeps',()=>{
  const d=surface();
  viewport(d.p,{x:3.2,y:2.7,scale:.5}).glint(20,20,{arms:[2,1,0,3],core:8,tip:7});
  const at=(x,y)=>d.pixels[y*SIZE+x],cx=Math.round(3.2+10),cy=Math.round(2.7+10);
  assert.equal(at(cx,cy),8);assert.equal(at(cx,cy-1),8);assert.equal(at(cx,cy-2),7);
  assert.equal(at(cx+1,cy),8);assert.equal(at(cx+2,cy),255);assert.equal(at(cx,cy+1),255);
  assert.equal(at(cx-3,cy),7);assert.equal(at(cx-2,cy),8);
  const painted=occupied(d.pixels);
  assert.equal(painted.length,7);
  for(const [x,y] of painted)assert.deepEqual(d.intent.get(y*SIZE+x),{color:at(x,y),reason:'glint'});
  const quiet=surface();quiet.p.glint(10,10,{reason:null});
  assert.equal(quiet.intent.size,0);assert.equal(occupied(quiet.pixels).length,5);

  const s=surface();
  s.p.stamp(30,30,['.a.a.','aabaa','..c..'],{a:6,b:8,c:4},{reason:'face'});
  s.p.stamp(60,10,['x.x','...','x.x'],{x:5},{anchor:'topleft',reason:'rivets'});
  s.p.stamp(10,60,['dd','d.'],{d:3});
  assert.equal(s.pixels[29*SIZE+29],6);assert.equal(s.pixels[30*SIZE+30],8);assert.equal(s.pixels[31*SIZE+30],4);
  assert.equal(s.pixels[10*SIZE+60],5);assert.equal(s.pixels[12*SIZE+62],5);assert.equal(s.pixels[11*SIZE+61],255);
  const reasons=[...s.intent].map(([i,mark])=>[i%SIZE,Math.floor(i/SIZE),mark.reason]);
  assert.deepEqual(reasons.filter(r=>r[2]==='face').map(r=>r.slice(0,2)),[[30,30],[30,31]],'colour singletons in the stamp are intent');
  assert.equal(reasons.filter(r=>r[2]==='rivets').length,4);
  assert.equal(reasons.length,6,'stamps without a reason register nothing');
  assert.throws(()=>s.p.stamp(5,5,['q'],{a:1}),/no colour/);
  const layer=s.pixels.slice();cleanSubject(layer,{size:SIZE,intent:s.intent});
  for(const [x,y] of [[60,10],[62,10],[60,12],[62,12]])assert.equal(layer[y*SIZE+x],5,'detached rivets survive cleanup');
  // A reflected part mirrors the stamp's anchoring, never its art.
  const m=surface();part(m.p,{x:80,flipX:true}).stamp(10,20,['ab'],{a:1,b:2},{anchor:'topleft'});
  assert.equal(m.pixels[20*SIZE+69],1);assert.equal(m.pixels[20*SIZE+70],2);
});

function polygon(r,convex) {
  const n=3+r(6),cx=20+r(56)+r(8)/8,cy=20+r(56)+r(8)/8,points=[];
  for(let i=0;i<n;i++){const a=(i+r(60)/100)*2*Math.PI/n,radius=convex?6+r(12):4+r(16);points.push([cx+Math.cos(a)*radius,cy+Math.sin(a)*radius*.8]);}
  return points;
}
test('facetPoly covers exactly poly, lights device edges through flipX and seats its glint on the boundary',()=>{
  const r=random(5);
  for(let n=0;n<150;n++){
    const points=polygon(r,n%2===0),a=surface(),b=surface();
    a.p.facetPoly(points,{mid:6,lit:7,dark:5,glint:{color:8,reason:'gem'}});b.p.poly(points,6);
    assert.deepEqual(a.pixels.map(v=>v===255),b.pixels.map(v=>v===255),'coverage equals poly');
    const [g]=[...a.intent];
    if(g){
      const x=g[0]%SIZE,y=Math.floor(g[0]/SIZE);
      assert.equal(a.pixels[g[0]],8);assert.equal(g[1].reason,'gem');
      assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>b.pixels[(y+dy)*SIZE+x+dx]===255),'glint on the boundary');
    }
    // Through a reflected part the classes are those of the device polygon.
    const flipped=surface(),direct=surface(),settings={x:90,y:3,scaleX:.9,scaleY:1.1,flipX:true};
    part(flipped.p,settings).facetPoly(points,{mid:6,lit:7,dark:5});
    direct.p.facetPoly(points.map(([u,v])=>[90-u*.9,3+v*1.1]).reverse(),{mid:6,lit:7,dark:5});
    assert.deepEqual(flipped.pixels,direct.pixels,'winding does not matter, only device normals');
  }
  // A symmetric gem lights its device top-left both ways round.
  const gem=[[30,10],[42,22],[30,34],[18,22]],plain=surface(),mirror=surface();
  plain.p.facetPoly(gem,{mid:6,lit:7,dark:5,glint:{color:8}});
  part(mirror.p,{x:60,flipX:true}).facetPoly(gem,{mid:6,lit:7,dark:5,glint:{color:8}});
  assert.deepEqual(mirror.pixels,plain.pixels);
  assert.equal(plain.pixels[13*SIZE+27],7,'upper-left edge is lit');assert.equal(plain.pixels[30*SIZE+33],5,'lower-right edge is dark');
  assert.equal(plain.pixels[13*SIZE+32],6,'upper-right edge is mid');assert.equal(plain.pixels[22*SIZE+30],6,'interior is mid');
  const [[glintAt]]=[...plain.intent];assert.ok(Math.floor(glintAt/SIZE)<=12,'the tie goes to the top vertex');
});

test('poly scanline fill matches the per-pixel inside test on random and degenerate polygons',()=>{
  const r=random(11);
  for(let n=0;n<300;n++){
    const points=Array.from({length:3+r(7)},()=>[r(1100)/10-5,r(1100)/10-5]);
    const a=new Uint8Array(SIZE*SIZE),b=a.slice();
    raster(a,SIZE,{pixelArt:true}).poly(points,1);raster(b,SIZE,{pixelArt:false}).poly(points,1);
    assert.deepEqual(a,b,JSON.stringify(points));
  }
  for(const points of [[[10,10],[30,10],[30,10]],[[5,5],[50,5],[50,40],[5,40],[5,5]],[[0,0],[95,0],[95,95],[0,95]],[[10,10],[NaN,20],[30,30]],[[10,10],[Infinity,20],[30,30]]]){
    const a=new Uint8Array(SIZE*SIZE),b=a.slice();
    raster(a,SIZE,{pixelArt:true}).poly(points,1);raster(b,SIZE,{pixelArt:false}).poly(points,1);
    assert.deepEqual(a,b,JSON.stringify(points));
  }
});

// Verbatim engine-18 materials.js ditherTone.
const CHECKER=[0,2,3,1];
function ditherTone18(light,ramp,x,y) {
  const value=Math.max(0,Math.min(1,light))*(ramp.length-1),lo=Math.floor(value);
  const rank=CHECKER[((Math.floor(y)&1)<<1)+(Math.floor(x)&1)];
  return ramp[Math.min(ramp.length-1,lo+(rank<Math.round((value-lo)*4)?1:0))];
}
test('ditherTone seams: seam 1 is engine 18, narrow seams dither only inside their band',()=>{
  for(const ramp of [[1,2,3],[5,6,7,8],[4],[2,9]])for(let i=-40;i<=140;i++)for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    const light=i/100+x*.0013;
    assert.equal(ditherTone(light,ramp,x+.5,y+.5),ditherTone18(light,ramp,x+.5,y+.5));
    assert.equal(ditherTone(light,ramp,x+.5,y+.5,1),ditherTone18(light,ramp,x+.5,y+.5));
  }
  const ramp=[1,2,3,4];
  for(let i=0;i<=300;i++){
    const light=i/300,value=light*3,f=value-Math.floor(value);
    const tones=new Set([[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>ditherTone(light,ramp,x,y,.3)));
    if(f<.35||f>.65)assert.equal(tones.size,1,'flat plateau outside the seam at '+light);
    const hard=new Set([[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>ditherTone(light,ramp,x,y,0)));
    assert.equal(hard.size,1,'seam 0 never dithers');
  }
  assert.equal(new Set([[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>ditherTone(.5/3,ramp,x,y,.3))).size,2,'the seam itself dithers');
  for(let level=0;level<=3;level++)for(const [x,y] of [[0,0],[1,1]])assert.equal(levelTone(level,ramp,x,y),ramp[level]);
  assert.equal(levelTone(2,[6],0,0),6);
});

test('shaft stays clipped to its quad and lights the side facing the key',()=>{
  const r=random(3);
  for(let n=0;n<80;n++){
    const x0=10+r(70)+r(4)/4,y0=10+r(70),x1=10+r(70),y1=10+r(70)+r(4)/4,w=2+r(8);
    if(Math.hypot(x1-x0,y1-y0)<4)continue;
    const d=surface();shaft(d.p,{x0,y0,x1,y1,w,ramp:[5,6,7],bands:r(4),spec:r(2)?8:null});
    const ax=x1-x0,ay=y1-y0,length=Math.hypot(ax,ay);
    for(const [i,j] of occupied(d.pixels)){
      const qx=i+.5-x0,qy=j+.5-y0,t=(qx*ax+qy*ay)/(length*length),u=Math.abs(qx*ay-qy*ax)/length;
      assert.ok(t>=-1e-9&&t<1+1e-9&&u<=w/2+1e-9,'pixel inside the quad');
    }
  }
  for(const [y0,y1] of [[10,60],[60,10]]){
    const d=surface();shaft(d.p,{x0:40.5,y0,x1:40.5,y1,w:7,ramp:[5,6,7]});
    assert.equal(d.pixels[30*SIZE+38],7,'left (key) side is light');assert.equal(d.pixels[30*SIZE+43],5,'right side is dark');
  }
  const flat=surface();shaft(flat.p,{x0:10,y0:40.5,x1:80,y1:40.5,w:7,ramp:[5,6,7],spec:true});
  assert.equal(flat.pixels[38*SIZE+40],7,'top is lit on a horizontal shaft');assert.equal(flat.pixels[43*SIZE+40],5);
  assert.ok(flat.pixels.includes(8),'specular streak');
  const banded=surface();shaft(banded.p,{x0:40.5,y0:10,x1:40.5,y1:70,w:5,ramp:[5,6,7],bands:6});
  const column=Array.from({length:60},(_,j)=>banded.pixels[(10+j)*SIZE+40]);
  assert.ok(new Set(column).size>1,'bands step the ramp');
});

test('geometry helpers: catenary, clean vectors, angle buckets, bezier and edge normals',()=>{
  for(const [w,sag] of [[30,6],[41,9],[60,12],[24,3]]){
    const points=catenary(10,20,10+w,20,sag);
    assert.equal(points.length,w+1);
    points.forEach(([x],k)=>assert.equal(x,10+k));
    for(let k=0;k<=w;k++)assert.equal(points[k][1],points[w-k][1],'exactly symmetric');
    const ys=points.map(([,y])=>Math.round(y)),runs=[];
    for(const y of ys)if(runs.length&&runs.at(-1)[0]===y)runs.at(-1)[1]++;else runs.push([y,1]);
    const half=runs.slice(0,Math.ceil(runs.length/2)).map(r=>r[1]);
    for(let i=1;i<half.length;i++)assert.ok(half[i]>=half[i-1],'runs lengthen toward the sag: '+half);
    for(let i=1;i<runs.length;i++)assert.equal(Math.abs(runs[i][0]-runs[i-1][0]),1,'one-pixel steps on a shallow cable');
    assert.equal(Math.max(...ys),20+sag);
    assert.equal(components8(points),1);
  }
  assert.deepEqual(catenary(5,5,5,9,3),[[5,5]]);
  for(const [y1,sag] of [[30,8],[12,6],[40,3],[20,-7]]){
    const points=catenary(4,20,60,y1,sag);
    assert.deepEqual(points[0],[4,20]);assert.deepEqual(points.at(-1),[60,y1]);
    const d=surface();d.p.inkPath(points,1);
    assert.deepEqual(lCorners(occupied(d.pixels)),[],'a slanted cable draws as a clean ink path');
  }
  const ratios=[0,1/8,1/6,1/4,1/3,1/2,2/3,1],r=random(9);
  for(let n=0;n<500;n++){
    const dx=r(201)-100,dy=r(201)-100,[a,b]=cleanVector(dx,dy),major=Math.max(Math.abs(dx),Math.abs(dy));
    if(!major){assert.deepEqual([a,b],[0,0]);continue;}
    assert.equal(Math.max(Math.abs(a),Math.abs(b)),major,'keeps the major extent');
    assert.ok(ratios.some(q=>Math.abs(Math.min(Math.abs(a),Math.abs(b))/major-q)<1e-12),'whole ratio');
    if(a)assert.equal(Math.sign(a),Math.sign(dx));if(b)assert.equal(Math.sign(b),Math.sign(dy));
    const ratio=Math.min(Math.abs(dx),Math.abs(dy))/major,chosen=Math.min(Math.abs(a),Math.abs(b))/major;
    assert.ok(ratios.every(q=>Math.abs(q-ratio)>=Math.abs(chosen-ratio)-1e-12),'nearest ratio');
  }
  for(const n of [4,8,12,16])for(let k=0;k<400;k++){
    const dx=r(2001)-1000,dy=r(2001)-1000;if(!dx&&!dy)continue;
    const angle=(Math.atan2(dy,dx)+2*Math.PI)%(2*Math.PI),exact=angle/(2*Math.PI/n);
    if(Math.abs(exact-Math.round(exact))<1e-6)continue;
    assert.equal(angleBucket(dx,dy,n),Math.floor(exact)%n,`${dx},${dy}/${n}`);
  }
  assert.equal(angleBucket(1,0,12),0);assert.equal(angleBucket(0,1,4),1);assert.equal(angleBucket(-1,0,4),2);assert.equal(angleBucket(0,-1,4),3);
  assert.equal(angleBucket(0,0,8),0);
  const curve=bezier([0,0],[10,20],[20,0],24);
  assert.equal(curve.length,24);assert.deepEqual(curve[0],[0,0]);assert.deepEqual(curve.at(-1),[20,0]);assert.ok(Math.abs(curve[0][1]-curve[23][1])<1e-12);
  const square=[[0,0],[10,0],[10,10],[0,10]];
  assert.deepEqual(edgeNormals(square),[[0,-1],[1,0],[0,1],[-1,0]]);
  assert.deepEqual(edgeNormals([...square].reverse()),[[0,1],[1,0],[0,-1],[-1,0]],'reversed winding stays outward');
  assert.ok(Math.abs(Math.hypot(...KEY)-1)<1e-12);assert.ok(KEY[0]<0&&KEY[1]<0&&KEY[2]>0);
  assert.ok(Math.abs(lambert(...KEY)-1)<1e-12);assert.equal(lambert(-KEY[0],-KEY[1],-KEY[2]),0);
});

test('noise2 is deterministic integer value noise that interpolates its lattice',()=>{
  const values=new Set();
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const v=noise2('stage',x,y,8);
    assert.ok(Number.isInteger(v)&&v>=0&&v<=255);values.add(v);
    assert.equal(v,noise2('stage',x,y,8));
  }
  assert.ok(values.size>60);
  for(let x=0;x<56;x++){const a=noise2(42,x,5,8),b=noise2(42,x+1,5,8);assert.ok(Math.abs(a-b)<=32,'neighbours change by at most a lattice step / scale');}
  assert.notEqual([0,8,16,24].map(x=>noise2('a',x,0,8)).join(),[0,8,16,24].map(x=>noise2('b',x,0,8)).join());
});

// Every engine-19 primitive in one recipe-space scene.
function scene(p) {
  p.group(q=>{q.rect(4,4,20,12,5);q.ellipse(30,12,8,6,6);q.detail(10,8,8,'eye');},{outline:1,color:4,shadow:{x:2,y:2}});
  p.inkPath([[4,30],[20,24],[36,34]],[[6,.5],[7,1]]);
  p.streak([40,40],[60,30],[80,44],1.5,.3,[[7,.4],[6,1]]);
  p.glint(50,10,{arms:2,tip:7});
  p.stamp(70,10,['.a.','aba'],{a:5,b:8},{reason:'stud'});
  p.facetPoly([[10,50],[20,40],[30,50],[20,60]],{mid:6,lit:7,dark:5,glint:{color:8}});
  p.sample(40,50,20,10,(x,y,dx)=>(Math.floor(dx)&1)?6:null);
  p.sphere(70,60,6,(nx,ny)=>nx<0?7:5);p.ring(80,80,6,4,4,1);p.line(2,90,40,80,6);p.poly([[50,70],[60,90],[40,90]],5);
}
test('recolor emits only mapped colours, drops effects and intent, and replays recordings',()=>{
  const d=surface(),map=c=>c===5?2:c===8?9:3;
  scene(recolor(viewport(d.p,{x:2,y:1,scale:.9}),map));
  const used=new Set(d.pixels.filter(v=>v!==255));
  assert.deepEqual([...used].sort(),[2,3,9]);
  assert.equal(d.intent.size,0,'echoes register no intent');
  const table=surface();scene(recolor(table.p,{5:1,6:1,7:1}));
  assert.ok(!table.pixels.some(v=>v===5||v===6||v===7));assert.ok(table.pixels.includes(8),'unmapped colours pass through a lookup');
  // A recorded drawing replays the new primitives exactly as drawn directly.
  const recording=recordDrawing();scene(recording.p);
  const direct=surface(),replay=surface(),frame={x:3.5,y:2.25,scale:.8};
  scene(viewport(direct.p,frame));recording.draw(viewport(replay.p,frame));
  assert.deepEqual(replay.pixels,direct.pixels);assert.deepEqual([...replay.intent],[...direct.intent]);
  const echo=surface(),plain=surface(SIZE,{effects:false});
  recording.draw(recolor(viewport(echo.p,frame),()=>2));recording.draw(viewport(plain.p,frame));
  assert.deepEqual(echo.pixels.map(v=>v!==255),plain.pixels.map(v=>v!==255),'an echo is the silhouette without group effects');
  assert.ok(direct.pixels.filter(v=>v!==255).length>plain.pixels.filter(v=>v!==255).length);
});

test('viewport and part map new primitives without scaling device sizes',()=>{
  for(const scale of [.5,.73,1.4]){
    const d=surface();const p=viewport(d.p,{x:4,y:6,scale});
    p.inkPath([[0,0],[40,10]],1);p.glint(20,40,{arms:2});p.stamp(40,40,['aaa'],{a:2});
    p.streak([0,60],[20,60],[50,60],1.2,.3,3);p.facetPoly([[50,0],[60,10],[50,20],[40,10]],{mid:5});
    const strokes=occupied(d.pixels).filter(([x,y])=>d.pixels[y*SIZE+x]===1);
    assert.deepEqual(lCorners(strokes),[],'inkPath stays 1 px at scale '+scale);
    assert.equal(occupied(d.pixels).filter(([x,y])=>d.pixels[y*SIZE+x]===8).length,9,'glint arms are device pixels');
    assert.equal(occupied(d.pixels).filter(([x,y])=>d.pixels[y*SIZE+x]===2).length,3,'stamp is device pixels');
  }
  const a=surface(),b=surface();
  part(a.p,{x:80,y:2,scaleX:.8,scaleY:1.2,flipX:true}).glint(20,20,{arms:[0,3,0,1]});
  b.p.glint(80-16,2+24,{arms:[0,1,0,3]});
  assert.deepEqual(a.pixels,b.pixels,'reflected glints mirror their arms');
});

test('new primitives record their provenance kind and grow a measure-only sink like a real render',async()=>{
  const {PROVENANCE}=await import('../src/raster.js');
  const kinds=new Uint8Array(SIZE*SIZE),pixels=new Uint8Array(SIZE*SIZE).fill(255),p=raster(pixels,SIZE,{pixelArt:true,provenance:kinds});
  p.inkPath([[2,2],[20,8]],1);p.streak([2,30],[20,26],[40,32],1.5,.3,2);p.glint(60,10);p.stamp(80,10,['aa'],{a:3});
  p.facetPoly([[50,40],[60,50],[50,60],[40,50]],{mid:6,lit:7,dark:5,glint:{color:8}});
  const at=(x,y)=>kinds[y*SIZE+x];
  assert.equal(at(2,2),PROVENANCE.inkPath);assert.equal(at(2,30),PROVENANCE.streak);assert.equal(at(60,10),PROVENANCE.glint);
  assert.equal(at(80,10),PROVENANCE.stamp);assert.equal(at(50,50),PROVENANCE.facetPoly);
  for(let i=0;i<kinds.length;i++)assert.equal(kinds[i]!==0,pixels[i]!==255,'every written pixel has a kind');
  const recording=recordDrawing();scene(recording.p);
  for(const frame of [{x:64,y:64,scale:1},{x:70.3,y:58.6,scale:.7}]){
    const bounds={left:256,top:256,right:-1,bottom:-1},layer=new Uint8Array(256*256).fill(255);
    recording.draw(viewport(raster(null,256,{pixelArt:true,effects:false,bounds}),frame));
    recording.draw(viewport(raster(layer,256,{pixelArt:true,effects:false}),frame));
    const painted=[];for(let i=0;i<layer.length;i++)if(layer[i]!==255)painted.push([i%256,Math.floor(i/256)]);
    assert.deepEqual(bounds,{left:Math.min(...painted.map(q=>q[0])),top:Math.min(...painted.map(q=>q[1])),right:Math.max(...painted.map(q=>q[0])),bottom:Math.max(...painted.map(q=>q[1]))});
  }
});
