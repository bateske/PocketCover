// FEATURE relics-only: faceted gems and the handle/body/ornament grammar live
// here. Removing this recipe removes those features without changing raster.js.
import {part} from '../raster.js';
import {dither,ditherTone} from '../materials.js';
import {insidePolygon,preferredVector} from '../geometry.js';
function facetedGem(p, x, y, w, h, color = 10) {
  p.poly([[x,y-h],[x+w,y-h/3],[x+w*.7,y+h*.65],[x,y+h],[x-w*.7,y+h*.65],[x-w,y-h/3]],color);
  // Restore the staff's colored cap and long contrasting face. Cream is a
  // narrow reflection, never a solid white replacement for the whole tip.
  p.poly([[x,y-h+2],[x,y+h-2],[x-w+2,y-h/3]],11);
  p.poly([[x,y-h+2],[x+w-2,y-h/3],[x,y-h/4],[x-w+2,y-h/3]],7);
  const glint=preferredVector(Math.max(1,w/3),h*2/3-3);
  p.line(x,y-h+3,x+glint[0],y-h+3+glint[1],8);
  p.poly([[x,y+h-2],[x+w*.63,y+h*.55],[x+w*.32,y+h*.1]],7);
  dither(p,{x:x-w*.5,y:y+h*.2,w:w*.5,h:h*.4,color,density:.25,
    mask:(px,py)=>Math.abs((px-x)/w)+Math.abs((py-y)/h)<.65});
}

function crystalBall(p,x,y,radius,color=10) {
  p.sphere(x,y,radius,(nx,ny,nz,dx,dy)=>{
    // Broad curved terminator plus a low reflected-light crescent. Both are
    // clipped to the same final-grid disk as the small specular reflection.
    let light=-nx*.48-ny*.58+nz*.64;
    if(ny>.34&&nz<.65)light=Math.max(light,.3+(1-nz)*.24);
    if(((nx+.34)/.21)**2+((ny+.44)/.15)**2<1)return 8;
    // One hue family: the dark end is the same material's own shade.
    return ditherTone(light,color===10?[11,11,10,10]:[5,5,6,7],dx,dy);
  });
}

function inscribedTablet(p,x,y,w,h,color=6,seed=0) {
  const face=[[x-w,y-h+6],[x-w+5,y-h],[x+w-5,y-h],[x+w,y-h+5],
    [x+w-1,y+h-3],[x+w-6,y+h],[x-w+3,y+h],[x-w,y+h-5]];
  p.poly(face.map(([a,b])=>[a+4,b+3]),5);p.poly(face,color);
  dither(p,{x:x-w,y:y-h,w:w*2,h:h*2,color:5,density:.5,
    mask:(a,b)=>insidePolygon(a,b,face)&&(a>x+w-5||b>y+h-7)});
  p.line(x-w+6,y-h+2,x+w-6,y-h+2,7);
  p.line(x-w+2,y-h+7,x-w+2,y+h-7,7);
  // One legible carved seal, with a quiet field around it. Fine writing is
  // subordinate to the seal and never interleaved with surface texture.
  const a=w*.45,b=y-h*.57,len=h*.83;
  const seal=seed%3===0?[[x-a,b],[x+a,b],[x+a,b+len*.35],[x,b+len*.35],[x,b+len],[x-a,b+len]]:
    seed%3===1?[[x,b],[x+a,b+a],[x,b+2*a],[x-a,b+a],[x,b],[x,b+len],[x+a,b+len]]:
      [[x-a,b],[x-a,b+len],[x+a,b],[x+a,b+len]];
  p.stroke(seal,4,2);
  p.line(x-a+1,b+len+2,x+a,b+len+2,7);
  if(h>20)for(let col=0;col<3;col++){
    const u=x-w*.56+col*w*.5,v=y+h-12;
    p.stroke([[u,v],[u,v+4],[u+3,v+4],[u+3,v+2]],5);
  }
  if(h>20){p.stroke([[x+w-7,y-h+1],[x+w-10,y-h+7],[x+w-6,y-h+11]],5);}
}

