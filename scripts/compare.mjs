#!/usr/bin/env node
// Before|after contact sheets rendered live from two engines (development only).
// Each style sheet pairs rows: the before row sits above the after row, six
// variants per row, integer nearest-neighbour scaling, labels in the project's
// own bitmap font. Sheets are for looking at; a SAME/DIFF label is a pixel
// count, not a judgement of the art.
//
//   node scripts/compare.mjs [--before baseline|<index.js>] [--after <index.js>] [--title "T"]
//     [--styles a,b] [--variants 0-11] [--scale 2] [--framing varied|classic] [--out examples/qa/compare] [--lint]
// --lint renders with diagnostics and overlays craft-lint marks on the scaled
// tiles (scripts/craft-lint.mjs colours; native sheets stay unmarked), adds a
// lint line under each tile and lint numbers to compare.json.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {png} from './png.mjs';
import {fonts} from '../src/font.js';
import {lintCover,overlayMarks,replayTitleMask,summarize} from './craft-lint.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const FALLBACK_TITLES={spaceships:'Star Patrol',machines:'Odd Works',relics:'Lost Relic',plants:'Alien Garden',islands:'Sky Haven',buildings:'Last Tower',
  vehicles:'Dust Rally',planets:'Outer Worlds',heraldry:'Iron Oath',glyphs:'Rune Keeper',dungeons:'Deep Vault',mascot:'Moon Meadow'};

function usage(message) {
  if(message)console.error('compare: '+message);
  console.error('usage: node scripts/compare.mjs [--before baseline|<index.js>] [--after <index.js>] [--title "T"] [--styles a,b] [--variants 0-11] [--scale 2] [--framing varied|classic] [--out examples/qa/compare] [--lint]');
  process.exit(2);
}
function parseArgs(argv) {
  const options={};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];if(!arg.startsWith('--'))usage('unexpected argument '+arg);
    let [key,value]=arg.slice(2).split(/=(.*)/s);
    if(value===undefined){if(key==='help'||key==='lint')value=true;else{value=argv[++i];if(value===undefined)usage('--'+key+' needs a value');}}
    options[key]=value;
  }
  return options;
}
function range(value,fallback) {
  if(value==null)return fallback;
  const out=[];
  for(const part of String(value).split(',')){
    const m=part.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)usage('bad range '+value);
    const a=Number(m[1]),b=m[2]==null?a:Number(m[2]);for(let v=Math.min(a,b);v<=Math.max(a,b);v++)out.push(v);
  }
  return [...new Set(out)];
}
const locate=spec=>spec==='baseline'?resolve(ROOT,'baseline/engine18/index.js'):isAbsolute(spec)?spec:existsSync(resolve(spec))?resolve(spec):resolve(ROOT,spec);
const rel=p=>relative(ROOT,p).split('\\').join('/');
async function load(spec) {
  const path=locate(spec);
  if(!existsSync(path)){if(spec==='baseline'){console.error('compare: baseline/engine18 is missing. It is a local, git-ignored copy of engine 18 used only for regression comparison; copy an engine-18 tree to baseline/engine18/ or pass another engine path (e.g. --against <index.js>).'.replace('--against','--before'));process.exit(2);}usage('engine not found: '+path);}
  const titlePath=join(dirname(path),'title.js');
  return {path,label:rel(path)||path,index:await import(pathToFileURL(path).href),title:existsSync(titlePath)?await import(pathToFileURL(titlePath).href):null};
}
// Canonical per-style titles, read from scripts/examples.mjs so both stay in step.
function canonicalTitles() {
  try{
    const source=readFileSync(resolve(ROOT,'scripts/examples.mjs'),'utf8'),m=source.match(/const titles=(\{[^}]*\})/);
    if(m)return {...FALLBACK_TITLES,...Function('return '+m[1])()};
  }catch{}
  return FALLBACK_TITLES;
}

// ---------- drawing ----------
const FONT=fonts[2],CAP=Math.max(...FONT.map(g=>g?.[3]??0)),LINE=CAP+4;
const BG=0x12191e,TEXT=0xd4dfdf,HEAD=0xbfee95,BEFORE=0x9fb4c0,AFTER=0xbfee95,CHANGED=0xffb070,MISSING=0x3a2a2a;
function textWidth(text){let w=0;for(const ch of text.toUpperCase())w+=FONT[ch.charCodeAt(0)-32]?.[0]??4;return w;}
function label(img,W,text,x,y,color,maxWidth=Infinity) {
  const H=img.length/W,x0=x;
  for(const ch of text.toUpperCase()){
    const glyph=FONT[ch.charCodeAt(0)-32];if(!glyph){x+=4;continue;}
    const [advance,w,left,top,...rows]=glyph;if(x+advance-x0>maxWidth)break;
    rows.forEach((bits,j)=>{for(let i=0;i<w;i++)if(bits&(1<<(w-1-i))){const px=x+left+i,py=y+CAP-top+j;if(px>=0&&px<W&&py>=0&&py<H)img[py*W+px]=color;}});
    x+=advance;
  }
}
function blit(img,W,pixels,x,y,scale) {
  for(let yy=0;yy<128*scale;yy++)for(let xx=0;xx<128*scale;xx++)img[(y+yy)*W+x+xx]=pixels[Math.floor(yy/scale)*128+Math.floor(xx/scale)];
}
function fill(img,W,x,y,w,h,color){for(let yy=y;yy<y+h;yy++)img.fill(color,yy*W+x,yy*W+x+w);}

