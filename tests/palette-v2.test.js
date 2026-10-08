import test from 'node:test';
import assert from 'node:assert/strict';
import {BG_HUE_NEAR,BG_LSTAR,BG_MAX_L,BG_QUIET_CHROMA,BG_SHADOW_GAP,BG_SUBJECT_GAP,CUSTOM_ROLES,FIXED,HUE_GAP,MIN_STEP,MOODS,MOOD_NAMES,RARE_BOOST_WILDNESS,RARE_MOODS,STYLE_MOODS,STYLE_SIGNATURES,SUBJECT_GAP,
  bendHue,bootloaderSafeColor,buildMoodPalette,chooseMood,clipChroma,createMoodPalette,isRgb565Exact,lstar,luma,moodBoost,moodWeights,oklch,
  oklchToRgb,orderViolation,rgbToOklab,treatmentFits} from '../src/palette.js';
import {BACKGROUND_ROLES,DARKER,LIGHTER,ROLE} from '../src/roles.js';
import {chooseFittingTreatment,chooseLook} from '../src/look.js';
import {TREATMENTS as TITLE_TREATMENTS} from '../src/title.js';
import {legacyPalette} from '../src/legacy.js';
import * as V from '../src/variation.js';
import {hash,random} from '../src/random.js';
import {generateCover,styles} from '../src/index.js';

const rgb565=c=>((c>>>19&31)<<11)|((c>>>10&63)<<5)|(c>>>3&31);
const L=c=>rgbToOklab(c)[0];
// Title treatment rows as E6 will pass them (engine-contract E6): accent hue and title chroma.
const TREATMENTS=[null,
  {id:'gilded',accentHue:[38,55],tC:'max'},{id:'chrome',accentHue:[195,225],tC:.06},{id:'neon',accentHue:'complement',tC:'max'},
  {id:'block',accentHue:'complement',tC:'max'},{id:'ember',accentHue:[15,35],tC:'max'},{id:'ivory',accentHue:[70,95],tC:.04},
  {id:'jade',accentHue:[140,165],tC:'max'},{id:'ice',accentHue:[185,210],tC:'max'}];
const WILDNESS=[0,.2,.5,.9];
// 400 look seeds x every mood, cycling treatments and wildness tiers.
function* sweep() {
  for(const mood of MOOD_NAMES)for(let seed=0;seed<400;seed++){
    const v=V.createVariation('palette-v2:'+seed+':look'),treatment=TREATMENTS[seed%TREATMENTS.length],wildness=WILDNESS[seed%4];
    yield {mood,seed,treatment,wildness,v,built:buildMoodPalette(v,{mood,treatment,wildness})};
  }
}
const where=({mood,seed,treatment})=>`${mood} seed ${seed} ${treatment?.id??'no treatment'}`;

test('mood palettes hold 15 roles: fixed menu colours, RGB565-exact customs, never #FF00FF, within budget',()=>{
  let count=0;
  for(const c of sweep()){
    const p=c.built.palette;count++;
    assert.ok(p instanceof Uint32Array,where(c));assert.equal(p.length,15,where(c));
    assert.equal(p[4],0x000000);assert.equal(p[8],0xfff4d6);assert.equal(p[13],0x808080);assert.equal(p[14],0xd62020);
    for(const role of CUSTOM_ROLES){
      const rgb=p[role];
      assert.ok(isRgb565Exact(rgb),`${where(c)}: role ${role} ${rgb.toString(16)} is not RGB565-exact`);
      assert.notEqual(rgb,0xff00ff);assert.notEqual(rgb565(rgb),0xf81f,`${where(c)}: role ${role} packs to the rainbow slot`);
      assert.equal(bootloaderSafeColor(rgb),rgb);
    }
    const fixed=new Set(Object.values(FIXED)),custom=new Set(CUSTOM_ROLES.map(r=>p[r]).filter(rgb=>!fixed.has(rgb)));
    assert.ok(custom.size<=11,`${where(c)}: ${custom.size} custom colours`);
    assert.ok(p.every(rgb=>rgb!==0xff00ff&&rgb565(rgb)!==0xf81f));
  }
  assert.equal(count,MOOD_NAMES.length*400);
  // There is no rainbow option: a stray flag never adds an entry.
  const v=V.createVariation('rainbow:look');
  assert.deepEqual(createMoodPalette(v,{mood:'neon',rainbow:true}),createMoodPalette(v,{mood:'neon'}));
});

