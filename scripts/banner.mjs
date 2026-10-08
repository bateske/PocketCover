#!/usr/bin/env node
// Build docs/banner.png: a dark strip with a row of real generated covers at an
// integer 2x scale (nearest neighbour) under the project name, lettered with
// the OFL Round9x13 bitmap font (fonts[3]). Development utility only.
//
//   node scripts/banner.mjs [--out docs/banner.png]
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {generateCover} from '../src/index.js';
import {fonts} from '../src/font.js';
import {png} from './png.mjs';

const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2),outArg=args.includes('--out')?args[args.indexOf('--out')+1]:null;
const out=resolve(outArg??resolve(root,'docs/banner.png'));

// [style, title, variant]: canonical review titles from scripts/examples.mjs.
const COVERS=[
  ['spaceships','Star Patrol',1],['islands','Sky Haven',0],['relics','Lost Relic',2],['planets','Outer Worlds',0],
  ['mascot','Moon Meadow',0],['buildings','Last Tower',3],['vehicles','Dust Rally',0],['dungeons','Deep Vault',1],
];
const SCALE=2,CELL=128*SCALE,GAP=24,HEADER=104,FOOT=32;
const W=COVERS.length*CELL+(COVERS.length+1)*GAP,H=HEADER+CELL+FOOT;
const BG=0x10161b,RULE=0x1e2a31,FRAME=0x2a3a43,INK=0xfff4d6,DIM=0x8fa3a8;
const img=new Uint32Array(W*H).fill(BG);
const rect=(x,y,w,h,c)=>{for(let j=Math.max(0,y);j<Math.min(H,y+h);j++)img.fill(c,j*W+Math.max(0,x),j*W+Math.min(W,x+w));};

function text(font,str,x,y,scale,color) {
  const cap=Math.max(...font.map(g=>g?.[3]??0));
  for(const ch of str){
    const glyph=font[ch.charCodeAt(0)-32];if(!glyph){x+=4*scale;continue;}
    const [advance,w,left,top,...rows]=glyph;
    rows.forEach((bits,j)=>{for(let i=0;i<w;i++)if(bits&(1<<(w-1-i)))rect(x+(left+i)*scale,y+(cap-top+j)*scale,scale,scale,color);});
    x+=advance*scale;
  }
  return x;
}

text(fonts[3],'POCKET COVER',GAP,28,4,INK);
text(fonts[2],'PROCEDURAL 128X128 PIXEL-ART COVERS',GAP+640,48,3,DIM);
rect(0,HEADER-12,W,2,RULE);
COVERS.forEach(([style,title,variant],n)=>{
  const {pixels}=generateCover(title,{style,variant}),x0=GAP+n*(CELL+GAP),y0=HEADER;
  rect(x0-2,y0-2,CELL+4,CELL+4,FRAME);
  for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++)img[(y0+y)*W+x0+x]=pixels[(y/SCALE|0)*128+(x/SCALE|0)];
});
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,png(W,H,img));
console.log(`banner ${W}x${H} -> ${out}`);
