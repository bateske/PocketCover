import {writeFile,mkdir} from 'node:fs/promises';
import {generateCover,styles,VERSION} from '../src/index.js';
import {fonts} from '../src/font.js';
import {png} from './png.mjs';
import {renderBackground} from '../src/backgrounds.js';
import {raster} from '../src/raster.js';
import {random,hash} from '../src/random.js';
import {createPalette} from '../src/palette.js';
import {createVariation} from '../src/variation.js';
import {titleLayout,drawTitle} from '../src/title.js';
const titles={spaceships:'Star Patrol',machines:'Odd Works',relics:'Lost Relic',plants:'Alien Garden',islands:'Sky Haven',buildings:'Last Tower',vehicles:'Dust Rally',planets:'Outer Worlds',heraldry:'Iron Oath',glyphs:'Rune Keeper',dungeons:'Deep Vault',mascot:'Moon Meadow'};
const out=new URL('../examples/',import.meta.url);await mkdir(out,{recursive:true});
const W=1072,H=964,pad=16,tile=256,step=264;
function canvas(h=H){return new Uint32Array(W*h).fill(0x12191e);}
function label(p,text,x,y,c=0xd4dfdf,scale=1){
  for(const ch of text.toUpperCase()){const glyph=fonts[2][ch.charCodeAt(0)-32];if(!glyph)continue;const [advance,w,left,top,...rows]=glyph;
    rows.forEach((bits,j)=>{for(let i=0;i<w;i++)if(bits&(1<<(w-1-i)))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const px=x+(left+i)*scale+dx,py=y+j*scale+dy;if(px>=0&&px<W&&py>=0&&py<p.length/W)p[py*W+px]=c;}});x+=advance*scale;}
}
function put(p,cover,x,y){for(let yy=0;yy<tile;yy++)for(let xx=0;xx<tile;xx++)p[(y+yy)*W+x+xx]=cover.pixels[(yy>>1)*128+(xx>>1)];}
const overviewRows=Math.ceil(styles.length/4),overviewHeight=68+overviewRows*294+14,overview=canvas(overviewHeight),nativeOverview=new Uint32Array(512*overviewRows*128),manifest=[];label(overview,'POCKET COVER / SUBJECT STUDIES',pad,14,0xbfee95,2);
let overviewIndex=0;
for(const style of styles.filter(s=>s.id!=='mascot').concat(styles.filter(s=>s.id==='mascot'))){
  const p=canvas(),native=new Uint32Array(512*384),title=titles[style.id];
  label(p,style.label+' / ENGINE '+VERSION,pad,14,0xbfee95,2);
  label(p,'TITLE: '+title+' | 128 X 128 | VARIANTS 0-11',pad,41);
  for(let variant=0;variant<12;variant++){
    const cover=generateCover(title,{style:style.id,variant}),x=pad+(variant%4)*step,y=68+Math.floor(variant/4)*294;
    put(p,cover,x,y);label(p,`${style.id.slice(0,7)} ${String(variant+1).padStart(2,'0')} / V${variant}`,x,y+264,0xbfee95);
    for(let yy=0;yy<128;yy++)for(let xx=0;xx<128;xx++)native[(Math.floor(variant/4)*128+yy)*512+(variant%4)*128+xx]=cover.pixels[yy*128+xx];
    label(p,(cover.traits.archetype||cover.traits.creature||style.id).slice(0,31),x,y+278);
    const file=`${style.id}-${String(variant+1).padStart(2,'0')}.png`;
    await writeFile(new URL(file,out),png(128,128,cover.pixels));
    manifest.push({file,style:style.id,title,variant,version:cover.version,styleVersion:cover.styleVersion,framing:cover.framing,composition:cover.composition,traits:cover.traits});
    if(variant===0){
      const ox=pad+overviewIndex%4*step,oy=68+Math.floor(overviewIndex/4)*294;put(overview,cover,ox,oy);label(overview,style.label,ox,oy+264,0xbfee95);
      for(let yy=0;yy<128;yy++)for(let xx=0;xx<128;xx++)nativeOverview[(Math.floor(overviewIndex/4)*128+yy)*512+(overviewIndex%4)*128+xx]=cover.pixels[yy*128+xx];
      overviewIndex++;
    }
  }
  await writeFile(new URL(style.id+'-grid.png',out),png(W,H,p));
  await writeFile(new URL(style.id+'-native.png',out),png(512,384,native));
  console.log(`${style.id}: 12 examples and contact sheet`);
}
await writeFile(new URL('overview.png',out),png(W,overviewHeight,overview));
await writeFile(new URL('overview-native.png',out),png(512,overviewRows*128,nativeOverview));
await writeFile(new URL('manifest.json',out),JSON.stringify(manifest,null,2)+'\n');
// A fixed-title focused sheet makes the requested hull/equipment changes easy
// to compare. Select real seeds by geometry; record every variant explicitly.
const submarines=[],rovers=[];
for(let variant=0;variant<160;variant++){
  const c=generateCover('Deep Frontier',{style:'vehicles',variant});
  if(c.traits.archetype.includes('submarine'))submarines.push(c);
  if(c.traits.archetype.includes('rover'))rovers.push(c);
}
submarines.sort((a,b)=>a.traits.dimensions.length/a.traits.dimensions.height-b.traits.dimensions.length/b.traits.dimensions.height);
const focused=Array.from({length:8},(_,i)=>submarines[Math.round(i*(submarines.length-1)/7)]).concat(
  rovers.filter(c=>c.traits.equipment.includes('spoiler')).slice(0,2),rovers.filter(c=>!c.traits.equipment.includes('spoiler')).slice(0,2));
