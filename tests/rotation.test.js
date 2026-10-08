import test from 'node:test';
import assert from 'node:assert/strict';
import {raster,viewport,part} from '../src/raster.js';
import {outlineMask} from '../src/masks.js';
import {recordDrawing} from '../src/drawing.js';

const SIZE=128;
const surface=(options={})=>{const pixels=new Uint8Array(SIZE*SIZE).fill(255),intent=new Map();return {pixels,intent,p:raster(pixels,SIZE,{pixelArt:true,intent,...options})};};
function components4(pixels,keep=v=>v!==255) {
  const seen=new Uint8Array(pixels.length);let count=0;
  for(let i=0;i<pixels.length;i++)if(keep(pixels[i])&&!seen[i]){
    count++;const stack=[i];seen[i]=1;
    while(stack.length){const at=stack.pop(),x=at%SIZE;for(const next of [x>0?at-1:-1,x<SIZE-1?at+1:-1,at-SIZE,at+SIZE])if(next>=0&&next<pixels.length&&keep(pixels[next])&&!seen[next]){seen[next]=1;stack.push(next);}}
  }
  return count;
}
// Runs of the top profile (topmost covered row per column) between columns
// a and b, or of the left profile per row when transposed.
function profileRuns(pixels,from,to,transpose) {
  const values=[];
  for(let k=from;k<=to;k++){
    let edge=-1;
    for(let m=0;m<SIZE;m++){const i=transpose?k*SIZE+m:m*SIZE+k;if(pixels[i]!==255){edge=m;break;}}
    values.push(edge);
  }
  const runs=[];
  for(let i=0;i<values.length;i++)if(i&&values[i]===values[i-1])runs[runs.length-1]++;else runs.push(1);
  return {runs,values};
}

test('a rectangle turned by (2,1) has long-edge runs of exactly 2 and stays connected',()=>{
  for(const [x,y] of [[20,10],[20.3,10.7],[33.5,12.25]])for(const scale of [1,.73,1.3])for(const [w,h] of [[40,10],[50,16],[30,7]]){
    const d=surface();part(d.p,{x,y,scaleX:scale,scaleY:scale,rotate:[2,1]}).rect(0,0,w,h,6);
    assert.equal(components4(d.pixels),1,'one 4-connected solid');
    // The long top edge runs from the anchor (its topmost point) to the right.
    const c=2/Math.sqrt(5),right=x+c*w*scale;
    const {runs,values}=profileRuns(d.pixels,Math.ceil(x)+1,Math.floor(right)-1,false);
    const interior=runs.slice(1,-1);
    assert.ok(interior.length>=6,'a long edge was measured');
    assert.ok(interior.every(n=>n===2),`runs ${runs.join(',')} at ${x},${y},${scale},${w}x${h}`);
    for(let i=1;i<values.length;i++)assert.ok(values[i]-values[i-1]===0||values[i]-values[i-1]===1,'top steps one row at a time');
  }
});

test('every allowed whole-ratio vector gives even edge runs, including sign variants',()=>{
  for(const [dx,dy] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const d=surface();part(d.p,{x:64.2,y:64.6,rotate:[dx,dy]}).rect(-20,-6,40,12,5);
    assert.equal(components4(d.pixels),1);
    // Measure along the edge's major axis: columns for |dx|>=|dy|, rows otherwise.
    const steep=Math.abs(dy)>Math.abs(dx),runsOf=transpose=>{
      const values=[];
      for(let k=0;k<SIZE;k++){
        const covered=[];for(let m=0;m<SIZE;m++)if(d.pixels[transpose?k*SIZE+m:m*SIZE+k]!==255)covered.push(m);
        values.push(covered.length?covered[0]:null);
      }
      return values;
    };
    const values=runsOf(steep).filter(v=>v!==null),diffs=values.slice(1).map((v,i)=>v-values[i]);
    // The profile is two straight pieces; count runs of equal value along each.
    const runs=[];for(let i=0;i<values.length;i++)if(i&&values[i]===values[i-1])runs[runs.length-1]++;else runs.push(1);
    const expected=Math.abs(dx)===Math.abs(dy)?1:2;
    const longest=runs.slice(1,-1),counts=new Map();for(const n of longest)counts.set(n,(counts.get(n)||0)+1);
    assert.ok((counts.get(expected)||0)>=6,`${dx},${dy}: runs ${runs.join(',')}`);
    assert.ok(diffs.every(v=>Math.abs(v)<=(expected===2?1:1)||Math.abs(v)===2),`${dx},${dy}: steps ${diffs.join(',')}`);
  }
});

