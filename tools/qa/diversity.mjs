#!/usr/bin/env node
// Silhouette and look diversity per style (development only; diagnostics,
// not art review). S-IoU12 (style-scope.md "Diversity targets"): for each
// title, crop the subject layer of variants 0-11 to its bounds, resample it
// (nearest) to 32x32, take the mean IoU over the 66 pairs, then average over
// the titles. Raw IoU12 is the same on the uncropped 128x128 occupancy (the
// governing metric for planets, dungeons and mascot). Also reported: the
// bounding-box aspect spread (max/min w/h), pairs above .85, and distinct
// traits.archetype, look.mood, scene and camera values per title.
//
// The mascot has no diagnostics subject layer (it paints the cover
// directly); its occupancy is a palette proxy: indices 5,6,7,8,10,11
// outside the title.
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {engineModule,fail,list,loadEngine,parseArgs,range,rel,ROOT,titlesArg} from './lib.mjs';

const USAGE=`usage: node tools/qa/diversity.mjs [--engine index.js|baseline|<index.js>] [--styles a,b] [--titles 4|"A|B"]
  [--variants 0-11] [--framing varied|classic] [--grid 32] [--json examples/qa/diversity.json] [--quiet]
  Titles default to the first four bench titles. Writes the JSON report and prints one row per style.`;
const TITLES=['Star Patrol','Pocket Worlds','Moss & Magic','The Last Tower Of Doom','A','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345','Odd Works','Deep Vault'];
const PROXY=[5,6,7,8,10,11];
// style-scope.md targets (report-only): S-IoU12 ceiling (raw for planets,
// dungeons and mascot), aspect spread, distinct archetypes (or classes) in
// v0-11, and moods/scenes/cameras.
const TARGETS={
  spaceships:{metric:'S-IoU12',ceiling:.55,aspect:2.2,archetypes:8,moods:4,scenes:4,cameras:3},
  vehicles:{metric:'S-IoU12',ceiling:.58,aspect:2.5,archetypes:7,moods:4,scenes:4,cameras:3},
  machines:{metric:'S-IoU12',ceiling:.55,aspect:2.0,archetypes:7,moods:4,scenes:3,cameras:3},
  buildings:{metric:'S-IoU12',ceiling:.60,aspect:2.0,archetypes:8,moods:4,scenes:3,cameras:2},
  relics:{metric:'S-IoU12',ceiling:.45,aspect:3.0,archetypes:10,moods:4,scenes:4,cameras:3},
  heraldry:{metric:'S-IoU12',ceiling:.58,aspect:1.8,archetypes:12,moods:4,scenes:3,cameras:2,note:'12 assembly classes, >= 3 regimes'},
  glyphs:{metric:'S-IoU12',ceiling:.41,aspect:1.8,archetypes:6,moods:4,scenes:4,cameras:2,note:'>= 5 media, >= 6 forms'},
  dungeons:{metric:'raw',ceiling:.60,aspect:[1.25,1.8],archetypes:8,moods:4,scenes:3,cameras:2,note:'>= 4 footprints, >= 3 lighting moods; cameras = scales'},
  plants:{metric:'S-IoU12',ceiling:.42,aspect:2.5,archetypes:8,moods:4,scenes:4,cameras:3},
  islands:{metric:'S-IoU12',ceiling:.55,aspect:1.8,archetypes:10,moods:4,scenes:4,cameras:3},
  planets:{metric:'raw',ceiling:.30,aspect:1.8,archetypes:8,moods:4,scenes:3,cameras:3},
  mascot:{metric:'raw',ceiling:.25,aspect:1.6,archetypes:6,moods:4,scenes:4,cameras:3,note:'creature unchanged, >= 6 looks'},
};

