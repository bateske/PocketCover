#!/usr/bin/env node
// Native-pixel crop of one cover for verification: the palette-index grid as
// hex characters and a layer map (S subject, B background, T title), using the
// diagnostics subject layer. Optionally writes the crop as an enlarged PNG.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {canonicalTitles,engineModule,fail,loadEngine,parseArgs,png} from './lib.mjs';

const USAGE=`usage: node tools/qa/crop.mjs --style <id> [--title "T"] [--variant 0] [--framing varied|classic] [--engine index.js|baseline]
  [--rect x,y,w,h] [--ascii] [--out crop.png] [--scale 8] [--grid]
  --ascii (default when --out is absent) prints the index grid (0-f, X = 16+) and the layer map:
  S subject layer, B background, T title, ? subject unknown (legacy mascot draws straight to the cover).`;
const options=parseArgs(process.argv.slice(2),{flags:['ascii','grid'],usage:USAGE});
if(!options.style)fail(USAGE,'--style is required');
let engine;try{engine=await loadEngine(String(options.engine??'src/index.js'));}catch(error){fail(USAGE,error.message);}
const style=String(options.style),variant=Number(options.variant??0),framing=String(options.framing??'varied');
if(!engine.index.styles.some(s=>s.id===style))fail(USAGE,'unknown style '+style);
const title=String(options.title??canonicalTitles()[style]??'Pocket Worlds');
const [rx,ry,rw,rh]=String(options.rect??'0,0,128,128').split(',').map(Number);
if(![rx,ry,rw,rh].every(Number.isInteger)||rw<1||rh<1||rx<0||ry<0||rx+rw>128||ry+rh>128)fail(USAGE,'--rect must be integers inside 0..128');
const scale=Number(options.scale??8);if(!Number.isInteger(scale)||scale<1||scale>32)fail(USAGE,'bad --scale');

const cover=engine.index.generateCover(title,{style,variant,framing,diagnostics:true});
const layer=cover.quality?.subjectLayer??null;
// Title footprint: the engine's own mask when it reports one, else replay the
// tree's title drawing onto an empty buffer (engine-18 API).
let titleMask=cover.quality?.titleMask??null,titleSource=titleMask?'quality.titleMask':null;
if(!titleMask){
  const mod=await engineModule(engine,'title.js');
  if(mod?.titleLayout&&mod?.drawTitle){
    titleMask=new Uint8Array(128*128);
    const p={dot:(x,y)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<128&&y>=0&&y<128)titleMask[y*128+x]=1;}};
    mod.drawTitle(p,mod.titleLayout(cover.title.toUpperCase()));titleSource='title.js replay';
  }
}
const at=(x,y)=>y*128+x;
const layerChar=i=>titleMask?.[i]?'T':layer?(layer[i]!==255?'S':'B'):'?';
const ruler=(pad)=>{
  const tens=[],units=[];for(let x=rx;x<rx+rw;x++){tens.push(x%10===0?String(Math.floor(x/10)%10):' ');units.push(String(x%10));}
  return [pad+tens.join(''),pad+units.join('')];
};

console.log(`${style} "${cover.title}" v${variant} ${framing} | engine ${engine.index.VERSION} (${engine.label}) | rect ${rx},${ry},${rw},${rh}`);
console.log(`archetype ${cover.traits?.archetype??cover.traits?.creature??'-'} | titleBottom ${cover.titleBottom} | subject layer ${layer?'yes':'no (legacy)'} | title mask ${titleSource??'unavailable'}`);
if(options.ascii||!options.out){
  const used=new Set();for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++)used.add(cover.indices[at(x,y)]);
  console.log('palette '+[...used].sort((a,b)=>a-b).map(i=>`${i<16?i.toString(16):'X'}=${i}:#${(cover.palette[i]??0).toString(16).padStart(6,'0')}`).join(' '));
  const counts={S:0,B:0,T:0,'?':0};
  for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++)counts[layerChar(at(x,y))]++;
  console.log('layers '+Object.entries(counts).filter(([,n])=>n).map(([k,n])=>`${k}=${n}`).join(' '));
  console.log('\nindices');
  for(const line of ruler('    '))console.log(line);
  for(let y=ry;y<ry+rh;y++){let row='';for(let x=rx;x<rx+rw;x++){const v=cover.indices[at(x,y)];row+=v<16?v.toString(16):'X';}console.log(String(y).padStart(3)+' '+row);}
  console.log('\nlayers (S subject, B background, T title)');
  for(const line of ruler('    '))console.log(line);
  for(let y=ry;y<ry+rh;y++){let row='';for(let x=rx;x<rx+rw;x++)row+=layerChar(at(x,y));console.log(String(y).padStart(3)+' '+row);}
}
if(options.out){
  const grid=options.grid&&scale>=4,W=rw*scale,H=rh*scale,img=new Uint32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const sx=rx+Math.floor(x/scale),sy=ry+Math.floor(y/scale);
    img[y*W+x]=grid&&(x%scale===scale-1||y%scale===scale-1)?0x202020:cover.pixels[at(sx,sy)];
  }
  writeFileSync(resolve(String(options.out)),png(W,H,img));
  console.log(`\nwrote ${options.out} (${W}x${H}, ${scale}x${grid?', grid':''})`);
}
