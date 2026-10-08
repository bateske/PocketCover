#!/usr/bin/env node
// Milliseconds per cover, per style, for one or more engines loaded side by
// side. Engines are interleaved per style and pass to limit drift; the table
// reports the median pass. Timing is a diagnostic of this machine only.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fail,list,loadEngine,parseArgs,range,titlesArg} from './lib.mjs';

const USAGE=`usage: node tools/qa/bench.mjs [--engines index.js,baseline/engine18/index.js] [--titles 4|"A|B"] [--variants 0-23]
  [--repeat 3] [--stat median|min] [--styles a,b] [--framing varied|classic] [--diagnostics] [--json <out.json>]
  'baseline' is an alias for baseline/engine18/index.js. Ratios are relative to the first engine.`;
const TITLES=['Star Patrol','Pocket Worlds','Moss & Magic','The Last Tower Of Doom','A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345','Odd Works','Deep Vault'];
const options=parseArgs(process.argv.slice(2),{flags:['diagnostics'],usage:USAGE});
const engines=[];
for(const spec of list(options.engines,['src/index.js']))try{engines.push(await loadEngine(spec));}catch(error){fail(USAGE,error.message);}
const titles=/^\d+$/.test(String(options.titles??'4'))?TITLES.slice(0,Number(options.titles??4)):titlesArg(options.titles);
const variants=range(options.variants,Array.from({length:24},(_,i)=>i));
const repeat=Math.max(1,Number(options.repeat??3));
const framing=String(options.framing??'varied'),diagnostics=!!options.diagnostics,stat=String(options.stat??'median');
if(stat!=='median'&&stat!=='min')fail(USAGE,'--stat must be median or min');
const styles=list(options.styles,engines[0].index.styles.map(s=>s.id));
const run=(engine,style)=>{
  const start=performance.now();
  for(const title of titles)for(const variant of variants)engine.index.generateCover(title,{style,variant,framing,diagnostics});
  return (performance.now()-start)/(titles.length*variants.length);
};
// Warm-up: every style once per engine, so JIT tiers settle before timing.
for(const engine of engines)for(const style of styles)for(const title of titles)for(const variant of variants.slice(0,4))
  engine.index.generateCover(title,{style,variant,framing,diagnostics});
const samples=new Map();
for(let pass=0;pass<repeat;pass++)for(const style of styles){
  const order=pass%2?[...engines].reverse():engines;
  for(const engine of order){
    const key=engines.indexOf(engine)+'|'+style;
    if(!samples.has(key))samples.set(key,[]);
    samples.get(key).push(run(engine,style));
  }
}
const median=values=>{const s=[...values].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const pick=values=>stat==='min'?Math.min(...values):median(values);
const table=styles.map(style=>({style,ms:engines.map((e,i)=>pick(samples.get(i+'|'+style)))}));
const mean=engines.map((_,i)=>table.reduce((n,r)=>n+r.ms[i],0)/table.length);
const names=engines.map(e=>`${e.label} (v${e.index.VERSION})`);
const col=Math.max(12,...names.map(n=>n.length+2));
const lines=[`bench: ${titles.length} titles x ${variants.length} variants (${variants[0]}-${variants.at(-1)}) x ${repeat} passes, framing ${framing}${diagnostics?', diagnostics':''}; ${stat} ms per cover`,
  `node ${process.version} | ${new Date().toISOString().slice(0,10)}`,
  'style'.padEnd(12)+names.map(n=>n.padStart(col)).join('')+engines.slice(1).map((_,i)=>`ratio ${i+2}/1`.padStart(12)).join('')];
for(const r of [...table,{style:'mean',ms:mean}])
  lines.push(r.style.padEnd(12)+r.ms.map(v=>v.toFixed(2).padStart(col)).join('')+r.ms.slice(1).map(v=>(v/r.ms[0]).toFixed(2).padStart(12)).join(''));
console.log(lines.join('\n'));
if(options.json)writeFileSync(resolve(String(options.json)),JSON.stringify({titles,variants,repeat,stat,framing,diagnostics,engines:names,table,mean},null,2)+'\n');
