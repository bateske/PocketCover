#!/usr/bin/env node
// Sandbox -> main merge with an ownership allow-list and a conflict check
// against the wave-base snapshot. Dry run unless --apply. Refuses, and applies
// nothing, when any change is outside --allow, deletes a file, or touches a
// file whose main copy differs from the base snapshot (a conflict or stray write).
import {copyFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fail,matcher,parseArgs,splitGlobs,walk} from './lib.mjs';

const USAGE=`usage: node tools/qa/merge.mjs --base <snapshot dir> --from <sandbox dir> --to <main dir> --allow "<glob>,<glob>" [--ignore "<glob>,..."] [--apply]
  Globs are relative forward-slash paths: * within a segment, ** across segments, {a,b} alternatives.
  Always ignored: examples/**, node_modules/**, .git/**, demo/standalone.html, **/*.log (plus --ignore).
  Review full diffs with: git diff --no-index --stat <base> <sandbox>`;
const options=parseArgs(process.argv.slice(2),{flags:['apply'],usage:USAGE});
for(const key of ['base','from','to'])if(!options[key])fail(USAGE,'--'+key+' is required');
const allowGlobs=splitGlobs(options.allow);
if(!allowGlobs.length)fail(USAGE,'--allow needs at least one glob');
const [base,from,to]=['base','from','to'].map(k=>resolve(String(options[k])));
for(const dir of [base,from,to])if(!existsSync(dir))fail(USAGE,'missing directory '+dir);
const ignoreGlobs=['examples/**','node_modules/**','.git/**','demo/standalone.html','**/*.log',...splitGlobs(options.ignore)];
const ignore=matcher(ignoreGlobs),allowed=matcher(allowGlobs);

const read=(dir,path)=>{const file=resolve(dir,path);return existsSync(file)?readFileSync(file):null;};
const same=(a,b)=>a&&b&&a.equals(b);
const baseFiles=new Set(walk(base,ignore)),fromFiles=new Set(walk(from,ignore));
const entries=[];
for(const path of [...new Set([...baseFiles,...fromFiles])].sort()){
  const b=baseFiles.has(path)?read(base,path):null,s=fromFiles.has(path)?read(from,path):null;
  if(b&&s&&b.equals(s))continue;
  const m=read(to,path),entry={path,status:!s?'D':!b?'A':'M',problems:[],note:''};
  if(entry.status==='D')entry.problems.push('deletion refused');
  else{
    if(!allowed(path))entry.problems.push('outside --allow');
    if(same(m,s))entry.note='already in main';
    else if(entry.status==='M'&&!same(m,b))entry.problems.push(m?'main differs from base (conflict)':'missing in main (conflict)');
    else if(entry.status==='A'&&m)entry.problems.push('exists in main with other content (conflict)');
  }
  entry.stat=diffStat(b,s);
  entries.push({...entry,source:s});
}

// Line counts via Myers' O(ND) edit distance, after trimming common ends.
function diffStat(a,b) {
  if(!a&&!b)return '';
  if((a&&a.includes(0))||(b&&b.includes(0)))return `binary ${a?.length??0} -> ${b?.length??0} bytes`;
  const lines=buffer=>{if(!buffer)return [];const l=buffer.toString('utf8').split(/\r?\n/);if(l.at(-1)==='')l.pop();return l;};
  const x=lines(a),y=lines(b);
  let start=0;while(start<x.length&&start<y.length&&x[start]===y[start])start++;
  let ex=x.length,ey=y.length;while(ex>start&&ey>start&&x[ex-1]===y[ey-1]){ex--;ey--;}
  const n=ex-start,m=ey-start,max=n+m;
  let d=max;
  if(max<=40000){
    const v=new Int32Array(2*max+2),off=max+1;
    outer:for(let k=0,D=0;D<=max;D++){
      for(k=-D;k<=D;k+=2){
        let i=k===-D||(k!==D&&v[off+k-1]<v[off+k+1])?v[off+k+1]:v[off+k-1]+1,j=i-k;
        while(i<n&&j<m&&x[start+i]===y[start+j]){i++;j++;}
        v[off+k]=i;
        if(i>=n&&j>=m){d=D;break outer;}
      }
    }
  }
  const added=(d+m-n)/2,removed=(d-m+n)/2;
  return `+${added} -${removed}`;
}

const width=Math.max(10,...entries.map(e=>e.path.length))+2;
console.log(`merge ${from}\n   -> ${to}\n  base ${base}\n allow ${allowGlobs.join(', ')}\n`);
for(const e of entries)console.log(`${e.status} ${e.path.padEnd(width)}${e.stat.padEnd(18)}${e.problems.length?'REFUSED: '+e.problems.join('; '):e.note||'ok'}`);
const refused=entries.filter(e=>e.problems.length),pending=entries.filter(e=>!e.problems.length&&e.note!=='already in main');
console.log(`\n${entries.length} changed paths: ${pending.length} to copy, ${entries.length-pending.length-refused.length} already in main, ${refused.length} refused`);
if(refused.length){console.log('nothing applied: fix the refused paths first');process.exit(1);}
if(!options.apply){console.log('dry run: pass --apply to copy');process.exit(0);}
for(const e of pending){const target=resolve(to,e.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(from,e.path),target);}
console.log(`applied ${pending.length} files`);
