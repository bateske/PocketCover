#!/usr/bin/env node
// Dense bytes per runtime module: comments stripped and whitespace collapsed
// (one byte kept only where two words or two +/- would otherwise merge). An
// approximate size metric for device estimates, not a minifier: the output is
// never executed. Files are found by following imports from index.js.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {fail,list,locateEngine,parseArgs,rel} from './lib.mjs';

const USAGE=`usage: node tools/qa/size.mjs [--engines index.js[,baseline/engine18/index.js]] [--flash-ratio 0.41] [--json <out.json>]
  Prints raw, dense and gzip(dense) bytes per module (core, recipes, other dirs), per-style closures
  (recipe plus the non-core modules it imports), trimmed single-style totals (engine core + closure) and the total.`;
const options=parseArgs(process.argv.slice(2),{usage:USAGE});
const flash=Number(options['flash-ratio']??.41);

const KEYWORDS=new Set(['return','typeof','instanceof','in','of','new','delete','void','throw','case','do','else','yield','await']);
const word=c=>c!==undefined&&/[A-Za-z0-9_$\u0080-\uffff]/.test(c);
export function dense(source) {
  let out='',i=0,pendingSpace=false,last='';const n=source.length;
  const stack=[];// template nesting: brace depth inside each ${ }
  const emit=text=>{
    if(pendingSpace){const prev=out.at(-1),next=text[0];if((word(prev)&&word(next))||(prev==='+'&&next==='+')||(prev==='-'&&next==='-')||(prev==='/'&&next==='/'))out+=' ';pendingSpace=false;}
    out+=text;
  };
  const regexAllowed=()=>{
    if(!last)return true;
    if(/[A-Za-z0-9_$)\]]$/.test(last)&&!KEYWORDS.has(last))return false;
    return !(last==='}');
  };
  const readTemplate=()=>{// from just after ` until closing ` or ${
    let s='';
    while(i<n){
      const c=source[i];
      if(c==='\\'){s+=source.slice(i,i+2);i+=2;continue;}
      if(c==='`'){s+=c;i++;return {text:s,end:true};}
      if(c==='$'&&source[i+1]==='{'){s+='${';i+=2;return {text:s,end:false};}
      s+=c;i++;
    }
    return {text:s,end:true};
  };
  while(i<n){
    const c=source[i];
    if(c===' '||c==='\t'||c==='\n'||c==='\r'||c==='\f'||c==='\v'||c==='\ufeff'){pendingSpace=true;i++;continue;}
    if(c==='/'&&source[i+1]==='/'){while(i<n&&source[i]!=='\n')i++;pendingSpace=true;continue;}
    if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?n:end+2;pendingSpace=true;continue;}
    if(c==='\''||c==='"'){let j=i+1;while(j<n&&source[j]!==c){if(source[j]==='\\')j++;j++;}emit(source.slice(i,j+1));last=c;i=j+1;continue;}
    if(c==='`'){i++;const t=readTemplate();emit('`'+t.text);if(!t.end)stack.push(0);last='`';continue;}
    if(c==='/'&&regexAllowed()){
      let j=i+1,klass=false;
      while(j<n){const d=source[j];if(d==='\\'){j+=2;continue;}if(d==='['){klass=true;}else if(d===']'){klass=false;}else if(d==='/'&&!klass)break;else if(d==='\n')break;j++;}
      j++;while(j<n&&word(source[j]))j++;
      emit(source.slice(i,j));last='/re/';i=j;continue;
    }
    if(stack.length&&(c==='{'||c==='}')){
      if(c==='{'){stack[stack.length-1]++;emit(c);last=c;i++;continue;}
      if(stack.at(-1)===0){stack.pop();i++;const t=readTemplate();out+='}'+t.text;pendingSpace=false;if(!t.end)stack.push(0);last='`';continue;}
      stack[stack.length-1]--;emit(c);last=c;i++;continue;
    }
    if(word(c)){let j=i;while(j<n&&word(source[j]))j++;const token=source.slice(i,j);emit(token);last=token;i=j;continue;}
    emit(c);last=c;i++;
  }
  return out;
}

function graph(entry) {
  const root=dirname(entry),files=new Map();
  (function visit(path){
    if(files.has(path))return;
    const source=readFileSync(path,'utf8'),imports=[];
    files.set(path,{source,imports});
    for(const m of source.matchAll(/\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)){const dep=resolve(dirname(path),m[1]);imports.push(dep);visit(dep);}
  })(entry);
  const closure=(start,stop=()=>false)=>{const seen=new Set();(function go(p){if(seen.has(p)||stop(p))return;seen.add(p);for(const d of files.get(p)?.imports??[])go(d);})(start);return seen;};
  return {root,files,closure};
}
function measure(entry) {
  const g=graph(entry),key=p=>relative(g.root,p).split('\\').join('/');
  const group=p=>{const k=key(p);return k.includes('/')?k.split('/')[0]:'core';};
  const modules=new Map();
  for(const [path,{source}] of g.files){
    const d=dense(source),raw=Buffer.byteLength(source),denseBytes=Buffer.byteLength(d);
    modules.set(key(path),{path,group:group(path),raw,dense:denseBytes,gzip:gzipSync(d,{level:9}).length});
  }
  const isCore=p=>group(p)==='core';
  const entryImports=g.files.get(entry).imports,engineFile=entryImports.find(p=>key(p)==='engine.js')??null;
  const core=engineFile?g.closure(engineFile):new Set([entry]);core.add(entry);
  const recipes=entryImports.filter(p=>key(p).startsWith('recipes/'));
  const sum=(paths,field)=>[...paths].reduce((n,p)=>n+modules.get(key(p))[field],0);
  const styles=recipes.map(p=>{
    const closure=g.closure(p,q=>q!==p&&isCore(q)&&core.has(q));
    const coreExtra=[...closure].filter(q=>isCore(q)&&!core.has(q));
    const trimmed=new Set([...core,...closure]);
    return {recipe:key(p),closure:[...closure].map(key),dense:sum(closure,'dense'),trimmed:sum(trimmed,'dense'),coreExtra:coreExtra.map(key)};
  });
  return {entry,modules,core:[...core].map(key),coreDense:sum(core,'dense'),styles,
    total:{raw:sum(g.files.keys(),'raw'),dense:sum(g.files.keys(),'dense'),gzip:[...modules.values()].reduce((n,m)=>n+m.gzip,0)}};
}

