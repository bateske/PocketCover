#!/usr/bin/env node
// Craft-lint review over a fixed corpus (development only, report-only):
// 12 styles x variants 0-11 x 2 titles (the style's canonical sheet title and
// "Moss & Magic"), rendered with diagnostics. Writes examples/qa/craft-lint.json
// and prints one summary row per style; --sheet <style> also writes a 4x
// annotated sheet examples/qa/lint-<style>.png (red specks, orange other
// orphans, green declared details, yellow counted jaggies, olive uncounted
// jaggies, cyan L-corners).
//
// The numbers are diagnostics. They do not establish good silhouettes,
// lighting or composition; look at the sheets at 1x and 4x for that.
//
//   node scripts/pixel-review.mjs [--engine index.js|baseline|<index.js>] [--styles a,b] [--titles "A|B"]
//     [--variants 0-11] [--framing varied|classic] [--out examples/qa/craft-lint.json]
//     [--sheet <style>[,<style>]] [--sheet-title "T"] [--sheet-out examples/qa] [--quiet]
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {png} from './png.mjs';
import {fonts} from '../src/font.js';
import {aggregate,CURVE_KINDS,LIMITS,lintCover,MARK_COLOURS,overlayMarks,replayTitleMask,STROKE_KINDS,summarize} from './craft-lint.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SECOND_TITLE='Moss & Magic',CAP_POINTS=24;
const KNOWN=new Set(['help','quiet','engine','styles','titles','variants','framing','out','sheet','sheet-title','sheet-out']);
const FALLBACK_TITLES={spaceships:'Star Patrol',machines:'Odd Works',relics:'Lost Relic',plants:'Alien Garden',islands:'Sky Haven',buildings:'Last Tower',
  vehicles:'Dust Rally',planets:'Outer Worlds',heraldry:'Iron Oath',glyphs:'Rune Keeper',dungeons:'Deep Vault',mascot:'Moon Meadow'};
const USAGE=`usage: node scripts/pixel-review.mjs [--engine index.js|baseline|<index.js>] [--styles a,b] [--titles "A|B"]
  [--variants 0-11] [--framing varied|classic] [--out examples/qa/craft-lint.json]
  [--sheet <style>[,<style>]] [--sheet-title "T"] [--sheet-out examples/qa] [--quiet]`;

function usage(message) {
  if(message)console.error('pixel-review: '+message);
  console.error(USAGE);process.exit(2);
}
function parseArgs(argv) {
  const options={},flags=new Set(['help','quiet']);
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];if(!arg.startsWith('--'))usage('unexpected argument '+arg);
    let [key,value]=arg.slice(2).split(/=(.*)/s);
    if(!KNOWN.has(key))usage('unknown option --'+key);
    if(value===undefined){if(flags.has(key))value=true;else{value=argv[++i];if(value===undefined)usage('--'+key+' needs a value');}}
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
const rel=p=>{const r=relative(ROOT,p).split('\\').join('/');return r&&!r.startsWith('..')&&!isAbsolute(r)?r:p.split('\\').join('/');};
function canonicalTitles() {
  try{
    const m=readFileSync(resolve(ROOT,'scripts/examples.mjs'),'utf8').match(/const titles=(\{[^}]*\})/);
    if(m)return {...FALLBACK_TITLES,...Function('return '+m[1])()};
  }catch{}
  return FALLBACK_TITLES;
}

// ---------- labels ----------
const FONT=fonts[2],CAP=Math.max(...FONT.map(g=>g?.[3]??0)),LINE=CAP+4;
const BG=0x12191e,TEXT=0xd4dfdf,HEAD=0xbfee95,WARN=0xffb070;
function label(img,W,text,x,y,color,maxWidth=Infinity) {
  const H=img.length/W,x0=x;
  for(const ch of String(text).toUpperCase()){
    const glyph=FONT[ch.charCodeAt(0)-32];if(!glyph){x+=4;continue;}
    const [advance,w,left,top,...rows]=glyph;if(x+advance-x0>maxWidth)break;
    rows.forEach((bits,j)=>{for(let i=0;i<w;i++)if(bits&(1<<(w-1-i))){const px=x+left+i,py=y+CAP-top+j;if(px>=0&&px<W&&py>=0&&py<H)img[py*W+px]=color;}});
    x+=advance;
  }
  return x;
}
const pct=v=>v==null?'-':(v*100).toFixed(1)+'%';
const num=(v,d=1)=>v==null?'-':Number.isInteger(v)?String(v):v.toFixed(d);

/** A lint result for JSON: point lists become {count, first} and long
 * lists are capped. */
