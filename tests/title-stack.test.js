// Engine-19 title stack (package E6): layout, masks, paint and treatments.
import test from 'node:test';
import assert from 'node:assert/strict';
import {STYLE_TREATMENTS,TREATMENTS,TREATMENT_NAMES,WILD_TREATMENTS,chooseTreatment,layoutTitle,prepareTitle} from '../src/title.js';
import {legacyDrawTitle,legacyTitleLayout} from '../src/legacy.js';
import {fonts} from '../src/font.js';
import {outsideMask} from '../src/masks.js';
import {raster} from '../src/raster.js';
import {createVariation} from '../src/variation.js';
import {generateCover,styles} from '../src/index.js';
import {createGenerator} from '../src/engine.js';
import {MOODS,oklch} from '../src/palette.js';

const S=128,N=S*S,UNPAINTED=1;
const TITLES=['A','I!?','POCKET WORLDS','THE LAST TOWER OF DOOM','MINESWEEPER','ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
  'STAR PATROL','MOSS & MAGIC','!? #$% &*()[]{} + = / ~ _ :;'];
const look=(id,seed='t')=>({treatment:{...TREATMENTS[id]},variation:createVariation('title-stack:'+seed+':'+id)});
// Every font each title can be set in, with every treatment.
function* cases() {
  for(const id of TREATMENT_NAMES)for(const font of [0,3,1,2])for(const text of TITLES){
    let layout;try{layout=layoutTitle(text,{look:look(id),fonts:[font]});}catch{continue;}
    const art=prepareTitle(layout,{look:look(id,text)});
    const indices=new Uint8Array(N).fill(UNPAINTED);art.paint(null,indices);
    yield {id,font,text,layout,art,indices,where:`${id} / font ${font} / ${text}`};
  }
}
const at=(m,x,y)=>x>=0&&y>=0&&x<S&&y<S&&!!m?.[y*S+x];

test('Round9x13 is fonts[3]; fonts 0-2 are untouched',()=>{
  assert.equal(fonts.length,4);
  for(const f of fonts)assert.equal(f.length,95,'codes 32..126');
  // Native size, never scaled: 13-row capitals, 3 px strokes, advance 10.
  const H=fonts[3]['H'.charCodeAt(0)-32];assert.deepEqual(H.slice(0,4),[10,9,0,12]);assert.equal(H.length-4,13);
  // The engine-18 layouts never see the new face.
  for(const t of TITLES)assert.ok([0,1,2].includes(legacyTitleLayout(t).font));
});

test("Round9x13 '&' is the redrawn glyph: an ampersand with two counters and a lower-right tail, not a G",()=>{
  const glyph=c=>fonts[3][c.charCodeAt(0)-32];
  const amp=glyph('&'),[adv,w,lb,tb,...rows]=amp;
  assert.deepEqual([adv,w,lb,tb,rows.length],[10,9,0,12,13],'the face metrics: advance 10, 13 rows');
  const on=(x,y)=>x>=0&&y>=0&&x<w&&y<13&&((rows[y]>>(w-1-x))&1)===1;
  // Enclosed counters: background regions that the flood from outside never reaches.
  const seen=new Set(),key=(x,y)=>`${x},${y}`,queue=[[-1,-1]];seen.add(key(-1,-1));
  while(queue.length){const [x,y]=queue.pop();for(const [u,t] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
    if(u<-1||t<-1||u>w||t>13||seen.has(key(u,t))||on(u,t))continue;seen.add(key(u,t));queue.push([u,t]);}}
  const holes=[];
  for(let y=0;y<13;y++)for(let x=0;x<w;x++)if(!on(x,y)&&!seen.has(key(x,y)))holes.push(y);
  assert.ok(holes.some(y=>y<=4)&&holes.some(y=>y>=7),`a top loop and a lower bowl (counter rows ${[...new Set(holes)]})`);
  // The tail reaches the lower-right corner; the top right is open (G is closed there).
  assert.ok(on(8,12)&&on(8,11),'a tail at the lower right');
  for(let y=0;y<=4;y++)assert.ok(!on(8,y),`open top right, row ${y}`);
  assert.notDeepEqual(amp.slice(4),glyph('G').slice(4));
});