test('lightness rises strictly along every DARKER/LIGHTER chain, with minimum steps, in every mood',()=>{
  const worst={};
  for(const c of sweep()){
    const p=c.built.palette;
    for(let role=0;role<15;role++){
      if(DARKER[role]!==role)assert.ok(L(p[DARKER[role]])<L(p[role]),`${where(c)}: DARKER[${role}]=${DARKER[role]} is not darker`);
      if(LIGHTER[role]!==role)assert.ok(L(p[LIGHTER[role]])>L(p[role]),`${where(c)}: LIGHTER[${role}]=${LIGHTER[role]} is not lighter`);
    }
    assert.equal(orderViolation(p),-1);
    const steps=[['background',[4,0,1,3,2,9],MIN_STEP.background],['main',[5,6,7,8],MIN_STEP.main],['accent',[11,10,12],MIN_STEP.accent]];
    for(const [name,chain,min] of steps)for(let i=1;i<chain.length;i++){
      const d=L(p[chain[i]])-L(p[chain[i-1]]);
      worst[name]=Math.min(worst[name]??1,d);
      assert.ok(d>=min,`${where(c)}: ${name} step ${chain[i-1]}->${chain[i]} is ${d.toFixed(3)} < ${min}`);
    }
  }
  assert.ok(MIN_STEP.background>=.045&&MIN_STEP.main>=.09&&MIN_STEP.accent>=.09,'spec minimum steps');
  assert.ok(worst.main>=.09&&worst.accent>=.09&&worst.background>=.045);
});

test('value structure: dark stages step the background in L*, lift the subject off bg2 and keep the title brightest; no high-key backgrounds',()=>{
  const step32={};
  for(const c of sweep()){
    const p=c.built.palette,spec=MOODS[c.mood],star=[0,1,3,2].map(r=>lstar(p[r]));
    if(spec.dark){
      // 0 -> 1 -> 3 rise by the full L* steps (with bg1 at L* 10 or more); 3 -> 2 gives way to the bg2 cap.
      assert.ok(star[1]-star[0]>=BG_LSTAR.steps[0]-.05&&star[1]>=BG_LSTAR.bg1-.05,`${where(c)}: bg 0->1 L* ${star[0].toFixed(1)} ${star[1].toFixed(1)}`);
      assert.ok(star[2]-star[1]>=BG_LSTAR.steps[1]-.05,`${where(c)}: bg 1->3 L* step ${(star[2]-star[1]).toFixed(1)}`);
      assert.ok(star[3]-star[2]>=6,`${where(c)}: bg 3->2 L* step ${(star[3]-star[2]).toFixed(1)}`);
      (step32[c.mood]??=[]).push(star[3]-star[2]);
      assert.ok(L(p[5])>=L(p[2])+SUBJECT_GAP-1e-9,`${where(c)}: main shadow 5 ${L(p[5]).toFixed(3)} vs bg2 ${L(p[2]).toFixed(3)}`);
      // The title owns the brightest ramp: 10 over the subject's light 7 (a
      // yellow subject's light may pass 10 but stays under 12).
      const yellow=spec.chroma*spec.subjectChroma>=.8&&c.built.mainHue>=70&&c.built.mainHue<120;
      assert.ok(yellow?L(p[7])<=L(p[12])-.05:L(p[10])>=L(p[7])+.02-1e-9,`${where(c)}: title 10/12 vs subject light 7`);
      assert.ok(L(p[9])<=L(p[12])-.05,`${where(c)}: role 9 brighter than the title`);
    }else assert.fail(`${where(c)}: light stage`);
    // No high-key backgrounds: every background role stays clearly under the
    // subject's body 6 and below its value band [5, 7].
    for(const r of BACKGROUND_ROLES){
      assert.ok(L(p[r])<=L(p[6])-BG_SUBJECT_GAP+1e-9,`${where(c)}: bg ${r} ${L(p[r]).toFixed(3)} vs main 6 ${L(p[6]).toFixed(3)}`);
      assert.ok(L(p[r])<=BG_MAX_L+1e-9,`${where(c)}: bg ${r} high key ${L(p[r]).toFixed(3)}`);
    }
  }
  // 3 -> 2 meets its L* step in the median of most dark moods.
  const met=Object.values(step32).filter(a=>a.sort((x,y)=>x-y)[a.length>>1]>=BG_LSTAR.steps[2]-1).length;
  assert.ok(met>=Object.keys(step32).length-2,JSON.stringify(Object.fromEntries(Object.entries(step32).map(([m,a])=>[m,a[a.length>>1].toFixed(1)]))));
});