function cap(result) {
  const {marks,...rest}=result,points={};
  for(const [k,v] of Object.entries(marks))points[k]={count:v.length,first:v.slice(0,CAP_POINTS)};
  return {...rest,orphans:{...rest.orphans,intentPixels:rest.orphans.intentPixels.slice(0,CAP_POINTS)},
    dither:{...rest.dither,rowList:rest.dither.rowList.slice(0,CAP_POINTS)},points};
}
function lintSheet(styleLabel,entries,engineLabel,version) {
  const scale=4,T=128*scale,cols=Math.min(4,entries.length),gap=12,pad=16,head=pad+3*LINE+10,labelH=3*LINE+6;
  const rows=Math.ceil(entries.length/cols),W=pad*2+cols*T+(cols-1)*gap,H=head+rows*(T+labelH+gap)+pad,img=new Uint32Array(W*H).fill(BG);
  label(img,W,`${styleLabel} / craft lint / ${entries[0]?.cover.title??''} / 4x`,pad,pad,HEAD);
  label(img,W,`engine ${version} / ${engineLabel} / diagnostics, not art review`,pad,pad+LINE+2,TEXT);
  let x=pad;const ly=pad+2*LINE+4;
  for(const [kind,text] of [['speck','speck'],['orphan','other orphan'],['intent','declared detail'],['jaggie','counted jaggie'],['jaggieOther','uncounted jaggie'],['lcorner','L-corner']]){
    for(let yy=0;yy<CAP;yy++)img.fill(MARK_COLOURS[kind],(ly+yy)*W+x,(ly+yy)*W+x+CAP);
    x=label(img,W,text,x+CAP+4,ly,TEXT)+14;
  }
  entries.forEach(({cover,result},i)=>{
    const x0=pad+(i%cols)*(T+gap),y0=head+Math.floor(i/cols)*(T+labelH+gap);
    for(let yy=0;yy<T;yy++)for(let xx=0;xx<T;xx++)img[(y0+yy)*W+x0+xx]=cover.pixels[(yy>>2)*128+(xx>>2)];
    overlayMarks(img,W,x0,y0,scale,result.marks);
    const s=summarize(result),t=cover.traits||{};
    label(img,W,`V${cover.variant} ${t.archetype??t.creature??''}`,x0,y0+T+3,HEAD,T);
    const bad=(s.specks??0)>LIMITS.specks||(s.jaggies??0)>LIMITS.jaggies||s.frameOver>0||s.title12Stray>0;
    label(img,W,`specks ${num(s.specks)} jag ${num(s.jaggies)} ${s.jaggiesBasis??''} L ${num(s.lCorners)} frame ${s.frameOver}`,x0,y0+T+3+LINE,bad?WARN:TEXT,T);
    label(img,W,`ink ${pct(s.inkShare)} acc ${pct(s.accentShare)} cream ${pct(s.creamShare)} dith ${s.ditherRows} calm ${num(s.calm)}`,x0,y0+T+3+2*LINE,TEXT,T);
  });
  return {W,H,img};
}

function table(rows) {
  const cols=[['style',11,r=>r.style],['n',4,r=>r.covers],['specks',7,r=>num(r.specks,2)],['orph S/B/T',16,r=>`${num(r.orphansSubject)}/${num(r.orphansBackground)}/${num(r.orphansTitle)}`],
    ['jag',6,r=>num(r.jaggies,2)],['basis',10,r=>r.jaggiesBasis??'-'],['jagSil',7,r=>num(r.jaggiesSilhouette,2)],['L',5,r=>num(r.lCorners,2)],['Lany',6,r=>num(r.lCornersAny,1)],
    ['frame!',7,r=>num(r.frameOver)],['t12!',5,r=>num(r.title12Stray)],['acc',6,r=>pct(r.accentShare)],['ink',6,r=>pct(r.inkShare)],
    ['dRows',6,r=>num(r.ditherRows)],['offP',6,r=>num(r.ditherOffPairs)],['dEdge',6,r=>num(r.ditherEdge)],['cream',6,r=>pct(r.creamShare)],['crm!',5,r=>num(r.creamOver)],
    ['bgCrm',6,r=>num(r.creamBackground)],['bar!',5,r=>num(r.installBar)],['calm',6,r=>num(r.calm)],['dbl',5,r=>num(r.doubled)]];
  const cell=(text,w,i)=>i?String(text).padStart(w):String(text).padEnd(w);
  return [cols.map(([h,w],i)=>cell(h,w,i)).join(' '),...rows.map(r=>cols.map(([,w,f],i)=>cell(f(r),w,i)).join(' '))].join('\n');
}