test('font order 0, 3, bold 1, 2; three lines of font 0 except in rooms',()=>{
  const three=layoutTitle('THE LAST TOWER OF DOOM',{style:'spaceships'});
  assert.equal(three.font,0);assert.equal(three.lines.length,3);assert.equal(three.bottom,52);
  const room=layoutTitle('THE LAST TOWER OF DOOM',{style:'dungeons'});
  assert.equal(room.font,1,'dungeons fall back to font 1');assert.ok(room.lines.length<=2);
  assert.equal(layoutTitle('THE LAST TOWER OF DOOM',{recipe:{composition:{room:true}}}).font,1);
  assert.equal(layoutTitle('MINESWEEPER').font,3,'a long word moves to Round9x13, not the 6 px face');
  assert.equal(layoutTitle('MOSS & MAGIC').font,3,'font 3 sets & ; font 0 keeps its charset');
  assert.equal(layoutTitle('STAR PATROL').font,0);assert.deepEqual(layoutTitle('STAR PATROL').lines,['STAR','PATROL']);
  const bold=layoutTitle('SUPERCOLOSSAL');assert.equal(bold.font,1);assert.equal(bold.bold,true);
  // N, M, W, K and J have 1 px counters that the bold mask would close.
  const closing=layoutTitle('INTERGALACTIC');assert.equal(closing.font,1);assert.equal(closing.bold,false);
  assert.equal(layoutTitle('!? #$% &*()[]{} + = / ~ _ :;').font,3,'font 3 sets every printable glyph it has');
  assert.equal(layoutTitle('ABCDEFGHIJKLMNOPQRSTUVWXYZ12345').font,2);
  // Font 2 breaks inside a word only when no break at a space fits.
  assert.deepEqual(layoutTitle('THE LAST TOWER OF DOOM',{fonts:[2]}).lines,['THE LAST','TOWER OF DOOM']);
  assert.equal(layoutTitle('ABCDEFGHIJKLMNOPQRSTUVWXYZ12345').lines.length,2);
  // Font 1 is drawn bold only when that still fits (in as few lines).
  const regular=layoutTitle('INTERGALACTICS');assert.equal(regular.font,1);assert.equal(regular.bold,false);
  assert.equal(regular.lines.length,1);
  // Depth caps: 2 for font 3, 1 for fonts 1 and 2 and for 3-line font 0.
  const block=look('block');
  assert.equal(layoutTitle('STAR PATROL',{look:block}).depth,3);
  assert.equal(layoutTitle('MINESWEEPER',{look:block}).depth,2);
  assert.equal(layoutTitle('THE LAST TOWER OF DOOM',{look:block}).depth,1);
  assert.equal(layoutTitle('MOSS & MAGIC',{look:block,fonts:[1]}).depth,1);
  for(const l of [layoutTitle('STAR PATROL',{look:block}),layoutTitle('A',{look:look('neon')})])assert.equal(l.gap,Math.max(3,l.depth+1));
  assert.equal(layoutTitle('A',{look:look('neon')}).halo,true);
  assert.throws(()=>layoutTitle('A'.repeat(31),{fonts:[0,3,1]}),/too wide/);
});

test('every treatment and font: bounds, area fields, role 10, title-only 12, determinism',()=>{
  let count=0;
  for(const {id,font,layout,art,indices,where,text} of cases()){
    count++;
    assert.ok(layout.bottom<60,where+': titleBottom '+layout.bottom);
    assert.equal(art.extent,layout.extent);
    assert.ok(art.extent<=layout.areaTop-3,where+': extent within areaTop-3');
    assert.equal(layout.areaTop,Math.max(layout.bottom+6,art.extent+3));
    assert.equal(layout.roomTop,Math.max(layout.bottom+4,art.extent+1));
    assert.equal(layout.classicTop,Math.max(layout.bottom+5,art.extent+2));
    let ten=false,last=-1;
    for(let i=0;i<N;i++){
      const x=i%S,y=(i-x)/S,c=indices[i];
      if(art.footprint[i]){last=y;assert.ok(x>=2&&x<=125&&y>=3,`${where}: footprint pixel at ${x},${y}`);}
      if(c!==UNPAINTED)assert.ok(art.footprint[i],`${where}: painted outside the footprint at ${x},${y}`);
      assert.ok(c<15,`${where}: index ${c}`);
      if(c===10&&y<layout.bottom)ten=true;
      if(art.calm&&art.footprint[i])assert.ok(art.calm[i]);
    }
    assert.equal(last,art.extent);
    assert.ok(ten,where+': role 10 inside the title rows');
    // Fonts 1 and 2 have no cream (no bevel, glints or cream bands).
    if(font===1||font===2)assert.ok(!indices.includes(8),where+': cream on a thin face');
    if(text==='A'){
      const again=new Uint8Array(N).fill(UNPAINTED);prepareTitle(layoutTitle(text,{look:look(id),fonts:[font]}),{look:look(id,text)}).paint(null,again);
      assert.deepEqual(again,indices,where+': deterministic');
    }
  }
  assert.ok(count>=180,'covers the treatment x font x title grid ('+count+')');
});

test('stack masks: outline continuity, notches only between letters, extrusion and shadow placement',()=>{
  for(const {id,font,layout,art,indices,where} of cases()){
    const {face,extrude,notch,outline,ring,halo,shadow}=art.masks;
    const body=new Uint8Array(N);for(let i=0;i<N;i++)body[i]=face[i]|extrude[i]|notch[i];
    // The outline is the full 4-connected ring of the body: no face or
    // extrusion pixel ever touches the background directly.
    for(let i=0;i<N;i++){
      if(!body[i])continue;const x=i%S,y=(i-x)/S;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
        assert.ok(at(body,x+dx,y+dy)||at(outline,x+dx,y+dy),`${where}: open outline at ${x+dx},${y+dy}`);
    }
    // Notches never fill a counter: every notch pixel lies in the face's
    // four-connected exterior.
    const outside=outsideMask(face,S);
    for(let i=0;i<N;i++)if(notch[i])assert.ok(outside[i],`${where}: notch inside a counter at ${i%S},${(i/S)|0}`);
    // Extrusion only below/right of the face (dy=1), never on it.
    for(let i=0;i<N;i++)if(extrude[i])assert.ok(!face[i]);
    if(!TREATMENTS[id].extrude)assert.ok(!extrude.some(Boolean),where);
    // Neon: coloured outline, ink outer ring, checker halo in 11, no shadow.
    if(id==='neon'){
      assert.ok(ring,where);
      if(layout.halo){
        assert.equal(shadow,null);
        const {glow}=art.masks;
        for(let i=0;i<N;i++)if(halo[i]){const x=i%S,y=(i-x)/S;assert.equal(indices[i],glow[i]||!((x+y)&1)?11:UNPAINTED,`${where}: solid glow ring, checker falloff`);}
      }
      if(font===0||font===3)assert.ok([...indices].some((c,i)=>c===10&&outline[i]),where+': neon outline in 10');
    }else{
      assert.equal(ring,null);
      for(let i=0;i<N;i++)if(outline[i]&&art.footprint[i]===1)assert.equal(indices[i],4,`${where}: ink outline`);
    }
    // The shadow touches the stack: every shadow pixel has its up-left
    // neighbour in the stack (a 1,1 drop), so none floats on the sky.
    if(shadow)for(let i=0;i<N;i++)if(shadow[i]){const x=i%S,y=(i-x)/S;
      assert.ok(at(body,x-1,y-1)||at(outline,x-1,y-1)||at(ring,x-1,y-1),where+': floating shadow');}
  }
});