const engines=list(options.engines,['src/index.js']).map(spec=>{const path=locateEngine(spec);try{return {label:rel(path),...measure(path)};}catch(error){fail(USAGE,error.message);}});
const first=engines[0],multi=engines.length>1;
const names=[...new Set(engines.flatMap(e=>[...e.modules.keys()]))].sort((a,b)=>{
  const ga=a.includes('/')?a.split('/')[0]:'',gb=b.includes('/')?b.split('/')[0]:'';return ga.localeCompare(gb)||a.localeCompare(b);});
const pad=Math.max(28,...names.map(n=>n.length+2));
const lines=[`size: dense = comments stripped, whitespace collapsed (approximate); est. flash = dense x ${flash}`];
lines.push('engines: '+engines.map((e,i)=>`[${i+1}] ${e.label}`).join('  '));
lines.push('module'.padEnd(pad)+engines.map((_,i)=>`raw[${i+1}]`.padStart(9)+`dense[${i+1}]`.padStart(10)+`gz[${i+1}]`.padStart(8)).join('')+(multi?'  dense ratio':''));
let currentGroup=null;
for(const name of names){
  const group=name.includes('/')?name.split('/')[0]:'core';
  if(group!==currentGroup){lines.push(`-- ${group}`);currentGroup=group;}
  const cells=engines.map(e=>{const m=e.modules.get(name);return m?String(m.raw).padStart(9)+String(m.dense).padStart(10)+String(m.gzip).padStart(8):'-'.padStart(9)+'-'.padStart(10)+'-'.padStart(8);});
  const a=first.modules.get(name),b=engines.at(-1).modules.get(name);
  lines.push(name.padEnd(pad)+cells.join('')+(multi?(a&&b?(b.dense/a.dense).toFixed(2):'new/removed').padStart(13):''));
}
const groupTotals=e=>{const t={};for(const m of e.modules.values())t[m.group]=(t[m.group]||0)+m.dense;return t;};
lines.push('','group totals (dense bytes)');
for(const group of [...new Set(engines.flatMap(e=>Object.keys(groupTotals(e))))]){
  lines.push(group.padEnd(pad)+engines.map(e=>String(groupTotals(e)[group]??0).padStart(10)).join('')+(multi&&groupTotals(first)[group]?(((groupTotals(engines.at(-1))[group]??0)/groupTotals(first)[group]).toFixed(2)).padStart(13):''));
}
lines.push('engine core (engine.js closure)'.padEnd(pad)+engines.map(e=>String(e.coreDense).padStart(10)).join(''));
lines.push('TOTAL dense'.padEnd(pad)+engines.map(e=>String(e.total.dense).padStart(10)).join('')+(multi?(engines.at(-1).total.dense/first.total.dense).toFixed(2).padStart(13):''));
lines.push('TOTAL raw / gzip'.padEnd(pad)+engines.map(e=>`${e.total.raw}/${e.total.gzip}`.padStart(16)).join(''));
lines.push('TOTAL est. flash'.padEnd(pad)+engines.map(e=>String(Math.round(e.total.dense*flash)).padStart(10)).join(''));
lines.push('','per style: closure = recipe + non-core helpers it imports; trimmed = engine core + closure (dense bytes, est. flash)');
for(const e of engines){
  if(multi)lines.push(`[${engines.indexOf(e)+1}] ${e.label}`);
  for(const s of e.styles)lines.push(`  ${s.recipe.padEnd(pad)}closure ${String(s.dense).padStart(7)}  trimmed ${String(s.trimmed).padStart(7)}  flash~${String(Math.round(s.trimmed*flash)).padStart(6)}`+
    (s.closure.length>1?`  (+${s.closure.filter(c=>c!==s.recipe).join(', ')})`:'')+(s.coreExtra.length?`  extra core: ${s.coreExtra.join(', ')}`:''));
}
console.log(lines.join('\n'));
if(options.json)writeFileSync(resolve(String(options.json)),JSON.stringify(engines.map(e=>({label:e.label,total:e.total,coreDense:e.coreDense,core:e.core,
  modules:Object.fromEntries([...e.modules].map(([k,m])=>[k,{group:m.group,raw:m.raw,dense:m.dense,gzip:m.gzip}])),styles:e.styles})),null,1)+'\n');