// User feedback (plants #41 infernal, relics #44 monochrome): the ground must
// part from the subject. Every background role sits BG_SHADOW_GAP under main
// shadow 5; a background hue near the main hue is quieted in chroma; the
// subject keeps its chroma. Low-chroma moods by design: sepia (chroma .55)
// and pastel (mainC .07-.08) are held to a lower floor (.05) than the rest (.08).
test('background parts from the subject: every bg role under main 5, near-hue grounds quiet, subject keeps its chroma',()=>{
  const arc=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d);};
  const quietC=[],otherC=[];
  for(const c of sweep()){
    const p=c.built.palette,l5=L(p[5]);
    for(const r of [0,1,2,3,9])assert.ok(L(p[r])<=l5-BG_SHADOW_GAP+1e-9,`${where(c)}: bg ${r} ${L(p[r]).toFixed(3)} vs main 5 ${l5.toFixed(3)}`);
    const floor=c.mood==='sepia'||c.mood==='pastel'?.05:.08;
    for(const r of [5,6])assert.ok(oklch(p[r])[1]>=floor,`${where(c)}: main ${r} chroma ${oklch(p[r])[1].toFixed(3)} collapsed`);
    if(MOODS[c.mood].glow)continue;
    const mean=[0,1,3,2].reduce((a,r)=>a+oklch(p[r])[1],0)/4/MOODS[c.mood].chroma;
    (arc(c.built.bgHue,c.built.mainHue)<BG_HUE_NEAR?quietC:otherC).push(mean);
  }
  const med=a=>a.sort((x,y)=>x-y)[a.length>>1];
  assert.ok(quietC.length>100&&otherC.length>100);
  assert.ok(med(quietC)<=med(otherC)*(BG_QUIET_CHROMA+.2),`near-hue bg chroma ${med(quietC).toFixed(3)} vs ${med(otherC).toFixed(3)}`);
});

