#!/usr/bin/env node
// Build docs/social.png, the 1280x640 GitHub social preview. It uses the
// demos' neobrutalist look: dotted paper, ink outlines and hard shadows. Real
// covers are shown at an integer 2x scale, nearest neighbour.
// Development utility only.
//
//   node scripts/social.mjs [--out docs/social.png]
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {generateCover} from '../src/index.js';
import {fonts} from '../src/font.js';
import {png} from './png.mjs';

const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2),outArg=args.includes('--out')?args[args.indexOf('--out')+1]:null;
const out=resolve(outArg??resolve(root,'docs/social.png'));

const W=1280,H=640,PAPER=0xfbfaf5,DOTS=0xe6e2d3,INK=0x252628,YELLOW=0xf9d84a,SAGE=0xb7dacc,CREAM=0xfffdf6,MUTED=0x5f5e58;
const img=new Uint32Array(W*H).fill(PAPER);
const rect=(x,y,w,h,c)=>{for(let j=Math.max(0,y);j<Math.min(H,y+h);j++)img.fill(c,j*W+Math.max(0,x),j*W+Math.min(W,x+w));};
// A card: hard shadow, then a 3px ink border, then the fill.
const card=(x,y,w,h,fill,shadow=8)=>{rect(x+shadow,y+shadow,w,h,INK);rect(x,y,w,h,INK);rect(x+3,y+3,w-6,h-6,fill);};
for(let y=12;y<H;y+=24)for(let x=12;x<W;x+=24)rect(x,y,3,3,DOTS);

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
const width=(font,str,scale)=>[...str].reduce((s,ch)=>s+(font[ch.charCodeAt(0)-32]?.[0]??4)*scale,0);

// Left column: the name, a highlighted tagline and two short lines.
const LX=56;
text(fonts[3],'POCKET',LX,84,5,INK);
text(fonts[3],'COVER',LX,170,5,INK);
const tag='PIXEL-ART COVERS',tw=width(fonts[2],tag,3);
card(LX-4,288,tw+40,64,YELLOW,6);
text(fonts[2],tag,LX+16,306,3,INK);
text(fonts[2],'ONE FOR EVERY GAME',LX,384,3,MUTED);
text(fonts[2],'12 STYLES  128X128',LX,420,3,MUTED);
text(fonts[2],'ZERO DEPENDENCIES',LX,456,3,MUTED);
card(LX-4,520,width(fonts[2],'MADE FOR CHGAME',3)+40,56,SAGE,6);
text(fonts[2],'MADE FOR CHGAME',LX+16,536,3,INK);

// Right side: a 3x2 grid of covers in ink-bordered cards.
const COVERS=[
  ['spaceships','Star Patrol',1],['islands','Sky Haven',0],['planets','Outer Worlds',0],
  ['mascot','Moon Meadow',0],['buildings','Last Tower',3],['dungeons','Deep Vault',1],
];
const CELL=256,GAP=24,GX=W-40-3*CELL-2*GAP,GY=(H-2*CELL-GAP)/2|0;
COVERS.forEach(([style,title,variant],n)=>{
  const x0=GX+(n%3)*(CELL+GAP),y0=GY+(n/3|0)*(CELL+GAP);
  card(x0-3,y0-3,CELL+6,CELL+6,CREAM,8);
  const {pixels}=generateCover(title,{style,variant});
  for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++)img[(y0+y)*W+x0+x]=pixels[(y>>1)*128+(x>>1)];
});
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,png(W,H,img));
console.log(`social ${W}x${H} -> ${out}`);
