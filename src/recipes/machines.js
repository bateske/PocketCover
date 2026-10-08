import {part} from '../raster.js';
import {dither} from '../materials.js';
import {dish} from './dish.js';
export default {
  id: 'machines', label: 'Strange machines', revision: 4, background: 'workshop',
  features: ['rect', 'poly', 'round', 'line', 'pipe', 'ellipse', 'arc', 'dot', 'sample', 'part', 'group'],
  specializedFeatures: ['toothed gears', 'pressure vessels and instrument gauges', 'concave satellite dish'],
  render({p,r,pick,variation}) {
    const archetype=pick(['pressure alchemist','arc dynamo','signal harvester','clockwork pump']);
    const accent=pick([7,10]), tankHeight=32+r(8);
    const frameWidth=.80+r(6)*.04,frameHeight=.80+r(6)*.04,offset=r(7)-3;
    p=part(p,{x:64*(1-frameWidth)+offset,y:85*(1-frameHeight),scaleX:frameWidth,scaleY:frameHeight});
    const shell=pick(['smooth alloy','riveted copper','cooling ribs']),gearRatio=.85+r(4)*.05,equipment=[];
    const spokeCount=variation.integer('gear-spokes',3,6),coilPitch=variation.integer('coil-pitch',5,8),dishAngle=variation.range('dish-tilt',.42,.75);
    // The assembled fill owns one exterior contour and one cast shadow. Module
    // contours remain one pixel so openings and working parts stay readable.
    p.group(p=>{
    const outlined=(draw)=>{const parent=p;parent.group(q=>{p=q;draw();p=parent;},{outline:1,color:4});};
    // FEATURE: toothed gear geometry is only required by the machine recipe.
    const gear=(x,y,rad,teeth=10)=>{
      teeth+=variation.integer('gear-teeth:'+x,-1,1);
      rad*=gearRatio;
      const pts=[];
      for(let i=0;i<teeth*4;i++) {
        const a=i*Math.PI*2/(teeth*4),rr=(i%4===0||i%4===3)?rad-3:rad;
        pts.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr]);
      }
      outlined(()=>{
      p.poly(pts,9);p.ellipse(x,y,rad-7,rad-7,5);
      for(let i=0;i<spokeCount;i++){const a=i*Math.PI*2/spokeCount;p.line(x,y,x+Math.cos(a)*(rad-6),y+Math.sin(a)*(rad-6),6,3);}
      p.ellipse(x,y,5,5,4);p.ellipse(x-1,y-1,3,3,7);p.dot(x,y,4);
      });
    };
    const pipe=(points)=>{
      outlined(()=>{
        p.pipe(points,9,5,1);
        // Short highlights stay on straight runs; the shared pipe primitive
        // supplies the one-device-pixel corner trim at every final scale.
        for(let i=1;i<points.length;i++){
          const [x0,y0]=points[i-1],[x1,y1]=points[i];
          if(y0===y1&&Math.abs(x1-x0)>8)p.rect(Math.min(x0,x1)+3,y0-1,Math.abs(x1-x0)-6,1,7);
          else if(x0===x1&&Math.abs(y1-y0)>8)p.rect(x0-1,Math.min(y0,y1)+3,1,Math.abs(y1-y0)-6,7);
        }
        for(const [x,y]of [points[0],points.at(-1)]){p.rect(x-4,y-3,8,6,5);p.rect(x-3,y-2,6,2,7);}
      });
    };
    const gauge=(x,y,rad=7)=>{
      outlined(()=>{
      p.ellipse(x,y,rad+1,rad+1,9);p.ellipse(x,y,rad-1,rad-1,8);
      p.dot(x-3,y-2,5);p.dot(x,y-4,5);p.dot(x+3,y-2,5);
      p.line(x,y,x+3-r(7),y-4,11,1);p.rect(x-1,y,2,2,4);
      });
    };
    const tank=(x,y,w,h)=>{
      outlined(()=>{
      p.round(x-2,y-2,w+4,h+4,8,5);
      p.round(x,y-1,w-3,h-1,7,6);
      p.round(x+2,y+2,Math.max(4,w*.23),Math.max(5,h-6),3,7);
      p.rect(x+4,y+4,Math.max(3,w*.45),2,8);
      // A narrow checker transition wraps the shaded right side; the broad
      // front and continuous left reflection establish a cylindrical vessel.
      dither(p,{x:x+w*.63,y:y+5,w:w*.21,h:h-10,color:5,density:.5});
      for(const yy of [y+8,y+h-9]){p.rect(x-1,yy,w+2,4,9);p.rect(x,yy,w*.72,1,8);p.rect(x+w-5,yy+1,5,3,5);}
      p.rect(x+6,y+h,4,7,5);p.rect(x+w-10,y+h,4,7,5);
      if(shell==='cooling ribs')for(let yy=y+13;yy<y+h-11;yy+=5)p.rect(x+1,yy,w-2,2,9);
      if(shell==='riveted copper')for(let yy=y+5;yy<y+h-5;yy+=8){p.rect(x+2,yy,2,2,9);p.rect(x+w-4,yy,2,2,9);}
      dither(p,{x:x+4,y:y+h-5,w:w-8,h:5,color:4,density:.25});
      });
    };
    // Common feet and cast base keep disconnected-looking parts grounded.
    outlined(()=>{
    p.rect(22,79,10,8,5);p.rect(91,79,10,8,5);
    p.round(17,71,92,11,3,9);p.rect(20,78,86,2,5);
    dither(p,{x:20,y:78,w:86,h:3,color:4,density:.25});
    for(const x of [23,103]){p.rect(x,74,2,2,8);p.dot(x,77,4);}
    });
    if(archetype==='pressure alchemist') {
      pipe([[43,35],[43,15],[81,15],[81,30]]);
      outlined(()=>{p.rect(54,12,4,7,9);p.ellipse(57,12,7,2,5);p.rect(51,10,12,2,accent);});
      const crown=25+r(9), liquid=41+r(10);
      tank(25,crown,31,69-crown);tank(72,28,24,41);
      p.rect(75,35,18,22,4);p.rect(77,37,14,18,11);p.rect(78,liquid,12,55-liquid,10);
      p.rect(78,38,2,15,8);p.dot(86,45,7);p.dot(83,51,8);
      pipe([[52,62],[63,62],[63,48],[72,48]]);
      gauge(40,48,8);
      outlined(()=>{p.rect(100,45,4,25,5);p.rect(101,46,2,23,6);p.line(103,48,111,39,9,2);p.ellipse(111,38,3,3,accent);});
      outlined(()=>{p.rect(30,crown-7,16,6,5);p.rect(31,crown-6,14,2,9);});
    } else if(archetype==='arc dynamo') {
      tank(46,43,34,26);
      const turns=4+r(3), coilTop=59-turns*6;
      for(const x of [27,96]) {
        outlined(()=>{
        p.rect(x-5,64,10,7,5);p.rect(x-3,27,6,38,5);p.rect(x-1,28,2,37,9);
        for(let y=coilTop;y<59;y+=coilPitch){p.round(x-9,y,18,5,2,5);p.rect(x-7,y,14,2,accent);p.rect(x-6,y+3,12,1,9);}
        p.ellipse(x,25,11,7,9);p.ellipse(x-2,22,5,2,8);
        });
        pipe([[x,65],[x,68],[48+(x>50?28:0),68]]);
      }
      p.line(38,25,48,21,10,2);p.line(48,21,53,29,10,2);p.line(53,29,65,17,10,2);
      p.line(65,17,72,26,10,2);p.line(72,26,85,24,10,2);
      // The connected discharge explains the electricity; loose dots beside it
      // only looked like debris and did not belong to a material or attachment.
      p.line(53,28,65,18,8,1);
      gauge(62,52,7);p.rect(54,64,17,3,4);p.rect(57,65,3,1,10);p.rect(64,65,4,1,7);
    } else if(archetype==='signal harvester') {
      outlined(()=>{p.poly([[37,72],[44,38],[56,38],[67,72]],5);p.line(48,44,44,69,7,3);});
      outlined(()=>dish(p,{x:46,y:32,rx:variation.integer('dish-width',23,28),ry:variation.integer('dish-depth',11,15),angle:dishAngle,accent}));
      outlined(()=>{p.round(70,43,31,27,3,5);p.rect(73,46,25,3,9);});
      const display=r(2)===0;
      if(display){
        p.rect(77,51,17,10,4);p.rect(79,53,13,6,11);
        p.line(80,56,83,56,10);p.line(83,56,85,54,10);p.line(85,54,88,58,10);p.line(88,58,91,56,10);
      }else gauge(85,55,6);
      p.rect(77,64,3,2,accent);p.rect(84,64,3,2,7);p.rect(91,64,3,2,9);
      pipe([[54,59],[64,59],[64,65],[73,65]]);
      const mast=17+r(12);
      outlined(()=>{p.line(87,mast+2,87,43,9);p.ellipse(87,mast,3,3,accent);});
    } else {
      tank(24,71-tankHeight,23,tankHeight-4);
      pipe([[35,71-tankHeight],[35,24],[63,24],[63,36]]);gauge(35,50,7);
      outlined(()=>{p.rect(56,55,42,15,5);p.rect(59,57,36,9,6);p.rect(59,58,36,2,7);});
      p.rect(62,62,29,3,4);p.rect(67,63,22,1,9);
      gear(67,42,17,11);gear(94,51,13,9);
      outlined(()=>p.line(67,42,79,62,9,3));
      p.ellipse(67,42,3,3,8);p.ellipse(79,62,3,3,4);p.dot(79,62,7);
      outlined(()=>{p.rect(100,23,3,13,9);p.ellipse(101,22,6,2,5);p.rect(96,20,10,2,accent);});
      pipe([[101,34],[109,34],[109,64],[97,64]]);
    }
    // Reuse small modules across all machine grammars, mounted on the frame.
    // Their narrow footprint leaves each machine's primary working part readable.
    const auxiliary=pick(['pressure valve','miniature coil','service gauge','receiver dish','vent stack','none']);
    const side=r(2)?1:-1,anchor=side<0?21:106,x=side<0?14:113,mountY=58+r(8);
    if(auxiliary!=='none'){
      pipe([[anchor,74],[x,74],[x,mountY+5]]);equipment.push(auxiliary);
      if(auxiliary==='pressure valve'){
        outlined(()=>{
        p.rect(x-2,mountY-12,4,18,5);p.rect(x-1,mountY-12,2,18,9);
        p.ellipse(x,mountY-12,6,2,5);p.rect(x-5,mountY-14,10,2,accent);
        });
      }else if(auxiliary==='miniature coil'){
        outlined(()=>{
        p.rect(x-1,mountY-18,2,25,9);
        for(let yy=mountY-14;yy<mountY+3;yy+=5){p.round(x-5,yy,10,3,1,5);p.rect(x-4,yy,8,1,accent);}
        p.ellipse(x,mountY-17,4,3,9);p.rect(x-2,mountY-19,3,1,7);
        });
      }else if(auxiliary==='service gauge')gauge(x,mountY-1,5);
      else if(auxiliary==='receiver dish'){
        outlined(()=>{
        p.line(x,mountY+4,x,mountY-6,9,2);
        dish(p,{x,y:mountY-10,rx:8,ry:4,angle:.4,accent});
        });
      }else{
        outlined(()=>{
        p.rect(x-4,mountY-17,8,22,5);p.rect(x-3,mountY-16,2,20,7);
        for(let yy=mountY-13;yy<mountY+2;yy+=5)p.rect(x-4,yy,8,2,9);
        });
      }
    }
    },{outline:2,color:4,shadow:{x:3,y:3,color:4},exteriorOnly:true});
    return {archetype,shell,equipment,spokeCount,coilPitch,dishAngle,dimensions:{frameWidth,frameHeight,tankHeight,gearRatio},outlinePixels:2,shadowPixels:{x:3,y:3},pipeCornerPixels:1,detail:'rounded pipe elbows, shaded vessels and linked working parts'};
  }
};
