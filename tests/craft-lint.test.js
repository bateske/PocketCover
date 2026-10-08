import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate,calmZone,clusters,ditherBudget,dilate,doubledTiles,frameRule,installBar,jaggies,lCorners,lintCover,lintJaggies,luma,
  monotonePieces,orphans,profileKinks,replayTitleMask,runKinks,screenFocal,summarize,titleColour} from '../scripts/craft-lint.mjs';
import {generateCover} from '../src/index.js';
import * as title from '../src/title.js';

const S=128,blank=(v=0)=>new Uint8Array(S*S).fill(v),at=(x,y)=>y*S+x;
// A shape whose left edge follows `profile` (one x per row from y0) and runs to x=100.
function staircase(profile,y0=10) {
  const mask=new Uint8Array(S*S);
  profile.forEach((x,r)=>{for(let xx=x;xx<=100;xx++)mask[at(xx,y0+r)]=1;});
  return mask;
}
const cumulative=(runs,start=10)=>runs.reduce((p,n)=>[...p,p.at(-1)+n],[start]);

test('run kinks: 1-2-1-2 alternation passes, 6-1-6 is flagged, even and shortening runs pass', () => {
  assert.deepEqual(runKinks([1,2,1,2]),[]);
  assert.deepEqual(runKinks([2,1,2,1]),[]);
  assert.deepEqual(runKinks([6,1,6]),[1]);
  assert.deepEqual(runKinks([2,2,2,2]),[]);
  assert.deepEqual(runKinks([3,2,2,1,1]),[]);
  assert.deepEqual(runKinks([4,3,2,1,1,1]),[]);
  // Without the engine-19 exemption the artkit rule flags every alternation.
  assert.deepEqual(runKinks([1,2,1,2],{alternation:false}),[1,2]);
  assert.deepEqual(runKinks([1,3,1]),[1],'a 1-3-1 step is not an alternation');
});

test('profiles split into monotone pieces and steep stretches are not judged in the row pass', () => {
  assert.deepEqual(monotonePieces([0,1,2,3,2,1]),[[0,4],[3,6]]);
  assert.deepEqual(profileKinks(cumulative([6,1,6])),[1]);
  assert.deepEqual(profileKinks(cumulative([1,2,1,2,1,2])),[]);
  // A 1:2 steep slope alternates flat 1 with steep 2; never a kink.
  assert.deepEqual(profileKinks([0,0,1,1,2,2,3,3]),[]);
});

test('image jaggies: a 6-1-6 staircase is flagged at the short run, a 1-2-1-2 staircase passes', () => {
  const kinked=staircase(cumulative([6,1,6]));
  const points=jaggies(kinked,S);
  assert.ok(points.some(([x,y])=>x===16&&y===11),'kink at the start of the 1-px run: '+JSON.stringify(points));
  assert.deepEqual(jaggies(staircase(cumulative([1,2,1,2,1,2])),S),[]);
  assert.ok(jaggies(staircase(cumulative([1,2,1,2,1,2])),S,S,{alternation:false}).length>0,'strict artkit rule flags it');
  assert.deepEqual(jaggies(staircase(cumulative([2,2,2,2])),S),[]);
  assert.deepEqual(jaggies(staircase(cumulative([3,2,2,1,1])),S),[]);
});

test('subject jaggies count only curve-provenance contour pixels, else fall back to the silhouette', () => {
  const layer=blank(255),shape=staircase(cumulative([6,1,6]));
  for(let i=0;i<shape.length;i++)if(shape[i])layer[i]=6;
  const poly=new Uint8Array(S*S).fill(5),ellipse=new Uint8Array(S*S).fill(3);
  const viaPoly=lintJaggies(layer,S,{provenance:poly}),viaCurve=lintJaggies(layer,S,{provenance:ellipse}),none=lintJaggies(layer,S);
  assert.equal(viaPoly.basis,'curve');assert.equal(viaPoly.count,0,'polygon edges are exempt');
  assert.ok(viaCurve.count>=1,'the same contour drawn as an ellipse counts');
  assert.equal(none.basis,'silhouette');assert.equal(none.count,none.silhouette);assert.ok(none.count>=1);
  assert.equal(none.curve,null);
  // The colour cluster has the same contour and is reported separately.
  assert.ok(viaCurve.clusters>=1);
});

