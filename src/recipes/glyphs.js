// FEATURE glyphs-only: connected paths selected from a structural rune grammar.
// Endpoints and embellishments are local; all stroke rasterization is shared.
import {part} from '../raster.js';
import {dither} from '../materials.js';
export default {
  id: 'glyphs', label: 'Glyphs / runes', revision: 3, background: 'void',
  features: ['dot','rect','poly','ellipse','line','stroke','ring','sample','part','group'],
  featureNotes: { runeGrammar: 'Local connected stroke templates and terminal marks; no font or stored bitmap.' },
  // Framing metadata (composition.js): symbols stay horizontally centred.
  composition: { centered: true },
  render({p,r,pick,variation}) {
    const form=pick(['fork','gate','coil','sigil','ladder','circuit','trident','orbit']);
    const proportions={width:.75+r(34)/100,height:.79+r(23)/100};
    p=part(p,{x:64*(1-proportions.width),y:48*(1-proportions.height),scaleX:proportions.width,scaleY:proportions.height});
    const width=5+r(3),terminal=pick(['square','diamond','circle']),lean=r(3)-1;
    const secondaryTerminal=pick(['square','diamond','circle']),extension=pick(['none','spur','fork','crossbar']);
    let paths=[],nodes=[],circle=null;
    if(form==='fork') {
      const spread=22+r(9);
      paths=[[[64,80],[64,28]],[[64-spread,18],[64-spread,34],[64,48],[64+spread,34],[64+spread,18]],[[49,62],[64,71],[79,62]]];
      nodes=[[64-spread,18],[64+spread,18],[64,80]];
      circle=[64,19,8];
      if(r(2))paths.push([[48,47],[40,55],[40,67]]);
    } else if(form==='gate') {
      const roof=20+r(5),leg=25+r(5);
      paths=[[[64-leg,78],[64-leg,roof],[64,11],[64+leg,roof],[64+leg,78]],[[64-leg,43],[64+leg,43]],[[64,43],[64,66],[75,66]]];
      nodes=[[64-leg,78],[64+leg,78],[75,66]];circle=[64,28,6];
      if(r(2))paths.push([[64-leg,59],[64-leg-11,59]]);
    } else if(form==='coil') {
      const off=r(3)*3;
      paths=[[[42,77],[86,77],[86,18],[40,18],[40,60],[70,60],[70,34],[55,34],[55,46]]];
      nodes=[[42,77],[55,46]];
      if(r(2))paths.push([[86,49],[99,49],[99,34]]);
      paths=paths.map(path=>path.map(([x,y])=>[x+off-3,y]));
      nodes=nodes.map(([x,y])=>[x+off-3,y]);
    } else if(form==='sigil') {
      const mid=45+r(8);
      paths=[[[64,12],[64,79]],[[38,31],[64,mid],[90,31]],[[38,69],[64,mid],[90,69]],[[38,31],[38,16]],[[90,69],[90,78]]];
      nodes=[[38,16],[90,78],[64,79]];circle=[64,mid,10];
      if(r(2))paths.push([[48,24],[64,35],[80,24]]);
    } else if(form==='ladder') {
      const spread=16+r(8);
      paths=[[[64-spread,80],[64-spread,17],[64,10]],[[64+spread,14],[64+spread,73],[64,80]],[[64-spread,34],[64+spread,34]],[[64-spread,59],[64+spread,59]],[[64,34],[64,59]]];
      nodes=[[64-spread,80],[64+spread,14]];
      circle=[64,47,7];
    } else if(form==='trident') {
      const spread=17+r(12),join=37+r(13);
      paths=[[[64,81],[64,14]],[[64-spread,15],[64-spread,join],[64,join+12],[64+spread,join],[64+spread,15]],[[51,70],[77,70]]];
      nodes=[[64-spread,15],[64+spread,15],[64,81]];circle=[64,join+12,7];
    } else if(form==='orbit') {
      const spread=20+r(8);
      paths=[[[64,10],[64+spread,26],[64+spread,62],[64,79],[64-spread,62],[64-spread,26],[64,10]],[[64-spread,44],[64+spread,44]],[[64,44],[64,65]]];
      nodes=[[64,10],[64,65]];circle=[64,28,7];
    } else {
      paths=[[[40,20],[65,20],[88,42],[88,67],[64,79],[40,67],[40,43],[65,43],[65,20]],[[40,58],[67,58],[67,68]],[[65,43],[78,31]]];
      nodes=[[40,20],[67,68],[78,31]];
      circle=[65,20,8];
      if(r(2))paths.push([[88,57],[99,57]]);
    }
    if(extension!=='none'){
      const [x,y]=nodes[0],side=x<64?1:-1,dy=y<48?10:-10;
      if(extension==='spur')paths.push([[x,y],[x+side*12,y],[x+side*12,y+dy]]);
      if(extension==='fork')paths.push([[x-side*7,y+dy],[x,y],[x+side*9,y+dy]]);
      if(extension==='crossbar'&&form!=='coil')paths.push([[x,y],[64,48]]);
    }
    // A slight shear keeps related silhouettes distinct without distorting pixels.
    const waist=variation.integer('rune-waist',43,53),terminalSize=variation.integer('terminal-size',4,6);
    const transform=([x,y])=>{
      const yy=y<=48?8+(y-8)*(waist-8)/40:waist+(y-48)*(84-waist)/36;
      return [x+lean*(48-yy)/12,yy];
    };
    paths=paths.map(path=>path.map(transform));nodes=nodes.map(transform);
    const halo=r(3);
    if(halo===0){p.ring(64,48,37,37,1,1);p.ring(64,48,40,40,1,1);}
    if(halo===1){p.stroke([[28,26],[28,13],[41,13]],1,2);p.stroke([[87,83],[100,83],[100,70]],1,2);}
    // One union of the filled strokes defines both the outline and the shadow.
    // Effect widths stay fixed in final pixels, even when this rune is fitted.
    p.group(q=>{
    const p=q;
    for(const path of paths)p.stroke(path,6,width);
    const segments=paths.flatMap(path=>path.slice(1).map((b,i)=>[path[i],b]));
    dither(p,{x:23,y:18,w:82,h:64,color:5,density:(x,y)=>.10+Math.max(0,y-40)/130,
      mask:(x,y)=>segments.some(([[ax,ay],[bx,by]])=>{
        const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
        const t=length?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)):0;
        return Math.hypot(x-ax-t*dx,y-ay-t*dy)<Math.max(.5,width/2-1.5);
      })});
    for(const path of paths)p.stroke(path.map(([x,y])=>[x-1,y-1]),7,Math.max(1,width-3));
    if(circle){const [x,y,radius]=circle,rx=radius+variation.integer('rune-ring',-1,1),[cx,cy]=transform([x,y]);p.ring(cx,cy,rx,rx,10,3);p.line(cx-3,cy-rx+1,cx+1,cy-rx+1,8,1);}
    for(const [i,[x,y]] of nodes.entries()) {
      const cap=i%2?secondaryTerminal:terminal;
      if(cap==='square'){p.rect(x-terminalSize+1,y-terminalSize+1,terminalSize*2-2,terminalSize*2-2,10);p.rect(x-2,y-2,2,2,8);}
      else if(cap==='diamond'){p.poly([[x,y-terminalSize],[x+terminalSize,y],[x,y+terminalSize],[x-terminalSize,y]],10);p.dot(x-1,y-1,8);}
      else {p.ring(x,y,terminalSize,terminalSize,10,2);p.dot(x-2,y-2,8);}
    }
    },{outline:1,color:4,shadow:{x:2,y:3,color:4}});
    // Satellite marks read as diacritics, with clear spacing from the main strokes.
    const diacritics=1+r(3);
    for(let i=0;i<diacritics;i++){
      const side=i%2?1:-1;
      const x=64+side*(44+r(3)),y=(i===2?70:32)+r(i===2?5:18);
      p.line(x,y-7,x,y-2,9,2);p.rect(x-1,y+3,3,3,10);p.rect(x-1,y+9,2,2,7);
      if(r(2))p.line(x-3,y-8,x+3,y-8,9,1);
    }
    return {archetype:form,form,terminal,secondaryTerminal,extension,proportions,diacritics,waist,terminalSize,strokeWidth:width,
      outlinePixels:1,shadowPixels:{x:2,y:3},halo:['double circle','corners','none'][halo]};
  },
};