test('notch fixture: counters of O and A stay open, gaps between letters close',()=>{
  for(const font of [0,3,1,2])for(const text of ['O','A','OAO','AOA','BOB']){
    const layout=layoutTitle(text,{look:look('gilded'),fonts:[font]}),art=prepareTitle(layout,{look:look('gilded')});
    const {face,notch}=art.masks,outside=outsideMask(face,S);
    if(text.length===1)assert.ok(!notch.some(Boolean),`font ${font} ${text}: a single letter has no notches`);
    for(let i=0;i<N;i++)if(!face[i]&&!outside[i])assert.ok(!notch[i],`font ${font} ${text}: counter filled`);
  }
  // Font 0 letters are one pixel apart: the gaps are notches (ink).
  const art=prepareTitle(layoutTitle('OAO',{look:look('gilded'),fonts:[0]}),{look:look('gilded')});
  assert.ok(art.masks.notch.some(Boolean));
});

test('seams only on runs of 5+ inside the face; bevel and glints only on thick strokes of fonts 0 and 3',()=>{
  for(const {id,font,layout,art,indices,where} of cases()){
    const t=TREATMENTS[id],{face}=art.masks;
    const run=i=>{let a=i,b=i;while(face[a-1]&&(a-1)%S!==S-1)a--;while(face[b+1]&&(b+1)%S)b++;return b-a+1;};
    // A face pixel in a colour no band of its row uses is a seam, bevel or glint.
    const cap=fonts[font][40],capTop=cap[3],capH=cap.length-4;
    const bands=font===0||font===3?t.bands:null;
    if(bands)layout.lines.forEach((line,li)=>{
      const base=7+layout.top+li*layout.lineHeight;
      for(let y=base-layout.top;y<base+layout.descent;y++){
        const r=Math.max(0,y-(base-capTop)),band=k=>{let b=bands.findIndex(([,u])=>(k+.5)/capH<u);return b<0?bands.length-1:b;};
        const b=band(r),prev=y>base-layout.top?band(Math.max(0,r-1)):b;
        for(let x=0;x<S;x++){const i=y*S+x;if(!face[i]||art.footprint[i]===2)continue;
          const c=indices[i];if(c===bands[b][0]||(t.bevel&&t.bevel.includes(c))||(b===t.horizon&&(c===bands[b+1][0]||c===bands[b-1][0]))||(bands[b][0]===8&&c===bands[Math.min(bands.length-1,b+1)][0]))continue;
          assert.ok(t.seams&&prev!==b&&c===bands[prev][0],`${where}: stray face colour ${c} at ${x},${y}`);
          assert.ok(run(i)>=5&&face[i-1]&&face[i+1]&&face[i-S]&&face[i+S],`${where}: seam on a thin or edge pixel at ${x},${y}`);
        }
      }
    });
    if(font!==0||!t.bevel)for(let i=0;i<N;i++)if(face[i]&&art.footprint[i]!==2&&t.bevel)
      assert.ok(!(indices[i]===8&&!t.bands.some(([c])=>c===8)),`${where}: bevel on a thin face`);
    // Glints: fonts 0 and 3 only, within the treatment's count, registered as
    // footprint 2, never in rows 0-2 or the frame columns, 24 px apart.
    const max=font===0?t.glints:font===3?Math.min(1,t.glints):0;
    assert.ok(art.glints.length<=max,where);
    if(art.glints.length===2)assert.ok(Math.abs(art.glints[0].x-art.glints[1].x)>=24);
    for(const g of art.glints){assert.equal(indices[g.y*S+g.x],8);assert.equal(art.footprint[g.y*S+g.x],2);}
    for(let i=0;i<N;i++)if(art.footprint[i]===2){const x=i%S,y=(i-x)/S;assert.ok(y>=3&&x>=2&&x<=125);assert.ok([8,12].includes(indices[i]));}
    if(!max)assert.ok(!art.footprint.includes(2),where);
  }
  // At least one font-0 cover per glint treatment actually gets its glints.
  for(const id of TREATMENT_NAMES.filter(id=>TREATMENTS[id].glints)){
    const art=prepareTitle(layoutTitle('POCKET WORLDS',{look:look(id)}),{look:look(id)});
    assert.ok(art.glints.length>=1,id);
  }
});