function describe(cover) {
  const look=cover.look,t=cover.traits||{};
  let lookText='';
  if(typeof look==='string')lookText=look;
  else if(look&&typeof look==='object'){
    const camera=look.camera??cover.composition?.camera;
    lookText=[look.mood,look.treatment,camera].filter(v=>v!=null&&v!=='').map(v=>typeof v==='object'?(v.name??v.id??''):String(v)).join('/');
    if(Number.isFinite(look.tier))lookText+=` T${look.tier}`;
  }else if(cover.composition?.camera)lookText=String(cover.composition.camera);
  return {archetype:String(t.archetype??t.creature??t.kind??''),look:lookText};
}
function render(engine,title,style,variant,framing,diagnostics=false) {
  if(!engine.index.styles.some(s=>s.id===style))return {missing:'style not in '+engine.label};
  try{return engine.index.generateCover(title,{style,variant,framing,diagnostics});}catch(error){return {missing:String(error?.message||error)};}
}
// Lint one diagnostics cover; the title mask is the engine's or a title.js replay.
function lint(engine,cover) {
  const own=cover.quality?.titleMask??null,replay=own?null:replayTitleMask(engine.title,cover.title);
  return lintCover(cover,{titleMask:own??replay,titleMaskSource:own?'quality.titleMask':replay?'title.js replay':null});
}
const lintText=s=>`LINT SPK ${s.specks??'-'} JAG ${s.jaggies??'-'} L ${s.lCorners??'-'} FR ${s.frameOver} INK ${s.inkShare==null?'-':Math.round(s.inkShare*100)+'%'} DR ${s.ditherRows}`;
function changed(a,b) {
  if(a.missing||b.missing||!a.pixels||!b.pixels)return null;
  let n=0;for(let i=0;i<b.pixels.length;i++)if(a.pixels[i]!==b.pixels[i])n++;
  return n;
}

// items: [{key, title, variant, name}] -> paired before/after rows of six.
function sheet(items,before,after,{scale,framing,heading,subheading,lintOverlay=false}) {
  const cols=Math.min(6,items.length),T=128*scale,gap=8,pad=16,head=pad+2*LINE+8,labelH=(lintOverlay?4:3)*LINE+4,pairGap=16;
  const pairs=Math.ceil(items.length/cols),pairH=2*(T+labelH)+pairGap;
  const W=pad*2+cols*T+(cols-1)*gap,H=head+pairs*pairH,img=new Uint32Array(W*H).fill(BG);
  const nW=cols*128,nH=pairs*256,native=new Uint32Array(nW*nH).fill(BG),records=[];
  label(img,W,heading,pad,pad,HEAD);label(img,W,subheading,pad,pad+LINE+2,TEXT,W-2*pad);
  items.forEach((item,i)=>{
    const col=i%cols,pair=Math.floor(i/cols),x=pad+col*(T+gap),y=head+pair*pairH;
    const a=render(before,item.title,item.style,item.variant,framing,lintOverlay),b=render(after,item.title,item.style,item.variant,framing,lintOverlay),diff=changed(a,b);
    const lints=lintOverlay?[a,b].map((cover,k)=>cover.missing?null:lint(k?after:before,cover)):[null,null];
    for(const [row,cover,tag,color] of [[0,a,'BEFORE',BEFORE],[1,b,'AFTER',AFTER]]){
      const ty=y+row*(T+labelH),ny=pair*256+row*128;
      if(cover.missing){fill(img,W,x,ty,T,T,MISSING);label(img,W,'N/A',x+4,ty+4,CHANGED,T-8);label(img,W,cover.missing,x+4,ty+4+LINE,TEXT,T-8);}
      else{
        blit(img,W,cover.pixels,x,ty,scale);
        if(lints[row])overlayMarks(img,W,x,ty,scale,lints[row].marks);
        for(let yy=0;yy<128;yy++)for(let xx=0;xx<128;xx++)native[(ny+yy)*nW+col*128+xx]=cover.pixels[yy*128+xx];
      }
      const d=cover.missing?{archetype:'',look:''}:describe(cover);
      const first=`${tag} ${item.name}`+(row&&diff!=null?(diff?` DIFF ${diff}PX`:' SAME'):'');
      label(img,W,first,x,ty+T+3,row&&diff?CHANGED:color,T);
      label(img,W,d.archetype,x,ty+T+3+LINE,TEXT,T);
      label(img,W,d.look,x,ty+T+3+2*LINE,TEXT,T);
      if(lints[row])label(img,W,lintText(summarize(lints[row])),x,ty+T+3+3*LINE,TEXT,T);
    }
    records.push({style:item.style,title:item.title,variant:item.variant,changedPixels:diff,
      before:a.missing?{missing:a.missing}:{version:a.version,styleVersion:a.styleVersion,...describe(a)},
      after:b.missing?{missing:b.missing}:{version:b.version,styleVersion:b.styleVersion,...describe(b)},
      ...(lintOverlay?{lint:{before:lints[0]&&summarize(lints[0]),after:lints[1]&&summarize(lints[1])}}:{})});
  });
  return {W,H,img,nW,nH,native,records};
}

