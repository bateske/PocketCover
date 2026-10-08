import {part} from '../raster.js';
import {dither,ditherTone} from '../materials.js';
import {insidePolygon} from '../geometry.js';

// FEATURE (islands only): layered floating rock and composed miniature scenery.
export default {
  id: 'islands', label: 'Floating micro-worlds', revision: 4, background: 'mist',
  features: ['dot', 'rect', 'poly', 'ellipse', 'line', 'stroke', 'sample', 'group'],
  specializedFeatures: ['floating terrain facets', 'miniature landmarks', 'waterfall ribbons'],
  // Framing metadata (composition.js): islands stay large.
  composition: { sizeRange: { standard: [.72, 1] } },
  render({p:screen,r,pick,variation,palette}) {
    const widthScale=.82+r(28)/100,heightScale=.9+r(11)/100,offset=r(9)-4;
    const p=part(screen,{x:64*(1-widthScale)+offset,y:84*(1-heightScale),scaleX:widthScale,scaleY:heightScale});
    const kind=pick(['sky temple','mountain spring','lighthouse','ancient tree','volcanic outpost','windmill sanctuary']);
    const waterfallCount=r(3)===0?(r(4)===0?2:1):0;
    // Waterfall worlds lift the terrain and use a shallower rock mass, leaving
    // enough negative space for the water to fall well past its lower tip.
    const left=19+r(7),right=104+r(6),top=(waterfallCount?35:44)+r(7),fall=39+r(13);
    const depth=(waterfallCount?28:32)+r(8),tipX=62+r(20),secondary=pick(['grove','shrine','observatory','crystal']);
    const landmarkHeight=Math.min(top-15,22+r(15)),canopyScale=.8+r(5)*.1;
    const waterfallLength=waterfallCount?43+r(15):0,waterfallWidth=waterfallCount?10+r(6):0;
    const rim=[[left+1,top+9],[62,top+19],[right,top+5]],waterfalls=[];
    let canopy;
    // Water takes whichever available ramp sits farthest from the rock's
    // material ramp (and from the sky behind the fall), so it never blends in.
    const rgb=i=>{const v=palette?.[i]??0;return [v>>16&255,v>>8&255,v&255];};
    const dist=(a,b)=>{const [x,y]=[rgb(a),rgb(b)];return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);};
    const water=[{body:10,shade:11},{body:9,shade:13},{body:3,shade:1}].map(w=>({...w,
      score:Math.min(...[5,6,7].flatMap(m=>[dist(w.body,m),dist(w.shade,m)]))+.4*Math.min(dist(w.body,0),dist(w.shade,0))+.3*dist(w.body,w.shade)}))
      .reduce((a,b)=>b.score>a.score+1?b:a);
    const waterFade=variation.integer('waterfall-fade-step',3,4);
    // Procedural silhouette: top outline shoulders, underside spike count,
    // spike depths and the facet seams all come from named variation.
    const shL=variation.integer('island-shoulder-left',-3,3),shR=variation.integer('island-shoulder-right',-4,3);
    const lift=variation.integer('island-crown-lift',-1,2);
    const spikes=variation.integer('island-spikes',1,3),drop=variation.wild('island-drop',.62,.88,.5,.96);
    const sideL=variation.integer('island-side-left',16,21),sideR=variation.integer('island-side-right',17,22);
    const under=[[right-6,top+sideR]];
    {
      // Secondary tips sit either side of the main tip, shorter, with valleys between.
      const tips=[[tipX,top+depth]];
      if(spikes>=2)tips.push([right-14-variation.integer('island-tip-r',0,6),top+depth*variation.range('island-tip-r-depth',.68,.8,12)]);
      if(spikes>=3)tips.push([left+15+variation.integer('island-tip-l',0,6),top+depth*variation.range('island-tip-l-depth',.62,.76,12)]);
      tips.sort((a,b)=>b[0]-a[0]);
      let prev=under[0];
      for(const t of tips){
        if(t[0]>prev[0]-6)continue;
        const vy=Math.max(prev[1],top+depth*drop*.8);
        if(prev!==under[0])under.push([(prev[0]+t[0])/2,Math.min(vy,Math.min(prev[1],t[1])-3)]);
        under.push(t);prev=t;
      }
      if(spikes===1){under.splice(1,0,[85+shR,top+depth*.7]);under.push([54,top+depth*drop],[34,top+depth*drop*.78]);}
      else under.push([(prev[0]+left+4)/2,top+Math.max(sideL+2,depth*drop*.7)]);
      under.push([left+4,top+sideL]);
    }
    const crownL=[40+shL,top-5-lift],crownR=[79+shR,top-7-lift];
    const outline=[[left,top+5],crownL,crownR,[right,top+5],...under];
    const underY=x=>{let best=top+depth;for(let i=0;i+1<under.length;i++){const [a,b]=[under[i],under[i+1]];
      if((x-a[0])*(x-b[0])<=0&&a[0]!==b[0])best=a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0]);}return best;};
    const seamX=variation.integer('island-seam',40,48),seamBottom=variation.integer('island-seam-foot',-6,6);
    const seam1=[[seamX,top+9+(seamX-left)*.18],[54+seamBottom,underY(54+seamBottom)]];
    const seam2=[[62,top+19],[tipX,top+depth]];
    const side=(x,y,[[ax,ay],[bx,by]])=>(bx-ax)*(y-ay)-(by-ay)*(x-ax);
    p.group(p=>{
    p.poly(outline,5);
    // The upper-left plane catches light; the right plane turns away and the
    // bottom receives less light. All rock faces use the material ramp, never
    // unrelated background gray. Dither is clipped separately to each plane.
    const facets=[
      {test:(x,y)=>side(x,y,seam1)>0,light:.7},
      {test:(x,y)=>side(x,y,seam1)<=0&&side(x,y,seam2)>0,light:.5},
      {test:(x,y)=>side(x,y,seam2)<=0,light:.28},
    ];
    for(const {test,light}of facets)
      dither(p,{x:left,y:top+5,w:right-left,h:depth+2,color:6,
        density:(x,y)=>Math.max(.15,light-(y-top)/depth*.25),mask:(x,y)=>insidePolygon(x,y,outline)&&test(x,y)});
    p.poly([[left,top+5],[crownL[0],crownL[1]-1],[crownR[0],crownR[1]-1],[right,top+5],[62,top+19],[left+1,top+9]],6);
    p.poly([[left+4,top+4],[crownL[0]+2,crownL[1]+2],[crownR[0]-3,crownR[1]+2],[87,top],[70,top+6],[43,top+8]],7);
    p.line(left+4,top+9,61,top+18,7);
    },{outline:1,color:4,shadow:{x:2,y:3,color:4}});
    function tree(x,y,s=1) {
      s*=canopyScale;
      p.line(x,y,x,y-17*s,4,5*s); p.line(x-1,y,x-1,y-17*s,5,2*s);
      p.poly([[x-13*s,y-11*s],[x-7*s,y-21*s],[x-4*s,y-28*s],[x+4*s,y-28*s],
        [x+8*s,y-20*s],[x+14*s,y-12*s],[x+7*s,y-8*s],[x-6*s,y-7*s]],4);
      p.poly([[x-11*s,y-12*s],[x-6*s,y-21*s],[x-3*s,y-26*s],[x+3*s,y-26*s],
        [x+6*s,y-19*s],[x+11*s,y-12*s],[x+5*s,y-10*s],[x-5*s,y-9*s]],5);
      p.poly([[x-11*s,y-12*s],[x-6*s,y-21*s],[x-3*s,y-26*s],[x+3*s,y-26*s],
        [x+2*s,y-19*s],[x-1*s,y-14*s]],10);
      p.line(x-6*s,y-15*s,x-2*s,y-16*s,8);
    }
    function house(x,y,w,h,roof=10) {
      p.poly([[x-w,y-h],[x,y-h-6],[x+w,y-h],[x+w,y],[x,y+6],[x-w,y]],4);
      p.poly([[x-w+2,y-h],[x,y-h-4],[x,y+4],[x-w+2,y-1]],7);
      p.poly([[x,y-h-4],[x+w-2,y-h],[x+w-2,y-1],[x,y+4]],5);
      p.poly([[x-w-3,y-h],[x,y-h-roof],[x+w+3,y-h],[x,y-h+5]],4);
      p.poly([[x-w-1,y-h],[x,y-h-roof+2],[x+w,y-h],[x,y-h+3]],10);
      p.line(x-w+1,y-h,x,y-h+3,8);
      p.rect(x+3,y-7,4,7,4); p.rect(x-w+4,y-h+4,3,4,11);
    }
    function waterfall(x,y) {
      if(!waterfallCount)return;
      const half=waterfallWidth/2,len=waterfallLength*.85;
      const topAt=xx=>{
        const [a,b]=xx<=62?[rim[0],rim[1]]:[rim[1],rim[2]];
        return a[1]+(xx-a[0])*(b[1]-a[1])/(b[0]-a[0])-.5;
      };
      const start=Math.min(topAt(x-half),topAt(x+half)),end=topAt(x)+len;
      // One opaque ribbon: clipped to the actual sloping lip, vertical sides,
      // continuous material all the way down and one clean terminal edge.
      const fadeRows=waterFade*3;
      p.sample(x-half,start,waterfallWidth,end-start,(xx,yy,dx,dy)=>{
        const lip=topAt(xx);
        if(yy<lip||yy>=end)return null;
        const t=(yy-lip)/len,u=(xx-x+half)/waterfallWidth,ix=dx|0,iy=dy|0;
        // Stepped 75/50/25 2x2 ordered fade (25% only two rows deep); each band keeps
        // diagonal contact with the one above, so the ribbon stays attached.
        const rest=end-yy,band=rest<2?0:rest<2+waterFade?1:rest<2+2*waterFade?2:3;
        if(band<3){
          const ox=ix&1,oy=iy&1,on=band===2?!(ox&&oy):band===1?ox===oy:!ox&&!oy;
          if(!on)return null;
          return u<.15||u>.86?water.shade:water.body;
        }
        if(yy<lip+2)return 8;
        if(u>.2&&u<.36&&t<.45&&yy<end-fadeRows-2)return 8;
        if(u<.15||u>.86)return water.shade;
        return ditherTone(Math.max(0,t-.3)*1.5,[water.body,water.shade],dx,dy);
      });
      waterfalls.push({x,left:x-half,right:x+half,start,end,topLeft:topAt(x-half),topRight:topAt(x+half)});
    }
    if(kind==='sky temple') {
      p.poly([[48,top+3],[68,top-4],[89,top+3],[68,top+12]],4);
      p.poly([[51,top+3],[68,top-2],[86,top+3],[68,top+9]],9);
      const columns=3+r(3);
      for(let j=0;j<columns;j++) {
        const x=53+j*27/(columns-1), y=top+3-Math.abs(x-67)*.2;
        p.rect(x-2,y-landmarkHeight,5,landmarkHeight+1,4); p.rect(x-1,y-landmarkHeight+1,2,landmarkHeight-2,8);
        p.rect(x-3,y-landmarkHeight-2,7,3,9);
      }
      p.poly([[46,top-landmarkHeight-1],[67,top-landmarkHeight-14],[91,top-landmarkHeight-1],[69,top-landmarkHeight+6]],4);
      p.poly([[49,top-landmarkHeight-2],[67,top-landmarkHeight-11],[87,top-landmarkHeight-1],[69,top-landmarkHeight+3]],7);
      p.line(53,top-landmarkHeight-2,68,top-landmarkHeight-7,8);
      tree(34,top+3,.65); waterfall(92,top+9);
      p.poly([[66,top+7],[77,top+10],[74,top+13],[64,top+11]],8);
    } else if(kind==='mountain spring') {
      const peak=top-landmarkHeight-5,peakX=51+r(10);
      p.poly([[36,top-1],[peakX,peak-2],[76,top-4],[91,top+1]],4);
      p.poly([[39,top-2],[peakX,peak],[73,top-3],[86,top]],9);
      p.poly([[peakX,peak],[peakX+4,top-2],[86,top],[73,top-3]],5);
      p.poly([[peakX-8,peak+13],[peakX,peak],[peakX+9,peak+14],[peakX+3,peak+10],
        [peakX,peak+13],[peakX-4,peak+9]],8);
      p.ellipse(64,top+7,18,5,4); p.ellipse(64,top+6,16,4,11);
      p.line(53,top+5,69,top+3,10); p.line(60,top+7,73,top+6,8);
      waterfall(fall+11,top+13); tree(88,top+3,.8); tree(32,top+3,.55);
    } else if(kind==='lighthouse') {
      const x=62+r(13),towerTop=top-landmarkHeight,width=8+r(4);
      p.poly([[x-width,top+2],[x-width+3,towerTop],[x+width-4,towerTop],[x+width,top+2],[x,top+6]],4);
      p.poly([[x-width+2,top+1],[x-width+5,towerTop+2],[x+width-6,towerTop+2],[x+width-2,top+1],[x,top+4]],8);
      p.poly([[x+1,towerTop+2],[x+width-6,towerTop+2],[x+width-2,top+1],[x+1,top+4]],9);
      const lighthouseFace=[[x-width+2,top+1],[x-width+5,towerTop+2],[x+width-6,towerTop+2],[x+width-2,top+1],[x,top+4]];
      p.sample(x-width,towerTop,width*2,top+4-towerTop,(xx,yy)=>
        insidePolygon(xx,yy,lighthouseFace)&&((yy>=towerTop+8&&yy<towerTop+12)||(yy>=top-7&&yy<top-3))?10:null);
      p.rect(x-width,towerTop-3,width*2+1,4,4);p.rect(x-width+3,towerTop-10,width*2-5,8,4);
      p.rect(x-width+5,towerTop-8,width*2-9,5,7);p.rect(x-1,towerTop-8,2,5,4);
      p.poly([[x-width-1,towerTop-10],[x,towerTop-15],[x+width+1,towerTop-10]],4);
      p.line(x-width+3,towerTop-11,x,towerTop-14,10);
      house(42,top+4,9,8,7); tree(93,top+3,.5);
      p.poly([[61,top+5],[67,top+7],[53,top+13],[48,top+11]],9);
      waterfall(87,top+11);
    } else if(kind==='ancient tree') {
      const count=3+r(5),spread=22+r(17),rise=24+r(17),lean=r(15)-7,shape=pick(['umbrella','tiered','windswept']);
      const nodes=Array.from({length:count},(_,i)=>{
        const t=count===1?.5:i/(count-1),x=64+lean+(t-.5)*spread*2;
        const y=top-rise+(shape==='umbrella'?Math.abs(t-.5)*12:shape==='tiered'?(i%2)*10:(t-.5)*15)+r(5)-2;
        return [x,y,(12+r(10))*canopyScale,(7+r(7))*canopyScale];
      });
      p.stroke([[65,top+5],[59,top-10],[64+lean,top-rise+8]],4,9);
      p.stroke([[64,top+3],[60,top-10],[64+lean,top-rise+8]],5,5);
      for(const [x,y]of nodes)p.stroke([[61,top-12],[64+lean,top-rise+12],[x,y+3]],5,4);
      // Outline the crown's combined fill once. Black borders on every lobe
      // can survive overlaps as distracting specks inside the foliage.
      p.group(q=>nodes.forEach(([x,y,w,h])=>{
        q.ellipse(x,y,w-1,h-1,5);
        q.ellipse(x-2,y-1,w-3,h-2,10);q.line(x-w*.45,y-h*.4,x-w*.1,y-h*.4,8);
      }),{outline:1,color:4});
      for(const i of [0,count-1]){const [x,y,,h]=nodes[i],hang=6+r(8);p.line(x,y+h-2,x,y+h+hang,5);p.ellipse(x,y+h+hang,2,3,10);}
      canopy={count,spread,rise,lean,shape};
      house(45,top+7,6,6,6); waterfall(88,top+11);
    } else if(kind==='windmill sanctuary') {
      const x=67+r(7),towerTop=top-landmarkHeight,axleY=towerTop-2,span=14+r(4),turn=r(2)*Math.PI/4;
      p.poly([[x-11,top+4],[x-7,towerTop],[x+7,towerTop],[x+12,top+3],[x,top+8]],4);
      p.poly([[x-8,top+3],[x-5,towerTop+2],[x,towerTop+1],[x,top+6]],7);
      p.poly([[x,towerTop+1],[x+5,towerTop+2],[x+9,top+2],[x,top+6]],5);
      p.poly([[x-10,towerTop+2],[x,towerTop-10],[x+11,towerTop+2]],4);
      p.poly([[x-7,towerTop],[x,towerTop-7],[x+7,towerTop]],10);
      p.rect(x-3,top-7,6,12,4);p.rect(x-1,top-6,3,9,9);
      const sails=variation.integer('windmill-sails',3,5);
      // Broad sails share one hub and equal angular spacing.
      for(let k=0;k<sails;k++){
        const a=turn+k*Math.PI*2/sails,co=Math.cos(a),si=Math.sin(a),point=(u,v)=>[x+u*co-v*si,axleY+u*si+v*co];
        p.line(x,axleY,...point(span,0),4,3);
        p.poly([point(4,-1),point(span,-1),point(span,5),point(7,4)],4);
        p.poly([point(6,0),point(span-1,0),point(span-1,3),point(8,2)],8);
        p.line(...point(9,0),...point(9,3),9);
      }
      p.ellipse(x,axleY,4,4,4);p.ellipse(x-1,axleY-1,2,2,9);
      house(39,top+6,8,8,7);tree(96,top+4,.5);
      p.poly([[58,top+7],[70,top+8],[76,top+11],[65,top+12]],9);
      waterfall(89,top+11);
    } else {
      p.poly([[32,top+1],[43,top-23],[53,top-25],[72,top+1]],4);
      p.poly([[35,top],[44,top-21],[52,top-23],[68,top]],3);
      p.poly([[49,top-21],[53,top-23],[68,top],[54,top-3]],5);
      p.ellipse(48,top-22,7,3,4); p.ellipse(48,top-22,5,2,10);
      p.stroke([[49,top-20],[52,top-12],[47,top-5],[52,top+2]],10,3);
      p.line(49,top-19,51,top-13,8);
      house(84,top+4,10,13,6);
      p.line(91,top-12,91,top-25,4,2); p.poly([[92,top-25],[104,top-22],[92,top-19]],10);
      p.poly([[55,top+3],[74,top+1],[77,top+4],[58,top+6]],9);
      p.ellipse(42,top-33,4,3,2); p.ellipse(45,top-39,6,3,2);
    }
    // Small secondary landmarks occupy the front-left clearing, rather than
    // being scattered across water, architecture, or the main landmark.
    const sx=37+r(6),sy=top+9;
    if(secondary==='shrine') {
      p.poly([[sx-6,sy],[sx,sy-3],[sx+6,sy],[sx,sy+3]],4);
      p.rect(sx-2,sy-10,4,11,9);p.rect(sx-1,sy-9,2,8,8);p.rect(sx-5,sy-11,10,3,4);
    } else if(secondary==='observatory') {
      p.line(sx,sy,sx,sy-11,4,3);p.ellipse(sx,sy-12,6,3,4,-.3);
      p.ellipse(sx-1,sy-13,4,2,9,-.3);p.line(sx,sy-12,sx+4,sy-17,10);
    } else if(secondary==='crystal') {
      p.poly([[sx-4,sy],[sx-5,sy-8],[sx,sy-17],[sx+5,sy-8],[sx+3,sy+2]],4);
      p.poly([[sx-3,sy-1],[sx-3,sy-8],[sx,sy-14],[sx,sy+1]],8);
      p.poly([[sx,sy-14],[sx+3,sy-8],[sx+2,sy],[sx,sy+1]],10);
    } else tree(sx,sy,.45);
    if(waterfallCount&&kind==='volcanic outpost')waterfall(right-11,top+11);
    if(waterfallCount===2)waterfall(left+13,top+12);
    return {subject:kind,archetype:kind,terrain:'floating rock',widthScale,heightScale,depth,
      landmarkHeight,secondary,waterfalls:waterfallCount,waterfallGeometry:waterfalls,waterfallLength,waterfallWidth,canopyScale,spikes,waterRamp:[water.body,water.shade],...(canopy?{canopy}:{}),detail:'inhabited miniature world'};
  }
};