test('chooseTreatment: named draw, style weights, wildness boost, recipe override',()=>{
  const v=createVariation('choose:look');
  assert.equal(chooseTreatment(null,'spaceships'),null);
  const row=chooseTreatment(v,'spaceships',null,0);
  assert.ok(TREATMENTS[row.id]);assert.deepEqual(row,{...TREATMENTS[row.id]});assert.notEqual(row,TREATMENTS[row.id],'a copy');
  assert.deepEqual(chooseTreatment(v,'spaceships',null,0),row,'deterministic');
  assert.equal(row.id,v.weighted('title-treatment',Object.entries(STYLE_TREATMENTS.spaceships)),'one draw named title-treatment');
  for(const style of [...Object.keys(STYLE_TREATMENTS),'unknown-style']){
    const allowed=Object.keys(STYLE_TREATMENTS[style]??STYLE_TREATMENTS.default),seen=new Set();
    for(let s=0;s<300;s++)seen.add(chooseTreatment(createVariation('w:'+style+':'+s),style,null,0).id);
    for(const id of seen)assert.ok(allowed.includes(id),`${style}: ${id}`);
    assert.ok(seen.size>=Math.min(3,allowed.length),style);
  }
  // Neon, block and ice weigh (1+w) more when wild.
  const tally=w=>{let n=0;for(let s=0;s<2000;s++)if(WILD_TREATMENTS.includes(chooseTreatment(createVariation('wild:'+s),'mascot',null,w).id))n++;return n;};
  assert.ok(tally(.9)>tally(0)*1.2,'wild covers deal more neon, block and ice');
  assert.equal(chooseTreatment(v,'heraldry',{treatments:{chrome:1}},0).id,'chrome');
  assert.equal(chooseTreatment(v,'heraldry',{treatments:[['jade',3],['ice',0]]},0).id,'jade');
  assert.throws(()=>chooseTreatment(v,'x',{treatments:{rainbow:1}}),/Unknown title treatment/);
  for(const id of TREATMENT_NAMES){const t=TREATMENTS[id];
    assert.ok(t.accentHue==='complement'||(Array.isArray(t.accentHue)&&t.accentHue.length===2));
    assert.ok(t.tC==='max'||typeof t.tC==='number');
    assert.ok(t.bands.some(([c])=>c===10),'every face has a role-10 band');
    assert.ok(t.bands.every(([c])=>[4,8,10,11,12,13,14].includes(c)));
    assert.notEqual(t.outline,15);assert.notEqual(t.halo,15);assert.notEqual(t.ring,15);
  }
  assert.deepEqual({outline:TREATMENTS.neon.outline,ring:TREATMENTS.neon.ring,halo:TREATMENTS.neon.halo},{outline:10,ring:4,halo:11});
});

test('compat keeps the frozen legacy title; the engine exposes titleMask and honours the treatment palette',()=>{
  for(const t of TITLES){
    const legacy=legacyTitleLayout(t),layout=layoutTitle(t,{compat:true});
    assert.deepEqual({...layout,measure:null},{...legacy,measure:null,gap:3,depth:0,bold:false,extent:legacy.bottom,
      areaTop:legacy.bottom+6,roomTop:legacy.bottom+4,classicTop:legacy.bottom+5});
    const art=prepareTitle(layout,{compat:true}),a=new Uint8Array(N),b=new Uint8Array(N);
    assert.equal(art.footprint,null);assert.equal(art.calm,null);assert.equal(art.extent,legacy.bottom);
    art.paint(raster(a,S,{pixelArt:true}),a);legacyDrawTitle(raster(b,S,{pixelArt:true}),legacy);
    assert.deepEqual(a,b,t);
  }
  const classic=generateCover('Star Patrol',{style:'mascot',framing:'classic',diagnostics:true});
  assert.equal(classic.quality.titleMask,undefined);assert.equal(classic.titleExtent,classic.titleBottom);
  for(const {id} of styles)for(const title of ['Star Patrol','Moss & Magic'])for(let variant=0;variant<4;variant++){
    const c=generateCover(title,{style:id,variant,diagnostics:true}),m=c.quality.titleMask;
    assert.ok(m instanceof Uint8Array&&m.length===N,id);
    let last=-1;for(let i=0;i<N;i++)if(m[i])last=(i/S)|0;
    assert.equal(c.titleExtent,last,id+': titleExtent is the footprint row');
    assert.ok(TREATMENTS[c.look.treatment],id);
    for(let i=0;i<N;i++)if(c.indices[i]===12)assert.ok(m[i],id+': role 12 off the title');
    // The look's accent hue follows the treatment unless the mood forces one;
    // chrome and ivory get a low-chroma title colour (tC).
    const t=TREATMENTS[c.look.treatment],mood=MOODS[c.look.mood];
    if(typeof t.tC==='number')assert.ok(oklch(c.palette[12])[1]<.09,`${id}: ${t.id} title chroma`);
    if(!mood.forceAccent&&Array.isArray(t.accentHue)){
      const [lo,hi]=t.accentHue,h=c.look.accentHue;
      assert.ok(lo<=hi?h>=lo&&h<=hi:h>=lo||h<=hi,`${id}: accent ${h} outside ${t.id} ${lo}-${hi}`);
    }
  }
});

