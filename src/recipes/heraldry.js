// FEATURE heraldry-only: symmetric crest fields, heraldic ornaments and charges.
// All borders and icons use shared raster primitives; no extra raster feature.
import {part} from '../raster.js';
import {dither} from '../materials.js';
function star(p,x,y,r,color,points=5) {
  const vertices=[];
  for(let i=0;i<points*2;i++){const a=i*Math.PI/points-Math.PI/2,rr=i%2?r*.44:r;vertices.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr]);}
  p.poly(vertices,color);
}

export default {
  id: 'heraldry', label: 'Heraldry / emblems', revision: 5, background: 'void',
  features: ['dot','rect','poly','ellipse','line','stroke','sample','part','group'],
  featureNotes: { crestGrammar: 'Recipe-local symmetric fields, charges, wings, crowns and scrolls.' },
  // Framing metadata (composition.js): symbols stay horizontally centred.
  composition: { centered: true },
  render({p,r,pick,variation}) {
    const proportions={width:.80+r(29)/100,height:.82+r(20)/100};
    p=part(p,{x:64*(1-proportions.width),y:48*(1-proportions.height),scaleX:proportions.width,scaleY:proportions.height});
    const field=pick(['shield','heater','seal','diamond']),division=pick(['halved','quartered','chevron','plain','bars','saltire']);
    // The single centred eye charge is rare (about one in twenty).
    const charge=variation.integer('eye-charge',0,19)===0?'eye':pick(['blade','sun','tree','star','flame']),ornament=pick(['wings','horns','crown','laurel']);
    const fieldWidth=.84+r(24)/100,fieldHeight=.87+r(18)/100,rays=pick([6,8,10]),starPoints=pick([4,5,6]);
    const crestlets=r(3)===0,scroll=!!r(2),edge=pick(['rivets','braid','plain']);
    const feathers=variation.integer('wing-feathers',3,5),laurelLeaves=variation.integer('laurel-leaves',5,7),crownGems=variation.integer('crown-gems',2,4);
    const mirror=(pts,side)=>pts.map(([x,y])=>[64+(x-64)*side,y]);
    const outerOutlinePixels=pick([1,2,2,2,3]),outlinePixels=Math.max(outerOutlinePixels,2+r(2));
    const shadow={x:2+r(3),y:3+r(3),color:4};
    let chargeScale,chargeOffset;
    p.group(assembly=>{
    let p=assembly;
    p.group(q=>{
    const p=q;
    if(ornament==='wings') {
      for(const side of [-1,1]) {
        p.poly(mirror([[41,48],[22,22],[14,20],[18,44],[28,60],[45,66]],side),5);
        p.poly(mirror([[41,46],[23,25],[18,23],[21,43],[29,55],[44,62]],side),5);
        for(let n=0;n<feathers;n++){const i=n*3/(feathers-1);p.poly(mirror([[39+i*2,48+i*3],[19+i*4,24+i*5],[23+i*4,42+i*5],[42+i*2,59+i*2]],side),n%2?9:7);}
        p.stroke(mirror([[19,24],[22,43],[30,56],[42,62]],side),4,2);
      }
    } else if(ornament==='horns') {
      for(const side of [-1,1]){
        p.poly(mirror([[42,34],[29,27],[24,12],[29,16],[38,20],[43,18],[47,28]],side),7);
        p.poly(mirror([[42,31],[32,25],[27,16],[38,23],[42,21],[45,28]],side),7);
        p.line(64+(35-64)*side,24,64+(38-64)*side,28,5,2);
      }
    } else if(ornament==='laurel') {
      for(const side of [-1,1]){
        p.stroke(mirror([[57,83],[40,78],[26,61],[23,43],[27,28]],side),9,2);
        for(let n=0;n<laurelLeaves;n++){const i=n*5/(laurelLeaves-1),x=25+i*i*.65,y=35+i*7;p.poly(mirror([[x,y+6],[x-10,y-3],[x-10,y+5],[x+2,y+11]],side),n%2?6:7);p.poly(mirror([[x,y+6],[x+8,y-2],[x+8,y+5],[x+2,y+12]],side),5);}
      }
    } else {
      p.poly([[43,26],[38,10],[51,18],[64,7],[77,18],[90,10],[85,26]],7);
      p.poly([[46,23],[42,14],[52,21],[64,11],[76,21],[86,14],[82,23]],7);
      p.rect(44,24,40,5,6);p.rect(46,24,36,3,6);
      for(let i=0;i<crownGems;i++){const x=50+i*28/(crownGems-1);p.rect(x-2,23,4,4,10);p.dot(x-1,23,8);}
    }
    // The field can narrow independently; ornament roots must follow it.
    if(ornament==='horns'||ornament==='wings')for(const side of [-1,1]){
      const root=ornament==='horns'?[64+side*20,28]:[64+side*22,53];
      const anchor=[64+side*fieldWidth*16,51+(ornament==='horns'?-13:6)*fieldHeight];
      p.line(...root,...anchor,ornament==='horns'?7:5,3);
    }
    },{outline:1,color:4});
    p=part(p,{x:64*(1-fieldWidth),y:51*(1-fieldHeight),scaleX:fieldWidth,scaleY:fieldHeight});
    p.group(q=>{
    let p=q;
    // Mirror a left outline so the colored halves always stay inside the field.
    const left=field==='shield'?[[64,25],[39,25],[36,46],[44,64],[64,78]]:
      field==='heater'?[[64,24],[37,31],[39,59],[50,72],[64,80]]:
      field==='diamond'?[[64,23],[35,50],[64,80]]:
      [[64,25],[49,28],[39,38],[35,51],[40,66],[50,75],[64,79]];
    const full=left.concat(mirror(left,-1).reverse());
    p.poly(full,6);
    const inset=left.map(([x,y])=>[64+(x-64)*.85,51+(y-51)*.85]);
    const fullInset=inset.concat(mirror(inset,-1).reverse());
    p.poly(fullInset,6);p.stroke(fullInset,7,2,true);
    const inner=left.map(([x,y])=>[64+(x-64)*.70,51+(y-51)*.70]);
    p.poly(inner,5);p.poly(mirror(inner,-1),division==='plain'?5:11);
    if(division==='quartered') {p.poly([[64,51],[46,51],[50,64],[64,71]],11);p.poly([[64,32],[64,51],[82,51],[79,39]],5);}
    if(division==='chevron') {p.poly([[46,53],[64,37],[82,53],[80,61],[64,46],[48,62]],9);}
    const fieldMask=(x,y)=>{
      const pts=inner.concat(mirror(inner,-1).reverse());let hit=false;
      for(let i=0,j=pts.length-1;i<pts.length;j=i++)if((pts[i][1]>y)!==(pts[j][1]>y)&&x<(pts[j][0]-pts[i][0])*(y-pts[i][1])/(pts[j][1]-pts[i][1])+pts[i][0])hit=!hit;
      return hit;
    };
    if(division==='bars'||division==='saltire')p.sample(42,30,44,45,(x,y)=>fieldMask(x,y)&&(division==='bars'?Math.floor((x+y)/8)%2===0:Math.abs(Math.abs(x-64)-Math.abs(y-51))<3)?9:null);
    dither(p,{x:44,y:55,w:40,h:19,color:5,density:(x,y)=>(y-54)/42,mask:fieldMask});
    if(edge!=='plain')for(const [x,y] of [[43,37],[85,37],[48,65],[80,65]]){p.rect(x-1,y-1,3,3,4);p.dot(x,y,8);}
    if(edge==='braid')for(const side of [-1,1])p.stroke([[64+side*21,41],[64+side*22,47],[64+side*18,54],[64+side*15,60]],9,2);
    const fieldPen=p;
    chargeScale=.78+r(23)/100;chargeOffset=r(5)-2;
    p=part(p,{x:64*(1-chargeScale),y:51*(1-chargeScale)+chargeOffset,scaleX:chargeScale,scaleY:chargeScale});
    p.group(p=>{
    if(charge==='blade') {
      p.poly([[64,31],[70,40],[67,60],[61,60],[58,40]],9);p.poly([[64,34],[68,40],[65,58],[64,59]],8);p.poly([[64,34],[64,59],[62,58],[60,40]],9);
      p.rect(54,58,20,3,7);p.rect(62,61,4,10,5);p.rect(63,62,2,7,7);p.rect(60,70,8,3,10);
    } else if(charge==='sun') {
      for(let i=0;i<rays;i++){const a=i*Math.PI*2/rays;p.line(64+Math.cos(a)*10,51+Math.sin(a)*10,64+Math.cos(a)*17,51+Math.sin(a)*17,7,3);}
      p.ellipse(64,51,10,10,7);p.ellipse(62,49,5,5,8);p.ellipse(67,54,4,4,6);
    } else if(charge==='eye') {
      p.poly([[48,51],[55,44],[64,41],[73,44],[80,51],[73,58],[64,61],[55,58]],8);
      p.ellipse(64,51,9,11,10);p.ellipse(64,51,4,8,4);p.rect(60,45,3,3,8);
      p.line(53,36,50,32,7,2);p.line(64,32,64,28,7,2);p.line(75,36,78,32,7,2);
    } else if(charge==='tree') {
      p.stroke([[54,68],[64,62],[74,68]],7,2);p.line(64,63,64,43,7,3);p.stroke([[52,48],[64,56],[77,45]],7,2);
      for(const [x,y,rx] of [[54,42,8],[72,40,9],[64,34,8]]){p.ellipse(x,y-1,rx-1,6,10);p.line(x-3,y-3,x,y-3,8,2);}
    } else if(charge==='star') {
      star(p,64,50,20,7,starPoints);star(p,64,49,10,8,starPoints);p.ellipse(64,51,4,4,10);
    } else {
      p.poly([[63,35],[68,42],[67,51],[76,45],[78,53],[73,61],[64,66],[56,61],[51,54],[54,49],[57,55],[64,46]],10);
      p.poly([[64,48],[70,57],[68,63],[63,64],[59,59]],8);
    }
    },{outline:1,color:4});
    p=fieldPen;
    if(crestlets)for(const x of [48,80]){star(p,x,34,5,4,4);star(p,x,34,3,10,4);}
    },{outline:outlinePixels,color:4});
    if(scroll) {
      p.group(p=>{
      p.poly([[35,72],[46,76],[82,76],[93,72],[90,82],[97,85],[80,86],[75,82],[52,82],[47,86],[31,85],[38,81]],9);
      p.poly([[37,75],[46,78],[82,78],[91,75],[87,81],[93,83],[81,84],[76,80],[51,80],[46,84],[36,83],[40,80]],9);
      for(const x of [54,63,72])p.rect(x,78,3,2,7);
      },{outline:1,color:4});
    }
    },{outline:outerOutlinePixels,color:4,exteriorOnly:true,shadow});
    return {archetype:field+' / '+charge,field,division,charge,ornament,proportions,fieldWidth,fieldHeight,chargeScale,chargeOffset,
      crestlets,scroll,edge,rays,starPoints,feathers,laurelLeaves,crownGems,outlinePixels,outerOutlinePixels,shadow,ornamentOutlinePixels:1};
  },
};