async function main() {
  const options=parseArgs(process.argv.slice(2));
  if(options.help)usage();
  const before=await load(String(options.before??'baseline')),after=await load(String(options.after??'src/index.js'));
  const scale=Number(options.scale??2);if(!Number.isInteger(scale)||scale<1||scale>8)usage('--scale must be an integer 1-8');
  const framing=String(options.framing??'varied');if(framing!=='varied'&&framing!=='classic')usage('--framing must be varied or classic');
  const variants=range(options.variants,Array.from({length:12},(_,i)=>i));
  const allStyles=after.index.styles.map(s=>s.id),styles=options.styles?String(options.styles).split(',').map(s=>s.trim()).filter(Boolean):allStyles;
  for(const s of styles)if(!allStyles.includes(s))usage('unknown style '+s);
  const titles=canonicalTitles(),titleFor=style=>options.title?String(options.title):titles[style]??'Pocket Worlds';
  const out=resolve(options.out?String(options.out):resolve(ROOT,'examples/qa/compare'));mkdirSync(out,{recursive:true});
  const engines=`BEFORE ${before.label} (ENGINE ${before.index.VERSION}) / AFTER ${after.label} (ENGINE ${after.index.VERSION})`;
  const lintOverlay=!!options.lint,summary={before:before.label,after:after.label,framing,scale,...(lintOverlay?{lint:true}:{}),styles:{}},sections=[];
  for(const style of styles){
    const title=titleFor(style),items=variants.map(variant=>({style,title,variant,name:'V'+variant}));
    const labelText=after.index.styles.find(s=>s.id===style)?.label??style;
    const s=sheet(items,before,after,{scale,framing,lintOverlay,heading:`${labelText} / ${title} / ${framing}`,subheading:engines});
    writeFileSync(resolve(out,style+'.png'),png(s.W,s.H,s.img));
    writeFileSync(resolve(out,style+'-native.png'),png(s.nW,s.nH,s.native));
    summary.styles[style]=s.records;
    const changedCount=s.records.filter(r=>r.changedPixels).length;
    sections.push({id:style,heading:`${labelText} / ${title}`,note:`${changedCount} of ${s.records.length} variants differ`});
    console.log(`${style}: ${s.records.length} variants, ${changedCount} differ -> ${style}.png, ${style}-native.png`);
  }
  const items=styles.map(style=>({style,title:titleFor(style),variant:0,name:style}));
  const o=sheet(items,before,after,{scale,framing,lintOverlay,heading:`OVERVIEW / VARIANT 0 / ${framing}`,subheading:engines});
  writeFileSync(resolve(out,'overview.png'),png(o.W,o.H,o.img));
  writeFileSync(resolve(out,'overview-native.png'),png(o.nW,o.nH,o.native));
  writeFileSync(resolve(out,'compare.json'),JSON.stringify({...summary,overview:o.records},null,2)+'\n');
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pocket Cover compare</title>
<style>body{font:15px system-ui;background:#12191e;color:#d4dfdf;margin:24px}a{color:#bfee95}img{image-rendering:pixelated;image-rendering:crisp-edges;max-width:none;display:block}section{margin:32px 0;overflow-x:auto}h2{font-size:18px;margin:0 0 8px}</style>
<h1>Before | after</h1><p>${engines.toLowerCase()} | framing ${framing} | ${scale}x tiles; before rows above after rows.${lintOverlay?' Craft-lint marks: red specks, orange other orphans, green declared details, yellow counted jaggies, olive uncounted jaggies, cyan L-corners. Lint marks are diagnostics too.':''} Pixel counts are diagnostics, not art review.</p>
<nav>${['overview',...styles].map(id=>`<a href="#${id}">${id}</a>`).join(' · ')}</nav>
<section id="overview"><h2>Overview, variant 0</h2><p><a href="overview-native.png">native 1x</a></p><img src="overview.png" alt="Variant 0 of every style before and after"></section>
${sections.map(s=>`<section id="${s.id}"><h2>${s.heading}</h2><p>${s.note} · <a href="${s.id}-native.png">native 1x</a></p><img loading="lazy" src="${s.id}.png" alt="${s.heading} before and after"></section>`).join('\n')}
</html>
`;
  writeFileSync(resolve(out,'index.html'),html);
  console.log(`overview.png, overview-native.png, compare.json, index.html -> ${rel(out)||out}`);
}
main().catch(error=>{console.error(error);process.exit(2);});
