#!/usr/bin/env node
// Engine digest harness (development only; never imported by the runtime).
// Compares the current tree with the frozen engine-18 copy in baseline/engine18,
// another index.js, or a stored snapshot. Equal digests prove sameness of
// output; they say nothing about silhouettes, lighting or composition.
//
//   node scripts/digest.mjs --scope all|compat|raster|scenery[,...]
//     [--against baseline|<index.js>|<snapshot.json>|<snapshot name>|none]
//     [--engine <index.js>] [--write <name>] [--fields indices,palette,traits,composition,title,quality]
//     [--styles a,b] [--exclude a,b] [--titles "A|B"] [--variants 0-23] [--framings varied,classic]
//     [--strict-order] [--limit 20] [--quiet]
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {basename,dirname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fixtures,loadApi,sceneryCases} from './digest-fixtures.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const DIGESTS=resolve(ROOT,'examples/qa/digests');
const TITLES=['Star Patrol','Pocket Worlds','A','Moss & Magic','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345','The Last Tower Of Doom'];
const COVER_FIELDS=['indices','palette','traits','composition','title','quality'];
const QUALITY_KEYS=['policy','bounds','removedDetachedPixels','beforeCleanup','afterCleanup','removed','subjectLayer'];
const SCOPES=['all','compat','raster','scenery'];

function usage(message) {
  if(message)console.error('digest: '+message);
  console.error(`usage: node scripts/digest.mjs --scope ${SCOPES.join('|')}[,..] [--against baseline|<index.js>|<snapshot>|none]
  [--engine <index.js>] [--write <name>] [--fields ${COVER_FIELDS.join(',')}] [--styles a,b] [--exclude a,b]
  [--titles "A|B"] [--variants 0-23] [--framings varied,classic] [--strict-order] [--limit 20] [--quiet]`);
  process.exit(2);
}
function parseArgs(argv,flags) {
  const options={};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];if(!arg.startsWith('--'))usage('unexpected argument '+arg);
    let [key,value]=arg.slice(2).split(/=(.*)/s);
    if(value===undefined){if(flags.has(key))value=true;else{value=argv[++i];if(value===undefined)usage('--'+key+' needs a value');}}
    options[key]=value;
  }
  return options;
}
const list=(value,fallback)=>value==null?fallback:String(value).split(',').map(s=>s.trim()).filter(Boolean);
function range(value,fallback) {
  if(value==null)return fallback;
  const out=[];
  for(const part of String(value).split(',')){
    const m=part.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)usage('bad range '+value);
    const a=Number(m[1]),b=m[2]==null?a:Number(m[2]);for(let v=Math.min(a,b);v<=Math.max(a,b);v++)out.push(v);
  }
  return [...new Set(out)];
}

const options=parseArgs(process.argv.slice(2),new Set(['strict-order','quiet','help']));
if(options.help)usage();
const scopes=list(options.scope,['all']);
for(const s of scopes)if(!SCOPES.includes(s))usage('unknown scope '+s);
const fields=list(options.fields,COVER_FIELDS);
for(const f of fields)if(!COVER_FIELDS.includes(f))usage('unknown field '+f);
const limit=Number(options.limit??20);
const rel=p=>relative(ROOT,p).split('\\').join('/')||'.';