test('index 12 stays inside dilate(titleMask, 1) and out of the subject layer across 12 styles x 12 variants',()=>{
  for(const {id} of styles)for(let variant=0;variant<12;variant++){
    const title=variant%3===0?'The Last Tower Of Doom':variant%3===1?'Minesweeper':'A';
    const c=generateCover(title,{style:id,variant,diagnostics:true}),m=c.quality.titleMask,sub=c.quality.subjectLayer;
    assert.ok(c.titleBottom<60);
    for(let i=0;i<N;i++){
      if(sub)assert.notEqual(sub[i],12,`${id} ${variant}: role 12 in the subject layer`);
      if(c.indices[i]!==12)continue;
      const x=i%S,y=(i-x)/S;let near=false;
      for(let dy=-1;dy<=1&&!near;dy++)for(let dx=-1;dx<=1;dx++)if(at(m,x+dx,y+dy))near=true;
      assert.ok(near,`${id} ${variant}: stray role 12 at ${x},${y}`);
    }
  }
  // A probe recipe painting role 10 gets its title over it; 'I!?' paints 10.
  const probe=createGenerator([{id:'probe',revision:1,render({p}){p.rect(30,70,60,30,6);return {};}}]);
  for(let variant=0;variant<8;variant++){const c=probe.generateCover('I!?',{variant});assert.ok(c.indices.slice(0,c.titleBottom*S).includes(10));}
});

// ---- Phase-1.5 title findings (F6): each test pins one generating rule.

// Letter ids rebuilt from the layout: one id per glyph, as placed.
function letterIds(layout) {
  const id=new Uint16Array(N);let letter=0;
  layout.lines.forEach((line,li)=>{
    const y=7+layout.top+li*layout.lineHeight,b=layout.measure(line);
    let x=Math.round((S-b.width)/2)-b.left;
    for(const ch of line){
      const [adv,w,left,t,...bits]=fonts[layout.font][ch.charCodeAt(0)-32];letter++;
      bits.forEach((row,j)=>{for(let i=0;i<w;i++)if(row&(1<<(w-1-i)))for(let k=0;k<=(layout.bold?1:0);k++)id[(y-t+j)*S+x+left+i+k]=letter;});
      x+=adv+(layout.bold?1:0);
    }
    letter++;
  });
  return id;
}

test('chrome horizon: never ink, inset from both run ends, silhouettes whole',()=>{
  for(const font of [0,3])for(const text of TITLES){
    let layout;try{layout=layoutTitle(text,{look:look('chrome'),fonts:[font]});}catch{continue;}
    const art=prepareTitle(layout,{look:look('chrome',text)}),indices=new Uint8Array(N).fill(UNPAINTED);art.paint(null,indices);
    const {face}=art.masks,where=`chrome / font ${font} / ${text}`;
    for(let i=0;i<N;i++){
      if(!face[i]||art.footprint[i]===2)continue;
      assert.notEqual(indices[i],4,`${where}: ink inside the face at ${i%S},${(i/S)|0}`);
      // A horizon pixel (11 in the face) has face on both sides and a run of 5+.
      if(indices[i]===11){
        let a=i,b=i;while(face[a-1])a--;while(face[b+1])b++;
        assert.ok(face[i-1]&&face[i+1]&&b-a+1>=5,`${where}: horizon at a run end or on a narrow stem, ${i%S},${(i/S)|0}`);
      }
    }
    // Every face run keeps a face colour at both ends, so the band never
    // joins the outline and no letter's silhouette is sliced.
    for(let i=0;i<N;i++)if(face[i]&&art.footprint[i]===1&&(!face[i-1]||!face[i+1]))assert.ok(![4,11].includes(indices[i]),`${where}: horizon at a run end ${i%S},${(i/S)|0}`);
  }
});

test('extrusion faces by generating edge: side planes meet their letter in every row, never a strand',()=>{
  for(const {id,font,layout,art,indices,where} of cases()){
    const ex=TREATMENTS[id].extrude;if(!ex)continue;
    const {face,extrude,under,side}=art.masks,dx=font===1||font===2?0:ex.dx,outside=outsideMask(face,S),ids=letterIds(layout);
    for(let i=0;i<N;i++){
      if(!extrude[i])continue;
      const x=i%S,y=(i-x)/S;
      // An extrusion pixel is never inside one of the face's enclosed counters.
      assert.ok(outside[i],`${where}: extrusion in a counter at ${x},${y}`);
      if(!side[i])continue;
      assert.ok(dx!==0,`${where}: a straight drop has no side face (${x},${y})`);
      assert.ok(!under[i]);
      // Walking back along -dx in its own row, a side pixel reaches its
      // letter's face through side pixels only: never below the last face
      // row of its edge (a drip past the baseline), never cut off by ink.
      let k=x-dx;while(at(side,k,y))k-=dx;
      assert.ok(at(face,k,y),`${where}: side pixel not attached to the face in its row at ${x},${y}`);
      assert.ok(k!==x-dx||!at(face,x,y-ex.dy)||ids[y*S+k]===ids[(y-ex.dy)*S+x],`${where}: side under another letter at ${x},${y}`);
      if(art.footprint[i])assert.equal(indices[i],ex.side,`${where}: side colour at ${x},${y}`);
    }
    // Fonts 1 and 2 (1-2 px strokes) drop straight down: no side faces.
    if(font===1||font===2)assert.ok(!side.some(Boolean),where);
  }
  // The study case: in STAR PATROL (font 0, gilded) no side pixel lies below
  // its line's last face row, and the L's rounded foot keeps its side plane
  // (the 1 px step joins it) instead of losing it or hanging a hook.
  const layout=layoutTitle('STAR PATROL',{look:look('gilded'),fonts:[0]}),art=prepareTitle(layout,{look:look('gilded')});
  const {face,side,under}=art.masks,rowHas=(m,y)=>m.slice(y*S,y*S+S).some(Boolean);
  for(let y=0;y<S;y++)if(rowHas(side,y))assert.ok(rowHas(face,y),'side in a row with no face');
  let foot=0,right=0;for(let i=0;i<N;i++)if(face[i]){foot=(i/S)|0;}
  for(let x=0;x<S;x++)if(face[foot*S+x])right=x;
  // The L ends the second line: its last two rows are 1 px shorter than the
  // row above (a rounded corner); the step and the plane beyond it are side.
  assert.ok(face[(foot-2)*S+right+1]&&!face[(foot-1)*S+right+1]&&!face[foot*S+right+1],'L foot is rounded');
  for(const [dx,dy] of [[1,-1],[2,-1],[1,0],[2,0]])assert.ok(side[(foot+dy)*S+right+dx],`rounded foot keeps its plane at +${dx},${dy}`);
  assert.ok(!side[(foot+1)*S+right+1]&&!side[(foot+1)*S+right+2]&&!side[(foot+1)*S+right+3],'nothing below the foot');
  assert.ok(under[(foot+1)*S+right+1],'the foot bottom sweeps under');
});