const options=parseArgs(process.argv.slice(2),{flags:['quiet'],usage:USAGE});
let engine;try{engine=await loadEngine(String(options.engine??'src/index.js'));}catch(error){fail(USAGE,error.message);}
const titleModule=await engineModule(engine,'title.js');
const allStyles=engine.index.styles.map(s=>s.id),styles=list(options.styles??options.style,allStyles);
for(const s of styles)if(!allStyles.includes(s))fail(USAGE,'unknown style '+s);
const titles=/^\d+$/.test(String(options.titles??'4'))?TITLES.slice(0,Number(options.titles??4)):titlesArg(options.titles);
const variants=range(options.variants,Array.from({length:12},(_,i)=>i));
const framing=String(options.framing??'varied');if(framing!=='varied'&&framing!=='classic')fail(USAGE,'--framing must be varied or classic');
const G=Number(options.grid??32);if(!Number.isInteger(G)||G<4||G>128)fail(USAGE,'--grid must be an integer 4-128');
const out=resolve(options.json?String(options.json):resolve(ROOT,'examples/qa/diversity.json'));

function titleMask(cover) {
  if(cover.quality?.titleMask)return cover.quality.titleMask;
  if(!titleModule?.titleLayout||!titleModule?.drawTitle)return null;
  const mask=new Uint8Array(128*128),p={dot:(x,y)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<128&&y>=0&&y<128)mask[y*128+x]=1;}};
  titleModule.drawTitle(p,titleModule.titleLayout(cover.title.toUpperCase()));
  return mask;
}
/** Subject occupancy (0/1) and how it was found. */
function occupancy(cover) {
  const layer=cover.quality?.subjectLayer;
  if(layer)return {occ:Uint8Array.from(layer,v=>v!==255?1:0),source:'subject layer'};
  const mask=titleMask(cover);
  return {occ:Uint8Array.from(cover.indices,(v,i)=>PROXY.includes(v)&&!mask?.[i]?1:0),source:'palette proxy 5,6,7,8,10,11 outside the title'};
}
function bounds(occ) {
  let left=128,top=128,right=-1,bottom=-1;
  for(let i=0;i<occ.length;i++)if(occ[i]){const x=i%128,y=(i-x)/128;if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;}
  return right<0?null:{left,top,right,bottom,width:right-left+1,height:bottom-top+1};
}
/** Nearest resample of the occupancy inside its bounds to G x G. */
function normalized(occ,b) {
  const out=new Uint8Array(G*G);
  for(let v=0;v<G;v++){const sy=b.top+Math.floor((v+.5)*b.height/G);for(let u=0;u<G;u++)out[v*G+u]=occ[sy*128+b.left+Math.floor((u+.5)*b.width/G)];}
  return out;
}
function iou(a,b) {let inter=0,union=0;for(let i=0;i<a.length;i++){if(a[i]&&b[i])inter++;if(a[i]||b[i])union++;}return union?inter/union:1;}
const name=v=>v==null?null:typeof v==='object'?(v.name??v.id??v.kind??null):String(v);
const sceneOf=c=>name(c.traits?.background)??(c.style==='mascot'&&c.traits?.landscape!=null?`landscape ${c.traits.landscape}${c.traits.celestial&&c.traits.celestial!=='none'?'/'+c.traits.celestial:''}`:null);
const TRAITS={archetype:c=>name(c.traits?.archetype??c.traits?.creature??c.traits?.kind),mood:c=>name(c.look?.mood),scene:sceneOf,
  camera:c=>name(c.look?.camera??c.composition?.camera),tier:c=>Number.isFinite(c.look?.tier)?'T'+c.look.tier:null};
const r3=v=>v==null?null:Math.round(v*1000)/1000;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;

const report={tool:'diversity',engine:engine.label,version:engine.index.VERSION,framing,titles,variants,grid:G,
  notes:['S-IoU12: crop each cover subject to its bounds, nearest-resample to grid x grid, mean IoU over all variant pairs per title, averaged over titles.',
    'rawIoU12: the same on the uncropped 128x128 occupancy; it governs planets, dungeons and mascot (style-scope.md).',
    'aspectSpread: max/min bounding-box width/height per title, averaged over titles; aspectAll: over every cover.',
    'distinct: distinct non-null values per title (min and mean over titles) and their union; null values are counted under "none".',
    'Diagnostics only; they do not establish that covers read as different pictures.'],
  styles:{}};