test('role tables keep their closure properties',()=>{
  assert.equal(DARKER.length,15);assert.equal(LIGHTER.length,15);
  assert.deepEqual(Object.values(ROLE),[...Array(15).keys()]);
  assert.deepEqual([...BACKGROUND_ROLES],[0,1,2,3,9]);
  for(let c=0;c<15;c++){
    assert.ok(DARKER[c]<15&&LIGHTER[c]<15);
    if(c!==8)assert.notEqual(DARKER[c],8,'nothing darkens into cream');
    if(c!==12){assert.notEqual(DARKER[c],12);assert.notEqual(LIGHTER[c],12,'LIGHTER never produces the title colour');}
    if(c!==8)assert.notEqual(LIGHTER[c],8,'LIGHTER never produces cream');
    // Chains end: darker steps reach black, lighter steps reach a fixed point.
    let d=c,l=c;for(let i=0;i<8;i++){d=DARKER[d];l=LIGHTER[l];}
    assert.equal(d,4,`DARKER chain from ${c}`);assert.equal(LIGHTER[l],l,`LIGHTER chain from ${c}`);
  }
  // Two-way chains: background 4 -> 0 -> 1 -> 3 -> 2 -> 9, main 5 -> 6 -> 7, accent 11 -> 10.
  for(const chain of [[4,0,1,3,2,9],[5,6,7],[11,10]])for(let i=1;i<chain.length;i++){assert.equal(DARKER[chain[i]],chain[i-1]);assert.equal(LIGHTER[chain[i-1]],chain[i]);}
  // One-way joins: 5 -> 4, cream -> 7, title 12 -> 10, 11 -> 5, grey -> black, red -> 11.
  assert.equal(DARKER[5],4);assert.equal(DARKER[8],7);assert.equal(DARKER[12],10);assert.equal(DARKER[11],5);assert.equal(DARKER[13],4);assert.equal(DARKER[14],11);
  assert.equal(LIGHTER[7],7);assert.equal(LIGHTER[10],10);assert.equal(LIGHTER[9],9);
  for(const role of BACKGROUND_ROLES){assert.ok(BACKGROUND_ROLES.includes(LIGHTER[role]));assert.ok(DARKER[role]===4||BACKGROUND_ROLES.includes(DARKER[role]));}
});

test('mood rows and per-style weights: ten moods, every row sums to 100, rare moods capped, every stage dark',()=>{
  assert.deepEqual(Object.keys(MOODS),[...MOOD_NAMES]);
  for(const name of MOOD_NAMES){
    const row=MOODS[name];
    assert.equal(row.id,name);assert.equal(row.dark,true);
    // The light stage has no vignette ring (the frame pass still darkens rows 0-1 and 126-127):
    // one step from its pale sky reaches ink, which drew a black porthole.
    assert.ok([0,1,2].includes(row.stage.pool)&&row.stage.vignette>=(row.dark?1:0)&&row.stage.vignette<=3);
    assert.deepEqual(Object.keys(row.stage.kinds),['pool','spot','blaze','flat']);
    // Dark stages always get a key light: 'flat' (vignette only) is for the light stage.
    if(row.dark)assert.equal(row.stage.kinds.flat,0,name);
    assert.ok(row.stage.kinds.pool>0,name);
  }
  assert.ok(RARE_MOODS.every(m=>MOOD_NAMES.includes(m)));
  for(const {id} of styles)assert.ok(STYLE_MOODS[id],`${id} has a mood row`);
  assert.ok(STYLE_MOODS.default);
  for(const [style,row] of Object.entries(STYLE_MOODS)){
    assert.equal(row.length,MOOD_NAMES.length,style);
    assert.ok(row.every(w=>Number.isInteger(w)&&w>=0),style);
    assert.equal(row.reduce((a,b)=>a+b,0),100,`${style} weights sum to 100`);
    // Rare moods stay rare: at most 25 together (the style's signature mood counts as common), pastel at most 8.
    const rare=MOOD_NAMES.reduce((s,m,i)=>s+(RARE_MOODS.includes(m)&&STYLE_SIGNATURES[style]!==m?row[i]:0),0);
    assert.ok(rare<=25,`${style}: rare moods ${rare}`);assert.equal(row[MOOD_NAMES.indexOf('pastel')],0,style);
  }
  for(const [style,m] of Object.entries(STYLE_SIGNATURES)){
    const row=STYLE_MOODS[style],i=MOOD_NAMES.indexOf(m);
    assert.ok(row[i]>=10&&row[i]===Math.max(...row.filter((_,j)=>RARE_MOODS.includes(MOOD_NAMES[j])||MOOD_NAMES[j]===m)),`${style} keeps ${m} as its signature`);
  }
  assert.ok(STYLE_MOODS.machines[MOOD_NAMES.indexOf('sepia')]<=8);
  assert.equal(STYLE_MOODS.glyphs[MOOD_NAMES.indexOf('pastel')],0);assert.equal(STYLE_MOODS.dungeons[MOOD_NAMES.indexOf('pastel')],0);
});