test('covers: no 1 px side-colour strand tip in dx=1 titles (the verifier metric)',()=>{
  // An 11 or 14 title pixel with no title colour to its left, right or below
  // is a hanging strand tip (a drip or a hook); none may exist.
  const colour=k=>[8,10,11,12,13,14].includes(k);let n=0;
  for(const {id:style} of styles)for(const title of ['Star Patrol','Deep Vault','Outer Worlds'])for(let variant=0;variant<12;variant+=1){
    const c=generateCover(title,{style,variant,diagnostics:true}),t=c.look?.treatment;
    if(!['gilded','jade','ivory','ice','ember'].includes(t))continue;n++;
    const I=c.indices,M=c.quality.titleMask;
    for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++){
      const i=y*S+x;if(!M[i]||(I[i]!==11&&I[i]!==14))continue;
      assert.ok(colour(I[i-1])||colour(I[i+1])||colour(I[i+S]),`${style} "${title}" v${variant} ${t}: strand tip at ${x},${y}`);
    }
  }
  assert.ok(n>=100,'enough dx=1 covers sampled: '+n);
});

test('straight drops show a coloured under face; side and under never repeat the last face band',()=>{
  for(const id of TREATMENT_NAMES){
    const t=TREATMENTS[id],ex=t.extrude;if(!ex)continue;
    assert.ok(ex.side!==t.bands[t.bands.length-1][0],`${id}: side equals the last band`);
    if(!ex.dx)assert.ok(![0,1,2,3,4,9].includes(ex.under)&&ex.under!==t.bands[t.bands.length-1][0],`${id}: under face`);
    for(const font of [0,3,1,2])for(const forced of [false,true]){
      const lookRow={...look(id),moodSpec:forced?MOODS.toxic:MOODS.night};
      const layout=layoutTitle('STAR PATROL',{look:lookRow,fonts:[font]}),art=prepareTitle(layout,{look:lookRow});
      const indices=new Uint8Array(N).fill(UNPAINTED);art.paint(null,indices);
      const where=`${id} / font ${font} / ${forced?'forced':'free'}`,straight=!ex.dx||font===1||font===2;
      let below=0,coloured=0;
      for(let i=0;i<N;i++){
        if(!art.footprint[i])continue;
        if(art.masks.side[i])assert.equal(indices[i],ex.side,where);
        if(art.masks.under[i])assert.equal(indices[i],ex.under,where);
        // Directly under the face, a straight drop shows the under colour
        // (ink only on a lone 1 px step of a curve), never a background role.
        if(straight&&art.masks.face[i-S]&&!art.masks.face[i]&&art.masks.extrude[i]){
          below++;if(indices[i]===ex.under)coloured++;else assert.equal(indices[i],4,where);
        }
      }
      if(straight&&below)assert.ok(coloured>=.75*below,`${where}: ${coloured}/${below} under pixels coloured`);
    }
  }
  assert.equal(TREATMENTS.block.extrude.under,11);assert.equal(TREATMENTS.chrome.extrude.under,13);
});

test('no extrusion pixel lands in a 1 px pocket of its own letter (font 2 M and W, font 3 &)',()=>{
  for(const id of TREATMENT_NAMES.filter(id=>TREATMENTS[id].extrude))for(const [text,font] of [['ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',2],['MOSS & MAGIC',3],['MW',0],['MW',3]]){
    const layout=layoutTitle(text,{look:look(id),fonts:[font]}),art=prepareTitle(layout,{look:look(id)});
    const {face,extrude}=art.masks,ex=TREATMENTS[id].extrude,dx=font===1||font===2?0:ex.dx,letters=letterIds(layout);
    for(let i=0;i<N;i++){
      if(!extrude[i])continue;const x=i%S,y=(i-x)/S;
      // The pixel's own letter: the face it was swept from.
      let own=0;for(let k=1;k<=layout.depth&&!own;k++){const j=i-k*(ex.dy*S+dx);if(face[j])own=letters[j];}
      if(dx)assert.ok(!(face[i+dx]&&letters[i+dx]===own),`${id} ${text}: extrusion against its own letter at ${x},${y}`);
      // A straight drop's slot pixel only continues an extrusion below it.
      else assert.ok(!(face[i-1]&&face[i+1]&&letters[i-1]===own&&letters[i+1]===own&&!extrude[i+ex.dy*S]),`${id} ${text}: extrusion in a 1 px slot at ${x},${y}`);
    }
  }
});

