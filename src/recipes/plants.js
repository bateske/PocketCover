import {dither} from '../materials.js';
import {carnivorousMouth} from './plant-mouth.js';
import {part} from '../raster.js';
import {preferredVector} from '../geometry.js';

// FEATURE (plants only): anchored branch grammar, bilateral leaves, flower/cap heads.
export default {
  id:'plants', label:'Alien botany', revision:4, background:'garden',
  features:['dot','rect','poly','ellipse','line','stroke','sample','group'],
  specializedFeatures:['leaf fans','radial flowers','mushroom gills','mixed botanical heads'],
  render({p:raw,r,pick,variation}) {
    const kind=pick(['orchid','mushrooms','lantern tree','crystal cactus','carnivorous bloom']);
    const rootX=59+r(11),ground=82, crownY=9+r(39), spread=16+r(23), lean=r(29)-14;
    const facing=r(2)?'right':'left',screen=facing==='left'?raw:part(raw,{x:128,flipX:true});let p=screen;
    const leafPairs=Math.max(1,Math.floor((ground-crownY)/16)),extraLeaves=Math.max(0,leafPairs-2);
    const leafShape=pick(['blade','broad','lobed']),petals=4+r(5),stemWidth=4+r(4);
    const headMix=pick(['flower','lantern','mushroom']), accessories=[];
    let mouth;
    const topX=rootX+lean,midY=(ground+crownY)/2;
    function stem(points,width=4) {
      p.stroke(points,5,width);
      p.stroke(points.map(([x,y])=>[x-1,y]),6,Math.max(1,width-2));
    }
    function leaf(x,y,dx,dy,size=1) {
      [dx,dy]=preferredVector(dx*size,dy*size);
      const broad=leafShape==='broad'?.42:leafShape==='lobed'?.35:.22;
      const nx=-dy*broad,ny=dx*broad,tip=[x+dx,y+dy];
      p.poly([[x,y],[x+dx*.35+nx,y+dy*.35+ny],tip,[x+dx*.6-nx,y+dy*.6-ny]],5);
      p.poly([[x,y],[x+dx*.36+nx*.8,y+dy*.36+ny*.8],[x+dx*.92,y+dy*.92],[x+dx*.56,y+dy*.56]],6);
      p.poly([[x,y],[x+dx*.56,y+dy*.56],[x+dx*.92,y+dy*.92],[x+dx*.6-nx*.8,y+dy*.6-ny*.8]],5);
      p.line(x,y,x+dx*.84,y+dy*.84,7);
      if(leafShape==='lobed') for(const t of [.3,.53]) {
        p.line(x+dx*t,y+dy*t,x+dx*(t+.1)+nx*.5,y+dy*(t+.1)+ny*.5,7);
      }
    }
    function flower(x,y,size,n=petals) {
      const wide=3+r(2);
      for(let k=0;k<n;k++) {
        const a=k*Math.PI*2/n,dx=Math.cos(a),dy=Math.sin(a);
        p.poly([[x,y],[x+dx*size*.45-dy*(wide+2),y+dy*size*.45+dx*(wide+2)],
          [x+dx*size,y+dy*size],[x+dx*size*.45+dy*(wide+2),y+dy*size*.45-dx*(wide+2)]],11);
        p.poly([[x,y],[x+dx*size*.5-dy*wide,y+dy*size*.5+dx*wide],
          [x+dx*(size-2),y+dy*(size-2)],[x+dx*size*.4+dy*wide,y+dy*size*.4-dx*wide]],10);
      }
      p.ellipse(x,y,5,5,4);p.ellipse(x,y,3,3,11);p.rect(x-2,y-2,2,2,8);
    }
    function pod(x,y,size) {
      p.ellipse(x,y,size*.65,size,11);
      p.poly([[x,y-size+2],[x+size*.42,y-1],[x,y+size-2],[x-size*.42,y-1]],10);
      p.line(x-1,y-size+3,x-1,y+size-3,8);
    }
    function cap(x,y,w,h) {
      const gillPitch=variation.integer('gill-pitch:'+x+':'+y,4,7),spots=variation.integer('cap-spots:'+x+':'+y,2,4);
      p.ellipse(x,y+3,w,h*.5,11);
      for(let j=-w+5;j<w-3;j+=gillPitch) p.line(x+j,y+2,x+j*.6,y+6,10);
      const outline=[[x-w,y+2],[x-w*.72,y-h*.6],[x-w*.2,y-h],[x+w*.25,y-h],
        [x+w*.78,y-h*.5],[x+w,y+2],[x+w*.25,y],[x-w*.16,y+4]];
      p.poly(outline,5);
      p.poly([[x-w+2,y],[x-w*.65,y-h*.55],[x-w*.2,y-h+2],[x+w*.2,y-h+2],
        [x+w*.7,y-h*.4],[x+w-2,y],[x+w*.25,y-2],[x-w*.16,y+2]],6);
      p.poly([[x-w+5,y-3],[x-w*.63,y-h*.5],[x-w*.2,y-h+2],[x+w*.2,y-h+2],[x+w*.3,y-h*.3]],7);
      dither(p,{x:x-w*.55,y:y-h*.45,w:w*1.1,h:h*.4,color:5,density:.25,
        mask:(px,py)=>py>y-h*.35+(px-x)*.05 && py<y-1});
      for(let j=0;j<spots;j++) p.rect(x-w*.42+j*w*.68/(spots-1),y-h*.4-(j%2)*2,Math.max(2,w*.14),2,8);
    }
    function head(type,x,y,s) {
      if(type==='flower')flower(x,y,s);
      else if(type==='mushroom')cap(x,y,s,s*.62);
      else pod(x,y,s*.7);
    }
    // A quiet root contact lets the unusual plant own the silhouette. Ground
    // sprigs, rough soil triangles and loose texture competed with its leaves.
    p.ellipse(rootX,ground,Math.max(9,spread*.55),2,3);
    let branches=0,heads=1;
    // One source union connects stems, leaves and heads before the final-grid
    // outline is applied. Black interior marks remain eyes, gills or mouths.
    screen.group(q=>{p=q;
    if(kind==='mushrooms') {
      heads=2+r(3);
      const spacing=spread*.8;
      for(let n=0;n<heads;n++) {
        const big=n===0,x=big?topX:rootX+(n%2?-spacing:spacing)+(r(5)-2);
        const y=big?crownY+9:54+(n-1)*7+r(4),w=big?19+r(9):10+r(7),h=w*(.45+r(4)*.08);
        stem([[x+(rootX-x)*.25,ground-3],[x-2,y+16],[x,y+4]],big?stemWidth+3:4);
        cap(x,y,w,h);
        if(n===0&&r(2)) {leaf(x,y+23,spread*.65,-9);accessories.push('stem leaves');}
      }
      if(r(2)) {stem([[rootX,ground-4],[rootX-12,67]],2);pod(rootX-12,64,6);accessories.push('lantern fruit');}
    } else if(kind==='lantern tree') {
      branches=Math.max(2,leafPairs+r(2));heads=branches;
      stem([[rootX,ground-3],[rootX-4,midY+7],[topX,midY-5],[topX-2,crownY]],stemWidth);
      for(let n=0;n<branches;n++) {
        const side=n%2?1:-1,sy=crownY+9+n*(ground-crownY-22)/branches;
        const sx=topX+(rootX-topX)*(sy-crownY)/(ground-crownY);
        const tx=sx+side*(spread-3+r(6)),ty=sy-10-r(5);
        stem([[sx,sy],[tx-side*6,ty-3],[tx,ty]],3);
        leaf(tx,ty,side*(10+r(5)),-7);
        const hang=6+r(6);p.line(tx,ty,tx,ty+hang,5,2);
        head(n===0&&headMix!=='lantern'?headMix:'lantern',tx,ty+hang+5,8+r(3));
      }
      leaf(topX-2,crownY,7,-12);
      accessories.push(headMix==='lantern'?'hanging pods':headMix+' crown');
    } else if(kind==='crystal cactus') {
      branches=Math.max(2,leafPairs-1);heads=branches+1;
      stem([[rootX,ground-3],[topX,crownY+5]],stemWidth+6);
      for(let n=0;n<branches;n++) {
        const side=n%2?1:-1,reach=spread*(n===2?.47:.85),joinY=ground-17-n*(ground-crownY-24)/branches,tipY=joinY-11-r(9);
        const sx=topX+(rootX-topX)*(joinY-crownY)/(ground-crownY),tx=sx+side*reach;
        stem([[sx,joinY],[tx,joinY],[tx,tipY]],stemWidth+2);
        for(let yy=tipY+7;yy<joinY-1;yy+=9)p.line(tx+side*3,yy,tx+side*7,yy-3,7);
        head(n===0?headMix:'flower',tx,tipY-3,7+r(3));
      }
      for(let yy=crownY+15;yy<ground-7;yy+=10)p.line(topX-5,yy,topX-10,yy-2,7);
      flower(topX,crownY,10+r(4));
      accessories.push(headMix+' arms');
    } else if(kind==='carnivorous bloom') {
      const hx=topX+4,hy=crownY+7,rx=17+r(8),ry=12+r(6),gape=4+r(10);
      stem([[rootX,ground-3],[rootX-8,midY+7],[hx-7,hy+ry],[hx,hy+3]],stemWidth+2);
      leaf(rootX-3,ground-13,-spread,-13);leaf(rootX-4,ground-13,spread,-17);
      for(let n=0;n<extraLeaves;n++){
        const yy=ground-24-n*10;
        const xx=yy>=midY+7?rootX-8+(yy-midY-7)*8/(ground-midY-10):
          rootX-8+(midY+7-yy)/Math.max(1,midY+7-hy-ry)*(hx+1-rootX);
        leaf(xx,yy,(n%2?1:-1)*spread*.68,-11-r(5));
      }
      leaf(hx-7,hy+ry+4,-spread*.7,-13);
      p.ellipse(hx,hy,rx+3,ry+3,5,-.15);p.ellipse(hx-1,hy-1,rx+1,ry+1,6,-.15);
      mouth={x:hx,y:hy,rx:rx*(.62+r(4)*.08),ry:Math.min(ry-2,gape),upper:2+r(5),lower:1+r(5)};
      carnivorousMouth(p,mouth);
      if(r(2)) {stem([[rootX-6,midY+9],[rootX-spread,midY]],2);head(headMix,rootX-spread,midY-3,7);heads++;accessories.push(headMix+' side shoot');}
    } else {
      branches=Math.max(2,leafPairs-1+r(2));heads=branches+1;
      stem([[rootX,ground-3],[rootX-4,midY+10],[topX,midY-4],[topX,crownY]],stemWidth);
      for(let n=0;n<branches;n++) {
        const side=n%2?1:-1,y=crownY+15+n*(ground-crownY-28)/branches,x=topX+(rootX-topX)*(y-crownY)/(ground-crownY);
        leaf(x,y+8,side*spread,-14-r(7));
        const tx=x-side*(spread*.7),ty=y-12;
        stem([[x,y],[tx+side*5,ty+4],[tx,ty]],2);
        head(n===0?'flower':headMix,tx,ty,8+r(3));
      }
      flower(topX,crownY,16+r(5));accessories.push(headMix+' branch heads');
    }
    // Fade the effects at contact without cutting off the living stem itself.
    // The shared group maps this mask through the final placement transform.
    },{outline:1,color:4,shadow:{x:1,y:2,color:4},effectMask:(x,y)=>y<ground-4});
    return {subject:kind,archetype:kind,height:ground-crownY,spread,lean,stemWidth,leafShape,heads,branches,facing,leafPairs,
      accessories,...(mouth?{mouth}:{}),groundContact:{x:facing==='right'?128-rootX:rootX,y:ground},effectCutoff:ground-4,
      habitat:pick(['moon garden','forgotten greenhouse','deep spore forest'])};
  }
};