test('clusters are 4-connected, per colour and at least six pixels', () => {
  const layer=blank(255);
  for(let x=10;x<16;x++)layer[at(x,10)]=5;          // six in a row
  for(let x=10;x<15;x++)layer[at(x,12)]=5;          // five: too small
  layer[at(20,20)]=6;layer[at(21,21)]=6;            // diagonal only
  const found=clusters(layer,S);
  assert.equal(found.length,1);assert.deepEqual([found[0].color,found[0].size,found[0].left,found[0].top,found[0].width,found[0].height],[5,6,10,10,6,1]);
});

test('orphans: a lone pixel is flagged, 25% and 50% dithers are not', () => {
  const grid=blank(0);
  for(let y=0;y<S;y+=2)for(let x=0;x<S;x+=2)grid[at(x,y)]=1;   // 25% dot grid
  grid[at(64,65)]=7;                                             // one stray
  const found=orphans(grid,S);
  assert.deepEqual(found,[[64,65]]);
  const checker=Uint8Array.from({length:S*S},(_,i)=>((i%S)+Math.floor(i/S))&1);
  assert.deepEqual(orphans(checker,S),[]);
  // Off-image counts as different: a corner pixel with no partner is alone.
  const corner=blank(0);corner[0]=3;
  assert.deepEqual(orphans(corner,S),[[0,0]]);
});

test('frame rule: luma above .55 on rows and columns 0-1 and 126-127 is counted', () => {
  const palette=Uint32Array.of(0x000000,0xffffff,0x808080),indices=blank(0);
  indices[at(1,64)]=1;indices[at(64,126)]=1;indices[at(2,2)]=1;indices[at(127,0)]=2;
  const frame=frameRule(indices,palette,S);
  assert.equal(frame.pixels,S*S-124*124);
  assert.equal(frame.over,2,'(2,2) is inside the frame rings and grey is .50');
  assert.equal(frame.max,1);
  assert.ok(Math.abs(luma(0x808080)-.502)<.001);
});

test('L-corners: flagged on 1-px strokes only', () => {
  const indices=blank(0),prov=blank(0);
  const stroke=[[10,10],[11,10],[12,10],[12,11],[12,12]];
  for(const [x,y] of stroke){indices[at(x,y)]=4;prov[at(x,y)]=8;}
  assert.deepEqual(lCorners(indices,S,{provenance:prov}),[[12,10]]);
  // The same pixels drawn as an ellipse are not a stroke.
  const curve=blank(0);for(const [x,y] of stroke)curve[at(x,y)]=3;
  assert.deepEqual(lCorners(indices,S,{provenance:curve}),[]);
  // A 1:1 diagonal drawn with doubled steps has an L at every step.
  const stair=blank(0),stairProv=blank(0),ink=(x,y)=>{stair[at(x,y)]=4;stairProv[at(x,y)]=14;};
  for(const [x,y] of [[40,40],[41,40],[41,41],[42,41],[42,42]])ink(x,y);
  assert.deepEqual(lCorners(stair,S,{provenance:stairProv}),[[41,40],[41,41],[42,41]]);
  // A clean 1:1 diagonal has none; nor does the notch of a solid block.
  for(let k=0;k<6;k++)ink(60+k,60+k);
  for(let y=80;y<84;y++)for(let x=80;x<84;x++)if(x!==83||y!==80)ink(x,y);
  assert.equal(lCorners(stair,S,{provenance:stairProv}).length,3);
  assert.equal(lCorners(stair,S).length,3,'without provenance every thin L counts');
});

test('title colour, calm zone, install bar and dilation', () => {
  const mask=blank(0);for(let x=40;x<80;x++)for(let y=8;y<16;y++)mask[at(x,y)]=1;
  const indices=blank(0);
  indices[at(50,10)]=12;indices[at(39,10)]=12;   // inside and one pixel beside the title
  indices[at(50,40)]=12;                         // stray
  indices[at(50,18)]=9;indices[at(50,19)]=2;indices[at(50,20)]=9;  // 2, 3 and 4 below the title
  const t=titleColour(indices,mask,S);
  assert.deepEqual([t.checked,t.total,t.stray],[true,3,1]);
  assert.deepEqual(titleColour(indices,null,S).checked,false);
  const calm=calmZone(indices,mask,S);
  assert.equal(calm.pixels,1,'dilate(title,3) reaches rows 16-18 only');
  assert.equal(dilate(mask,1,S).reduce((a,b)=>a+b,0),42*10);
  assert.equal(installBar({focal:[64,112]}).hit,true);
  assert.equal(installBar({bounds:{left:10,top:60,right:50,bottom:100}}).hit,false);
  assert.deepEqual(installBar({bounds:{left:10,top:104,right:50,bottom:124}}),{source:'bounds',x:30,y:114,hit:true});
});

