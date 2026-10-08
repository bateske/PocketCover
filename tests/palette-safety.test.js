import test from 'node:test';
import assert from 'node:assert/strict';
import {bootloaderSafeColor,createPalette} from '../src/palette.js';

const rgb565=c=>((c>>>19&31)<<11)|((c>>>10&63)<<5)|(c>>>3&31);

test('palette protection excludes the animated bootloader slot before and after RGB565 packing',()=>{
  for(let red=248;red<256;red++)for(let green=0;green<8;green++)for(let blue=248;blue<256;blue++){
    const color=bootloaderSafeColor(red<<16|green<<8|blue);
    assert.notEqual(color,0xff00ff);assert.notEqual(rgb565(color),0xf81f);
  }
  for(const color of [0xfff4d6,0x808080,0xf708ff,0xff08ff,0xf700ff,0xff00f7])assert.equal(bootloaderSafeColor(color),color,'safe colors retain their exact bytes');
  for(let hue=0;hue<360;hue++)for(let offset=0;offset<=60;offset++){
    let calls=0;
    const palette=createPalette(()=>calls++===0?hue:offset);
    assert.equal(palette[8],0xfff4d6);
    assert.ok(palette.every(c=>c!==0xff00ff&&rgb565(c)!==0xf81f));
  }
});