test('chooseMood follows the style weights, boosts rare moods only on wild covers and honours recipe.moods',()=>{
  const N=20000,count=(style,wildness,recipe=null)=>{
    const seen=Object.fromEntries(MOOD_NAMES.map(m=>[m,0]));
    for(let i=0;i<N;i++)seen[chooseMood(V.createVariation('mood-freq:'+style+':'+i+':look'),style,recipe,wildness)]++;
    return seen;
  };
  for(const style of ['spaceships','dungeons'])for(const w of [0,.2]){
    const seen=count(style,w);
    MOOD_NAMES.forEach((m,i)=>assert.ok(Math.abs(seen[m]/N*100-STYLE_MOODS[style][i])<1.5,`${style} w${w} ${m}: ${seen[m]/N*100}% vs ${STYLE_MOODS[style][i]}%`));
  }
  const rare=seen=>RARE_MOODS.reduce((s,m)=>s+seen[m],0)/N,row=STYLE_MOODS.spaceships;
  const weight=w=>MOOD_NAMES.reduce((s,m,i)=>s+row[i]*(RARE_MOODS.includes(m)?1+2*w:1),0);
  const expected=w=>RARE_MOODS.reduce((s,m)=>s+row[MOOD_NAMES.indexOf(m)]*(1+2*w),0)/weight(w);
  assert.ok(Math.abs(rare(count('spaceships',.9))-expected(.9))<.015,'rare moods x (1 + 2w) at tier 3');
  assert.ok(expected(.9)>expected(0)+.1);
  // The boost starts at tier 2 and never applies to a style's signature mood.
  assert.equal(RARE_BOOST_WILDNESS,V.WILDNESS_BY_TIER[2]);
  assert.equal(moodBoost('neon','spaceships',V.WILDNESS_BY_TIER[1]),1);assert.equal(moodBoost('neon','spaceships',.5),2);
  assert.equal(moodBoost('infernal','dungeons',.9),1);assert.equal(moodBoost('night','spaceships',.9),1);
  const dungeons=count('dungeons',.9),infernal=STYLE_MOODS.dungeons[MOOD_NAMES.indexOf('infernal')];
  assert.ok(dungeons.infernal/N*100<infernal,'the signature mood is not boosted');
  // Unknown styles use the default row; recipes replace the row in any of three shapes.
  assert.equal(chooseMood(V.createVariation('x'),'no-such-style'),chooseMood(V.createVariation('x'),'default'));
  for(const moods of [{pastel:5},[['sepia',1]],MOOD_NAMES.map(m=>m==='toxic'?1:0)]){
    const only=MOOD_NAMES.find((m,i)=>moodWeights(moods)[i]>0);
    for(let i=0;i<50;i++)assert.equal(chooseMood(V.createVariation('r'+i),'spaceships',{moods},.5),only);
  }
  assert.throws(()=>chooseMood(V.createVariation('x'),'spaceships',{moods:{sunny:1}}),/Unknown mood/);
  assert.throws(()=>moodWeights([1,2,3]),/one number per mood/);
  assert.equal(moodWeights(undefined),null);
});