// ---------- digests ----------
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,32);
const bytesOf=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
function stable(value) {
  if(value===undefined)return 'undefined';
  if(value===null||typeof value!=='object'){
    if(typeof value==='number'&&!Number.isFinite(value))return String(value);
    if(typeof value==='bigint')return value+'n';
    if(typeof value==='function')return '"[function]"';
    return JSON.stringify(value);
  }
  if(ArrayBuffer.isView(value))return '['+Array.from(value).join(',')+']';
  if(Array.isArray(value))return '['+value.map(v=>v===undefined?'null':stable(v)).join(',')+']';
  if(value instanceof Map)return stable(Object.fromEntries([...value].map(([k,v])=>[String(k),v])));
  return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
const ordered=value=>JSON.stringify(value,(k,v)=>ArrayBuffer.isView(v)?Array.from(v):v)??'undefined';
const textSha=text=>sha(Buffer.from(text));

function coverRecord(cover) {
  if(cover.error)return {error:cover.error};
  const q=cover.quality||{};
  return {
    indices:sha(cover.indices),palette:sha(bytesOf(cover.palette)),traits:textSha(stable(cover.traits)),
    composition:textSha(stable(cover.composition)),title:textSha(stable({titleLines:cover.titleLines,titleBottom:cover.titleBottom})),
    quality:Object.fromEntries(QUALITY_KEYS.map(k=>[k,k==='subjectLayer'?(q.subjectLayer?sha(q.subjectLayer):null):textSha(stable(q[k]))])),
    order:textSha(ordered({traits:cover.traits,composition:cover.composition})),
  };
}
const coverDetail=cover=>cover.error?{error:cover.error}:{traits:cover.traits,composition:cover.composition,
  title:{titleLines:cover.titleLines,titleBottom:cover.titleBottom},palette:Array.from(cover.palette),
  quality:Object.fromEntries(QUALITY_KEYS.filter(k=>k!=='subjectLayer').map(k=>[k,cover.quality?.[k]]))};

// ---------- detail helpers ----------
function short(value) {
  const text=value===undefined?'(missing)':stable(value);
  return text.length>60?text.slice(0,57)+'...':text;
}
function firstDiff(a,b,path='') {
  if(ArrayBuffer.isView(a))a=Array.from(a);if(ArrayBuffer.isView(b))b=Array.from(b);
  const objects=a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b);
  if(!objects)return stable(a)===stable(b)?null:`${path||'.'}: ${short(a)} -> ${short(b)}`;
  if(Array.isArray(a)){
    for(let i=0;i<Math.min(a.length,b.length);i++){const d=firstDiff(a[i],b[i],`${path}[${i}]`);if(d)return d;}
    return a.length===b.length?null:`${path||'.'}.length: ${a.length} -> ${b.length}`;
  }
  for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
    if(a[key]===undefined&&b[key]===undefined)continue;
    const d=firstDiff(a[key],b[key],`${path}.${key}`);if(d)return d;
  }
  return null;
}
function pixelDiff(a,b,size) {
  let count=0,left=Infinity,top=Infinity,right=-1,bottom=-1;
  const n=Math.min(a.length,b.length),limitPixels=size?Math.min(n,size*size):n;
  for(let i=0;i<n;i++)if(a[i]!==b[i]){
    count++;
    if(size&&i<limitPixels){const x=i%size,y=Math.floor(i/size);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  }
  let text=`${count} ${size?'px':'bytes'} differ`;
  if(right>=0)text+=` in x${left}..${right} y${top}..${bottom}`;
  if(a.length!==b.length)text+=` (length ${a.length} -> ${b.length})`;
  return text;
}
function paletteDiff(a,b) {
  const changes=[];
  for(let i=0;i<Math.max(a.length,b.length);i++)if(a[i]!==b[i])changes.push(`${i}:${hex(a[i])}->${hex(b[i])}`);
  return 'palette '+changes.slice(0,5).join(' ')+(changes.length>5?` (+${changes.length-5})`:'');
}
const hex=v=>v==null?'none':'#'+(v>>>0).toString(16).padStart(6,'0');

// ---------- engines and snapshots ----------
function locate(spec) {
  if(spec==='baseline')return resolve(ROOT,'baseline/engine18/index.js');
  if(isAbsolute(spec))return spec;
  return existsSync(resolve(spec))?resolve(spec):resolve(ROOT,spec);
}
async function loadEngine(path) {
  if(!existsSync(path)){if(path.includes('baseline')){console.error('digest: baseline/engine18 is missing. It is a local, git-ignored copy of engine 18 used only for regression comparison; copy an engine-18 tree to baseline/engine18/ or pass another engine path (e.g. --against <index.js>). (or --against none)');process.exit(2);}usage('engine not found: '+path);}
  const url=pathToFileURL(path),index=await import(url.href);
  return {kind:'engine',path,label:rel(path),index,api:await loadApi(new URL('./',url))};
}
function snapshotPath(spec) {
  if(/\.json$/i.test(spec))return locate(spec);
  const named=resolve(DIGESTS,spec+'.json');
  return existsSync(named)?named:null;
}
function loadSnapshot(path) {
  const data=JSON.parse(readFileSync(path,'utf8'));
  const dir=dirname(path),pixels=data.meta?.pixels&&existsSync(resolve(dir,data.meta.pixels))?gunzipSync(readFileSync(resolve(dir,data.meta.pixels))):null;
  let detail=null;
  if(data.meta?.detail&&existsSync(resolve(dir,data.meta.detail)))detail=JSON.parse(gunzipSync(readFileSync(resolve(dir,data.meta.detail))).toString('utf8'));
  return {kind:'snapshot',path,label:rel(path),data,pixels,detail};
}

// ---------- cases ----------
function coverCases(styles,{titles,variants,framings,v8=null}) {
  const cases=[];
  for(const style of styles)for(const framing of framings)for(const variant of variants)for(const title of titles)
    cases.push({type:'cover',style,title,variant,framing,key:`cover|${style}|${framing}|${variant}|${title}`,row:`${style}/${framing}`});
  if(v8)for(const {title,variant,sha:expected} of v8){
    const key=`cover|mascot|classic|${variant}|${title}`,existing=cases.find(c=>c.key===key);
    if(existing)existing.v8=expected;
    else cases.push({type:'cover',style:'mascot',title,variant,framing:'classic',key,row:'mascot/classic',v8:expected});
  }
  return cases;
}

async function main() {
  const started=Date.now();
  const current=await loadEngine(locate(options.engine??'src/index.js'));
  const againstSpec=String(options.against??'baseline');
  let against=null;
  if(againstSpec!=='none'){
    const snap=againstSpec==='baseline'?null:snapshotPath(againstSpec);
    against=snap?loadSnapshot(snap):await loadEngine(locate(againstSpec));
  }
  const allStyles=current.index.styles.map(s=>s.id);
  const exclude=new Set(list(options.exclude,[]));
  const styles=list(options.styles,allStyles).filter(s=>!exclude.has(s));
  for(const s of styles)if(!allStyles.includes(s))usage('unknown style '+s);
  const titles=options.titles!=null?String(options.titles).split('|').map(s=>s.trim()).filter(Boolean):TITLES;
  const variants=range(options.variants,Array.from({length:24},(_,i)=>i));
  const framings=list(options.framings,['varied','classic']);
  for(const f of framings)if(f!=='varied'&&f!=='classic')usage('unknown framing '+f);

  const cases=[];
  if(scopes.includes('all'))cases.push(...coverCases(styles,{titles,variants,framings}));
  if(scopes.includes('compat')){
    const v8=JSON.parse(readFileSync(resolve(ROOT,'tests/mascot-v8.json'),'utf8'));
    const extra=coverCases(styles.includes('mascot')?['mascot']:[],{titles,variants,framings:['classic'],v8});
    for(const c of extra){const existing=cases.find(d=>d.key===c.key);if(existing)existing.v8??=c.v8;else cases.push(c);}
  }
  if(scopes.includes('raster')||scopes.includes('compat'))
    for(const f of fixtures(current.api))cases.push({type:'raster',key:'raster|'+f.name,name:f.name,row:'raster:'+f.name.split('/')[0],size:f.size,bytes:f.bytes});
  if(scopes.includes('scenery'))for(const c of sceneryCases(styles))cases.push({type:'scenery',key:'scenery|'+c.name,name:c.name,row:'scenery:'+c.style,run:c.run});
  if(!cases.length)usage('the requested scope selects no cases');

  const againstFixtures=against?.kind==='engine'&&cases.some(c=>c.type==='raster')?new Map(fixtures(against.api).map(f=>[f.name,f])):null;
  console.log(`digest: scope ${scopes.join(',')} | current ${current.label} (engine ${current.index.VERSION}) | against ${against?`${against.label}${against.kind==='engine'?` (engine ${against.index.VERSION})`:' (snapshot)'}`:'none'}`);
  console.log(`cases: ${cases.length} | fields ${fields.join(',')}${options['strict-order']?' | strict key order':''}`);

  const rows=new Map(),mismatches=[],snapshot={},pixelChunks=[],details={};
  let pixelOffset=0,notInSnapshot=0,orderWarnings=0,compared=0;
  const row=(name,columns)=>{if(!rows.has(name))rows.set(name,{n:0,counts:Object.fromEntries(columns.map(c=>[c,0])),columns});return rows.get(name);};
  const storePixels=bytes=>{const at=[pixelOffset,bytes.length];pixelChunks.push(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength));pixelOffset+=bytes.length;return at;};
  const snapPixels=record=>against?.pixels&&record?.px?against.pixels.subarray(record.px[0],record.px[0]+record.px[1]):null;
  const snapDetail=key=>against?.detail?.[key];
  let last=Date.now();

  for(const [index,c] of cases.entries()){
    if(!options.quiet&&Date.now()-last>5000){last=Date.now();console.log(`  ... ${index}/${cases.length}`);}
    let record,bad=[],notes=[],columns,skipped=false;
    if(c.type==='cover'){
      columns=fields.concat(c.v8?['v8']:[]);
      const cover=(()=>{try{return current.index.generateCover(c.title,{style:c.style,variant:c.variant,framing:c.framing,diagnostics:true});}
        catch(error){return {error:String(error?.message||error)};}})();
      record=coverRecord(cover);
      if(c.v8){
        const digest=cover.error?'error':createHash('sha256').update(cover.indices).update(bytesOf(cover.palette)).digest('hex');
        if(digest!==c.v8){bad.push('v8');notes.push('v8 snapshot sha differs (tests/mascot-v8.json)');}
      }
      if(options.write){
        snapshot[c.key]={...record,...(cover.indices?{px:storePixels(cover.indices)}:{})};
        details[c.key]=coverDetail(cover);
      }
      let other=null,otherRecord=null;
      if(against?.kind==='engine'){
        other=(()=>{try{return against.index.generateCover(c.title,{style:c.style,variant:c.variant,framing:c.framing,diagnostics:true});}
          catch(error){return {error:String(error?.message||error)};}})();
        otherRecord=coverRecord(other);
      }else if(against?.kind==='snapshot'){
        otherRecord=against.data.cases?.[c.key];
        if(!otherRecord){notInSnapshot++;skipped=true;otherRecord=null;}
      }
      if(otherRecord){
        compared++;
        if(otherRecord.error||record.error){
          if(otherRecord.error!==record.error){bad.push(...fields);notes.push(`error: ${otherRecord.error||'none'} -> ${record.error||'none'}`);}
        }else{
          const snapDet=against.kind==='snapshot'?snapDetail(c.key):null;
          for(const field of fields){
            if(field==='quality'){
              const keys=QUALITY_KEYS.filter(k=>otherRecord.quality?.[k]!==record.quality[k]);
              if(keys.length){
                bad.push('quality');
                const parts=keys.map(k=>{
                  if(k==='subjectLayer')return other?.quality?.subjectLayer&&cover.quality?.subjectLayer?'subjectLayer '+pixelDiff(other.quality.subjectLayer,cover.quality.subjectLayer,128):'subjectLayer differs';
                  if(!other&&!snapDet)return k+' differs';
                  return firstDiff(other?other.quality?.[k]:snapDet.quality?.[k],cover.quality?.[k],k)??k+' differs';
                });
                notes.push('quality '+parts.join('; '));
              }
            }else if(otherRecord[field]!==record[field]){
              bad.push(field);
              if(field==='indices'){
                const a=other?other.indices:snapPixels(otherRecord);
                notes.push('indices '+(a?pixelDiff(a,cover.indices,128):'differ (no pixel data in snapshot)'));
              }else if(field==='palette'){
                const a=other?other.palette:snapDet?.palette;
                notes.push(a?paletteDiff(a,cover.palette):'palette differs');
              }else{
                const a=other?(field==='title'?{titleLines:other.titleLines,titleBottom:other.titleBottom}:other[field]):snapDet?.[field];
                const b=field==='title'?{titleLines:cover.titleLines,titleBottom:cover.titleBottom}:cover[field];
                notes.push(field+' '+(a!==undefined||other?firstDiff(a,b):'differs'));
              }
            }
          }
          if(!bad.length&&otherRecord.order&&otherRecord.order!==record.order){
            if(options['strict-order']){bad.push('order');notes.push('key insertion order of traits/composition differs');columns=columns.concat(['order']);}
            else orderWarnings++;
          }
        }
      }
    }else if(c.type==='raster'){
      columns=['bytes'];
      record={bytes:sha(c.bytes),n:c.bytes.length};
      if(options.write)snapshot[c.key]={...record,size:c.size,px:storePixels(c.bytes)};
      let theirs=null,theirSha=null;
      if(againstFixtures){
        const f=againstFixtures.get(c.name);
        if(f){theirs=f.bytes;theirSha=sha(f.bytes);}else{compared++;bad.push('bytes');notes.push('fixture missing in '+against.label);}
      }else if(against?.kind==='snapshot'){
        const r=against.data.cases?.[c.key];
        if(r){theirSha=r.bytes;theirs=snapPixels(r);}else{notInSnapshot++;skipped=true;}
      }
      if(theirSha){compared++;if(theirSha!==record.bytes){bad.push('bytes');notes.push(theirs?pixelDiff(theirs,c.bytes,c.size):'bytes differ');}}
    }else{
      columns=['indices','traits'].filter(f=>fields.includes(f));
      if(!columns.length)continue;
      const run=api=>{try{return c.run(api);}catch(error){const message='ERROR: '+(error?.message||error);return {indices:Buffer.from(message),traits:{error:message},result:null};}};
      const sceneryRecord=s=>({indices:sha(s.indices),traits:textSha(stable({traits:s.traits,result:s.result}))});
      const mine=run(current.api);
      record=sceneryRecord(mine);
      if(options.write){snapshot[c.key]={...record,px:storePixels(mine.indices)};details[c.key]={traits:{traits:mine.traits,result:mine.result}};}
      let theirs=null,theirRecord=null;
      if(against?.kind==='engine'){theirs=run(against.api);theirRecord=sceneryRecord(theirs);}
      else if(against?.kind==='snapshot'){theirRecord=against.data.cases?.[c.key]??null;if(!theirRecord){notInSnapshot++;skipped=true;}}
      if(theirRecord){
        compared++;
        if(columns.includes('indices')&&theirRecord.indices!==record.indices){
          bad.push('indices');const a=theirs?theirs.indices:snapPixels(theirRecord);notes.push('indices '+(a?pixelDiff(a,mine.indices,128):'differ'));
        }
        if(columns.includes('traits')&&theirRecord.traits!==record.traits){
          bad.push('traits');const a=theirs?{traits:theirs.traits,result:theirs.result}:snapDetail(c.key)?.traits;
          notes.push('traits '+(a?firstDiff(a,{traits:mine.traits,result:mine.result}):'differ'));
        }
      }
    }
    const r=row(c.row,columns);r.n++;if(skipped)r.skipped=(r.skipped||0)+1;
    for(const col of columns)if(!(col in r.counts)){r.counts[col]=0;r.columns.push(col);}
    if(bad.length){
      for(const f of new Set(bad))r.counts[f]=(r.counts[f]||0)+1;
      mismatches.push({c,fields:[...new Set(bad)],notes});
    }
  }

  // ---------- report ----------
  const groups=new Map();
  for(const [name,r] of rows){const kind=name.includes(':')?name.split(':')[0]:'cover';if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push([name,r]);}
  for(const [kind,entries] of groups){
    const columns=[...new Set(entries.flatMap(([,r])=>r.columns))];
    const width=Math.max(18,...entries.map(([n])=>n.length))+2;
    console.log(`\n${kind==='cover'?'covers: style/framing':kind} mismatches (cases differing per field)`);
    const skipColumn=entries.some(([,r])=>r.skipped);
    console.log(''.padEnd(width)+'cases'.padStart(7)+(skipColumn?'not-compared'.padStart(14):'')+columns.map(c=>c.padStart(Math.max(9,c.length+2))).join(''));
    const total={n:0,counts:{}};
    for(const [name,r] of entries){
      total.n+=r.n;for(const c of columns)total.counts[c]=(total.counts[c]||0)+(r.counts[c]||0);
      total.skipped=(total.skipped||0)+(r.skipped||0);
      console.log(name.padEnd(width)+String(r.n).padStart(7)+(skipColumn?String(r.skipped||0).padStart(14):'')+columns.map(c=>String(c in r.counts?r.counts[c]:'-').padStart(Math.max(9,c.length+2))).join(''));
    }
    console.log('TOTAL'.padEnd(width)+String(total.n).padStart(7)+(skipColumn?String(total.skipped||0).padStart(14):'')+columns.map(c=>String(total.counts[c]||0).padStart(Math.max(9,c.length+2))).join(''));
  }
  if(mismatches.length){
    console.log(`\nfirst ${Math.min(limit,mismatches.length)} of ${mismatches.length} mismatches:`);
    for(const [i,{c,fields:f,notes}] of mismatches.slice(0,limit).entries()){
      const where=c.type==='cover'?`cover ${c.style} ${c.framing} v${c.variant} "${c.title}"`:`${c.type} ${c.name}`;
      console.log(`${String(i+1).padStart(3)}. ${where} [${f.join(',')}]`);
      for(const note of notes)console.log('       '+note);
    }
  }
  if(orderWarnings)console.log(`\nnote: ${orderWarnings} cases match semantically but their traits/composition key insertion order differs (--strict-order makes this a mismatch)`);
  if(notInSnapshot)console.log(`\nnote: ${notInSnapshot} cases are not in the snapshot and were not compared`);

  if(options.write){
    const name=basename(String(options.write)).replace(/\.json$/i,'');
    mkdirSync(DIGESTS,{recursive:true});
    const meta={tool:'pocket-cover scripts/digest.mjs',format:1,created:new Date().toISOString(),engine:current.label,version:current.index.VERSION,
      scopes,fields,filters:{styles,titles,variants,framings},count:Object.keys(snapshot).length,
      pixels:name+'.pixels.gz',detail:name+'.detail.json.gz',
      note:'Digests are sha256 prefixes. Field "order" is the insertion-order JSON of traits/composition (informational).'};
    writeFileSync(resolve(DIGESTS,name+'.json'),JSON.stringify({meta,cases:snapshot})+'\n');
    writeFileSync(resolve(DIGESTS,meta.pixels),gzipSync(Buffer.concat(pixelChunks),{level:9}));
    writeFileSync(resolve(DIGESTS,meta.detail),gzipSync(Buffer.from(JSON.stringify(details)),{level:9}));
    console.log(`\nwrote ${rel(resolve(DIGESTS,name+'.json'))} (${meta.count} cases) plus ${meta.pixels} and ${meta.detail}`);
  }
  const seconds=((Date.now()-started)/1000).toFixed(1);
  if(against&&!compared&&cases.length){console.log(`\nnothing was compared (${seconds} s)`);process.exit(2);}
  console.log(`\n${mismatches.length} mismatches in ${cases.length} cases${against?'':' (no comparison)'} (${seconds} s)`);
  process.exit(mismatches.length?1:0);
}
main().catch(error=>{console.error(error);process.exit(2);});
