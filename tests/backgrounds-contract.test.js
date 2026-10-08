import test from 'node:test';
import assert from 'node:assert/strict';
import {raster} from '../src/raster.js';
import {renderBackground} from '../src/backgrounds.js';
import {random} from '../src/random.js';

test('backgrounds protect the title and stay within their muted palette roles',()=>{
  for(const kind of ['stars','garden','mist','workshop','void'])for(const style of ['plants','vehicles','buildings','dungeons']){
    const data=new Uint8Array(128*128);data.fill(255,0,36*128);
    renderBackground(raster(data,128,{pixelArt:true}),random(134),{kind,style,traits:{archetype:'deep sea submarine'},top:36});
    if(style!=='dungeons')assert.ok(data.slice(0,36*128).every(v=>v===255));
    else assert.ok(data.slice(0,36*128).some(v=>v!==255),'distant walls may share the title vertical space');
    assert.ok(data.slice(36*128).every(v=>[0,1,2,3,9].includes(v)));
  }
});