test('hue rules: the treatment hue always wins, main and background keep clear of it, mood hues hold, wildness widens the bend',()=>{
  const off=(a,b)=>Math.abs(((a-b)%360+540)%360-180),inRange=(h,[lo,hi])=>lo<=hi?h>=lo&&h<=hi:h>=lo||h<=hi;
  const OWN={night:[25,60],dusk:[20,50],infernal:[45,70],toxic:[300,330],sepia:[170,190]};
  for(let seed=0;seed<200;seed++){
    const v=V.createVariation('hues:'+seed+':look');
    for(const mood of MOOD_NAMES){
      const plain=buildMoodPalette(v,{mood}),comp=buildMoodPalette(v,{mood,treatment:TREATMENTS[3]});
      for(const t of TREATMENTS.slice(1)){
        const b=buildMoodPalette(v,{mood,treatment:t});
        for(const k of ['mainHue','bgHue','accentHue'])assert.ok(Number.isInteger(b[k])&&b[k]>=0&&b[k]<360,`${mood} ${k} ${b[k]}`);
        // Treatment identity: a hue range is never overridden, by any mood.
        if(Array.isArray(t.accentHue))assert.ok(inRange(b.accentHue,t.accentHue),`${mood} ${t.id} accent ${b.accentHue}`);
        // Hue separation, wherever the treatment suits the mood (look.js never deals the others).
        if(treatmentFits(mood,t)){
          assert.ok(off(b.mainHue,b.accentHue)>=HUE_GAP.main,`${mood} ${t.id} seed ${seed}: main ${b.mainHue} vs accent ${b.accentHue}`);
          assert.ok(off(b.bgHue,b.accentHue)>=HUE_GAP.bg,`${mood} ${t.id} seed ${seed}: bg ${b.bgHue} vs accent ${b.accentHue}`);
        }
        // The main hue moves only when it sat on the accent ('main-hue-avoid').
        const raw=v.integer('main-hue',0,359),absBg=MOODS[mood].bg[0]==='abs';
        if(!MOODS[mood].main&&absBg&&Array.isArray(t.accentHue)&&off(raw,b.accentHue)>=HUE_GAP.main)assert.equal(b.mainHue,raw,`${mood} ${t.id}`);
      }
      assert.ok(off(comp.accentHue,comp.mainHue+180)<=75&&off(comp.accentHue,comp.bgHue)>=HUE_GAP.bg,`${mood} complement`);
      // Without a treatment the mood's own accent applies.
      if(OWN[mood])assert.ok(inRange(plain.accentHue,OWN[mood]),`${mood} own accent ${plain.accentHue}`);
      if(mood==='monochrome'){assert.ok(off(plain.accentHue,plain.mainHue)<=10);assert.equal(plain.bgHue,plain.mainHue);}
      if(mood==='sepia')assert.ok(plain.mainHue>=25&&plain.mainHue<=95&&plain.bgHue>=45&&plain.bgHue<=70);
      if(mood==='night')assert.ok(plain.bgHue>=230&&plain.bgHue<=270);
      if(mood==='infernal')assert.ok(plain.bgHue<=30);
      if(mood==='toxic')assert.ok(plain.bgHue>=115&&plain.bgHue<=145);
      if(mood==='neon'){
        assert.ok(plain.bgHue>=260&&plain.bgHue<=290);
        assert.ok([[300,335],[175,200],[135,150]].some(r=>inRange(plain.mainHue,r)),`neon main ${plain.mainHue}`);
        assert.ok(off(plain.accentHue,plain.mainHue)>=60);
      }
      if(mood==='complementary'||mood==='pastel')assert.ok(off(plain.bgHue,plain.mainHue)>=150);
      if(mood==='analogous'){const d=off(plain.bgHue,plain.mainHue);assert.ok(d>=30&&d<=50);}
    }
    // Low-chroma treatments: chrome and ivory get a low-chroma title and accent ramp
    // (ivory is not gilded with a pale top); gilded keeps its saturated gold.
    const chrome=buildMoodPalette(v,{mood:'night',treatment:TREATMENTS[2]}).palette,ivory=buildMoodPalette(v,{mood:'night',treatment:TREATMENTS[6]}).palette;
    const gilded=buildMoodPalette(v,{mood:'night',treatment:TREATMENTS[1]}).palette;
    assert.ok(oklch(chrome[12])[1]<.09&&oklch(ivory[12])[1]<.07);
    for(const r of [10,11])assert.ok(oklch(ivory[r])[1]<.07&&oklch(chrome[r])[1]<.07&&oklch(gilded[r])[1]>.09,`accent ${r} chroma`);
    // Sepia's title keeps full chroma.
    assert.ok(oklch(buildMoodPalette(v,{mood:'sepia',treatment:TREATMENTS[7]}).palette[10])[1]>.1,'sepia jade title');
    const calm=buildMoodPalette(v,{mood:'night',wildness:0}),wild=buildMoodPalette(v,{mood:'night',wildness:.9});
    assert.equal(wild.bend-calm.bend,27);
  }
  // A treatment range may wrap through 0 (a ruby title, say 350-10).
  for(let seed=0;seed<100;seed++){const h=buildMoodPalette(V.createVariation('ruby:'+seed),{mood:'night',treatment:{id:'ruby',accentHue:[350,10],tC:'max'}}).accentHue;assert.ok(h>=350||h<=10,`ruby ${h}`);}
  assert.equal(buildMoodPalette(V.createVariation('n:look'),{mood:'neon'}).bend*2,buildMoodPalette(V.createVariation('n:look'),{mood:'night'}).bend);
  assert.throws(()=>buildMoodPalette(V.createVariation('x'),{mood:'sunny'}),/Unknown mood/);
});

