import test from 'node:test';
import assert from 'node:assert/strict';
import {raster,viewport} from '../src/raster.js';
import {recordDrawing} from '../src/drawing.js';
import {carnivorousMouth} from '../src/recipes/plant-mouth.js';

test('bloom teeth and tongue cannot escape the mouth under rotation, fitting or replay',()=>{
  const size=96;
  for(const scale of [.55,.83,1])for(const angle of [-.4,-.15,.3])for(const ry of [5,9,13])for(const count of [2,6]){
    const data=new Uint8Array(size*size).fill(255),frame={x:8.3,y:11.7,scale};
    const mouth={x:42,y:37,rx:20,ry,upper:count,lower:count-1,angle},record=recordDrawing();
    carnivorousMouth(record.p,mouth);record.draw(viewport(raster(data,size,{pixelArt:true}),frame));
    let teeth=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const dx=(x+.5-frame.x)/scale-mouth.x,dy=(y+.5-frame.y)/scale-mouth.y;
      const u=dx*Math.cos(angle)+dy*Math.sin(angle),v=-dx*Math.sin(angle)+dy*Math.cos(angle);
      const inside=(u/mouth.rx)**2+(v/ry)**2<1,value=data[y*size+x];
      assert.equal(value!==255,inside,'every material shares exactly the mouth coverage');
      if(value===8||value===7){teeth++;assert.ok(value===8?v<0:v>0,'teeth attach to their own jaw');}
    }
    assert.ok(teeth>0,'teeth remain visible at the smallest fit');
  }
});
