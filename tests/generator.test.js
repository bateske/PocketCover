import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateCover,createGenerator,styles} from '../src/index.js';
import ships from '../src/recipes/spaceships.js';
import {raster} from '../src/raster.js';
const digest=c=>createHash('sha256').update(c.indices).update(new Uint8Array(c.palette.buffer)).digest('hex');

test('classic framing preserves original mascot pixels byte-for-byte with v8',()=>{
  const cases=JSON.parse(readFileSync(new URL('./mascot-v8.json',import.meta.url)));
  for(const {title,variant,sha} of cases)assert.equal(digest(generateCover(title,{variant,framing:'classic'})),sha);
});
test('every style is deterministic, varied, and within the CHGame color budget',()=>{
  assert.equal(styles.length,12);
  for(const {id} of styles){
    const shapes=new Set(),images=new Set();
    for(let variant=0;variant<40;variant++){
      const a=generateCover('Pocket Worlds',{style:id,variant}),b=generateCover('Pocket Worlds',{style:id,variant});
      assert.deepEqual(a,b,`${id} variant ${variant} must repeat exactly`);
      assert.equal(a.width,128);assert.equal(a.height,128);assert.equal(a.indices.length,16384);
      const used=new Set(a.pixels),reserved=new Set([0xfff4d6,0x808080,0x000000,0xd62020,0xff00ff]);
      assert.ok(used.size<=16);assert.ok([...used].filter(c=>!reserved.has(c)).length<=11);
      a.indices.forEach((i,j)=>{assert.ok(i<a.palette.length);assert.equal(a.pixels[j],a.palette[i]);});
      images.add(digest(a));shapes.add(createHash('sha256').update(a.indices).digest('hex'));
    }
    assert.equal(images.size,40,`${id} full covers vary`);assert.ok(shapes.size>=36,`${id} geometry varies`);
  }
});
test('normalization, extreme variants, long titles and validation',()=>{
  assert.deepEqual(generateCover('  Moon   Meadow  '),generateCover('Moon Meadow'));
  for(const style of styles)for(const title of ['A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345','!? #$% &*()[]{} + = / ~ _ :;']){
    const c=generateCover(title,{style:style.id,variant:Number.MAX_SAFE_INTEGER});
    assert.ok(c.titleBottom<60);assert.ok(c.titleLines.every(Boolean));assert.ok(c.pixels.every(Number.isInteger));
  }
  for(const title of ['', '   ', 'a'.repeat(32), 'café',null,8])assert.throws(()=>generateCover(title));
  for(const variant of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>generateCover('Test',{variant}));
  assert.throws(()=>generateCover('Test',{style:'missing'}));
  assert.throws(()=>generateCover('Test',{framing:'missing'}));
});
test('a trimmed engine gives the exact same style pixels',()=>{
  const onlyShips=createGenerator([ships]);
  assert.equal(onlyShips.styles.length,1);
  assert.deepEqual(onlyShips.generateCover('Trimmed Fleet'),generateCover('Trimmed Fleet',{style:'spaceships'}));
  assert.throws(()=>createGenerator([ships,ships]));assert.throws(()=>createGenerator([]));
});
test('strokes connect endpoints in all octants; rings preserve their hollow center',()=>{
  for(const [x,y] of [[14,9],[9,14],[1,9],[9,1],[1,1],[14,14],[1,14],[14,1]]){
    const data=new Uint8Array(16*16),p=raster(data,16);p.line(8,8,x,y,3);
    assert.equal(data[8*16+8],3);assert.equal(data[y*16+x],3);
    const seen=new Set([8*16+8]),queue=[8*16+8];
    while(queue.length){const i=queue.shift(),cx=i%16,cy=Math.floor(i/16);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,ny=cy+dy,j=ny*16+nx;if(nx>=0&&nx<16&&ny>=0&&ny<16&&data[j]&&!seen.has(j)){seen.add(j);queue.push(j);}}}
    assert.equal(seen.size,data.filter(Boolean).length);
  }
  const data=new Uint8Array(16*16).fill(2),p=raster(data,16);p.ring(8,8,6,5,7,2);
  assert.equal(data[8*16+8],2);assert.ok(data.includes(7));
  p.ellipse(8,8,0,4,3);p.rect(-10,-10,12,12,6);assert.equal(data[0],6);
});