test('treatments suit their mood: look.js never deals a title hue the mood would swallow',()=>{
  const T=TITLE_TREATMENTS;
  assert.equal(treatmentFits('infernal',T.ember),false);assert.equal(treatmentFits('infernal',T.gilded),true);
  for(const id of ['gilded','ivory','ember'])assert.equal(treatmentFits('sepia',T[id]),false,id);
  for(const id of ['jade','ice','chrome','neon','block'])assert.equal(treatmentFits('sepia',T[id]),true,id);
  assert.equal(treatmentFits('toxic',T.jade),false);assert.equal(treatmentFits('toxic',T.gilded),true);
  for(const mood of MOOD_NAMES)for(const id of ['neon','block'])assert.ok(treatmentFits(mood,T[id]),'complement treatments suit every mood');
  for(const mood of ['complementary','analogous','monochrome','pastel'])for(const t of Object.values(T))assert.ok(treatmentFits(mood,t),`${mood} ${t.id}`);
  // The fitted choice: never an unfit one, deterministic, and exactly title.js
  // chooseTreatment where nothing is filtered (relics on night).
  for(let i=0;i<400;i++){
    const v=V.createVariation('fit:'+i+':look'),style=['relics','heraldry','dungeons','machines'][i&3];
    for(const mood of ['sepia','infernal','toxic','night']){
      const t=chooseFittingTreatment(v,style,null,.2,mood);
      assert.ok(treatmentFits(mood,t),`${style} ${mood} ${t.id}`);
      assert.deepEqual(chooseFittingTreatment(v,style,null,.2,mood),t);
    }
    if(style==='relics')assert.deepEqual(chooseFittingTreatment(v,style,null,.2,'night'),{...T[v.weighted('title-treatment',[['gilded',35],['ivory',15],['jade',15],['ice',15*1.2],['neon',10*1.2],['ember',10]])]});
  }
});

test('OKLCh helpers: luma, round trip, gamut clip, hue bend, RGB565 snap and the rainbow guard',()=>{
  assert.equal(luma(0xffffff),1);assert.equal(luma(0),0);assert.ok(Math.abs(luma(0x808080)-128/255)<1e-9);
  assert.ok(Math.abs(L(0xffffff)-1)<1e-6&&Math.abs(L(0))<1e-9);
  for(let h=0;h<360;h+=7)for(const l of [.1,.3,.5,.7,.9])for(const c of [0,.05,.12,.2,'max']){
    const rgb=oklchToRgb(l,c,h);
    assert.ok(isRgb565Exact(rgb),`${l} ${c} ${h}`);assert.notEqual(rgb565(rgb),0xf81f);assert.notEqual(rgb,0xff00ff);
    assert.ok(Math.abs(L(rgb)-l)<.04,`L ${l} C ${c} h ${h}: ${L(rgb)}`);
    if(typeof c==='number'&&c>=.12&&l>=.3&&l<=.7&&clipChroma(l,c,h)>=.08)assert.ok(Math.abs(((oklch(rgb)[2]-h)%360+540)%360-180)<12,`hue ${h} at L ${l}`);
  }
  assert.equal(clipChroma(.5,.05,200),.05);assert.ok(clipChroma(.9,.3,260)<.1);
  // The closest snap to pure magenta is pushed off the rainbow code.
  const magenta=oklch(0xff00ff);
  assert.notEqual(oklchToRgb(magenta[0],magenta[1],magenta[2]),0xff00ff);
  assert.equal(bendHue(200,1,30),170);assert.equal(bendHue(60,-1,30),30);assert.equal(bendHue(300,-1,30),285,'never past the attractor');
  assert.equal(bendHue(300,1,30),330);assert.equal(bendHue(123,0,45),123);assert.equal(bendHue(10,-.5,20),0);
});