test('neon: solid glow then checker on dark moods, none on light moods, empty pockets',()=>{
  for(const font of [0,3])for(const text of ['RUNE KEEPER','OUTER WORLDS','A']){
    const dark={...look('neon'),moodSpec:MOODS.night},light={...look('neon'),moodSpec:{...MOODS.pastel,dark:false}};
    const a=layoutTitle(text,{look:dark,fonts:[font]}),b=layoutTitle(text,{look:light,fonts:[font]});
    assert.equal(b.halo,false,`${text}: no dark glow on a light stage`);
    const art=prepareTitle(b,{look:light});assert.equal(art.masks.halo,null);assert.ok(art.masks.shadow,'light moods keep the drop shadow');
    if(!a.halo)continue;
    const glowArt=prepareTitle(a,{look:dark}),{halo,glow,ring}=glowArt.masks;
    assert.ok(glow.some(Boolean)&&ring.some(Boolean));
    const stack=new Uint8Array(N);for(let i=0;i<N;i++)stack[i]=glowArt.footprint[i]&&!halo[i]?1:0;
    const has=(x,y)=>at(stack,x,y);
    for(let i=0;i<N;i++){
      if(!halo[i])continue;const x=i%S,y=(i-x)/S;
      // The glow ring touches the stack; the checker ring lies outside it.
      if(glow[i])assert.ok([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dy])=>has(x+dx,y+dy)),`${text}: floating glow`);
      // Within 3 px along a row or column, 2 px along a diagonal.
      const near=(dx,dy)=>has(x+dx,y+dy)||has(x+2*dx,y+2*dy)||(!dx||!dy)&&has(x+3*dx,y+3*dy);
      const pocket=(near(-1,0)&&near(1,0))||(near(0,-1)&&near(0,1))||(near(-1,-1)&&near(1,1))||(near(1,-1)&&near(-1,1));
      assert.ok(!pocket,`font ${font} ${text}: halo in a pocket at ${x},${y}`);
    }
  }
});

test('ember is amber over a red foot; a forced accent drops the red foot',()=>{
  assert.deepEqual([...TREATMENTS.ember.accentHue],[45,62]);
  // No mood forces the accent any more (F1), so every mood keeps ember's red
  // foot; a mood spec that does force it (synthetic, the title.js rule)
  // drops the red foot.
  const forced=name=>({...MOODS[name],forceAccent:['abs',115,135]});
  for(const [mood,red,spec] of [['night',true],['dusk',true],['toxic',true],['infernal',true],['monochrome',true],
    ['forced toxic',false,forced('toxic')],['forced infernal',false,forced('infernal')]]){
    const l={...look('ember'),moodSpec:spec??MOODS[mood]},layout=layoutTitle('DEEP VAULT',{look:l}),art=prepareTitle(layout,{look:l});
    const indices=new Uint8Array(N).fill(UNPAINTED);art.paint(null,indices);
    const used=new Set();for(let i=0;i<N;i++)if(art.footprint[i])used.add(indices[i]);
    assert.equal(used.has(14),red,`${mood}: red foot`);
    assert.ok(!art.masks.side.some((s,i)=>s&&indices[i]===14),`${mood}: ember side is never 14`);
  }
  // OKLCh hue of ember's accent: orange to amber, not pink or salmon.
  let seen=0;
  for(let s=0;s<60;s++){
    const c=generateCover('Deep Vault',{style:'dungeons',variant:s});
    if(c.look.treatment!=='ember'||MOODS[c.look.mood].forceAccent)continue;
    seen++;const h=oklch(c.palette[10])[2];assert.ok(h>=35&&h<=75,`ember 10 hue ${h.toFixed(0)}`);
  }
  assert.ok(seen>0);
});

test('treatments are dealt per block of 12 variants when the look carries a cycle seed',()=>{
  let windows=0,abab=0;
  for(const style of [...Object.keys(STYLE_TREATMENTS),'unknown-style'])for(const title of ['Iron Oath','Minesweeper','A']){
    const seed=`pocket-cover:${style}:5:${title}`,deal=v=>chooseTreatment(createVariation(`d:${title}:${v}`,{cycleSeed:seed,index:v}),style).id;
    const ids=[];for(let v=0;v<36;v++)ids.push(deal(v));
    for(let v=1;v<ids.length;v++)assert.notEqual(ids[v],ids[v-1],`${style} ${title}: v${v-1}/v${v} repeat ${ids[v]}`);
    // Fillers vary between a heavy treatment's slots: ABAB runs stay rare.
    for(let v=3;v<ids.length;v++){windows++;if(ids[v]===ids[v-2]&&ids[v-1]===ids[v-3])abab++;}
    const allowed=Object.keys(STYLE_TREATMENTS[style]??STYLE_TREATMENTS.default);
    for(let b=0;b<3;b++){
      const count={};for(const id of ids.slice(b*12,b*12+12))count[id]=(count[id]??0)+1;
      for(const [id,n] of Object.entries(count)){assert.ok(allowed.includes(id));assert.ok(n<=5,`${style}: ${id} x${n} in a block`);}
      // The style's heaviest treatment is never dealt out of a block.
      const top=Object.entries(STYLE_TREATMENTS[style]??STYLE_TREATMENTS.default).sort((p,q)=>q[1]-p[1])[0][0];
      assert.ok(count[top]>=2,`${style} ${title}: ${top} in block ${b}`);
    }
    // Deterministic, and independent of the variation's own seed.
    assert.equal(chooseTreatment(createVariation('other',{cycleSeed:seed,index:7}),style).id,ids[7]);
  }
  assert.ok(abab<=.04*windows,`ABAB in ${abab} of ${windows} four-variant windows`);
  // A recipe row still overrides the style; a single id repeats by necessity.
  assert.equal(chooseTreatment(createVariation('x',{cycleSeed:'s',index:3}),'heraldry',{treatments:{chrome:1}}).id,'chrome');
  // Without a cycle seed it stays the single weighted draw.
  const v=createVariation('choose:look');
  assert.equal(chooseTreatment(v,'spaceships').id,v.weighted('title-treatment',Object.entries(STYLE_TREATMENTS.spaceships)));
});

