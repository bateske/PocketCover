import {dither} from '../materials.js';
import {sphereUV,orbitBand} from './planet-surfaces.js';

// FEATURE (planets only): all surface markings are inverse-sampled inside the
// same disk. Eye grammar, rectilinear panels and geological faults stay local.
export default {
  id:'planets',label:'Uncharted planets',revision:5,background:'stars',
  features:['sphere','arc','sample','group'],
  specializedFeatures:['spherical terrain','filled multicolor orbital bands','clipped geological faults','variable living eyes','sphere-wrapped machine panels'],
  render({p,r,pick,variation}) {
    // The watchful planet is a rare joke: about one cover in twenty.
    const kind=variation.integer('watchful-planet',0,19)===0?'watchful planet':pick(['ocean world','banded giant','fractured moon','machine world']);
    const cx=60+r(9),cy=43+r(6),radius=kind==='machine world'?30+r(5):22+r(13),phase=r(628)/100;
    const ringed=r(4)!==0,tilt=(r(71)-35)*Math.PI/180,rings=1+r(3);
    const orbitRadius=Math.min(53,radius+13+r(6)),orbitHeight=9+r(8);
    const terrainKind={'ocean world':'ocean','banded giant':'bands','fractured moon':'mineral','watchful planet':'living','machine world':'machine'}[kind];
    const weather=kind==='machine world'||kind==='fractured moon'?'none':pick(['clear','cloud belts','polar ice','swirling storms']);
    const landThreshold=(r(7)-2)*.09,continentScale=4+r(4),bandScale=3+r(4);
    const anomaly=kind==='watchful planet'?'living eyes':kind==='fractured moon'?'faults':kind==='banded giant'||weather==='swirling storms'?'storm':'none';
    const faultStyle=pick(['dark fault','glowing rift']),faultAngle=(r(91)-45)*Math.PI/180,faultWidth=.014+r(4)*.006;
    const faultPaths=[];
    if(kind==='fractured moon') {
      const main=[],segments=variation.integer('fault-vertices',5,9);
      for(let j=0;j<segments;j++) {
        const x=(r(25)-12)/100+(j%2?.07:-.07),y=-.87+j*1.74/(segments-1);
        main.push([x*Math.cos(faultAngle)-y*Math.sin(faultAngle),x*Math.sin(faultAngle)+y*Math.cos(faultAngle)]);
      }
      faultPaths.push(main);
      for(const [branch,t] of [.33,.67].entries())if(r(3)!==0) {
        const [x,y]=main[Math.round((segments-1)*t)],side=branch===0?-1:1;
        faultPaths.push([[x,y],[x+side*(.19+r(10)/100),y-.08],[x+side*(.39+r(8)/100),y+.03]]);
      }
    }
    const craters=[];
    if(kind==='fractured moon')for(let j=0,n=2+r(4);j<n;j++) {
      const a=r(628)/100,d=.35+r(35)/100;
      craters.push({x:Math.cos(a)*d,y:Math.sin(a)*d,rx:.07+r(6)/100,ry:.055+r(4)/100});
    }
    const eyes=[];
    if(kind==='watchful planet') {
      // Exactly one eye, centred on the disk.
      const count=1;
      for(const [x,y]of [[0,0]]) {
        const width=count===1?.48+r(14)/100:count===2?.29+r(5)/100:.25+r(5)/100;
        const height=count===1?.3+r(17)/100:.22+r(7)/100;
        eyes.push({x,y,width,height,rotation:(r(91)-45)*Math.PI/180,
          iris:pick([7,9,10]),pupil:pick(['round','vertical slit','horizontal slit','diamond']),openness:.56+r(45)/100,
          gazeX:(r(17)-8)/100,gazeY:(r(11)-5)/100,irisSize:.66+r(29)/100,sectors:7+r(6)});
      }
    }
    const storm={x:(r(35)-12)/100,y:(r(31)-9)/100,rx:.25+r(12)/100,ry:.11+r(7)/100,turn:(r(51)-25)/100};
    const tile=kind==='machine world'?10+r(4):6+r(5),panelOffsetX=r(tile),panelOffsetY=r(tile),busX=-.3+r(7)*.1,busY=-.25+r(6)*.1;
    const panels=Array.from({length:12*12},()=>({shade:r(3),port:r(kind==='machine world'?9:5)===0,lit:r(3)===0}));
    const positiveMod=(n,m)=>(n%m+m)%m;
    const lightAt=(nx,ny)=>-nx*.45-ny*.3+Math.sqrt(Math.max(0,1-nx*nx-ny*ny))*.6;
    function distanceToFault(x,y) {
      let nearest=10;
      for(const path of faultPaths)for(let j=1;j<path.length;j++) {
        const [ax,ay]=path[j-1],[bx,by]=path[j],dx=bx-ax,dy=by-ay;
        const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
        nearest=Math.min(nearest,Math.hypot(x-ax-t*dx,y-ay-t*dy));
      }
      return nearest;
    }
    function eyeColor(nx,ny,eye) {
      const dx=nx-eye.x,dy=ny-eye.y,c=Math.cos(eye.rotation),s=Math.sin(eye.rotation),u=dx*c+dy*s,v=dy*c-dx*s;
      if(Math.abs(u)>=eye.width)return null;
      const lid=eye.height*eye.openness*Math.sqrt(Math.max(0,1-(u/eye.width)**2));
      if(Math.abs(v)>=lid)return null;
      if(lid-Math.abs(v)<.025)return 5;
      let color=v<0?8:9;
      const ir=eye.height*eye.irisSize,ix=u-eye.gazeX*eye.width,iy=v-eye.gazeY*eye.height;
      const irisLevel=(ix/ir)**2+(iy/ir)**2;
      if(irisLevel<1) {
        color=irisLevel>.77?11:eye.iris;
        if(irisLevel>.28&&irisLevel<.77&&Math.cos(Math.atan2(iy,ix)*eye.sectors)>.35)color=10;
        let pupil;
        if(eye.pupil==='vertical slit')pupil=(ix/(ir*.17))**2+(iy/(ir*.75))**2<1;
        else if(eye.pupil==='horizontal slit')pupil=(ix/(ir*.7))**2+(iy/(ir*.19))**2<1;
        else if(eye.pupil==='diamond')pupil=Math.abs(ix/(ir*.43))+Math.abs(iy/(ir*.64))<1;
        else pupil=(ix/(ir*.39))**2+(iy/(ir*.48))**2<1;
        if(pupil)color=4;
        if(Math.abs(ix+ir*.33)<.037&&Math.abs(iy+ir*.36)<.033)color=8;
      }
      return color;
    }
    function orbit(back) {
      p.group(q=>{
        orbitBand(q,{cx,cy,rx:orbitRadius+.5,ry:orbitHeight+.5,width:4+(rings-1)*3,angle:tilt,bands:rings+1,back});
      },{shadow:{x:1,y:1,color:4}});
    }
    if(ringed)orbit(true);
    p.group(q=>{
      q.sample(cx-radius,cy-radius,radius*2,radius*2,(x,y)=>{
        const xx=x-cx,yy=y-cy,nx=xx/radius,ny=yy/radius,radial=nx*nx+ny*ny;
        if(radial>1)return null;
        const depth=Math.sqrt(Math.max(0,1-radial)),light=lightAt(nx,ny),lon=Math.atan2(nx,depth),lat=Math.asin(ny);
        const terrain=Math.sin(lon*continentScale+phase)*.5+Math.cos(lat*(continentScale+3)-phase)*.35+
          Math.sin(lon*(continentScale+6)+lat*7+phase)*.2;
        let color;
        if(terrainKind==='ocean')color=terrain>landThreshold?(light>.66?7:light>.13?6:5):(light>.65?10:light>.18?11:3);
        else if(terrainKind==='bands') {
          const wave=Math.sin((ny+Math.sin(nx*2+phase)*.12)*bandScale*3+phase);
          color=wave>.5?(light>.5?8:9):wave>-.2?(light>.5?10:11):(light>.5?6:5);
        } else if(terrainKind==='mineral') {
          color=light>.72?8:light>.23?9:5;if(terrain>.4)color=light>.25?7:3;
        } else if(terrainKind==='living')color=terrain>.4?(light>.55?7:5):(light>.65?8:light>.18?6:5);
        else {
          // Keep the rectilinear machinery grammar, but paint it in surface
          // coordinates. Tilted latitude rows bow across the globe and the
          // meridians narrow toward the limb instead of looking like a disk.
          const [surfaceX,surfaceY]=sphereUV(nx,ny,depth,.32+Math.sin(phase)*.18,.12*Math.cos(phase));
          const sx=surfaceX*radius+radius+panelOffsetX,sy=surfaceY*radius+radius+panelOffsetY;
          const gx=Math.floor(sx/tile),gy=Math.floor(sy/tile);
          const u=positiveMod(sx,tile),v=positiveMod(sy,tile),panel=panels[positiveMod(gy,12)*12+positiveMod(gx,12)];
          color=light>.6?(panel.shade===0?7:9):light>.12?(panel.shade===2?6:5):3;
          if(u<1||v<1)color=3;
          if(u>1&&u<2&&v>2&&v<tile-2)color=9;
          if(panel.port&&u>tile*.32&&u<tile*.72&&v>tile*.35&&v<tile*.72)color=panel.lit?10:4;
          if((Math.abs(surfaceX-busX)<.035||Math.abs(surfaceY-busY)<.035)&&depth>.2)color=light>.2?10:11;
          return color;
        }
        if(light<.02)color=3;
        if(weather==='polar ice'&&Math.abs(ny)>.77&&light>.25)color=8;
        if(weather==='cloud belts'&&Math.sin(lon*4+lat*10+phase)+Math.sin(lon*7-lat*4)>1.32&&light>.5&&depth>.25)color=8;
        if(anomaly==='storm') {
          const dx=nx-storm.x,dy=ny-storm.y,c=Math.cos(storm.turn),s=Math.sin(storm.turn),u=(dx*c+dy*s)/storm.rx,v=(dy*c-dx*s)/storm.ry;
          const level=u*u+v*v;
          if(level<1)color=level>.72?11:level>.37?10:level>.11?9:8;
        }
        if(kind==='fractured moon') {
          for(const crater of craters) {
            const u=(nx-crater.x)/crater.rx,v=(ny-crater.y)/crater.ry,level=u*u+v*v;
            if(level<1)color=level>.65&&v<-.2?9:5;
          }
          const distance=distanceToFault(nx,ny);
          if(distance<faultWidth*1.9&&nx<.2)color=light>.35?9:5;
          if(distance<faultWidth)color=faultStyle==='glowing rift'?11:3;
          if(faultStyle==='glowing rift'&&distance<faultWidth*.42)color=10;
        }
        for(const eye of eyes) {const mark=eyeColor(nx,ny,eye);if(mark!==null)color=mark;}
        return color;
      });
      if(terrainKind!=='machine')dither(q,{x:cx-radius,y:cy-radius,w:radius*2,h:radius*2,color:3,
        density:(x,y)=>Math.max(0,Math.min(.5,(.24-lightAt((x-cx)/radius,(y-cy)/radius))*2)),
        mask:(x,y)=>{const nx=(x-cx)/radius,ny=(y-cy)/radius,l=lightAt(nx,ny);return nx*nx+ny*ny<.86&&l<.24&&l>.025&&eyes.every(eye=>eyeColor(nx,ny,eye)===null);}});
    },{shadow:{x:1,y:1,color:4}});
    if(ringed)orbit(false);
    const moonCount=r(4),moonPositions=[];
    const positions=pick([[[19,16],[108,18],[104,79]],[[23,77],[106,15],[17,31]],[[18,18],[108,76],[98,12]]]);
    for(let j=0;j<moonCount;j++) {
      const [ax,ay]=positions[j],size=3+r(4),x=ax+r(5)-2,y=ay+r(5)-2;
      p.group(q=>q.sphere(x,y,size,(nx,ny,nz)=>{
        const light=-nx*.45-ny*.4+nz*.65;
        return light>.86?8:light>.46?9:light>.04?6:5;
      }),{shadow:{x:1,y:1,color:4}});
      moonPositions.push({x,y,radius:size});
    }
    return {...(kind==='machine world'?{sizeRange:{standard:[.9,1],vista:[.76,.78],thirds:[.82,.86]}}:{}),subject:kind,archetype:kind,radius,center:[cx,cy],terrain:terrainKind,weather,anomaly,cities:kind==='machine world',
      eyes:eyes.map(e=>({pupil:e.pupil,iris:e.iris,rotation:Math.round(e.rotation*180/Math.PI),openness:e.openness,width:e.width,height:e.height})),
      eyeCount:eyes.length,faultStyle:kind==='fractured moon'?faultStyle:null,
      satellites:moonCount,moonPositions,rings:ringed?rings:0,ringBands:ringed?rings+1:0,
      ringWidth:ringed?4+(rings-1)*3:0,surfaceProjection:terrainKind==='machine'?'tilted longitude / latitude':'spherical terrain',
      orbitTilt:Math.round(tilt*180/Math.PI),orbitRadius,continentScale};
  }
};