test('dither budget: wide checker rows and off-ramp pairs are reported, ramp neighbours are not', () => {
  const indices=blank(0);
  // Rows 20-23: 60 px of a 0/1 checker (1 = LIGHTER[0]); rows 40-41: a 0/7 checker 10 px wide.
  for(let y=20;y<24;y++)for(let x=10;x<70;x++)indices[at(x,y)]=(x+y)&1;
  for(let y=40;y<42;y++)for(let x=10;x<20;x++)indices[at(x,y)]=(x+y)&1?7:0;
  const d=ditherBudget(indices,S);
  assert.deepEqual(d.rows,[20,21,22,23]);
  assert.equal(d.offPairWindows,9);assert.deepEqual(Object.keys(d.offPairs),['0/7']);
  assert.equal(d.windows,59*3+9);
  assert.equal(d.edgeWindows,null);
  const layer=blank(255);for(let y=40;y<42;y++)for(let x=10;x<20;x++)layer[at(x,y)]=indices[at(x,y)];
  assert.equal(ditherBudget(indices,S,{layer}).edgeWindows,9,'a 2-row dithered part is all edge');
});

test('doubled tiles are found only for detailed 2x enlargements', () => {
  const indices=blank(0);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)indices[at(16+x,16+y)]=[1,2,3,1][(x>>1)&3]+((y>>1)&1);
  assert.deepEqual(doubledTiles(indices,S),[[16,16]]);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)indices[at(40+x,40+y)]=(x*7+y*3)%4;
  assert.deepEqual(doubledTiles(indices,S).length,1);
});

test('lintCover reads a real diagnostics cover and stays pure', () => {
  const cover=generateCover('Rune Keeper',{style:'glyphs',variant:0,diagnostics:true});
  const before=cover.indices.slice(),layer=cover.quality.subjectLayer.slice();
  const titleMask=replayTitleMask(title,cover.title);
  assert.ok(titleMask.some(Boolean));
  const result=lintCover(cover,{titleMask,titleMaskSource:'replay'});
  assert.deepEqual(cover.indices,before);assert.deepEqual(cover.quality.subjectLayer,layer);
  assert.equal(result.layers.subject,true);assert.equal(result.layers.provenance,true);assert.equal(result.layers.titleMask,'replay');
  assert.equal(result.jaggies.basis,'curve');assert.equal(result.lCorners.basis,'stroke');assert.ok(Number.isInteger(result.lCorners.count)&&Number.isInteger(result.lCorners.any));
  assert.equal(result.frame.pixels,1008);
  assert.equal(result.titleColour.checked,!!cover.quality.titleMask,'index 12 is checked against the engine mask only');
  assert.ok(result.subject.pixels>0&&result.ink.share>=0&&result.ink.share<=1);
  assert.equal(result.hard.rainbow,0);assert.equal(result.hard.outOfRange,0);assert.equal(result.hard.detachedUnmarked,0);
  assert.ok(result.hard.ownColours<=11);
  const row=summarize(result);
  for(const key of ['specks','jaggies','lCorners','frameOver','inkShare','ditherRows','creamShare','installBar','calm'])assert.ok(key in row,key);
  // The mascot has no subject layer: subject numbers are null, whole-image checks still run.
  const mascot=lintCover(generateCover('Moon Meadow',{style:'mascot',diagnostics:true}));
  assert.equal(mascot.layers.subject,false);assert.equal(mascot.ink.share,null);assert.equal(mascot.orphans.specks,null);
  assert.equal(mascot.jaggies.basis,'image');assert.equal(mascot.lCorners.count,null);assert.equal(mascot.cream.background,null);assert.equal(mascot.frame.pixels,1008);
});

test('screenFocal maps recipe-space focal points through the varied frame', () => {
  assert.equal(screenFocal({traits:{},composition:{x:0,y:0,scale:1}}),null);
  assert.deepEqual(screenFocal({style:'relics',traits:{focal:[10,20]},composition:{x:4,y:30,scale:.5}}),[9,40]);
  assert.deepEqual(screenFocal({style:'mascot',traits:{focal:[10,20]},composition:{x:4,y:30,scale:.5}}),[10,20]);
  assert.equal(screenFocal({style:'relics',traits:{focal:[10,20]},composition:null}),null);
});

test('aggregate averages numbers, counts true flags and marks mixed strings', () => {
  assert.deepEqual(aggregate([{a:1,b:true,c:'x',d:null},{a:3,b:false,c:'y',d:null}]),{a:2,b:1,c:'mixed',d:null,covers:2});
  assert.deepEqual(aggregate([{c:'curve'},{c:'curve'}]),{c:'curve',covers:2});
});
