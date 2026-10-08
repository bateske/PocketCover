import test from 'node:test';
import assert from 'node:assert/strict';
import {raster,viewport,part} from '../src/raster.js';
import {dither} from '../src/materials.js';

test('part transforms rotated ellipses geometrically and preserves orbital halves',()=>{
  const size=96;
  for(const scaleX of [.7,1.15])for(const scaleY of [.65,1.1])for(const angle of [0,.3,1.2]){
    const full=new Uint8Array(size*size),arcs=new Uint8Array(size*size),solid=new Uint8Array(size*size);
    const transform={x:7,y:5,scaleX,scaleY};
    part(raster(full,size,{pixelArt:true}),transform).ring(42,42,24,11,1,2,angle);
    const p=part(raster(arcs,size,{pixelArt:true}),transform);
    p.arc(42,42,24,11,1,2,angle,0,Math.PI);p.arc(42,42,24,11,1,2,angle,Math.PI,2*Math.PI);
    assert.deepEqual(arcs,full,'two transformed arcs reconstruct the rotated contour');
    part(raster(solid,size,{pixelArt:true}),transform).ellipse(42,42,24,11,1,angle);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const dx=(x+.5-transform.x)/scaleX-42,dy=(y+.5-transform.y)/scaleY-42;
      const u=dx*Math.cos(angle)+dy*Math.sin(angle),v=dy*Math.cos(angle)-dx*Math.sin(angle),level=(u/24)**2+(v/11)**2;
      if(level<.8)assert.equal(solid[y*size+x],1,'interior follows inverse analytic shape');
      if(level>1.01)assert.equal(solid[y*size+x],0,'no stretched raster pixels outside ellipse');
    }
  }
  assert.throws(()=>part(raster(new Uint8Array(16),4),{scaleX:0}));
});

test('dither clips its material mask and keeps final-grid phase through nested transforms',()=>{
  const size=64,a=new Uint8Array(size*size).fill(3),b=a.slice();
  const transform={x:5,y:7,scaleX:.73,scaleY:1.14};
  const p=part(viewport(raster(a,size,{pixelArt:true}),{x:2,y:3,scale:.8}),transform);
  const x0=2+5*.8,y0=3+7*.8,sx=.73*.8,sy=1.14*.8;
  const mask=(x,y)=>((x-24)/12)**2+((y-22)/10)**2<.8;
  dither(p,{x:10,y:10,w:28,h:25,color:5,density:.5,mask});
  dither(raster(b,size,{pixelArt:true}),{x:x0+10*sx,y:y0+10*sy,w:28*sx,h:25*sy,color:5,density:.5,mask:(x,y)=>mask((x-x0)/sx,(y-y0)/sy)});
  assert.deepEqual(a,b,'pattern phase does not follow stretched recipe coordinates');
  assert.ok(a.includes(5));
  for(let i=0;i<a.length;i++)if(a[i]===5)assert.ok(mask((i%size+.5-x0)/sx,(Math.floor(i/size)+.5-y0)/sy));
});
