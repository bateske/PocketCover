// Shared helpers for tools/qa (development only; not shipped in package files).
import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const rel=(p,base=ROOT)=>{const r=relative(base,p).split('\\').join('/');return r&&!r.startsWith('..')&&!isAbsolute(r)?r:p.split('\\').join('/');};
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export function parseArgs(argv,{flags=[],usage}) {
  const options={_:[]},booleans=new Set([...flags,'help']);
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(!arg.startsWith('--')){options._.push(arg);continue;}
    let [key,value]=arg.slice(2).split(/=(.*)/s);
    if(value===undefined){
      if(booleans.has(key))value=true;
      else{value=argv[++i];if(value===undefined)fail(usage,'--'+key+' needs a value');}
    }
    if(key in options&&!booleans.has(key))options[key]=[].concat(options[key],value);
    else options[key]=value;
  }
  if(options.help){console.log(usage);process.exit(0);}
  return options;
}
export function fail(usage,message) {
  if(message)console.error('error: '+message);
  if(usage)console.error(usage);
  process.exit(2);
}
export const list=(value,fallback=[])=>value==null?fallback:[].concat(value).flatMap(v=>String(v).split(',')).map(s=>s.trim()).filter(Boolean);
export const titlesArg=(value,fallback)=>value==null?fallback:[].concat(value).flatMap(v=>String(v).split('|')).map(s=>s.trim()).filter(Boolean);
export function range(value,fallback) {
  if(value==null)return fallback;
  const out=[];
  for(const part of String(value).split(',')){
    const m=part.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)throw Error('bad range '+value);
    const a=Number(m[1]),b=m[2]==null?a:Number(m[2]);for(let v=Math.min(a,b);v<=Math.max(a,b);v++)out.push(v);
  }
  return [...new Set(out)];
}

/** 'baseline' -> baseline/engine18/index.js; other paths resolve from cwd, then the project root. */
export function locateEngine(spec='src/index.js') {
  if(spec==='baseline')return resolve(ROOT,'baseline/engine18/index.js');
  if(spec==='current')return resolve(ROOT,'src/index.js');
  if(isAbsolute(spec))return spec;
  return existsSync(resolve(spec))?resolve(spec):resolve(ROOT,spec);
}
export async function loadEngine(spec) {
  const path=locateEngine(spec);
  if(!existsSync(path))throw Error(spec==='baseline'?'baseline/engine18 is missing. It is a local, git-ignored copy of engine 18 used only for regression comparison; copy an engine-18 tree to baseline/engine18/ or pass another engine path (e.g. --against <index.js>).':'engine not found: '+path);
  const index=await import(pathToFileURL(path).href);
  return {path,dir:resolve(path,'..'),label:rel(path),index};
}
/** Import a sibling module of an engine (e.g. title.js), or null when absent. */
export async function engineModule(engine,file) {
  const path=join(engine.dir,file);
  return existsSync(path)?import(pathToFileURL(path).href):null;
}

const FALLBACK_TITLES={spaceships:'Star Patrol',machines:'Odd Works',relics:'Lost Relic',plants:'Alien Garden',islands:'Sky Haven',buildings:'Last Tower',
  vehicles:'Dust Rally',planets:'Outer Worlds',heraldry:'Iron Oath',glyphs:'Rune Keeper',dungeons:'Deep Vault',mascot:'Moon Meadow'};
/** Canonical per-style titles from scripts/examples.mjs. */
export function canonicalTitles() {
  try{
    const m=readFileSync(resolve(ROOT,'scripts/examples.mjs'),'utf8').match(/const titles=(\{[^}]*\})/);
    if(m)return {...FALLBACK_TITLES,...Function('return '+m[1])()};
  }catch{}
  return FALLBACK_TITLES;
}

// ---------- images ----------
export {png} from '../../scripts/png.mjs';
let font=null;
export async function loadFont() {
  if(!font){const {fonts}=await import(pathToFileURL(resolve(ROOT,'src/font.js')).href);font=fonts[2];}
  return font;
}
export function textLabel(img,W,text,x,y,color,maxWidth=Infinity) {
  const cap=Math.max(...font.map(g=>g?.[3]??0)),H=img.length/W,x0=x;
  for(const ch of String(text).toUpperCase()){
    const glyph=font[ch.charCodeAt(0)-32];if(!glyph){x+=4;continue;}
    const [advance,w,left,top,...rows]=glyph;if(x+advance-x0>maxWidth)break;
    rows.forEach((bits,j)=>{for(let i=0;i<w;i++)if(bits&(1<<(w-1-i))){const px=x+left+i,py=y+cap-top+j;if(px>=0&&px<W&&py>=0&&py<H)img[py*W+px]=color;}});
    x+=advance;
  }
}
export const lineHeight=()=>Math.max(...font.map(g=>g?.[3]??0))+4;

// ---------- trees ----------
export function globToRegExp(glob) {
  let re='',i=0;
  while(i<glob.length){
    const c=glob[i];
    if(c==='*'){
      if(glob[i+1]==='*'){i+=2;if(glob[i]==='/'){i++;re+='(?:.*/)?';}else re+='.*';continue;}
      re+='[^/]*';
    }else if(c==='?')re+='[^/]';
    else if(c==='{'&&glob.indexOf('}',i)>i){const end=glob.indexOf('}',i);re+='(?:'+glob.slice(i+1,end).split(',').map(s=>s.replace(/[.+^$()|[\]\\]/g,'\\$&').replace(/\*/g,'[^/]*')).join('|')+')';i=end;}
    else re+=c.replace(/[.+^$()|[\]\\{}]/g,'\\$&');
    i++;
  }
  return new RegExp('^'+re+'$');
}
/** Split a comma list of globs without splitting inside {a,b}. */
export function splitGlobs(values) {
  const out=[];
  for(const value of [].concat(values??[])){let depth=0,cur='';for(const ch of String(value)){if(ch==='{')depth++;if(ch==='}')depth--;if(ch===','&&!depth){if(cur.trim())out.push(cur.trim());cur='';}else cur+=ch;}if(cur.trim())out.push(cur.trim());}
  return out;
}
export const matcher=globs=>{const res=globs.map(globToRegExp);return path=>res.some(re=>re.test(path));};

/** Relative forward-slash paths of every file below dir, skipping ignored paths. */
export function walk(dir,ignore=()=>false) {
  const out=[];
  (function visit(sub){
    for(const entry of readdirSync(join(dir,sub),{withFileTypes:true})){
      const path=sub?sub+'/'+entry.name:entry.name;
      if(ignore(path)||ignore(path+'/'))continue;
      if(entry.isDirectory())visit(path);else if(entry.isFile())out.push(path);
    }
  })('');
  return out.sort();
}
export function readJson(path) {
  let buffer=readFileSync(path);
  // PowerShell 5 redirection writes UTF-16LE with a BOM.
  if(buffer[0]===0xff&&buffer[1]===0xfe)return JSON.parse(buffer.subarray(2).toString('utf16le'));
  let text=buffer.toString('utf8');if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  return JSON.parse(text);
}