test('chooseLook: classic mascot keeps legacyPalette(r); varied mascot discards it; every other style gets a mood look',()=>{
  const r1=random(7),r2=random(7);
  const compat=chooseLook({r:r1,seedKey:'pocket-cover:2:Moon Meadow',title:'Moon Meadow',style:'mascot',recipe:{revision:8},legacy:true,compat:true});
  assert.deepEqual(compat.palette,legacyPalette(r2));assert.equal(r1(1000),r2(1000));
  assert.deepEqual({...compat,palette:null},{palette:null,mood:null,moodSpec:null,treatment:null,tier:0,wildness:0,variation:null,summary:null});
  const r3=random(9),r4=random(9);
  const varied=chooseLook({r:r3,seedKey:'pocket-cover:2:Moon Meadow',title:'Moon Meadow',variant:0,style:'mascot',recipe:{revision:8},legacy:true,compat:false});
  legacyPalette(r4);assert.equal(r3(1000),r4(1000),'the varied mascot still draws its legacy palette from r');
  assert.equal(varied.palette.length,15);assert.ok(MOOD_NAMES.includes(varied.mood));
  for(const style of ['spaceships','plants','dungeons'])for(let variant=0;variant<14;variant++){
    const title='Star Patrol',seedKey=`pocket-cover:${style}:4:${variant?title+' '+variant:title}`,recipe={revision:4};
    const a=chooseLook({r:random(1),seedKey,title,variant,style,recipe}),b=chooseLook({r:random(2),seedKey,title,variant,style,recipe});
    assert.deepEqual(a.palette,b.palette,'the look never reads the recipe stream');assert.deepEqual(a.summary,b.summary);
    assert.deepEqual(Object.keys(a.summary),['mood','tier','wildness','treatment','mainHue','bgHue','accentHue']);
    const deal=V.dealTier?V.dealTier(`pocket-cover:${style}:4:${title}`,variant):{tier:0,wildness:0};
    assert.equal(a.tier,deal.tier);assert.equal(a.wildness,deal.wildness);
    assert.equal(a.moodSpec,MOODS[a.mood]);assert.equal(a.summary.treatment,a.treatment?.id??null);
    assert.deepEqual(a.palette,createMoodPalette(a.variation,{mood:a.mood,treatment:a.treatment,wildness:a.wildness}));
    assert.deepEqual(a.variation.integer('probe',0,1e6),V.createVariation(seedKey+':look').integer('probe',0,1e6),'look stream is seedKey:look');
  }
});

test('covers carry the mood palette and look summary; framing never changes them; no #FF00FF',()=>{
  for(const {id} of styles)for(const title of ['Pocket Worlds','A'])for(let variant=0;variant<3;variant++){
    const varied=generateCover(title,{style:id,variant}),classic=generateCover(title,{style:id,variant,framing:'classic'});
    assert.equal(varied.palette.length,15,id);assert.ok(MOOD_NAMES.includes(varied.look.mood));
    assert.ok(varied.pixels.every(c=>c!==0xff00ff&&rgb565(c)!==0xf81f));
    if(id==='mascot'){assert.equal(classic.palette.length,12,'classic mascot keeps the engine-18 palette');assert.equal(classic.look,null);continue;}
    assert.deepEqual(classic.palette,varied.palette,`${id}: framing must not change the palette`);
    assert.deepEqual(classic.look,varied.look);
    assert.equal(orderViolation(varied.palette),-1);
  }
});
