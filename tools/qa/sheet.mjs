#!/usr/bin/env node
// Arbitrary review sheets for one engine: cover, menu (1px border plus the
// install bar over x8-119 y110-119, as artkit's menu view), silhouette (the
// subject layer in black) and indexed (a fixed debug palette per index).
// Sheets are for looking at, at 1x and integer enlargements; they are not a
// verdict on the art.
import {mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {canonicalTitles,fail,lineHeight,list,loadEngine,loadFont,parseArgs,png,range,rel,ROOT,textLabel,titlesArg} from './lib.mjs';

const USAGE=`usage: node tools/qa/sheet.mjs [--engine index.js|baseline|<index.js>] [--style a,b] [--titles "A|B"]
  [--variants 0-11 | --pool 0-399 --wild <n>] [--scales 1,2,4] [--modes cover,menu,silhouette,indexed]
  [--framing varied|classic] [--cols 6] [--no-labels] [--out examples/qa/sheets]
  --wild picks the first <n> variants in --pool whose cover.look.tier >= 2; engines without cover.look skip it.
  Writes <out>/<style>-<mode>-<scale>x.png, <out>/<style>.json and <out>/index.html.`;
const MODES=['cover','menu','silhouette','indexed'];
// Debug colours per palette index; 253/254 markers and anything else are alarm green.
const DEBUG=[0x1b1b3a,0x3355aa,0x55aaee,0x2a7a7a,0x000000,0x7a2a10,0xd05a20,0xffc040,0xffffff,0x88cc88,0xc040c0,0x702070,0xff4080,0x808080,0xe02020,0x00ffc0];
const ALARM=0x00ff00,BG=0x12191e,TEXT=0xd4dfdf,HEAD=0xbfee95,NOTE=0xffb070;
const BORDER=0x00c8ff,BAR=0xf000f0;

const options=parseArgs(process.argv.slice(2),{flags:['no-labels'],usage:USAGE});
let engine;try{engine=await loadEngine(String(options.engine??'src/index.js'));}catch(error){fail(USAGE,error.message);}
await loadFont();
const allStyles=engine.index.styles.map(s=>s.id),styles=list(options.style??options.styles,allStyles);
for(const s of styles)if(!allStyles.includes(s))fail(USAGE,'unknown style '+s);
const modes=list(options.modes,['cover']);for(const m of modes)if(!MODES.includes(m))fail(USAGE,'unknown mode '+m);
const scales=list(options.scales,['1','2']).map(Number);for(const s of scales)if(!Number.isInteger(s)||s<1||s>16)fail(USAGE,'bad scale '+s);
const framing=String(options.framing??'varied'),labels=!options['no-labels'],cols=Number(options.cols??6);
const out=resolve(options.out?String(options.out):resolve(ROOT,'examples/qa/sheets'));mkdirSync(out,{recursive:true});
const canonical=canonicalTitles(),index=[];

function modePixels(cover,mode) {
  const n=128*128,px=new Uint32Array(n);
  if(mode==='cover'||mode==='menu')px.set(cover.pixels);
  if(mode==='menu'){
    for(let i=0;i<128;i++){px[i]=px[127*128+i]=px[i*128]=px[i*128+127]=BORDER;}
    for(let y=110;y<=119;y++)for(let x=8;x<=119;x++){
      const edge=y===110||y===119||x===8||x===119;
      px[y*128+x]=edge?BAR:(y>=112&&y<=117&&x>=10&&x<=63)?BAR:0x000000;
    }
  }
  if(mode==='silhouette'){
    const layer=cover.quality?.subjectLayer;
    if(!layer)return null;
    for(let i=0;i<n;i++)px[i]=layer[i]===255?0xffffff:0x000000;
  }
  if(mode==='indexed')for(let i=0;i<n;i++)px[i]=DEBUG[cover.indices[i]]??ALARM;
  return px;
}
function draw(covers,mode,scale,heading) {
  const T=128*scale,gap=8,pad=16,lh=lineHeight(),head=labels?pad+lh*2+6:pad,labelH=labels?2*lh+4:0;
  const c=Math.max(1,Math.min(cols,covers.length)),rows=Math.ceil(covers.length/c);
  const W=pad*2+c*T+(c-1)*gap,H=head+rows*(T+labelH+gap)+pad-gap,img=new Uint32Array(W*H).fill(BG);
  if(labels){textLabel(img,W,heading,pad,pad,HEAD,W-2*pad);textLabel(img,W,`ENGINE ${engine.index.VERSION} / ${engine.label} / ${mode} / ${scale}X / ${framing}`,pad,pad+lh+2,TEXT,W-2*pad);}
  covers.forEach((cover,i)=>{
    const x=pad+(i%c)*(T+gap),y=head+Math.floor(i/c)*(T+labelH+gap),px=modePixels(cover,mode);
    if(px)for(let yy=0;yy<T;yy++)for(let xx=0;xx<T;xx++)img[(y+yy)*W+x+xx]=px[Math.floor(yy/scale)*128+Math.floor(xx/scale)];
    else{for(let yy=0;yy<T;yy++)img.fill(0x808080,(y+yy)*W+x,(y+yy)*W+x+T);if(labels)textLabel(img,W,'NO SUBJECT LAYER',x+4,y+4,0x000000,T-8);}
    if(labels){
      const t=cover.traits||{},look=cover.look,tier=Number.isFinite(look?.tier)?` T${look.tier}`:'';
      textLabel(img,W,`V${cover.variant} ${cover.title}${tier}`,x,y+T+3,px?HEAD:NOTE,T);
      const mood=look&&typeof look==='object'?[look.mood,look.treatment,look.camera].filter(Boolean).join('/'):'';
      textLabel(img,W,[t.archetype??t.creature??'',mood].filter(Boolean).join(' / '),x,y+T+3+lh,TEXT,T);
    }
  });
  return {W,H,img};
}

for(const style of styles){
  const titles=titlesArg(options.titles,[canonical[style]??'Pocket Worlds']);
  let variants=range(options.variants,Array.from({length:12},(_,i)=>i));
  const covers=[];
  if(options.wild!=null){
    const want=Number(options.wild),pool=range(options.pool,Array.from({length:400},(_,i)=>i));
    const probe=engine.index.generateCover(titles[0],{style,variant:pool[0],framing});
    if(!Number.isFinite(probe.look?.tier)){console.log(`${style}: engine ${engine.index.VERSION} has no cover.look.tier; --wild skipped`);continue;}
    for(const title of titles){
      let found=0;
      for(const variant of pool){
        if(found>=want)break;
        const cover=engine.index.generateCover(title,{style,variant,framing,diagnostics:true});
        if(cover.look?.tier>=2){covers.push(cover);found++;}
      }
      if(found<want)console.log(`${style}: only ${found} of ${want} wild covers for "${title}" in the pool`);
    }
  }else for(const title of titles)for(const variant of variants)covers.push(engine.index.generateCover(title,{style,variant,framing,diagnostics:true}));
  if(!covers.length)continue;
  const label=engine.index.styles.find(s=>s.id===style)?.label??style;
  const heading=`${label} / ${titles.join(' | ')}${options.wild!=null?' / WILD TIER 2+':''}`;
  const files=[];
  for(const mode of modes)for(const scale of scales){
    const sheet=draw(covers,mode,scale,heading),file=`${style}-${mode}-${scale}x.png`;
    writeFileSync(resolve(out,file),png(sheet.W,sheet.H,sheet.img));files.push(file);
  }
  writeFileSync(resolve(out,style+'.json'),JSON.stringify(covers.map(c=>({title:c.title,style,variant:c.variant,framing:c.framing,version:c.version,
    styleVersion:c.styleVersion,look:c.look??null,archetype:c.traits?.archetype??c.traits?.creature??null})),null,1)+'\n');
  index.push({style,files});
  console.log(`${style}: ${covers.length} covers -> ${files.join(', ')}`);
}
const pngs=readdirSync(out).filter(f=>f.endsWith('.png')).sort(),groups=[...new Set(pngs.map(f=>f.split('-')[0]))];
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Pocket Cover sheets</title>
<style>body{font:15px system-ui;background:#12191e;color:#d4dfdf;margin:24px}a{color:#bfee95}img{image-rendering:pixelated;max-width:none;display:block;margin:8px 0 24px}section{overflow-x:auto}</style>
<h1>Review sheets</h1><p>Every PNG in this folder; the latest run used engine ${engine.index.VERSION} (${engine.label}).</p>
${groups.map(style=>`<section><h2>${style}</h2>${pngs.filter(f=>f.split('-')[0]===style).map(f=>`<p><a href="${f}">${f}</a></p><img loading="lazy" src="${f}" alt="${f}">`).join('')}</section>`).join('\n')}
</html>
`;
writeFileSync(resolve(out,'index.html'),html);
console.log('index.html -> '+rel(out));
