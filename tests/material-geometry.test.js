import test from 'node:test';
import assert from 'node:assert/strict';
import {dither,ditherTone} from '../src/materials.js';
import {preferredVector} from '../src/geometry.js';
import {raster,part,viewport} from '../src/raster.js';

test('continuous tone dithering agrees with the overlay checker and clamps its ramp',()=>{
  for(const amount of [0,.125,.25,.5,.75,.875,1]){
    const pixels=new Uint8Array(64).fill(5);
    dither(raster(pixels,8,{pixelArt:true}),{x:0,y:0,w:8,h:8,color:7,density:amount});
    pixels.forEach((value,i)=>assert.equal(ditherTone(amount,[5,7],i%8+.5,Math.floor(i/8)+.5),value));
  }
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    assert.equal(ditherTone(-10,[3,5,7],x,y),3);
    assert.equal(ditherTone(10,[3,5,7],x,y),7);
    assert.equal(ditherTone(.5,[3,5,7],x,y),5);
  }
});

test('geometry slope preferences preserve direction, joins and near-orthogonal short features',()=>{
  for(const vector of [[2,3],[30,0],[0,-12],[7,1],[14,7]])assert.deepEqual(preferredVector(...vector),vector);
  for(const [x,y] of [[40,11],[-40,11],[11,-40],[-11,-40],[60,19]]){
    const [dx,dy]=preferredVector(x,y);
    assert.equal(Math.sign(dx),Math.sign(x));assert.equal(Math.sign(dy),Math.sign(y));
    assert.equal(Math.max(Math.abs(dx),Math.abs(dy)),Math.max(Math.abs(x),Math.abs(y)));
    const ratio=Math.max(Math.abs(dx),Math.abs(dy))/Math.min(Math.abs(dx),Math.abs(dy));
    assert.ok(Math.abs(ratio-Math.round(ratio))<1e-10,'chosen long diagonal has repeating integer run ratio');
    assert.ok(Math.abs(Math.atan2(Math.abs(dx),Math.abs(dy))-Math.atan2(Math.abs(x),Math.abs(y)))<=.085);
  }
  assert.deepEqual(preferredVector(30,22),[30,22],'a substantially different angle is retained');
});

test('reflected parts invert material coordinates while keeping effects in device pixels',()=>{
  const size=64;
  for(const scale of [.63,1,1.25]){
    const data=new Uint8Array(size*size).fill(255);
    const p=part(viewport(raster(data,size,{pixelArt:true}),{x:2,y:3,scale}),{x:45,y:4,flipX:true});
    p.group(q=>q.sample(5,10,20,18,(x,y)=>x<13?6:7),{
      outline:2,color:4,shadow:{x:3,y:3,color:4},effectMask:(x,y)=>x<13,
    });
    let shaded=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=45-(x+.5-2)/scale,v=(y+.5-3)/scale-4,c=data[y*size+x];
      if(u>=5&&u<25&&v>=10&&v<28)assert.equal(c,u<13?6:7,'reflected surface keeps its own left/right materials');
      if(c===4){shaded++;assert.ok(u<13,'effect mask uses the same reflected local coordinates');}
    }
    assert.ok(shaded>0);
  }
  const data=new Uint8Array(size*size),p=part(raster(data,size,{pixelArt:true}),{x:60,flipX:true});
  p.rect(10,8,12,7,1);p.round(10,20,12,10,3,2);
  assert.equal(data[10*size+40],1);assert.equal(data[24*size+40],2,'reflected boxes retain positive coverage');
});

test('reflected ellipses and complementary arcs preserve their silhouette and selected half',()=>{
  const size=96;
  for(const sx of [.7,1.1])for(const angle of [0,.4,1.2]){
    const full=new Uint8Array(size*size),halves=full.slice();
    const settings={x:85,y:5,scaleX:sx,scaleY:.9,flipX:true};
    part(raster(full,size,{pixelArt:true}),settings).ring(42,42,24,11,1,1,angle);
    const p=part(raster(halves,size,{pixelArt:true}),settings);
    p.arc(42,42,24,11,1,1,angle,0,Math.PI);
    p.arc(42,42,24,11,1,1,angle,Math.PI,Math.PI*2);
    assert.deepEqual(halves,full);
  }
  const quarter=new Uint8Array(size*size);
  part(raster(quarter,size,{pixelArt:true}),{x:70,flipX:true}).arc(30,30,15,9,1,1,0,0,Math.PI/2);
  const points=Array.from(quarter.keys()).filter(i=>quarter[i]);assert.ok(points.length>6);
  for(const i of points){assert.ok(i%size+.5<=40);assert.ok(Math.floor(i/size)+.5>=30);}
});

test('sphere edge samples give tiny portholes an unbroken frame without enlarging the disk',()=>{
  const size=64;
  for(const radius of [2,3,4,7])for(const scale of [.38,.65,1]){
    const data=new Uint8Array(size*size).fill(255);
    viewport(raster(data,size,{pixelArt:true}),{x:12.3,y:11.8,scale}).sphere(30,30,radius,(nx,ny,nz,x,y,edge)=>{
      assert.equal(x%1,.5);assert.equal(y%1,.5);
      return edge?4:7;
    });
    let interior=0,edge=0;
    for(let i=0;i<data.length;i++)if(data[i]!==255){
      const boundary=[-1,1,-size,size].some(offset=>data[i+offset]===255);
      assert.equal(data[i],boundary?4:7,'frame follows the discrete mask rather than a continuous radius threshold');
      if(boundary)edge++;else interior++;
    }
    assert.ok(edge>0&&interior>0);
  }
});
