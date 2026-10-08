#!/usr/bin/env node
// sha256 manifest of a project tree, excluding examples/, node_modules/,
// baseline/ and .git/. Use --check to prove a tree is unchanged.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fail,matcher,parseArgs,readJson,ROOT,sha256,splitGlobs,walk} from './lib.mjs';

const USAGE=`usage: node tools/qa/manifest.mjs [<dir>] [--out <file.json>] [--check <manifest.json>] [--exclude "<glob>,<glob>"]
  Prints {root, excluded, count, files:{path:sha256}} to stdout (or --out).
  --check compares <dir> with a saved manifest: lists changed/added/removed files, exit 1 on any difference.`;
const options=parseArgs(process.argv.slice(2),{usage:USAGE});
const dir=resolve(options._[0]??ROOT);
const excluded=['examples/**','node_modules/**','baseline/**','.git/**',...splitGlobs(options.exclude)];
const ignore=matcher(excluded);
const files={};
for(const path of walk(dir,ignore))files[path]=sha256(readFileSync(resolve(dir,path)));
const manifest={root:dir.split('\\').join('/'),excluded,count:Object.keys(files).length,files};

if(options.check){
  const saved=readJson(resolve(String(options.check)));
  const before=saved.files||{},changed=[],added=[],removed=[];
  for(const [path,hash] of Object.entries(files))if(!(path in before))added.push(path);else if(before[path]!==hash)changed.push(path);
  for(const path of Object.keys(before))if(!(path in files))removed.push(path);
  for(const [tag,paths] of [['M',changed],['A',added],['D',removed]])for(const path of paths)console.log(`${tag} ${path}`);
  console.log(`${manifest.count} files: ${changed.length} changed, ${added.length} added, ${removed.length} removed (against ${options.check})`);
  process.exit(changed.length+added.length+removed.length?1:0);
}
const text=JSON.stringify(manifest,null,1)+'\n';
if(options.out){writeFileSync(resolve(String(options.out)),text);console.error(`wrote ${options.out} (${manifest.count} files)`);}
else process.stdout.write(text);
if(!manifest.count)fail(USAGE,'no files found in '+dir);