test('presence: thin one-line sets of fonts 0 and 3 become two balanced lines',()=>{
  assert.deepEqual(layoutTitle('MOSS & MAGIC').lines,['MOSS &','MAGIC']);
  assert.deepEqual(layoutTitle('IRON OATH').lines,['IRON','OATH']);
  assert.deepEqual(layoutTitle('DEEP VAULT',{style:'dungeons'}).lines,['DEEP','VAULT']);
  // No split exists, or a line would be under 40 px: the single line stays.
  assert.deepEqual(layoutTitle('MINESWEEPER').lines,['MINESWEEPER']);
  assert.deepEqual(layoutTitle('A').lines,['A']);
  assert.deepEqual(layoutTitle('GO WEST',{fonts:[0]}).lines,['GO WEST']);
  for(const text of [...TITLES,'IRON OATH','DEEP VAULT','GO WEST','RUNE KEEPER'])for(const font of [0,3]){
    let l;try{l=layoutTitle(text,{fonts:[font]});}catch{continue;}
    if(l.lines.length!==1||l.bottom>=26)continue;
    const words=text.split(' ');
    for(let k=1;k<words.length;k++){
      const w=[words.slice(0,k).join(' '),words.slice(k).join(' ')].map(s=>l.measure(s).width);
      assert.ok(w.some(x=>x<40),`${text} font ${font}: a balanced two-line split was skipped`);
    }
  }
});

test('glints sit on the lit upper face of their own letter, never on outline or apertures',()=>{
  let placed=0;
  for(const {font,layout,art,where} of cases()){
    if(!art.glints.length)continue;
    const {face}=art.masks,id=letterIds(layout),cap=fonts[font][40],capTop=cap[3],capH=cap.length-4;
    for(const g of art.glints){
      placed++;
      const li=layout.lines.findIndex((_,k)=>{const y=7+layout.top+k*layout.lineHeight;return g.y>=y-layout.top&&g.y<y+layout.descent;});
      const base=7+layout.top+li*layout.lineHeight,c0=base-capTop;
      assert.ok(g.y-c0<.4*capH,`${where}: glint at ${g.x},${g.y} below the upper 40% of the cap`);
      for(let y=base-layout.top;y<g.y;y++)assert.ok(!face[y*S+g.x],`${where}: glint under face (an aperture) at ${g.x},${g.y}`);
    }
    for(let i=0;i<N;i++)if(art.footprint[i]===2){
      assert.ok(face[i],`${where}: glint pixel off the face at ${i%S},${(i/S)|0}`);
      assert.ok(art.glints.some(g=>id[g.y*S+g.x]===id[i]),`${where}: glint arm on another letter`);
    }
  }
  assert.ok(placed>20,'glints are still placed ('+placed+')');
});

test('bold font 1 never closes a 1 px counter',()=>{
  for(const text of ['KNIGHTS OF THE ROUND TABLE','MEGAMAN-STYLE PLATFORMER','THE LAST TOWER OF DOOM','INTERGALACTIC','SUPERCOLOSSAL','PROPERTYSPACE']){
    const l=layoutTitle(text,{fonts:[1]});
    if(!l.bold)continue;
    for(const c of text.replace(/ /g,'')){
      const [,w,,,...bits]=fonts[1][c.charCodeAt(0)-32];
      assert.ok(bits.every(b=>!(b&(b>>2)&~(b>>1)&((1<<w)-1))),`${text}: bold ${c} closes a counter`);
    }
  }
  assert.equal(layoutTitle('THE LAST TOWER OF DOOM',{fonts:[1]}).bold,false,'W and M keep their counters');
  assert.equal(layoutTitle('PROPERTYSPACE',{fonts:[1]}).bold,true);
});

test('no 1 px pinhole of background is left inside the drop-shadowed stack',()=>{
  for(const {art,layout,where} of cases()){
    if(layout.halo)continue;
    const f=art.footprint;
    for(let y=4;y<=art.extent;y++)for(let x=3;x<S-3;x++){
      const i=y*S+x;
      if(!f[i])assert.ok(!(f[i-1]&&f[i+1]&&f[i-S]&&f[i+S]),`${where}: pinhole at ${x},${y}`);
    }
  }
});
