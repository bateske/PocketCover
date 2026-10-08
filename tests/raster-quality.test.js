import test from 'node:test';
import assert from 'node:assert/strict';
import {raster,viewport} from '../src/raster.js';

const SIZE=96;
function drawing(){const pixels=new Uint8Array(SIZE*SIZE);return {pixels,p:raster(pixels,SIZE,{pixelArt:true})};}
function components(pixels){
  const seen=new Set(),groups=[];
  for(let i=0;i<pixels.length;i++)if(pixels[i]&&!seen.has(i)){
    const queue=[i],group=[];seen.add(i);
    while(queue.length){
      const at=queue.pop(),x=at%SIZE,y=Math.floor(at/SIZE);group.push(at);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy,next=yy*SIZE+xx;
        if(xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE&&pixels[next]&&!seen.has(next)){seen.add(next);queue.push(next);}
      }
    }
    groups.push(group);
  }
  return groups;
}

test('pixel-art straight lines have balanced runs, no gaps, and identical reversed endpoints',()=>{
  for(let dx=0;dx<=24;dx++)for(let dy=0;dy<=24;dy++)for(const sign of [-1,1]){
    const a=drawing(),b=drawing(),x0=30,y0=40,x1=x0+dx,y1=y0+dy*sign;
    a.p.line(x0,y0,x1,y1,1);b.p.line(x1,y1,x0,y0,1);
    assert.deepEqual(a.pixels,b.pixels,`reversal ${dx},${dy},${sign}`);
    const groups=components(a.pixels),major=Math.max(dx,dy),minor=Math.min(dx,dy);
    assert.equal(groups.length,1);assert.equal(groups[0].length,major+1);
    const coordinates=groups[0].map(i=>[i%SIZE-x0,(Math.floor(i/SIZE)-y0)*sign]);
    const steep=dy>dx;
    coordinates.sort((a,b)=>a[steep?1:0]-b[steep?1:0]);
    const runs=[];let last=-1;
    for(const [x,y] of coordinates){
      const u=steep?y:x,v=steep?x:y;
      if(major)assert.ok(Math.abs(v-u*minor/major)<=.500000001,'nearest integer staircase');
      if(v===last)runs[runs.length-1]++;else{runs.push(1);last=v;}
    }
    if(runs.length>2){const middle=runs.slice(1,-1);assert.ok(Math.max(...middle)-Math.min(...middle)<=1,'interior runs differ by at most one pixel');}
  }
});

test('fractional rectangles retain thin features and shared edges after shrinking',()=>{
  const a=drawing(),b=drawing(),frame={x:6.1,y:9.7,scale:.73};
  const left=viewport(a.p,frame),whole=viewport(b.p,frame);
  left.rect(3,4,11,13,1);left.rect(14,4,7,13,1);whole.rect(3,4,18,13,1);
  assert.deepEqual(a.pixels,b.pixels,'adjacent rectangle edges use the same rounding');
  const tiny=drawing();tiny.p.rect(20.1,20.1,.2,.2,1);
  assert.equal(tiny.pixels[20*SIZE+20],1);assert.equal(tiny.pixels.filter(Boolean).length,1);
  tiny.p.rect(30,30,0,1,1);tiny.p.rect(30,30,1,0,1);tiny.p.rect(30,30,-1,1,1);
  assert.equal(tiny.pixels.filter(Boolean).length,1,'empty rectangles paint nothing');
  for(const scale of [.65,.73,.91,1]){
    const c=drawing(),p=viewport(c.p,{x:3.1,y:4.9,scale});
    p.rect(20,20,30,1,1);p.line(50,20,50,35,1);p.rect(50,35,1,12,1);
    assert.equal(components(c.pixels).length,1,'thin attached features stay attached');
  }
});