const focus=canvas(),native=new Uint32Array(4*128*3*128);
label(focus,'SUBMARINES / ROVERS / ENGINE '+VERSION,pad,14,0xbfee95,2);
label(focus,'TITLE: DEEP FRONTIER | PRINTED VARIANTS ARE EXACT SEEDS',pad,41);
focused.forEach((c,i)=>{
  const x=pad+i%4*step,y=68+Math.floor(i/4)*294;put(focus,c,x,y);
  label(focus,`${String(i+1).padStart(2,'0')} / VARIANT ${c.variant}`,x,y+264,0xbfee95);
  label(focus,c.traits.archetype.includes('submarine')?`${c.traits.profile} ${c.traits.dimensions.length} X ${c.traits.dimensions.height}`:c.traits.equipment.includes('spoiler')?'ROVER / SPOILER':'ROVER / SURVEY',x,y+278);
  for(let yy=0;yy<128;yy++)for(let xx=0;xx<128;xx++)native[(Math.floor(i/4)*128+yy)*512+(i%4)*128+xx]=c.pixels[yy*128+xx];
});
await writeFile(new URL('vehicle-variations-grid.png',out),png(W,H,focus));
await writeFile(new URL('vehicle-variations-native.png',out),png(512,384,native));
await writeFile(new URL('vehicle-variations.json',out),JSON.stringify(focused.map(({title,style,variant,version,styleVersion,framing,composition,traits})=>({title,style,variant,version,styleVersion,framing,composition,traits})),null,2)+'\n');
// Focused revisions include exact variant labels so their rarer subjects can
// be reviewed without hunting through the studio's random title combinations.
function selectSeeds(style,title,groups){
  const selected=groups.map(()=>[]);
  for(let variant=0;variant<700&&selected.some((s,i)=>s.length<groups[i][1]);variant++){
    const {traits}=generateCover(title,{style,variant});
    groups.forEach(([match,count],i)=>{if(selected[i].length<count&&match(traits))selected[i].push(variant);});
  }
  if(selected.some((s,i)=>s.length<groups[i][1]))throw new Error('Insufficient study samples: '+style);
  return selected.flat();
}
const extraStudies=[
  ['car-variations','vehicles','Dust Rally','CARS / COUPES AND SUPERCARS',selectSeeds('vehicles','Dust Rally',
    ['sport coupe','supercar','boxy sedan','rally hatchback','utility pickup'].map((profile,i)=>[t=>t.profile===profile,i<2?3:2]))],
  ['tank-variations','vehicles','Dust Rally','TANKS / FOUR CHASSIS AND WEAPON TYPES',selectSeeds('vehicles','Dust Rally',
    ['light scout','heavy battle tank','siege artillery','rocket carrier'].map(profile=>[t=>t.profile===profile,3]))],
  ['dish-variations','machines','Odd Works','DISHES / CONCAVE BOWLS AND RECEIVERS',selectSeeds('machines','Odd Works',[[t=>t.archetype==='signal harvester',12]])],
  ['crystal-variations','relics','Lost Relic','PRISMS / CRYSTAL BALLS / INSCRIBED TABLETS',selectSeeds('relics','Lost Relic',
    ['crystal','cabochon','tablet'].map(cut=>[t=>t.archetype==='crystal'&&t.gemCut===cut,4]))],
  ['bloom-variations','plants','Alien Garden','BLOOMS / MOUTH SIZE AND CLIPPED TEETH',selectSeeds('plants','Alien Garden',[[t=>t.archetype==='carnivorous bloom',12]])],
  ['waterway-variations','dungeons','Deep Vault','CHANNELS / BOTH AXES AND VARIED LENGTHS',selectSeeds('dungeons','Deep Vault',
    ['x','y'].flatMap(axis=>['sunken shrine','lava crossing'].map(kind=>[t=>t.waterway?.axis===axis&&t.archetype===kind,3])))],
  ['waterfall-variations','islands','Sky Haven','WATERFALLS / STRAIGHT VERTICAL STREAMS',selectSeeds('islands','Sky Haven',[[t=>t.waterfalls>0,12]])],
  ['canopy-variations','islands','Sky Haven','ANCIENT TREES / CROWNS AND BRANCHING',selectSeeds('islands','Sky Haven',[[t=>t.archetype==='ancient tree',12]])],
  ['staff-variations','relics','Lost Relic','STAVES / COLORED FACETS AND SMALL GLINTS',selectSeeds('relics','Lost Relic',[[t=>t.archetype==='staff'&&t.gemCut==='crystal',12]])],
];
for(const [id,style,title,heading,seeds] of [
  ['ship-variations','spaceships','Star Patrol','ROCKETS / HULLS / COMPLEXITY',[6,17,3,7,14,30,9,10,0,2,1,54]],
  ['key-variations','relics','Lost Relic','KEYS / SHAFTS / CUT TEETH',[27,34,45,56,58,59,70,76,79,85,87,102]],
  ['building-variations','buildings','Last Tower','BUILDINGS / SIX ARCHITECTURAL FAMILIES',[0,24,8,27,3,9,13,40,1,20,6,17]],
  ['planet-variations','planets','Outer Worlds','SPHERES / SOLID RINGS / ROUND MOONS',[1,10,2,3,5,6,7,9,11,18,20,24]],
  ...extraStudies,
]){
  const sheet=canvas(),small=new Uint32Array(512*384),records=[];
  label(sheet,heading+' / ENGINE '+VERSION,pad,14,0xbfee95,2);
  label(sheet,'TITLE: '+title+' | PRINTED VARIANTS ARE EXACT SEEDS',pad,41);
  seeds.forEach((variant,i)=>{
    const cover=generateCover(title,{style,variant}),x=pad+i%4*step,y=68+Math.floor(i/4)*294;
    put(sheet,cover,x,y);label(sheet,`${String(i+1).padStart(2,'0')} / VARIANT ${variant}`,x,y+264,0xbfee95);
    const t=cover.traits;
    label(sheet,(t.profile||t.gemCut||t.archetype||style).slice(0,31),x,y+278);
    for(let yy=0;yy<128;yy++)for(let xx=0;xx<128;xx++)small[(Math.floor(i/4)*128+yy)*512+i%4*128+xx]=cover.pixels[yy*128+xx];
    const {version,styleVersion,framing,composition,traits}=cover;records.push({title,style,variant,version,styleVersion,framing,composition,traits});
  });
  await writeFile(new URL(id+'-grid.png',out),png(W,H,sheet));
  await writeFile(new URL(id+'-native.png',out),png(512,384,small));
  await writeFile(new URL(id+'.json',out),JSON.stringify(records,null,2)+'\n');
}
// Isolate the actual scenery renderer. All twelve samples use ONE palette so
// changes in their geometry cannot be mistaken for palette swaps.
const scenery=canvas(),sceneryNative=new Uint32Array(512*384),sceneryRecords=[];
const sceneryPalette=createPalette(random(hash('scenery-review-palette'))),sceneryLayout=titleLayout('PURE GEOMETRY');
label(scenery,'PROCEDURAL BACKGROUNDS / ENGINE '+VERSION,pad,14,0xbfee95,2);
label(scenery,'ONE PALETTE / NO SUBJECT LAYER / ALL MARKS GENERATED FROM GEOMETRY',pad,41);
for(const [row,[style,kind]] of [['machines','workshop'],['dungeons','void'],['spaceships','stars']].entries())for(let column=0;column<4;column++){
  const seed=column+row*4,key='background-study:'+seed,indices=new Uint8Array(128*128),p=raster(indices,128,{pixelArt:true});
  const traits={};
  renderBackground(p,random(hash(key)),{style,kind,traits,top:sceneryLayout.bottom,
    subjectBounds:{left:20,top:40,right:108,bottom:107},variation:createVariation(key)});
  drawTitle(p,sceneryLayout);
  const pixels=Uint32Array.from(indices,i=>sceneryPalette[i]),x=pad+column*step,y=68+row*294;
  put(scenery,{pixels},x,y);label(scenery,`${style} / SCENERY SEED ${seed}`,x,y+264,0xbfee95);
  label(scenery,'SAME PALETTE / VARIED GEOMETRY',x,y+278);
  for(let yy=0;yy<128;yy++)for(let xx=0;xx<128;xx++)sceneryNative[(row*128+yy)*512+column*128+xx]=pixels[yy*128+xx];
  sceneryRecords.push({style,kind,seed,key,version:VERSION,traits});
}
await writeFile(new URL('background-variations-grid.png',out),png(W,H,scenery));
await writeFile(new URL('background-variations-native.png',out),png(512,384,sceneryNative));
await writeFile(new URL('background-variations.json',out),JSON.stringify({palette:[...sceneryPalette],samples:sceneryRecords},null,2)+'\n');
const studyLinks='<a href="#background-variations">procedural backgrounds</a>'+extraStudies.map(([id,,,heading])=>`<a href="#${id}">${heading.split(' / ')[0].toLowerCase()} study</a>`).join('');
const studySections='<section id="background-variations"><h2>PROCEDURAL BACKGROUNDS / ONE PALETTE</h2><p>The live scenery renderer, with subjects omitted and one fixed palette. These PNGs are generated outputs, never inputs to the cover generator. <a href="background-variations-native.png">Native pixels</a> · <a href="background-variations.json">Seeds and parameters</a></p><img loading="lazy" src="background-variations-grid.png" alt="Twelve procedural backgrounds with the same palette"></section>'+extraStudies.map(([id,,,heading])=>`<section id="${id}"><h2>${heading}</h2><p>Exact variants are printed under each sample. <a href="${id}-native.png">Native pixels</a> · <a href="${id}.json">Seeds and traits</a></p><img loading="lazy" src="${id}-grid.png" alt="${heading}"></section>`).join('');
await writeFile(new URL('index.html',out),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pocket Cover - review sheets</title><style>body{font:16px system-ui;background:#12191e;color:#d4dfdf;max-width:1072px;margin:32px auto;padding:16px}a{color:#bfee95}img{width:1072px;max-width:none;image-rendering:pixelated}nav{display:flex;flex-wrap:wrap;gap:16px}section{margin:48px 0;overflow-x:auto}h2{font-size:22px}</style><h1>Subject studies / engine ${VERSION}</h1><p>Main sheets use variants 0–11. Focused studies print their exact variant below each sample. All cover previews use fixed 2× pixels.</p><p><a href="../demo/">Open the generator</a> · <a href="manifest.json">Exact seeds and traits</a></p><nav>${studyLinks}<a href="vehicle-variations-grid.png">Submarine / rover study</a><a href="ship-variations-grid.png">Rocket / ship study</a><a href="key-variations-grid.png">Key study</a><a href="building-variations-grid.png">Building study</a><a href="planet-variations-grid.png">Planet study</a>${styles.map(s=>`<a href="#${s.id}">${s.label}</a>`).join('')}</nav>${styles.map(s=>`<section id="${s.id}"><h2>${s.label}</h2><a href="${s.id}-grid.png"><img loading="lazy" src="${s.id}-grid.png" alt="Twelve generated ${s.label} covers"></a></section>`).join('')}${studySections}</html>`);