export default {
  id: 'relics', label: 'Relics / magic items', revision: 5, background: 'void',
  features: ['dot','detail','rect','poly','ellipse','sphere','line','stroke','ring','arc','sample','part','group'],
  featureNotes: { facetedGems: 'Local to relics; six-point crystal facets and item grammar.' },
  render({p,r,pick,variation}) {
    const kind=pick(['sword','crystal','key','amulet','grimoire','ring','staff']);
    const proportions={width:.74+r(45)/100,height:.79+r(24)/100,x:r(9)-4,y:r(5)-2};
    p=part(p,{x:64*(1-proportions.width)+proportions.x,y:48*(1-proportions.height)+proportions.y,scaleX:proportions.width,scaleY:proportions.height});
    const cut=pick(['crystal','cabochon','tablet']),gemColor=pick([6,10]);
    const gem=(pen,x,y,w,h,color=gemColor)=>{
      if(cut==='crystal')return facetedGem(pen,x,y,w,h,color);
      if(cut==='cabochon'){
        crystalBall(pen,x,y,Math.min(w,h),color);
      }else{
        if(w>=9&&h>=12)inscribedTablet(pen,x,y,w,h,color);
        else facetedGem(pen,x,y,w,h,color);
      }
    };
    const chosenAttachment=pick(['none','winglets','chain','tassel','seal']);
    const attachment=kind==='crystal'&&cut!=='crystal'?'none':chosenAttachment;
    let keyGeometry,clusterGeometry;
    const anchor={sword:59,crystal:71,key:47,amulet:39,grimoire:65,ring:39,staff:45}[kind];
    const attachmentSpan=11+r(9);
    const aura=pick(['halo','sparks','orbit']);
    if(aura==='halo') {p.ring(64,48,32,34,1,1);p.ring(64,48,36,38,1,1);}
    if(aura==='orbit') {p.ring(64,47,36,14,1,1,-.45);p.ring(64,47,25,35,1,1,.45);}
    const auraCount=variation.integer('aura-marks',5,10),auraTurn=variation.range('aura-turn',-.2,.2);
    for(let i=0;i<auraCount;i++) {
      const a=i*Math.PI*2/auraCount+auraTurn+.12*r(4),x=64+Math.cos(a)*(31+r(9)),y=46+Math.sin(a)*(28+r(8));
      if(i%3===0){p.line(x-2,y,x+2,y,11);p.line(x,y-2,x,y+2,11);p.dot(x,y,8);}
      else p.detail(x,y,10,'Sparse magical aura spark arranged around the item');
    }
    // The item keeps its established geometry and facets. Its filled material
    // mask supplies a consistent outline and shadow; aura pixels stay separate.
    p.group(q=>{
    const p=q;
    if(attachment==='winglets')for(const side of [-1,1]){
      p.poly([[64,anchor-3],[64+side*attachmentSpan,anchor-12],[64+side*(attachmentSpan-3),anchor+2],[64,anchor+4]],6);
      p.stroke([[64,anchor],[64+side*(attachmentSpan-3),anchor-8],[64+side*(attachmentSpan-5),anchor]],7,3);
    }
    if(kind==='sword') {
      const broad=7+r(5),guard=17+r(6),bladeTip=9+r(6),curved=r(3)===0;
      p.poly([[64,bladeTip],[64+broad,bladeTip+13],[69,57],[59,57],[64-broad,bladeTip+13]],9);
      p.poly([[64,bladeTip+3],[64+broad-2,bladeTip+14],[67,55],[64,57]],9);
      p.poly([[64,bladeTip+3],[64,57],[61,55],[64-broad+2,bladeTip+14]],7);
      p.line(64,bladeTip+8,64,53,8);
      if(curved) {p.poly([[64-guard,52],[50,56],[78,56],[64+guard,52],[64+guard-3,62],[64,60],[64-guard+3,62]],6);p.stroke([[64-guard+2,54],[51,58],[77,58],[64+guard-2,54]],6,3);}
      else {p.rect(64-guard,55,guard*2,7,6);p.rect(65-guard,56,guard*2-2,3,6);p.rect(65-guard,56,guard*2-2,1,7);p.rect(63-guard,52,4,11,5);p.rect(61+guard,52,4,11,5);}
      p.rect(59,60,10,20,5);p.rect(61,61,6,17,5);
      for(let y=63;y<78;y+=4)p.line(61,y,66,y+2,6,2);
      p.rect(58,78,12,5,7);p.rect(60,79,8,3,7);gem(p,64,59,5,5);
    } else if(kind==='crystal') {
      if(cut==='cabochon'){
        const radius=25+r(5),y=68-radius;
        // A single crystal ball seated in a low metal cradle.
        p.poly([[43,72],[50,65],[77,65],[86,72],[80,80],[48,80]],5);
        p.poly([[43,72],[53,69],[77,69],[85,72],[77,75],[51,75]],9);
        crystalBall(p,64,y,radius,gemColor);
        p.arc(64,y,radius+1,radius+1,7,2,0,.28,Math.PI-.28);
        clusterGeometry={base:68,pieces:[{x:64,y,w:radius,h:radius}],form:'crystal ball'};
      }else if(cut==='tablet'){
        const w=20+r(5),h=29+r(7);
        inscribedTablet(p,63,45,w,h,6,r(20));
        clusterGeometry={form:'inscribed tablet',inscribed:true};
      }else{
      const mainW=16+r(4),mainH=29+r(4),base=72;
      const pieces=[];
      for(const side of [-1,1]){
        const w=9+r(3),h=17+r(8);
        // Embed every piece in the same socket. Neighbouring orbs overlap in
        // projection, so a spherical cluster cannot turn into floating dots.
        const x=64+side*(mainW+w-8),y=base-h*.75;
        pieces.push({x,y,w,h});gem(p,x,y,w,h,side<0?10:6);
      }
      pieces.push({x:64,y:base-mainH*.92,w:mainW,h:mainH});
      gem(p,64,base-mainH*.92,mainW,mainH);
      clusterGeometry={base,pieces};
      p.poly([[38,73],[51,67],[77,67],[91,75],[83,82],[46,82]],5);
      p.poly([[39,73],[51,70],[77,70],[87,75],[78,78],[48,78]],6);
      p.poly([[48,78],[78,78],[87,75],[82,81],[47,81]],5);
      for(const x of [47,57,70,79])p.rect(x,74,3,3,7);
      }
    } else if(kind==='key') {
      const teeth=2+r(3),ornate=r(2);
      const toothTop=57,toothPitch=13,toothHeight=4,shaftWidth=7,shaftBottom=toothTop+(teeth-1)*toothPitch+toothHeight+5;
      const baseLength=15+r(5),toothLengths=Array.from({length:teeth},(_,i)=>baseLength-(i%2?5:0)+r(3));
      // A narrow cylinder carries distinct bits. Their open slots are wide
      // enough to survive fitting plus the shared outline and cast shadow.
      p.rect(61,40,shaftWidth,shaftBottom-40,9);p.ellipse(64.5,shaftBottom-1,3.5,2,9);
      p.rect(66,41,2,shaftBottom-41,5);p.rect(62,41,2,shaftBottom-41,7);
      for(let i=0;i<teeth;i++) {
        const y=toothTop+i*toothPitch,end=67+toothLengths[i];
        p.poly([[66,y],[end,y],[end,y+2],[end-3,y+2],[end-3,y+toothHeight],[66,y+toothHeight]],9);
        p.line(68,y,end-1,y,7);
        p.line(68,y+toothHeight,end-4,y+toothHeight,5);
        p.line(end-2,y+2,end-3,y+2,5);
      }
      keyGeometry={shaftWidth,shaftLength:shaftBottom-40,teeth,toothLengths,toothPitch,toothHeight};
      p.ring(64,29,16,16,6,4);p.ring(64,29,15,15,7,1);
      if(ornate) {p.stroke([[48,28],[55,20],[64,29],[73,20],[80,28]],5,3);p.line(64,13,64,43,5,3);gem(p,64,28,6,7);}
      else {p.ring(64,29,7,7,9,2);p.dot(50,26,8);}
      p.rect(57,46,14,5,6);p.rect(58,47,12,2,6);
    } else if(kind==='amulet') {
      const shape=pick(['sun','tear','diamond']);
      p.stroke([[44,11],[44,23],[48,30],[55,35],[64,37],[73,35],[80,29],[84,21],[84,11]],9,2);
      for(const [x,y] of [[45,24],[49,30],[55,34],[73,34],[79,29],[83,22]])p.dot(x,y,7);
      p.ring(64,38,4,6,7,1);
      p.poly([[56,66],[49,82],[60,77],[64,86],[67,66]],5);p.poly([[65,65],[74,84],[76,77],[82,79],[73,64]],6);
      if(shape==='sun') {
        for(let i=0;i<12;i++){const a=i*Math.PI/6;p.line(64+Math.cos(a)*19,57+Math.sin(a)*19,64+Math.cos(a)*25,57+Math.sin(a)*25,7,3);}
        p.ellipse(64,57,20,20,6);p.ellipse(64,57,17,17,6);p.ring(64,57,15,15,7,1);gem(p,64,57,12,14);
      } else {
        p.poly([[64,38],[85,55],[77,73],[64,82],[51,73],[43,55]],6);
        p.poly([[64,41],[81,56],[74,71],[64,78],[54,71],[47,56]],6);
        p.stroke([[64,43],[49,56],[55,70],[64,77]],7,2);gem(p,64,58,13,17);
      }
    } else if(kind==='grimoire') {
      p.poly([[38,20],[79,15],[90,23],[90,77],[46,84],[36,76]],9);
      p.poly([[43,28],[86,23],[86,73],[44,80]],8);
      for(let y=32;y<77;y+=4)p.line(46,y,84,y-6,9);
      p.poly([[35,20],[77,14],[85,20],[85,71],[43,78],[35,72]],6);
      p.poly([[39,22],[77,17],[81,21],[81,69],[44,75],[39,71]],6);
      p.poly([[39,22],[44,23],[44,75],[39,71]],5);
      p.line(46,25,76,21,7);p.line(48,70,76,65,5);
      p.poly([[47,29],[73,25],[76,59],[48,65]],5);
      p.stroke([[48,30],[71,27],[74,59],[49,63]],7,1,true);
      gem(p,61,45,9,13);
      for(const [x,y] of [[44,24],[76,20],[47,71],[77,66]]){p.rect(x-2,y-2,5,5,4);p.rect(x-1,y-1,3,3,7);}
      p.rect(77,43,12,9,4);p.rect(79,45,8,5,9);p.dot(82,47,8);
      p.poly([[54,77],[61,76],[62,87],[57,83],[54,87]],10);
    } else if(kind==='ring') {
      p.ring(64,58,22,25,6,7);p.ring(64,58,20,23,7,2);
      p.stroke([[44,53],[44,64],[48,73]],8,2);p.stroke([[79,43],[84,51],[84,64],[79,72]],5,3);
      p.poly([[47,25],[55,18],[74,18],[83,25],[79,42],[49,42]],7);
      p.poly([[50,27],[57,21],[72,21],[80,27],[76,39],[52,39]],7);
      gem(p,65,29,13,16);
      for(const [x,y] of [[50,27],[55,39],[75,39],[80,27]])p.rect(x-1,y-2,3,5,9);
    } else {
      const fork=r(2)===0;
      p.line(59,82,66,36,5,5);p.line(58,80,65,38,7,1);
      for(let y=51;y<78;y+=6)p.line(59,y,64,y+2,6,3);
      if(fork){p.stroke([[65,41],[47,30],[44,18]],7,3);p.stroke([[65,41],[80,28],[82,18]],6,3);}
      else {p.ring(65,26,18,18,6,3);p.stroke([[51,16],[46,26],[51,37]],7,2);}
      gem(p,65,26,11,17);p.rect(58,44,13,5,9);p.rect(59,45,11,2,9);
      p.poly([[68,44],[81,50],[75,53],[86,59],[77,61],[67,50]],10);
    }
    if(attachment==='chain')for(const side of [-1,1]){
      const x=64+side*attachmentSpan;
      p.stroke([[64,anchor],[x,anchor+5],[x,anchor+12]],9,1);gem(p,x,anchor+14,4,5);
    }
    if(attachment==='tassel'){
      p.line(65,anchor,77,anchor+7,9);
      p.poly([[74,anchor+6],[79,anchor+6],[84,anchor+18],[79,anchor+15],[77,anchor+19],[72,anchor+16]],11);p.line(76,anchor+8,78,anchor+15,10,2);
    }
    if(attachment==='seal'){p.ring(64,anchor,5,3,9,2);p.rect(62,anchor-1,4,3,10);}
    },{outline:1,color:4,shadow:{x:2,y:3,color:4}});
    return { archetype:kind, item:kind, aura,auraCount, proportions, gemCut:cut,attachment,attachmentSpan,
      ...(keyGeometry?{keyGeometry}:{}),...(clusterGeometry?{clusterGeometry}:{}),outlinePixels:1,shadowPixels:{x:2,y:3},grammar:'handle + body + ornament + gem' };
  },
};
