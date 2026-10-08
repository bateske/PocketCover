// Build demo/standalone.html: demo/index.html with its CSS inline and every ES module of
// the demo's import graph embedded exactly once, as a base64 data: URL behind
// an inline import map. Each module's relative imports are rewritten to bare
// "@pc/<path>" specifiers that the map resolves, so no module text repeats and
// every module stays a singleton. No second renderer or bundler dependency;
// the page still works offline from a double-click.
//
//   node scripts/standalone.mjs [--out demo/standalone.html] [--check]
// --check re-reads the written page, confirms each module appears once and
// imports nothing relative, then loads the embedded engine in Node through
// the same map and compares covers with the source tree.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..'),PREFIX='@pc/',DATA='data:text/javascript;base64,';
const FROM=/(^\s*(?:import|export)\s+[^;]*?\sfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2/gm;
const BARE_IMPORT=/(^\s*import\s*)(['"])(\.{1,2}\/[^'"]+)\2/gm;
const LEFTOVER=[/\bfrom\s*['"]\.{1,2}\//,/^\s*import\s*['"]\.{1,2}\//m,/\bimport\s*\(/,/\bimport\.meta\b/];

const args=process.argv.slice(2);
const outArg=args.includes('--out')?args[args.indexOf('--out')+1]:null;
if(args.includes('--out')&&!outArg)throw Error('--out needs a path');
const out=resolve(outArg??resolve(root,'demo/standalone.html')),check=args.includes('--check');

/** Every module reachable from `entry`, keyed by its bare specifier, with its
 * relative imports rewritten to bare specifiers. */
function collect(entry) {
  const modules=new Map();
  const visit=path=>{
    const key=PREFIX+relative(root,path).split('\\').join('/');
    if(modules.has(key))return key;
    modules.set(key,null);
    const rewrite=(_,prefix,quote,specifier)=>prefix+quote+visit(resolve(dirname(path),specifier))+quote;
    const source=readFileSync(path,'utf8').replace(FROM,rewrite).replace(BARE_IMPORT,rewrite);
    for(const re of LEFTOVER)if(re.test(source))throw Error(`${key}: unsupported import form ${re} (only static relative imports are embedded)`);
    modules.set(key,{path,source});
    return key;
  };
  visit(entry);
  return modules;
}

const modules=collect(resolve(root,'demo/demo.js'));
const map={imports:Object.fromEntries([...modules].map(([key,{source}])=>[key,DATA+Buffer.from(source).toString('base64')]))};
// '<' never occurs in base64 or the keys; escaping keeps "</script" impossible anyway.
const importMap=JSON.stringify(map).replace(/</g,'\\u003c');
const html=readFileSync(resolve(root,'demo/index.html'),'utf8')
  .replace('<link rel="stylesheet" href="./demo.css">',()=>'<style>'+readFileSync(resolve(root,'demo/demo.css'),'utf8')+'</style>')
  .replace('<script type="module" src="./demo.js"></script>',()=>'<script type="importmap">'+importMap+'</script><script type="module">import "'+PREFIX+'demo/demo.js";</script>')
  .replace('href="../examples/index.html">Browse review sheets ↗','href="#gallery">Browse generated variants ↓')
  .replace('or copy the page URL.', 'shown below each cover.')
  .replace('Procedural cover studio / 128 × 128','Offline cover studio / 128 × 128');
if(!html.includes('<script type="importmap">'))throw Error('demo/index.html no longer has the expected demo.js module script.');
if(!modules.has(PREFIX+'demo/demo.js'))throw Error('standalone entry specifier is missing from the import map.');
writeFileSync(out,html);
const sourceBytes=[...modules.values()].reduce((n,m)=>n+Buffer.byteLength(m.source),0);
console.log(`Built ${relative(root,out)||out} (${Math.round(Buffer.byteLength(html)/1024)} KiB; ${modules.size} modules, ${Math.round(sourceBytes/1024)} KiB of source, each embedded once). Double-click to open; no server required.`);

if(check){
  const page=readFileSync(out,'utf8'),json=page.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
  if(!json)throw Error('check: no import map in '+out);
  const imports=JSON.parse(json).imports,problems=[];
  for(const [key,url] of Object.entries(imports)){
    if(!url.startsWith(DATA)){problems.push(key+': not a base64 data URL');continue;}
    const source=Buffer.from(url.slice(DATA.length),'base64').toString('utf8'),occurrences=page.split(url.slice(DATA.length)).length-1;
    if(occurrences!==1)problems.push(`${key}: embedded ${occurrences} times`);
    if(source.includes('data:text/javascript'))problems.push(key+': contains a nested data URL');
    for(const m of source.matchAll(/\bfrom\s*(['"])([^'"]+)\1|^\s*import\s*(['"])([^'"]+)\3/gm)){
      const specifier=m[2]??m[4];if(!(specifier in imports))problems.push(`${key}: imports ${specifier}, which the map lacks`);
    }
  }
  const expected=[...modules.keys()].sort().join(),found=Object.keys(imports).sort().join();
  if(expected!==found)problems.push('check: the map keys differ from the module graph');
  if(problems.length){console.error(problems.join('\n'));process.exit(1);}
  console.log(`check: ${Object.keys(imports).length} modules, each embedded once, no relative or nested imports.`);
  // Load the embedded engine in Node through the same map (demo.js needs a DOM).
  const module=await import('node:module');
  if(typeof module.registerHooks!=='function'){console.log('check: this Node has no module.registerHooks; cover comparison skipped.');process.exit(0);}
  module.registerHooks({resolve(specifier,context,next){return specifier in imports?{url:imports[specifier],shortCircuit:true}:next(specifier,context);}});
  const embedded=await import(imports[PREFIX+'src/index.js']),local=await import(pathToFileURL(resolve(root,'src/index.js')).href);
  let covers=0;
  for(const {id} of local.styles)for(const title of ['Star Patrol','Moss & Magic'])for(const variant of [0,1,7])for(const framing of ['varied','classic']){
    const a=embedded.generateCover(title,{style:id,variant,framing}),b=local.generateCover(title,{style:id,variant,framing});
    if(Buffer.compare(Buffer.from(a.pixels.buffer),Buffer.from(b.pixels.buffer))||JSON.stringify(a.traits)!==JSON.stringify(b.traits))
      {console.error(`check: ${id} "${title}" v${variant} ${framing} differs from the source tree`);process.exit(1);}
    covers++;
  }
  if(embedded.styles.map(s=>s.id).join()!==local.styles.map(s=>s.id).join()||embedded.VERSION!==local.VERSION){console.error('check: styles or VERSION differ');process.exit(1);}
  console.log(`check: the embedded engine matches the source tree on ${covers} covers (pixels and traits).`);
}
