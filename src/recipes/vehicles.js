import {dither} from '../materials.js';
import {dish as concaveDish} from './dish.js';
import {part} from '../raster.js';
import {preferredVector} from '../geometry.js';

export default {
  id:'vehicles', label:'Vehicles', revision:5, background:'workshop',
  features:['rect','poly','round','line','ellipse','sphere','arc','ring','dot','sample','detail','group'],
  specializedFeatures:['car body grammar','tracked and wheeled armor','parametric pressure hulls'],
  // Varied framing only (composition.adjustPlacement): the long tank hull
  // gets a wider size range than the other archetypes.
  adjustPlacement(placement,traits) {
    if(traits.archetype==='crawler tank')placement.size=.48+(placement.size-.62)/.38*.52;
  },
  render({p,r,pick,variation}) {
    const archetype=pick(['cars','crawler tank','deep sea submarine','lunar rover','cars','crawler tank']);
    const accent=pick([7,10]), equipment=[];
    const facing=r(2)?'right':'left';
    if(facing==='right')p=part(p,{x:128,flipX:true});
    let dimensions,profile,bubbles=0,bubblePattern='none',wheelCount=0;
    const bubbleMarks=[];let dust=null;
    // Some grounded cars and tanks kick dust up behind the rear contact.
    const kicksDust=variation.integer('dust-kick',0,99)<35,dustPuffs=variation.integer('dust-puffs',2,4);
    // One exterior contour belongs to the complete vehicle. The nested hull
    // contours only separate overlapping parts; they cast no extra shadows.
    p.group(p=>{
    const wheel=(x,y,rad=9)=>p.sphere(x,y,rad,(u,v)=>{
      const rr=u*u+v*v;
      if(rr>.48)return 3; // broad tire, restrained metal rim, solid centered axle
      if(rr>.29)return v<-.2?7:9;
      if(Math.abs(u)<.12&&Math.abs(v)<.12)return 7;
      return 5;
    });
    // Every accessory receives its mounting point from the host's dimensions.
    const spoiler=(x,y,width=18,height=12)=>{
      p.group(p=>{
        p.rect(x+width*.3+1,y-height+1,2,height+2,9);
        p.rect(x,y-height-2,width,3,5);p.rect(x,y-height-2,width,1,accent);
      },{outline:1,color:4});
      equipment.push('spoiler');
    };
    const aerial=(x,y,height=17)=>{p.group(p=>{p.line(x+1,y,x+3,y-height,9);p.rect(x+1,y-height-2,4,3,accent);},{outline:1,color:4});equipment.push('aerial');};
    const crate=(x,y,w=15,h=13)=>{p.group(p=>{p.rect(x+1,y-h+1,w-2,h-1,5);p.rect(x+3,y-h+2,w-6,2,7);p.rect(x+w/2-1,y-h+2,2,h-3,9);},{outline:1,color:4});equipment.push('cargo pod');};
    const dish=(x,y,height=21)=>{
      p.group(p=>{
      p.line(x+1,y,x+4,y-height+5,9);
      concaveDish(p,{x:x+3,y:y-height+3,rx:10,ry:5,angle:.4,accent});
      },{outline:1,color:4});equipment.push('survey dish');
    };
    const panelShade=(x,y,w,h)=>{if(w>3&&h>3)dither(p,{x,y,w,h,color:5,density:(xx,yy)=>.12+.34*(yy-y)/h,mask:(xx,yy)=>xx>x+1&&xx<x+w-1&&yy>y+1&&yy<y+h-1});};
    if(archetype==='cars') {
      profile=pick(['sport coupe','boxy sedan','rally hatchback','utility pickup','supercar']);
      const pickup=profile==='utility pickup',hatch=profile==='rally hatchback',supercar=profile==='supercar',sport=profile==='sport coupe'||supercar;
      const length=(hatch?79:supercar?102:91)+r(supercar?10:16),left=64-length/2,bodyY=54+r(4),bodyH=(supercar?10:14)+r(4),right=left+length;
      const cabinW=length*(pickup?.29:hatch?.51:.44),cabinH=(supercar?8:sport?11:16)+r(4),cabX=left+length*.3,roof=bodyY-cabinH;
      const wheelR=7+r(3),axles=[left+length*.19,right-length*.19];wheelCount=2;
      dimensions={length,height:bodyH+cabinH,wheelRadius:wheelR,cabinWidth:cabinW};
      if(sport&&r(3)===0)spoiler(right-16,bodyY+1,16,7);
      // Bonnet, cabin, trunk/bed and modest wheels give the road cars their
      // identity. Profile choices change masses rather than just decals.
      const frontBase=cabX-7,frontRoof=frontBase+preferredVector(cabinH*(sport?2:1),-cabinH)[0];
      const rearBase=pickup?cabX+cabinW+1:hatch?right-7:cabX+cabinW+5,rearRoof=rearBase-(pickup?0:hatch?cabinH/2:sport?cabinH:cabinH/2);
      p.poly([[left,bodyY+5],[left+6,bodyY],[frontBase,bodyY],[frontRoof,roof],[rearRoof,roof],
        [rearBase,bodyY],[right-3,bodyY],[right,bodyY+6],[right-2,bodyY+bodyH],[left+1,bodyY+bodyH]],6);
      p.poly([[left+1,bodyY+bodyH-5],[right-1,bodyY+bodyH-5],[right-2,bodyY+bodyH],[left+1,bodyY+bodyH]],5);
      p.line(left+6,bodyY+1,cabX-7,bodyY+1,7);
      p.line(frontRoof,roof+1,rearRoof-1,roof+1,7);
      p.poly([[frontRoof+1,roof+3],[rearRoof-2,roof+3],[rearBase-3,bodyY-2],[frontBase+4,bodyY-2]],10);
      p.poly([[frontRoof+1,roof+3],[frontRoof+5,roof+3],[frontBase+8,bodyY-3],[frontBase+4,bodyY-3]],7);
      if(!pickup){
        const pillar=(frontRoof+rearRoof)/2;
        p.line(pillar,roof+3,pillar,bodyY-2,6,2);
        p.line(pillar,bodyY+2,pillar,bodyY+bodyH-7,5);
        p.rect(pillar-6,bodyY+3,4,1,9);
      }else{
        p.rect(cabX+cabinW+3,bodyY-1,right-cabX-cabinW-7,3,5);
        p.rect(cabX+cabinW-7,bodyY+3,4,1,9);
        if(r(3)===0)crate(right-24,bodyY,15,8);
      }
      if(sport||hatch){p.rect(left+8,bodyY+5,length-16,2,accent);equipment.push(sport?'low sport body':'short hatch body');}
      dither(p,{x:left+5,y:bodyY+7,w:length-10,h:Math.max(2,bodyH-9),color:5,density:.5});
      if(supercar){p.rect(right-20,bodyY+5,10,2,5);p.rect(right-18,bodyY+8,8,1,5);equipment.push('side air intake');}
      p.rect(left,bodyY+4,6,3,8);p.rect(right-4,bodyY+3,3,4,11);
      p.rect(left,bodyY+bodyH-4,7,2,9);p.rect(right-7,bodyY+bodyH-4,7,2,9);
      for(const x of axles)wheel(x,bodyY+bodyH-1,wheelR);
      if(kicksDust)dust={x:axles[1]+wheelR-2,y:bodyY+bodyH-1+wheelR};
      equipment.push('road tires');
    } else if(archetype==='crawler tank') {
      profile=pick(['light scout','heavy battle tank','siege artillery','rocket carrier']);
      const heavy=profile==='heavy battle tank',siege=profile==='siege artillery',rockets=profile==='rocket carrier';
      const length=(heavy||siege?94:76)+r(14),left=64-length/2,baseY=64,trackH=(heavy?18:14)+r(3);
      const top=baseY-(heavy?17:12),turretW=(heavy?37:siege?33:24)+r(7),tx=64+(siege?10:0)+r(5);
      const barrel=(siege?20:heavy?12:8)+r(siege?49:heavy?42:28),turretY=top-(heavy?20:siege?22:14),wheeled=r(3)===0,count=wheeled?3+r(3):(heavy?6:siege?7:4)+variation.integer('track-rollers',-1,1);wheelCount=count;
      dimensions={length,height:baseY+trackH-turretY,turretWidth:turretW,barrelLength:rockets?0:barrel,chassis:wheeled?'wheeled':'tracked'};
      if(!wheeled){
      p.poly([[left+7,baseY],[left+length-7,baseY],[left+length,baseY+5],[left+length-4,baseY+trackH],
        [left+6,baseY+trackH],[left,baseY+trackH-6],[left,baseY+5]],3);
      p.line(left+9,baseY+2,left+length-9,baseY+2,9,2);
      p.line(left+8,baseY+trackH-2,left+length-6,baseY+trackH-2,9,2);
      for(let i=0;i<count;i++){
        const x=left+10+i*(length-20)/(count-1),y=baseY+trackH/2;
        p.sphere(x,y,trackH*.29,(u,v)=>u*u+v*v>.48?5:9);
      }
      const treadPitch=variation.integer('tread-pitch',6,9);
      for(let x=left+10;x<left+length-8;x+=treadPitch)p.rect(x,baseY+trackH-2,2,2,5);
      }else for(let i=0;i<count;i++)wheel(left+10+i*(length-20)/(count-1),baseY+trackH*.6,trackH*.51);
      if(kicksDust)dust=wheeled?{x:left+length-10+trackH*.51-2,y:Math.round(baseY+trackH*.6+trackH*.51)}:{x:left+length-4,y:baseY+trackH};
      p.poly([[left+1,baseY+2],[left+13,top],[left+length-15,top],[left+length,baseY+2]],6);
      p.line(left+14,top+1,left+length-16,top+1,7,2);
      p.rect(left+8,baseY-2,length-15,4,5);
      dither(p,{x:left+13,y:top+5,w:length-29,h:baseY-top-7,color:5,density:.5});
      const vents=variation.integer('engine-vents',2,4);
      for(let i=0;i<vents;i++)p.rect(left+length-26+i*12/vents,top+3,2,5,5);
      if(rockets){
        // The tilting rectangular launcher gives this family a distinct mass,
        // instead of another gun turret wearing different decals.
        p.rect(tx-9,top-9,18,10,9);
        p.poly([[tx-27,top-24],[tx+21,top-14],[tx+18,top-1],[tx-30,top-11]],5);
        p.poly([[tx-27,top-24],[tx+21,top-14],[tx+17,top-10],[tx-29,top-20]],7);
        p.poly([[tx-27,top-19],[tx+17,top-10],[tx+16,top-4],[tx-28,top-13]],6);
        for(let n=0;n<3;n++)p.rect(tx-29+n*9,top-17+n*2,4,4,4);
        equipment.push('angled rocket rack');
      }else{
        p.poly([[tx-turretW/2,top],[tx-turretW/2+3,turretY+4],[tx-turretW/2+9,turretY],
          [tx+turretW/2-6,turretY],[tx+turretW/2+3,top-4],[tx+turretW/2,top+1]],5);
        p.poly([[tx-turretW/2+8,turretY+2],[tx+turretW/2-7,turretY+2],[tx+turretW/2-2,turretY+8],[tx-turretW/2+6,turretY+8]],6);
        dither(p,{x:tx-turretW/2+6,y:turretY+9,w:turretW-10,h:top-turretY-11,color:6,density:.5});
        const gunX=tx-turretW/2+5,gunY=turretY+(heavy?10:8),tip=gunX-barrel;
        p.rect(tip,gunY,barrel,heavy?6:4,9);p.rect(tip,gunY+(heavy?4:3),barrel,2,5);
        p.rect(tip-2,gunY-1,5,heavy?8:6,5);p.rect(tip-2,gunY+1,2,heavy?4:2,4);
        p.rect(tx-5,turretY-3,12,4,9);p.rect(tx-3,turretY-3,8,1,7);
        p.rect(tx+4,turretY+10,5,3,accent);
        if(siege){p.poly([[left+length-8,baseY-2],[left+length+4,baseY+trackH-1],[left+length-1,baseY+trackH-1],[left+length-13,baseY]],9);equipment.push('rear stabilizer');}
      }
      if(r(3)!==0)aerial(left+length-20,top,11+r(5));
      p.rect(left+10,baseY-5,5,2,8);
      if(heavy){
        for(let x=left+23;x<left+length-20;x+=14){p.rect(x,top+6,10,7,5);p.rect(x,top+6,10,1,9);}
        equipment.push('side armor');
      }
    } else if(archetype==='deep sea submarine') {
      const length=63+r(33),height=33+r(20),cx=61+r(6),cy=53+r(5),rx=length/2,ry=height/2;
      const left=cx-rx,right=cx+rx,top=cy-ry,towerX=cx-8+r(11),towerW=15+r(10),towerY=Math.max(12,top-14-r(4));
      const ports=2+r(length>76?3:2),portR=Math.min(7,Math.floor(length/(ports*3.2)));
      profile=pick(['oval','capsule','faceted']);dimensions={length,height,portCount:ports,towerWidth:towerW};
      // Fins and propeller share the hull's stern; narrow hulls keep their scale.
      p.poly([[right-10,cy-7],[right+6,cy-ry+1],[right+6,cy-2],[right+1,cy+2],[right+7,cy+8],[right+7,cy+ry],[right-11,cy+10]],5);
      p.poly([[right-6,cy-7],[right+3,cy-ry+7],[right+3,cy-2],[right-3,cy+1]],5);
      p.poly([[right-5,cy+5],[right+4,cy+9],[right+4,cy+ry-5],[right-8,cy+8]],6);
      p.line(right+2,cy,right+9,cy,9,3);p.line(right+9,cy-10,right+9,cy+10,4,3);p.line(right+9,cy-8,right+9,cy-3,accent,2);
      p.round(towerX-towerW/2,towerY,towerW,top-towerY+8,3,5);p.rect(towerX-towerW/2+3,towerY+3,towerW-6,top-towerY+3,6);p.rect(towerX-towerW/2+3,towerY+3,3,top-towerY+2,7);
      const scopeY=Math.max(4,towerY-9-r(6));
      p.rect(towerX-3,scopeY+1,5,towerY-scopeY+1,5);p.rect(towerX-2,scopeY+2,2,towerY-scopeY,9);p.rect(towerX-3,scopeY,13,5,5);p.rect(towerX,scopeY+1,8,2,9);p.rect(towerX+8,scopeY,3,6,4);
      const hull=(draw,inset,c,dy=0)=>{
        if(profile==='capsule')draw.round(left+inset,top+inset+dy,length-inset*2,height-inset*2,Math.min(ry-inset,12),c);
        else if(profile==='faceted')draw.poly([[left+inset,cy-4+dy],[left+rx*.3,top+inset+dy],[right-rx*.3,top+inset+dy],[right-inset,cy-5+dy],[right-inset,cy+7+dy],[right-rx*.35,cy+ry-inset+dy],[left+rx*.35,cy+ry-inset+dy],[left+inset,cy+5+dy]],c);
        else draw.ellipse(cx,cy+dy,rx-inset,ry-inset,c);
      };
      p.group(p=>{
      hull(p,0,5);hull(p,5,6,-2);
      dither(p,{x:left+4,y:cy+3,w:length-8,h:ry-5,color:5,density:(x,y)=>.18+.55*(y-cy-3)/ry,mask:(x,y)=>profile==='oval'?((x-cx)/(rx-5))**2+((y-cy)/(ry-5))**2<1:x>left+rx*.35&&x<right-rx*.35&&y<cy+ry-5});
      p.line(left+rx*.45,top+6,right-rx*.4,top+6,7,2);
      },{outline:1,color:4});
      for(let i=0;i<ports;i++){
        const x=cx+(i-(ports-1)/2)*(length*.64/Math.max(1,ports-1));
        // One final-grid disk owns the rim, glass and reflection. Independently
        // rounding three concentric ellipses used to produce uneven circles.
        p.sphere(x,cy-2,portR+2,(u,v,nz,dx,dy,edge)=>{
          const rr=u*u+v*v;
          if(edge)return 4;
          if(rr>.48)return v<-.2?7:9;
          if(u<-.1&&v<.1&&u+v<-.38)return 8;
          return v>.32?11:10;
        });
      }
      const finX=cx+length*.18;
      const finY=cy+ry*.48;
      p.group(q=>{
        q.poly([[finX,finY],[finX+length*.19,finY+3],[finX+length*.08,cy+ry-2],[finX-1,cy+ry-4]],6);
        q.line(finX+2,finY+1,finX+length*.14,finY+3,7);
      },{outline:1,color:4});
      p.rect(left+3,cy-1,4,5,8);p.rect(towerX-5,towerY+4,10,4,4);p.rect(towerX-3,towerY+5,6,2,accent);
      if(r(3)===0){aerial(towerX+towerW/2-3,towerY+3,7);equipment.push('sonar mast');}
      if(r(3)===0){p.line(cx-9,cy+ry-2,cx-13,cy+ry+6,4,3);p.rect(cx-19,cy+ry+4,12,4,9);equipment.push('landing skid');}
      bubbles=2+r(5);bubblePattern=pick(['bow stream','stern stream','rising wake']);
      const lane=bubblePattern==='stern stream'?Math.min(112,right+2):Math.max(12,left+4),startY=Math.max(24,top+2);
      for(let i=0;i<bubbles;i++){
        const rad=2+r(2),y=Math.max(7,startY-i*5),drift=bubblePattern==='rising wake'?i*3:((i%2)*5-i);
        const x=Math.max(9,Math.min(117,lane+(bubblePattern==='stern stream'?-drift:drift)));
        bubbleMarks.push({x,y,rad});
      }
      equipment.push('periscope');
    } else if(archetype==='lunar rover') {
      const length=78+r(24),left=64-length/2,bodyY=48+r(7),bodyH=14+r(7),cabX=left+13+r(10),cabW=25+r(12),cabH=17+r(11),roof=bodyY-cabH;
      const wheelR=8+r(4),count=2+r(3),wheelY=bodyY+bodyH+7;wheelCount=count;
      profile=pick(['survey buggy','cargo buggy','sport buggy']);dimensions={length,height:bodyH+cabH,wheelRadius:wheelR,cabinWidth:cabW};
      for(let i=0;i<count;i++){const x=left+11+i*(length-22)/(count-1);p.line(x,bodyY+bodyH+7,x+(i%2?-7:7),bodyY+bodyH-3,9,4);wheel(x,wheelY,wheelR);}
      const hasSpoiler=r(2)===0;if(hasSpoiler)spoiler(left+length-20,bodyY,16+r(7),9+r(9));
      p.group(p=>{
      p.poly([[left,bodyY+3],[left+12,bodyY-5],[left+length-29,bodyY-5],[left+length-17,bodyY+2],[left+length,bodyY+5],[left+length-1,bodyY+bodyH],[left+5,bodyY+bodyH+2]],5);
      p.poly([[left+5,bodyY+3],[left+14,bodyY-2],[left+length-32,bodyY-2],[left+length-26,bodyY+4],[left+length-34,bodyY+8],[left+8,bodyY+8]],6);
      p.line(left+14,bodyY-2,left+length-34,bodyY-2,7,2);
      },{outline:1,color:4});
      panelShade(left+20,bodyY+8,length-42,bodyH-7);
      p.poly([[cabX,bodyY-3],[cabX+2,roof+4],[cabX+cabW-11,roof],[cabX+cabW,roof+8],[cabX+cabW,bodyY-3]],4);
      p.poly([[cabX+4,bodyY-6],[cabX+5,roof+7],[cabX+cabW-12,roof+4],[cabX+cabW-5,roof+10],[cabX+cabW-5,bodyY-6]],10);
      p.poly([[cabX+5,roof+8],[cabX+11,roof+6],[cabX+11,bodyY-6],[cabX+4,bodyY-6]],8);p.line(cabX+cabW*.5,roof+5,cabX+cabW*.5,bodyY-5,4,2);
      const mount=left+length-27;
      if(profile==='cargo buggy'||r(3)===0)crate(mount-5,bodyY,15,10+r(9));
      if(!hasSpoiler||r(2))dish(mount+2,bodyY+1,24+r(8));else aerial(cabX+cabW-1,roof+10,11+r(5));
      p.rect(left+length-9,bodyY+6,6,4,8);p.rect(left+5,bodyY+3,3,4,11);p.rect(cabX+3,bodyY+8,8,3,accent);
    }
    },{outline:2,color:4,shadow:{x:3,y:3,color:4},exteriorOnly:true});
    // Air bubbles describe water around the hull, so they do not join its
    // silhouette, receive a black outline or cast the vehicle's drop shadow.
    // Dust puffs sit on the ground behind the trailing wheel or track: rounded
    // clusters shrinking away from the vehicle, solid cores with a grey
    // checker rim that fades them into the floor. No outline or shadow.
    if(dust){
      const puffs=[];for(let i=0,cx=dust.x+3,rad=6;i<dustPuffs;i++){puffs.push({cx,cy:dust.y-rad+1,rad});cx+=rad+2;rad=Math.max(2.5,rad-1);}
      p.sample(dust.x-4,dust.y-14,40,15,(a,b)=>{
        if(b>dust.y+.5)return null;
        for(let i=0;i<puffs.length;i++){const {cx,cy,rad}=puffs[i],d=Math.hypot(a-cx,b-cy)/rad;
          if(d<(i===puffs.length-1?.5:.68))return 9;
          if(d<1)return ((Math.floor(a)+Math.floor(b))&1)?13:null;}
        return null;
      });
    }
    for(const {x,y,rad} of bubbleMarks){
      if(rad===2)p.detail(x,y,9,'small rising submarine bubble');else p.ring(x,y,rad,rad,9,1);
    }
    return {archetype,profile,dust:!!dust,dimensions,equipment,wheelCount,bubbles,bubblePattern,facing,outlinePixels:2,shadowPixels:{x:3,y:3},detail:equipment.join(', ')||'layered body panels'};
  }
};
