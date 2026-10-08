import {raster} from '../raster.js';
import {drawFace} from '../face.js';
import {hash,random} from '../random.js';
import {dropShadowMask} from '../masks.js';
import {dither} from '../materials.js';
import {fitComposition} from '../composition.js';
import {cloud} from '../backgrounds.js';
const SIZE=128;
// A small vocabulary of silhouettes and ONE identifying feature per creature.
// These are recipes, not stored artwork or a dictionary of game-title meanings.
const recipes = [
  ['blob','oval','none'], ['bean','bean','none'], ['cube','box','none'],
  ['cloud','cloud','none'], ['droplet','drop','none'], ['star','star','none'],
  ['cat','oval','cat'], ['bunny','oval','long'], ['bear','oval','round'],
  ['fox','bean','cat'], ['puppy','oval','floppy'], ['mouse','bean','round'],
  ['axolotl','oval','gills'], ['frog','oval','eye-bumps'], ['owl','egg','wings'],
  ['whale','bean','tail'], ['dinosaur','bean','spikes'], ['ghost','ghost','none'],
  ['mushroom','mushroom','none'], ['sprout','bean','leaf'], ['robot','box','antenna'],
  ['planet','oval','ring'], ['crystal','crystal','none'], ['cactus','bean','arms'],
];