const rows=[];
for(const style of styles){
  const perTitle=[],aspects=[],histograms=Object.fromEntries(Object.keys(TRAITS).map(k=>[k,{}]));let source=null,empty=0,above85=0;
  for(const title of titles){
    const items=[];
    for(const variant of variants){
      const cover=engine.index.generateCover(title,{style,variant,framing,diagnostics:true});
      const o=occupancy(cover),b=bounds(o.occ);source??=o.source;
      const traits=Object.fromEntries(Object.entries(TRAITS).map(([k,f])=>[k,f(cover)]));
      for(const [k,v] of Object.entries(traits))histograms[k][v??'none']=(histograms[k][v??'none']??0)+1;
      if(!b){empty++;continue;}
      items.push({variant,occ:o.occ,grid:normalized(o.occ,b),aspect:b.width/b.height,traits});aspects.push(b.width/b.height);
    }
    const s=[],raw=[];
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const v=iou(items[i].grid,items[j].grid);s.push(v);if(v>.85)above85++;raw.push(iou(items[i].occ,items[j].occ));
    }
    const a=items.map(x=>x.aspect),distinct={};
    for(const k of Object.keys(TRAITS))distinct[k]=new Set(items.map(x=>x.traits[k]).filter(v=>v!=null)).size;
    perTitle.push({title,covers:items.length,pairs:s.length,siou:r3(mean(s)),raw:r3(mean(raw)),aspectSpread:a.length?r3(Math.max(...a)/Math.min(...a)):null,distinct});
  }
  const valid=perTitle.filter(t=>t.pairs),distinct={};
  for(const k of Object.keys(TRAITS)){
    const counts=perTitle.map(t=>t.distinct[k]);
    distinct[k]={min:Math.min(...counts),mean:r3(mean(counts)),union:Object.keys(histograms[k]).filter(v=>v!=='none').length,values:histograms[k]};
  }
  const entry={metric:TARGETS[style]?.metric??'S-IoU12',subject:source,siou12:r3(mean(valid.map(t=>t.siou))),rawIoU12:r3(mean(valid.map(t=>t.raw))),
    pairsAbove85:above85,aspectSpread:r3(mean(valid.map(t=>t.aspectSpread))),
    aspectAll:aspects.length?{min:r3(Math.min(...aspects)),max:r3(Math.max(...aspects)),spread:r3(Math.max(...aspects)/Math.min(...aspects))}:null,
    emptyCovers:empty,distinct,perTitle,target:TARGETS[style]??null};
  report.styles[style]=entry;rows.push({style,...entry});
}
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,1)+'\n');
if(!options.quiet){
  const head=['style'.padEnd(11),'metric'.padStart(8),'S-IoU12'.padStart(8),'raw'.padStart(6),'ceil'.padStart(5),'>.85'.padStart(5),'aspect'.padStart(7),'all'.padStart(6),
    'arch'.padStart(7),'mood'.padStart(5),'scene'.padStart(6),'camera'.padStart(7),'tiers'.padStart(6)].join(' ');
  console.log(`diversity: engine ${report.version} (${engine.label}), ${framing}, ${titles.length} titles x ${variants.length} variants, ${G}x${G}; distinct = min per title/union`);
  console.log(head);
  for(const r of rows)console.log([r.style.padEnd(11),r.metric.padStart(8),String(r.siou12).padStart(8),String(r.rawIoU12).padStart(6),String(r.target?.ceiling??'-').padStart(5),
    String(r.pairsAbove85).padStart(5),String(r.aspectSpread).padStart(7),String(r.aspectAll?.spread??'-').padStart(6),
    `${r.distinct.archetype.min}/${r.distinct.archetype.union}`.padStart(7),`${r.distinct.mood.min}`.padStart(5),`${r.distinct.scene.min}/${r.distinct.scene.union}`.padStart(6),
    `${r.distinct.camera.min}`.padStart(7),`${r.distinct.tier.min}`.padStart(6)].join(' '));
  console.log(`wrote ${rel(out)}. Diagnostics only.`);
}