test('rotated parts keep effects in device pixels',()=>{
  for(const scale of [.6,1,1.4])for(const rotate of [[2,1],[1,1],[-1,2]]){
    const d=surface();
    part(viewport(d.p,{x:3.5,y:2.5,scale:.9}),{x:60,y:40,scaleX:scale,scaleY:scale*.8,rotate}).group(q=>{
      q.rect(-20,-8,40,16,6);q.round(-10,-4,20,8,3,7);
    },{outline:1,color:4,shadow:{x:2,y:3,color:3}});
    const material=d.pixels.map(v=>v===6||v===7?1:0),ring=outlineMask(material,SIZE,1);
    for(let i=0;i<d.pixels.length;i++){
      if(ring[i])assert.equal(d.pixels[i],4,'a 1 px device outline');
      else if(d.pixels[i]===4)assert.fail('no outline pixel beyond 1 device pixel');
      if(d.pixels[i]===3){const x=i%SIZE,y=Math.floor(i/SIZE);assert.equal(material[(y-3)*SIZE+x-2],1,'shadow offset is device (2,3)');}
    }
    assert.ok(d.pixels.includes(3)&&d.pixels.includes(7));
  }
});

test('rotation maps every primitive through one transform and its inverse',()=>{
  const c=2/Math.sqrt(5),s=1/Math.sqrt(5),x=50,y=40;
  const forward=(a,b)=>[x+c*a-s*b,y+s*a+c*b],inverse=(px,py)=>[c*(px-x)+s*(py-y),c*(py-y)-s*(px-x)];
  // sample: a pixel is painted exactly when its centre maps back into the box.
  const d=surface(),calls=new Map();
  part(d.p,{x,y,rotate:[2,1]}).sample(-10,-5,30,12,(u,v,dx,dy)=>{calls.set(Math.floor(dy)*SIZE+Math.floor(dx),[u,v]);return u<5?6:7;});
  for(let i=0;i<d.pixels.length;i++){
    const [u,v]=inverse(i%SIZE+.5,Math.floor(i/SIZE)+.5),inside=u>=-10&&u<20&&v>=-5&&v<7;
    if(Math.abs(u+10)>1e-4&&Math.abs(u-20)>1e-4&&Math.abs(v+5)>1e-4&&Math.abs(v-7)>1e-4)
      assert.equal(d.pixels[i]!==255,inside,'inverse-rotated domain');
    if(d.pixels[i]!==255)assert.equal(d.pixels[i],calls.get(i)[0]<5?6:7,'material follows local coordinates');
  }
  // ellipse: the analytic rotated shape (angle added).
  const e=surface();part(e.p,{x,y,scaleX:1.2,scaleY:.8,rotate:[1,2]}).ellipse(0,0,20,8,5,.2);
  const theta=Math.atan2(2,1),cc=Math.cos(theta),ss=Math.sin(theta);
  for(let i=0;i<e.pixels.length;i++){
    const dx=i%SIZE+.5-x,dy=Math.floor(i/SIZE)+.5-y,a=(cc*dx+ss*dy)/1.2,b=(cc*dy-ss*dx)/.8;
    const u=a*Math.cos(.2)+b*Math.sin(.2),v=b*Math.cos(.2)-a*Math.sin(.2),level=(u/20)**2+(v/8)**2;
    if(level<.8)assert.equal(e.pixels[i],5);if(level>1.05)assert.equal(e.pixels[i],255);
  }
  // sphere keeps its device shape; only its centre moves.
  const a=surface(),b=surface(),shade=(nx,ny,nz,px,py,edge)=>edge?4:nx<0?7:6;
  part(a.p,{x,y,rotate:[1,1]}).sphere(10,0,5,shade);
  b.p.sphere(x+10/Math.SQRT2,y+10/Math.SQRT2,5,shade);
  assert.deepEqual(a.pixels,b.pixels,'sphere shading stays in device space');
  // pipes fall back to strokes, lines and polys use the forward map.
  const p=surface();
  assert.doesNotThrow(()=>part(p.p,{x,y,rotate:[2,1]}).pipe([[0,0],[20,0],[20,20]],3,4));
  assert.ok(p.pixels.includes(3));
  const [ex,ey]=forward(20,20);
  assert.ok([[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].some(([ox,oy])=>p.pixels[(Math.round(ey)+oy)*SIZE+Math.round(ex)+ox]===3),'stroke reaches the turned end');
  // Recorded drawings replay through a rotated part identically.
  const recording=recordDrawing();
  recording.p.group(q=>{q.rect(0,0,20,8,6);q.detail(4,4,8,'rivet');},{outline:1,effectMask:(u)=>u<10});
  recording.p.facetPoly([[0,12],[8,12],[4,20]],{mid:6,lit:7,dark:5});recording.p.inkPath([[0,24],[20,30]],1);
  const direct=surface(),replay=surface(),settings={x:40,y:30,scaleX:.9,scaleY:1.1,flipX:true,rotate:[2,-1]};
  const draw=q=>{q.group(r=>{r.rect(0,0,20,8,6);r.detail(4,4,8,'rivet');},{outline:1,effectMask:(u)=>u<10});
    q.facetPoly([[0,12],[8,12],[4,20]],{mid:6,lit:7,dark:5});q.inkPath([[0,24],[20,30]],1);};
  draw(part(direct.p,settings));recording.draw(part(replay.p,settings));
  assert.deepEqual(replay.pixels,direct.pixels);assert.deepEqual([...replay.intent],[...direct.intent]);
  // The effect mask is inverse-rotated: only the local half u<10 is outlined.
  let outlined=0;
  for(let i=0;i<direct.pixels.length;i++)if(direct.pixels[i]===4){
    outlined++;
    const px=i%SIZE+.5,py=Math.floor(i/SIZE)+.5,h=Math.sqrt(5),cr=2/h,sr=-1/h,du=px-40,dv=py-30;
    assert.ok((cr*du+sr*dv)/(-.9)<10+1e-6,'mask follows the turned, reflected part');
  }
  assert.ok(outlined>0);
});

test('a rotated part reflects before it turns and rejects other vectors',()=>{
  const a=surface(),b=surface();
  part(a.p,{x:64,y:64,flipX:true,rotate:[2,1]}).poly([[0,0],[30,0],[30,10]],5);
  const c=2/Math.sqrt(5),s=1/Math.sqrt(5),F=(u,v)=>[64-c*u-s*v+2**-20,64-s*u+c*v+3*2**-22];
  b.p.poly([F(0,0),F(30,0),F(30,10)],5);
  assert.deepEqual(a.pixels,b.pixels,'flipX mirrors the local x before the turn');
  for(const rotate of [[1,0],[0,1],[3,1],[2,2],[1,3],[1.5,1],[0,0],'2,1',[2],[NaN,1]])
    assert.throws(()=>part(a.p,{rotate}),/whole-ratio/,String(rotate));
  assert.doesNotThrow(()=>part(a.p,{rotate:null}).rect(0,0,2,2,1),'null means no rotation');
});