export default {
  id:'mascot', label:'Mascots', revision:8, background:'legacy',
  features:['ellipse','poly','rect','dot','dropShadowMask'],
  specializedFeatures:['Face fitting (face.js), mascot body masks and legacy landscape'],
  setup({r}) {const [creature,shape,feature]=recipes[r(recipes.length)];return {creature,shape,feature};},
  render({p,r,variation,indices,layout,palette,seedTitle,placement,setup:{creature,shape,feature}}) {
  const landscape=r(4),horizon=55+r(29),skyHorizon=39+r(34),fade=26+r(19),terrain=Array.from({length:9},()=>r(22));
  // A dispersed Bayer pattern blends the same two sky tones across a broad band.
  const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  const sky=(x,y)=>{
    const t=Math.max(0,Math.min(1,(y-skyHorizon+fade/2)/fade));
    return t*t*(3-2*t)>(bayer[(y&3)*4+(x&3)]+.5)/16?1:0;
  };
  if(placement){
    p.rect(0,0,SIZE,SIZE,0);
    dither(p,{x:0,y:0,w:SIZE,h:SIZE,color:1,density:(x,y)=>{
      const t=Math.max(0,Math.min(1,(y-skyHorizon+fade/2)/fade));return t*t*(3-2*t);
    }});
  }else for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)p.dot(x,y,sky(x,y));
  // Clouds have a separate stream so the original creature and face stay the
  // same. Classic framing is the untouched v8 compatibility path.
  const cloudRandom=random(hash('mascot-clouds:1:'+seedTitle)),clouds=!!placement&&cloudRandom(3)===0;
  if(clouds)for(let i=0,n=1+cloudRandom(3);i<n;i++){
    const x=8+cloudRandom(94),y=layout.bottom+8+cloudRandom(17),w=15+cloudRandom(15);
    cloud(p,cloudRandom,x,y,w,2);
  }
  const celestial=r(100)<30?(r(2)?'moon':'sun'):'none',phase=r(7),waxing=!!r(2);
  if(celestial!=='none'){
    const moonX=r(2)?102+r(14):13+r(14),radius=5+r(5),moonY=Math.max(layout.bottom+radius+4,39+r(12));
    const disk=new Uint8Array(SIZE*SIZE);raster(disk).ellipse(moonX,moonY,radius,radius,1);
    for(let y=moonY-radius;y<=moonY+radius;y++)for(let x=moonX-radius;x<=moonX+radius;x++)if(disk[y*SIZE+x]){
      const dx=(x+.5-moonX)/radius*(waxing?1:-1),dy=(y+.5-moonY)/radius;
      const edge=Math.sqrt(Math.max(0,1-dy*dy));
      // The curved terminator spans crescent, quarter, gibbous, and full phases.
      if(celestial==='sun'||phase===6||dx>(.8-phase*.3)*edge)p.dot(x,y,placement?2:9);
    }
  }
  for(let i=0,n=3+r(9);i<n;i++){const x=7+r(114),y=Math.max(layout.bottom+4,35)+r(20);p.dot(x,y,9);}
  for(let x=0;x<SIZE;x++) {
    const i=Math.floor(x/16),t=(x%16)/16,s=landscape===1?t:t*t*(3-2*t);
    const far=horizon+terrain[i]*(1-s)+terrain[i+1]*s;
    p.rect(x,far,1,SIZE-far,2);
    const near=98+Math.round((terrain[i]*(1-t)+terrain[i+1]*t)/3);
    p.rect(x,near,1,SIZE-near,3);
  }
  if(landscape===2)for(let i=0,n=placement?variation.integer('landscape-peaks',5,9):7;i<n;i++){
    const x=r(128),y=82+r(15),h=8+r(13);
    p.poly([[x-6,y+8],[x,y-h],[x+7,y+8]],3);
  }
  if(landscape===3)for(let i=0,n=placement?variation.integer('ground-bands',9,15):12;i<n;i++)p.rect(r(128),106+r(19),4+r(12),1,2);
  else for(let i=0,n=placement?variation.integer('ground-marks',14,22):18;i<n;i++)p.rect(r(128),110+r(15),2+r(3),1,2);

  let cx=43+r(43),cy=82+r(8);
  const rx=23+r(4),ry=22+r(4),requestedScale=.62+r(61)/100,tilt=(r(21)-10)/80;
  const tail=r(100)<20,alien=r(100)<10,tailSide=r(2)?1:-1;
  const starPoints=5+r(12),starDepth=.62+r(17)/100,starTurn=r(100)/100;
  // Fit the actual recipe's envelope, rather than shrinking every body as if
  // it had the tallest ears. Plain blobs can be much bigger than tiny sprites.
  const topExtent=Math.max(ry+3,shape==='drop'?ry+13:shape==='star'?35:shape==='crystal'?ry+7:0,
    ({cat:35,long:39,round:33,floppy:29,'eye-bumps':33,leaf:46,antenna:42})[feature]||0,alien?44:0)+5;
  const bottomExtent=Math.max(ry+6,shape==='star'?35:shape==='cloud'?25:0)+5;
  const sideExtent=Math.max(rx+4,({gills:41,floppy:36,wings:36,ring:42,arms:40,spikes:38,round:34})[feature]||0,
    ['cloud','mushroom','star'].includes(shape)?38:0,(tail||feature==='tail')?rx+17:0)+5;
  let scale=Math.min(requestedScale,(122-layout.bottom-6)/(topExtent+bottomExtent),120/(2*sideExtent));
  cx=Math.max(sideExtent*scale+4,Math.min(124-sideExtent*scale,cx));
  cy=Math.max(layout.bottom+6+topExtent*scale,Math.min(122-bottomExtent*scale,cy));
  if(placement){
    // Rotate the conservative local envelope as well as the geometry. Ears and
    // tails stay inside the frame even at its left/right/top placement extremes.
    const c=Math.cos(tilt),s=Math.sin(tilt),corners=[[-sideExtent,-topExtent],[sideExtent,-topExtent],[-sideExtent,bottomExtent],[sideExtent,bottomExtent]];
    const xs=corners.map(([x,y])=>x*c-y*s),ys=corners.map(([x,y])=>y*c+x*s);
    const bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    const frame=fitComposition(bounds,{x:4,y:layout.bottom+6,width:120,height:117-layout.bottom},placement);
    cx=frame.x;cy=frame.y;scale=frame.scale;
  }
  p.ellipse(cx+2,cy+(ry+5)*scale,(rx+7)*scale,4,4);
  const mask=new Uint8Array(SIZE*SIZE),rearEar=new Uint8Array(SIZE*SIZE),bodyCore=new Uint8Array(SIZE*SIZE);
  let m=raster(mask);
  const pos=(x,y)=>[cx+(x*Math.cos(tilt)-y*Math.sin(tilt))*scale,cy+(y*Math.cos(tilt)+x*Math.sin(tilt))*scale];
  const E=(x,y,a,b,angle=0)=>m.ellipse(...pos(x,y),a*scale,b*scale,1,angle+tilt);
  const P=pts=>m.poly(pts.map(([x,y])=>pos(x,y)),1);
  const R=(x,y,w,h)=>P([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
  if(alien){
    E(3,-28,3,10,-.3);E(7,-37,7,5,.25);
  }
  // Accessories merge into the body mask, keeping the silhouette continuous.
  for(const side of [-1,1]) {
    if(side===-1)m=raster(rearEar);
    // Bury the triangle bases inside the head.
    if(feature==='cat')P([[side*8,-15],[side*19,-33],[side*20,-13]]);
    if(feature==='long')E(side*13,-23,7,14,side*.18);
    if(feature==='round')E(side*19,-20,10,10);
    if(feature==='floppy')E(side*23,-6,8,20,side*-.24);
    m=raster(mask);
  }
  if(feature==='gills')for(const s of [-1,1])for(const dy of [-12,0,12])E(s*28,dy,12,5);
  if(feature==='eye-bumps')for(const s of [-1,1])E(s*15,-20,11,11);
  if(feature==='wings')for(const s of [-1,1])E(s*24,6,10,17);
  if(feature==='spikes')for(let i=0;i<3;i++)E(22+i*3,-12+i*12,9,7);
  if(feature==='leaf'){E(-7,-28,12,6,.25);E(9,-32,6,12,.45);R(-2,-30,4,14);}
  if(feature==='antenna'){R(-2,-35,4,16);E(0,-35,6,5);}
  if(feature==='arms')for(const s of [-1,1]){E(s*28,7,10,6);E(s*33,-1,6,12);}
  if(feature==='ring')E(0,7,40,9,-.2);
  const accessories=mask.slice();mask.fill(0);
  if(shape==='box')P([[-rx+6,-ry],[rx-6,-ry],[rx,-ry+6],[rx,ry-6],[rx-6,ry],[-rx+6,ry],[-rx,ry-6],[-rx,-ry+6]]);
  else if(shape==='cloud'){E(-14,4,17,18);E(0,-8,21,23);E(15,6,17,17);}
  else if(shape==='drop'){E(0,5,rx,ry);P([[-rx+3,0],[5,-ry-13],[rx-2,6]]);}
  else if(shape==='star'){
    const points=[];for(let i=0;i<starPoints*2;i++){
      const a=-Math.PI/2+i*Math.PI/starPoints+starTurn,rad=i%2?34*starDepth:34;
      points.push([Math.cos(a)*rad,Math.sin(a)*rad]);
    }P(points);E(0,0,22,22);
  }
  else if(shape==='crystal')P([[-15,-ry-7],[13,-ry-7],[rx,0],[14,ry],[-14,ry],[-rx,0]]);
  else if(shape==='mushroom'){E(0,8,16,20);E(0,-9,28,20);}
  else if(shape==='ghost'){E(0,-5,rx,ry);R(-rx,-4,rx*2,24);for(const dx of [-17,0,17])E(dx,19,8,8);}
  else if(shape==='bean'){E(-6,5,rx-2,ry);E(6,-8,rx-4,ry-4);}
  else E(0,0,rx,shape==='egg'?ry+5:ry);
  // Face anchors belong to the head primitive, not the combined silhouette.
  // Keep lighting continuous; this only places facial features and texture gaps.
  const headOffset=({bean:[6,-8],mushroom:[0,-9],cloud:[0,-8],ghost:[0,-5],egg:[0,-7],drop:[0,-3],star:[0,0],crystal:[0,-3]})[shape]||[0,-5];
  const [faceCX,faceCY]=pos(...headOffset);
  bodyCore.set(mask); // Occlusion mask only; all body parts share one lighting field.
  // Find the real body edge, including narrow stems and asymmetric beans.
  let tailAnchor=null;
  if(tail||feature==='tail') {
    const side=feature==='tail'?1:tailSide,y=Math.round(cy+9*scale);
    let x=Math.round(cx);
    while(mask[y*SIZE+x+side])x+=side;
    tailAnchor=[x,y];
    const tm=raster(accessories);
    for(const [dx,dy,a,b,angle] of [[-2,0,5,2.8,0],[3,-1,4,2.5,-.3],[6,-3,3,2.3,-.7],[7,-6,2.3,3,0]])
      tm.ellipse(x+side*dx*scale,y+dy*scale,a*scale,b*scale,1,side*angle);
  }
  for(let i=0;i<mask.length;i++)mask[i]|=accessories[i]|rearEar[i];
  if(!['ghost','star','planet','droplet'].includes(creature))for(const s of [-1,1])E(s*13,ry,8,5);

  if(placement){
    const shadow=dropShadowMask(mask,SIZE,2,3);
    for(let i=0;i<mask.length;i++)if(shadow[i])p.dot(i%SIZE,Math.floor(i/SIZE),4);
  }

  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(mask[y*SIZE+x]) {
    const onBody=bodyCore[y*SIZE+x];
    const nx=(x-cx)/(rx*scale),ny=(y-cy)/(ry*scale);
    const light=nx*.28+ny*.4+nx*nx*.22+ny*ny*.16;
    let c=light>.52?5:6;
    if(light>.45&&light<=.52&&(x+y)%4===0)c=5;
    // One pixel of reflected light along the exposed upper-left silhouette,
    // opposite the lower-right shadow. No interior patches or surface marks.
    const i=y*SIZE+x;
    if(c===6&&nx*.28+ny*.4<-.12&&(!mask[i-1]||!mask[i-SIZE]))c=7;
    // Rear ear shade and a one-pixel contact seam establish overlap.
    if(rearEar[y*SIZE+x]&&!onBody)c=5;
    if(onBody&&[-1,1,-SIZE,SIZE].some(d=>rearEar[y*SIZE+x+d]&&!bodyCore[y*SIZE+x+d]))c=5;
    p.dot(x,y,c);
  }
  const face=drawFace(indices,mask,{cx:faceCX,cy:faceCY,scale,shape,headMask:bodyCore,faceColor:palette[6]},random(hash('face:3:'+seedTitle)));

  return {creature,faceCenter:[faceCX,faceCY],tailAnchor,...face,tail,alien,starPoints:shape==='star'?starPoints:null,scale,cx,cy,tilt,font:layout.font,
    landscape,skyHorizon,horizon,celestial,phase:celestial==='moon'?phase:null,waxing,...(placement?{clouds}: {})};
  }
};