test('filled circles and rings share symmetric contours and preserve their opening',()=>{
  for(let radius=2;radius<=24;radius++){
    const solid=drawing(),ring=drawing();solid.p.ellipse(48,48,radius,radius,1);ring.p.ring(48,48,radius,radius,1,.5);
    assert.equal(components(ring.pixels).length,1);
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const i=y*SIZE+x;
      assert.equal(solid.pixels[i],solid.pixels[y*SIZE+(SIZE-1-x)],'horizontal reflection');
      assert.equal(solid.pixels[i],solid.pixels[(SIZE-1-y)*SIZE+x],'vertical reflection');
      assert.ok(!ring.pixels[i]||solid.pixels[i],'ring stays within its filled shape');
      if(solid.pixels[i]&&(!solid.pixels[i-1]||!solid.pixels[i+1]||!solid.pixels[i-SIZE]||!solid.pixels[i+SIZE]))assert.equal(ring.pixels[i],1,'no missing contour pixel');
    }
  }
  const d=drawing();d.pixels.fill(2);d.p.ring(48,48,18,9,7,2,.4);
  assert.equal(d.pixels[48*SIZE+48],2);assert.ok(d.pixels.includes(7));
});

test('rotated thin rings remain connected at fractional viewport sizes',()=>{
  // Thin eccentric ellipses were the worst case for analytic inset subtraction:
  // a subpixel-wide shell could leave dozens of disconnected edge fragments.
  for(const scale of [.65,.73,1])for(const rx of [3,8,18,30])for(const ry of [2,3,7,rx])for(let step=0;step<12;step++){
    const d=drawing(),p=viewport(d.p,{x:1.3,y:1.1,scale});p.ring(45,45,rx,ry,1,1,step*Math.PI/12);
    assert.equal(components(d.pixels).length,1,`ring ${rx},${ry},${scale},${step}`);
  }
});

test('orbital half arcs stay connected and together reproduce a full ring',()=>{
  for(const scale of [.65,.73,1])for(const [rx,ry] of [[24,7],[36,10],[42,14]])for(let step=0;step<12;step++){
    const front=drawing(),back=drawing(),full=drawing(),frame={x:1.3,y:1.1,scale},angle=step*Math.PI/12;
    viewport(front.p,frame).arc(45,45,rx,ry,1,1,angle,0,Math.PI);
    viewport(back.p,frame).arc(45,45,rx,ry,1,1,angle,Math.PI,Math.PI*2);
    viewport(full.p,frame).ring(45,45,rx,ry,1,1,angle);
    assert.equal(components(front.pixels).length,1);assert.equal(components(back.pixels).length,1);
    assert.deepEqual(front.pixels.map((v,i)=>v||back.pixels[i]),full.pixels);
  }
  const tiny=drawing();tiny.p.arc(45,45,18,1.5,1,1,0,0,Math.PI);
  assert.ok(tiny.pixels.every(v=>v===0),'partial arcs omit sub-2-pixel radii instead of leaving fragments');
  tiny.p.ring(45,45,18,1.5,1,1);
  assert.equal(components(tiny.pixels).length,1,'full thin rings remain supported');
});

test('continuous materials sample each final pixel once using inverse viewport coordinates',()=>{
  for(const scale of [.65,.73,1,1.5]){
    const d=drawing(),frame={x:9.2,y:10.7,scale},calls=new Map();
    d.pixels.fill(5);
    viewport(d.p,frame).sample(3,4,11,13,(x,y)=>{
      const px=frame.x+x*scale,py=frame.y+y*scale;
      assert.ok(Math.abs(px-Math.floor(px)-.5)<1e-10);assert.ok(Math.abs(py-Math.floor(py)-.5)<1e-10);
      assert.ok(x>=3-1e-10&&x<14);assert.ok(y>=4-1e-10&&y<17);
      const i=Math.floor(py)*SIZE+Math.floor(px);calls.set(i,(calls.get(i)||0)+1);
      return x<8?0:null;
    });
    assert.ok(calls.size>0);assert.ok([...calls.values()].every(n=>n===1),'no duplicated forward-mapped texels');
    for(let i=0;i<d.pixels.length;i++){
      const x=(i%SIZE+.5-frame.x)/scale,y=(Math.floor(i/SIZE)+.5-frame.y)/scale;
      assert.equal(d.pixels[i],x>=3&&x<8&&y>=4&&y<17?0:5,'null skips, index zero paints, domain is clipped');
    }
  }
});