async function main() {
  const options=parseArgs(process.argv.slice(2));if(options.help)usage();
  const enginePath=locate(String(options.engine??'src/index.js'));if(!existsSync(enginePath))usage('engine not found: '+enginePath);
  const engine=await import(pathToFileURL(enginePath).href),engineLabel=rel(enginePath);
  const titlePath=join(dirname(enginePath),'title.js'),titleModule=existsSync(titlePath)?await import(pathToFileURL(titlePath).href):null;
  const framing=String(options.framing??'varied');if(framing!=='varied'&&framing!=='classic')usage('--framing must be varied or classic');
  const variants=range(options.variants,Array.from({length:12},(_,i)=>i));
  const allStyles=engine.styles.map(s=>s.id),styles=options.styles?String(options.styles).split(',').map(s=>s.trim()).filter(Boolean):allStyles;
  for(const s of styles)if(!allStyles.includes(s))usage('unknown style '+s);
  const sheets=options.sheet?String(options.sheet).split(',').map(s=>s.trim()).filter(Boolean):[];
  for(const s of sheets)if(!styles.includes(s))usage('--sheet style not in the corpus: '+s);
  const canonical=canonicalTitles(),fixedTitles=options.titles?String(options.titles).split('|').map(s=>s.trim()).filter(Boolean):null;
  const titlesFor=style=>fixedTitles??[...new Set([canonical[style]??'Pocket Worlds',SECOND_TITLE])];
  const out=resolve(options.out?String(options.out):resolve(ROOT,'examples/qa/craft-lint.json'));mkdirSync(dirname(out),{recursive:true});
  const sheetDir=resolve(options['sheet-out']?String(options['sheet-out']):resolve(ROOT,'examples/qa'));
  const lint=cover=>{
    const engineMask=cover.quality?.titleMask??null,replay=engineMask?null:replayTitleMask(titleModule,cover.title);
    return lintCover(cover,{titleMask:engineMask??replay,titleMaskSource:engineMask?'quality.titleMask':replay?'title.js replay':null});
  };

  const report={tool:'craft-lint',engine:engineLabel,version:engine.VERSION,framing,variants,
    titles:fixedTitles??`per style: canonical sheet title, ${SECOND_TITLE}`,limits:LIMITS,curveKinds:CURVE_KINDS,strokeKinds:STROKE_KINDS,
    notes:['Report-only diagnostics; not a judgement of the art.',
      'jaggies.count: alternation-tolerant kinks on the subject silhouette and colour clusters of 6+ px, counted on curve-provenance pixels (basis curve); without quality.provenance the silhouette count (basis silhouette); without a subject layer, image clusters (basis image).',
      'titleColour (index 12) is checked only against quality.titleMask; layering and the calm zone use quality.titleMask or a title.js titleLayout/drawTitle replay (layers.titleMask).',
      'Means are per cover; boolean columns (creamOver, installBar) are cover counts.'],
    styles:{}};
  const rows=[],allRows=[];
  for(const style of styles){
    const titles=titlesFor(style),covers=[],styleRows=[],sheetTitle=options['sheet-title']?String(options['sheet-title']):titles[0],sheetEntries=[];
    for(const title of titles)for(const variant of variants){
      const cover=engine.generateCover(title,{style,variant,framing,diagnostics:true}),result=lint(cover),summary=summarize(result);
      styleRows.push(summary);allRows.push(summary);
      covers.push({title:cover.title,variant,archetype:cover.traits?.archetype??cover.traits?.creature??null,summary,detail:cap(result)});
      if(sheets.includes(style)&&title===sheetTitle)sheetEntries.push({cover,result});
    }
    const summary={style,...aggregate(styleRows)};rows.push(summary);
    report.styles[style]={titles,summary,covers};
    if(sheets.includes(style)){
      if(!sheetEntries.length)for(const variant of variants){
        const cover=engine.generateCover(sheetTitle,{style,variant,framing,diagnostics:true});
        sheetEntries.push({cover,result:lint(cover)});
      }
      mkdirSync(sheetDir,{recursive:true});
      const s=lintSheet(engine.styles.find(x=>x.id===style)?.label??style,sheetEntries,engineLabel,engine.VERSION),file=resolve(sheetDir,`lint-${style}.png`);
      writeFileSync(file,png(s.W,s.H,s.img));
      if(!options.quiet)console.log(`sheet ${rel(file)} (${s.W}x${s.H}, ${sheetEntries.length} covers, 4x)`);
    }
  }
  report.totals=aggregate(allRows);
  writeFileSync(out,JSON.stringify(report,null,1)+'\n');
  if(!options.quiet){
    console.log(`craft lint: engine ${engine.VERSION} (${engineLabel}), ${framing}, ${allRows.length} covers; means per cover, ! columns count covers or pixels over a limit`);
    console.log(table([...rows,{style:'ALL',...report.totals}]));
    console.log(`limits: specks <= ${LIMITS.specks}, jaggies <= ${LIMITS.jaggies}, frame luma <= ${LIMITS.frameLuma}, ink < ${LIMITS.inkShare*100}%, accent <= ${LIMITS.accentShare*100}%, cream <= ${LIMITS.creamShare*100}% and ${LIMITS.creamPixels} px`);
    console.log(`wrote ${rel(out)}. Diagnostics only; they are not a judgement of the art.`);
  }
}
main().catch(error=>{console.error(error);process.exit(2);});
