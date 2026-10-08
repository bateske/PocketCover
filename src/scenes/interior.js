// Interiors and backdrops: workshop, circuit, catacomb, void alcove,
// sunburst and aurora. Wall props stay far (1 and 3 on the 0/1 wall); only
// small lit edges take 2; 9 is kept for flames, lamps and aurora cores.
import {SCENE_TOP,calmMask,ellipseTest,floorPlane,ground,maskSpan,plateaus,ridge,ridgeTops,seamPixel,seamRow,starfield} from './common.js';

const meta=(id,extra={})=>Object.freeze({id,sky:'horizon',titleBand:false,ground:true,foreground:'none',...extra});

// ---- workshop: rails, pipes, shelves, bottles, cabinets and tools ----
// Engine-18 geometry and draws; structure in 3, shadowed volumes in 1.
export function workshop(p,r,ctx) {
  const {top,floor}=ctx,upper=top+6+r(4),leftWidth=23+r(10),rightWidth=23+r(10);
  const rails=3+r(3);
  for(let i=0;i<rails;i++){
    const x=Math.round(6+i*115/(rails-1)+r(5)-2);
    p.line(x,upper,x,floor,1,2);p.rect(x-2,upper+3+r(4),5,3,3);
  }
  p.stroke([[5,floor-8-r(7)],[5,upper],[leftWidth+4,upper],[leftWidth+4,upper+6+r(6)]],3,2);
  p.stroke([[123,floor-12-r(7)],[123,upper+4],[124-rightWidth,upper+4],[124-rightWidth,upper+11+r(5)]],3,2);
  for(const [x,w]of [[3,leftWidth],[125-rightWidth,rightWidth]]) {
    const shelf=Math.min(floor-13,upper+17+r(12)),bottles=2+r(3),pitch=(w-6)/bottles;
    p.rect(x,shelf,w,2,3);p.rect(x,shelf,w,1,2);p.line(x+3,shelf+2,x+3,shelf+7,1);p.line(x+w-4,shelf+2,x+w-4,shelf+7,1);
    for(let j=0;j<bottles;j++) {
      const bx=Math.round(x+3+j*pitch),h=5+r(8),bw=Math.max(3,Math.floor(pitch)-2);
      p.rect(bx,shelf-h,bw,h,1);p.rect(bx,shelf-h,bw,2,3);p.line(bx+1,shelf-h+3,bx+bw-2,shelf-h+3,3);
    }
    const cabinetY=Math.max(upper+18,floor-21),cabinetH=floor-cabinetY;
    if(cabinetH>5){p.rect(x+3,cabinetY,w-6,cabinetH,1);p.line(x+3,cabinetY,x+w-4,cabinetY,3);
      const drawerPitch=5+r(4);
      for(let y=cabinetY+4;y<floor-3;y+=drawerPitch){p.line(x+5,y,x+w-6,y,3);p.line(Math.round(x+w*.4),y-2,Math.round(x+w*.6),y-2,3);}}
  }
  const tools=2+r(4);
  for(let j=0;j<tools;j++) {
    const x=Math.round(43+j*40/(tools-1)),y=upper+3+r(4),len=5+r(7);
    p.line(x,y,x,y+len,1,2);p.poly([[x-3,y-2],[x-2,y+2],[x+2,y+2],[x+3,y-2],[x+1,y],[x-1,y]],3);
  }
  if(r(2)) {const x=r(2)?18:110,y=Math.max(upper+6,floor-30);p.ring(x,y,6,6,3,2);p.line(x-7,y,x+7,y,1);p.line(x,y-7,x,y+7,1);}
  ground(p,r,floor,true,{fill:3,edge:2,lines:1});
  return {floor};
}
workshop.meta=meta('workshop',{foreground:'girders',midFloor:true});

// ---- circuit: a far ridge, kerbs and a dark road with lane marks ----
// The road is 1 (never 0: one vignette step would ink it), lit 3 in a band
// through the subject's contact row (floorPlane), with lane marks of 3 on
// the dark part in front.
export function circuit(p,r,ctx) {
  const {top,floor,variation}=ctx,roadTop=Math.max(top+15,floor-16);
  ridge(p,r,roadTop-5,3,6,26,{rim:2,top:top+SCENE_TOP,sky:ctx.skyHorizon});
  floorPlane(p,roadTop,floor);
  p.line(0,roadTop-4,127,roadTop-4,2);p.rect(0,roadTop-3,128,1,1);
  const curb=variation.integer('curb-block',5,9),dash=variation.integer('lane-dash',10,19),gap=variation.integer('lane-gap',10,18),phase=r(gap);
  for(let x=-phase;x<128;x+=curb*2){p.rect(x,roadTop-2,curb,3,2);p.rect(x+curb,roadTop-2,curb,3,1);}
  for(let x=phase;x<128;x+=dash+gap)p.rect(x,Math.min(124,floor+7),dash,2,3);
  return {floor:roadTop};
}
circuit.meta=meta('circuit');

// ---- catacomb: masonry panels, an arch, torches and bats ----
// With ctx.titleBand (dungeons) the far wall may rise beside and behind the
// title; for every other style the arch top stays at or below top+3. The
// title keeps a calm margin (calmMask: its calm zone grown by 2, so about 5
// px round the lettering): there the wall is flat 1, the arch moves out
// along the wall (or narrows, or drops below the title), torches drop or go
// out, bats stay away, and masonry joints stop short of it.
function torch(p,ctx,tx,ty,glow,flame,lean) {
  plateaus(p,ctx,tx,ty,glow,glow+2,[[1,1],[.55,3]],{minY:ctx.titleBand?0:ctx.top+SCENE_TOP});
  p.rect(tx-2,ty+6,5,5,3);p.line(tx,ty+3,tx,ty+9,2,2);
  p.poly([[tx-3,ty+3],[tx-3,ty-1],[tx-1+lean,ty-flame+1],[tx,ty-2],[tx+2+lean,ty-flame],[tx+3,ty],[tx+2,ty+4],[tx-1,ty+5]],2);
  p.poly([[tx-1,ty+3],[tx-1,ty],[tx+1,ty-2],[tx+1,ty+3]],9);
}
// The arch's centre and half-width clear of the calm margin: moved outward
// along the wall, then narrowed to 7, else dropped below the margin.
function placeArch(busy,cx,width,archTop,height,side) {
  const span=maskSpan(busy,archTop,archTop+height);
  if(!span)return {cx,width,archTop};
  for(let w=width;w>=7;w--){
    const c=side?Math.max(cx,span.right+3+w):Math.min(cx,span.left-3-w);
    // Clear of the panels' 3-column fade at the frame edges as well.
    if(c-w>=6&&c+w<=121)return {cx:c,width:w,archTop};
  }
  const own=maskSpan(busy,0,127,cx-width-2,cx+width+2);
  return {cx,width,archTop:own?Math.max(archTop,own.bottom+1):archTop};
}
function catacombWall(p,r,ctx) {
  const top=ctx.top,draw=r(17),wallTop=ctx.titleBand?Math.max(3,top-20+draw):top+SCENE_TOP+(draw>>1);
  const height=37+r(14),side=r(2),cx0=side?109+r(5):15+r(5);
  const width0=9+r(5),shoulder=7+r(4),brickHeight=6+r(4),brickWidth=11+r(6);
  const panels=[[2,25+r(6)],[99-r(3),27+r(3)]];r(4);
  const busy=calmMask(ctx,2,wallTop+height+12),free=(x,y)=>!busy||x<0||x>127||y<0||y>127||!busy[y*128+x];
  const clear=(x0,y0,x1,y1)=>!maskSpan(busy,y0,y1,x0,x1);
  const {cx,width:archWidth,archTop}=busy?placeArch(busy,cx0,width0,wallTop,height,side):{cx:cx0,width:width0,archTop:wallTop};
  // Panels fade into the dark at both sides through a 3-column seam; the
  // masonry joints stop short of it, of the arch drawn over the panel and of
  // the calm margin, and a joint run shorter than 3 px is left out, so no
  // joint pixel is left stranded.
  const archLeft=cx-archWidth-2,archRight=cx+archWidth+2;
  const run=(u,v,y)=>{
    for(let x=u;x<=v;){
      if(!free(x,y)){x++;continue;}
      let e=x;while(e+1<=v&&free(e+1,y))e++;
      if(e-x>=2)p.line(x,y,e,y,3);
      x=e+1;
    }
  };
  const joint=(a,b,y)=>{
    for(const [u,v] of [[a,Math.min(b,archLeft-1)],[Math.max(a,archRight+1),b]])if(v-u>=2)run(u,v,y);
  };
  for(const [x,w]of panels){
    p.rect(x,wallTop+4,w,height+4,1);
    for(let k=0;k<3;k++)for(const col of [x+k,x+w-1-k])
      p.sample(col,wallTop+4,1,height+4,(px,py)=>seamPixel(Math.floor(py),3-k)&&free(col,Math.floor(py))?0:null);
    for(let row=0;row<Math.ceil(height/brickHeight);row++){
      const y=wallTop+5+row*brickHeight;joint(x+3,x+w-4,y);
      for(let bx=Math.round(x+4+(row%2)*brickWidth/2);bx<x+w-4;bx+=brickWidth)
        if(bx>x+3&&(bx<archLeft||bx>archRight)&&clear(bx,y+1,bx,y+brickHeight-2))p.line(bx,y+1,bx,y+brickHeight-2,3);
    }
  }
  const bottom=archTop+height,inner=archWidth-5;
  p.poly([[cx-archWidth,bottom],[cx-archWidth,archTop+shoulder],[cx-archWidth+3,archTop+3],[cx-3,archTop],[cx+3,archTop],[cx+archWidth-3,archTop+3],[cx+archWidth,archTop+shoulder],[cx+archWidth,bottom]],2);
  p.poly([[cx-inner,bottom],[cx-inner,archTop+shoulder+1],[cx-3,archTop+6],[cx+3,archTop+6],[cx+inner,archTop+shoulder+1],[cx+inner,bottom]],0);
  p.rect(cx-2,archTop+1,4,4,3);
  for(const s of [-1,1]){
    p.line(cx+s*(archWidth-4),archTop+5,cx+s*(archWidth-2),archTop+7,1);
    for(let y=archTop+shoulder+4;y<bottom;y+=brickHeight)p.line(cx+s*(inner+1),y,cx+s*(archWidth-1),y,1);
  }
  const torches=r(3)?[6+r(4),117+r(5)]:[side?7+r(4):117+r(5)];
  for(const tx of torches){
    let ty=wallTop+11+r(12);
    const glow=6+r(3),flame=4+r(4),lean=r(3)-1;
    // A torch in the calm margin moves down the wall below it, or goes out.
    const own=maskSpan(busy,0,127,tx-glow-2,tx+glow+2);
    if(own)ty=Math.max(ty,own.bottom+glow+4);
    if(own&&(ty+11>wallTop+height+6||!clear(tx-glow-2,ty-glow-3,tx+glow+2,ty+11)))continue;
    torch(p,ctx,tx,ty,glow,flame,lean);
  }
  const bats=1+r(2);
  for(let i=0;i<bats;i++){
    const bx=(side?29:97)+(i*10-3)*(side?1:-1),by=archTop+6+r(9),span=4+r(4),sweep=1+r(3);
    if(!clear(bx-span,by-sweep,bx+span,by+3))continue;
    p.poly([[bx-span,by-sweep],[bx-2,by],[bx-1,by+1],[bx,by-1],[bx+1,by+1],[bx+2,by],[bx+span,by-sweep],[bx+span-2,by+2],[bx+2,by+2],[bx,by+3],[bx-2,by+2],[bx-span+2,by+2]],3);
  }
}
// The cellar floor under the subject: a lit flagstone ellipse of 3 with a
// worn hollow of 1 (engine 18), shared by the three wall scenes.
function cellarFloor(p,ctx) {
  const {bounds,top,centerX,subjectWidth}=ctx;
  if(bounds){
    const sy=Math.max(top+12,Math.min(123,bounds.bottom+2)),rx=Math.max(8,Math.min(58,centerX-2,126-centerX,subjectWidth*.58)),ry=Math.max(3,Math.min(9,subjectWidth*.075));
    p.ellipse(centerX,sy,rx,ry,3);p.ellipse(centerX,sy+2,rx*.76,ry*.56,1);
    return {floor:sy};
  }
  p.ellipse(64,115,58,9,3);p.ellipse(64,117,44,5,1);
  return {floor:115};
}
export function catacomb(p,r,ctx) {
  catacombWall(p,r,ctx);
  return cellarFloor(p,ctx);
}
catacomb.meta=meta('catacomb',{titleBand:true,foreground:'rubble'});

// The top row of a dungeon backdrop: with the title band (dungeon rooms)
// the far wall rises beside and behind the title, otherwise it starts at
// or below top+3.
const wallTop=(ctx,draw)=>ctx.titleBand?Math.max(3,ctx.top-20+draw):ctx.top+SCENE_TOP+(draw>>1);

// ---- crypt: smooth ashlar walls lined with burial niches, a lintel door ----
// Flat wall slabs of 1 (lit 3 on the face that looks toward the key light),
// a plinth and cornice course in 3, rows of niches (0 recesses on a 3 sill)
// holding skulls or candles (a 9 flame), and on one side a doorway with
// 3 jambs under a 3 lintel lit 2 on top. Nothing busy lies in the calm
// margin round the title (calmMask): there the slab stays flat.
const SKULL=['.333.','30303','33333','.3.3.'];
export function crypt(p,r,ctx) {
  const v=ctx.variation,top=wallTop(ctx,v.integer('crypt-top',0,16)),height=v.integer('crypt-height',40,54);
  const busy=calmMask(ctx,2,top+height+12),clear=(x0,y0,x1,y1)=>!maskSpan(busy,y0,y1,x0,x1);
  const doorSide=v.integer('crypt-door-side',0,1),rowH=v.integer('crypt-row',8,10),nicheW=v.integer('crypt-niche-w',7,9);
  const doorW=v.integer('crypt-door-w',9,12),doorH=Math.min(height-12,v.integer('crypt-door-h',22,30));
  const widths=[v.integer('crypt-left',24,32),v.integer('crypt-right',24,32)];
  for(let i=0;i<2;i++){
    const w=widths[i],x=i?126-w:2,y0=top+2,y1=top+height;
    p.rect(x,y0,w,height-2,1);
    // The right slab's left face looks toward the key light.
    if(i===1)p.rect(x,y0,1,height-2,3);
    // A cornice course under the ceiling and a plinth at the foot.
    p.rect(x,y0,w,1,3);p.rect(x,y1-2,w,2,3);p.rect(x,y1-2,w,1,2);
    // The doorway stands on the slab's inner side; niches fill the rest.
    const door=i===doorSide,dx=i?x+3:x+w-doorW-3,dy=y1-2-doorH;
    for(let row=0,y=top+6;y+6<y1-3;row++,y+=rowH){
      for(let nx=x+3+((row&1)?2:0),k=0;nx+nicheW<=x+w-3;nx+=nicheW+3,k++){
        if(door&&y+6>=dy-4&&nx+nicheW>=dx-3&&nx<=dx+doorW+3)continue;
        if(!clear(nx-1,y-1,nx+nicheW,y+6))continue;
        p.rect(nx,y,nicheW,5,0);p.rect(nx-1,y+5,nicheW+2,1,3);
        const what=v.integer('crypt-niche-'+i+'-'+row+'-'+k,0,5);
        if(what<=1)p.stamp(nx+((nicheW-5)>>1),y+1,SKULL,{3:3,0:0},{anchor:'topleft'});
        else if(what===2){const cx=nx+(nicheW>>1);p.rect(cx,y+3,1,2,3);p.rect(cx,y+1,1,2,9);}
      }
    }
    if(door&&clear(dx-3,dy-4,dx+doorW+3,dy+doorH)){
      p.rect(dx-2,dy,doorW+4,doorH,3);p.rect(dx,dy,doorW,doorH,0);
      p.rect(dx-3,dy-3,doorW+6,3,3);p.rect(dx-3,dy-3,doorW+6,1,2);
      p.rect(dx-2,dy,1,doorH,2);
    }
  }
  return cellarFloor(p,ctx);
}
crypt.meta=meta('crypt',{sky:'none',titleBand:true,foreground:'rubble'});

// ---- cavern: rough rock walls, stalactites and glowing crystals ----
// The side walls are heightfields turned on their side (ridgeTops: clean
// faces of 1:2 to 1:4), rock of 1 with a lit 3 face on the right wall (it
// looks toward the key light). A ceiling band of 1 hangs stalactites lit 3
// on their left; crystal clusters (2, a 9 lit facet, a 3 shadow facet)
// stand on the wall feet. Stalactites and crystals keep out of the calm
// margin round the title.
function crystal(p,x,y,h,lean) {
  // A prism 3 wide with a pointed top, leaning 1:2 or upright.
  for(let k=0;k<h;k++){
    const yy=y-k,xx=x+Math.trunc(k*lean/2);
    if(k===h-1){p.dot(xx+1,yy,9);continue;}
    p.dot(xx,yy,9);p.dot(xx+1,yy,2);p.dot(xx+2,yy,3);
  }
}
export function cavern(p,r,ctx) {
  const v=ctx.variation,top=wallTop(ctx,v.integer('cavern-top',0,16));
  const busy=calmMask(ctx,2,127),clear=(x0,y0,x1,y1)=>!maskSpan(busy,y0,y1,x0,x1);
  const left=ridgeTops(r,v.integer('cavern-left',22,32),18,16),right=ridgeTops(r,v.integer('cavern-right',22,32),18,16);
  const ceiling=top+v.integer('cavern-ceiling',2,4);
  for(let y=top;y<128;y++){
    if(y<=ceiling){p.rect(0,y,128,1,1);continue;}
    const wl=left.tops[y],wr=right.tops[y];
    p.rect(0,y,wl,1,1);p.rect(128-wr,y,wr,1,1);
    if(clear(128-wr,y,128-wr,y))p.dot(128-wr,y,3);
  }
  // Two bold ledges per wall (a lit 3 top over a 2 lip) instead of many
  // thin strata, so each wall reads as one rock face with a clear shelf.
  for(let k=0;k<2;k++){
    const y=ceiling+18+k*v.integer('cavern-ledge-gap',26,36)+v.integer('cavern-ledge-y'+k,0,6);
    if(y>120)break;
    const len=v.integer('cavern-ledge'+k,6,10),wl=left.tops[y],wr=right.tops[y];
    if(wl>len+1&&clear(wl-len,y,wl-1,y+1)){p.rect(wl-len,y,len,1,3);p.rect(wl-len,y+1,len-1,1,2);}
    if(wr>len+1&&clear(128-wr,y,127-wr+len,y+1)){p.rect(128-wr,y,len,1,3);p.rect(129-wr,y+1,len-1,1,2);}
  }
  const drops=v.integer('cavern-drops',4,7);
  for(let i=0;i<drops;i++){
    const x=Math.round(14+i*100/drops+v.integer('cavern-drop-x'+i,0,8)),half=v.integer('cavern-drop-w'+i,1,3),len=v.integer('cavern-drop-len'+i,5,14);
    if(!clear(x-half-1,ceiling,x+half+1,ceiling+len+1))continue;
    // Clean slopes: the half-width shrinks by one every len/(half+1) rows.
    for(let k=0;k<len;k++){
      const hw=Math.max(0,half-Math.floor(k*(half+1)/len)),y=ceiling+1+k;
      p.rect(x-hw,y,2*hw+1,1,1);p.dot(x-hw,y,3);
    }
  }
  const clusters=v.integer('cavern-clusters',1,3),first=v.integer('cavern-cluster-side',0,1);
  for(let i=0;i<clusters;i++){
    const side=(i+first)&1,y=v.integer('cavern-cluster-y'+i,96,116);
    const x=side?128-right.tops[y]-7:left.tops[y]+1;
    if(!clear(x-3,y-12,x+9,y+1))continue;
    crystal(p,x,y,v.integer('cavern-crystal-h'+i,7,12),side?-1:1);
    crystal(p,x+3,y,v.integer('cavern-crystal-k'+i,5,9),0);
  }
  return cellarFloor(p,ctx);
}
cavern.meta=meta('cavern',{sky:'none',titleBand:true,foreground:'rocks'});

// ---- void: an engraved alcove (arch niche, pilasters or a plinth) ----
// The radial screen-door glow of engine 18 is gone (the stage pass lights
// the subject). The niche is a recess of 1 with a 0 shadow line along its
// inner upper-left edge; pilasters are lit on their left edge.
export function alcove(p,r,ctx) {
  const {top,bounds,centerX,subjectWidth}=ctx;
  const frame=r(3),left=13+r(9),right=128-left,base=108+r(7),shoulder=10+r(7),rise=6+r(4);
  if(frame===0){
    const path=[[left,base],[left,top+rise+shoulder],[left+shoulder,top+rise],[right-shoulder,top+rise],[right,top+rise+shoulder],[right,base]];
    p.poly(path,1);
    p.stroke([[left+2,base],[left+2,top+rise+shoulder+1],[left+shoulder+1,top+rise+2],[right-shoulder-1,top+rise+2]],0);
    p.stroke(path,3,2);
    p.rect(left-4,base+3,right-left+9,1,2);p.rect(left-4,base+4,right-left+9,2,3);
  }
  else if(frame===1){
    const pitch=13+r(9);
    for(const x of [left,right]){
      p.rect(x-1,top+13,3,base-top-16,3);p.line(x-1,top+13,x-1,base-4,2);
      for(let y=top+16;y<base-5;y+=pitch){p.rect(x-2,y,5,3,3);p.rect(x-2,y,5,1,2);}
    }
    p.line(left,base,right,base,3);
  }
  else if(bounds){
    const sy=Math.max(top+10,Math.min(123,bounds.bottom+2)),rx=Math.max(9,Math.min(44,centerX-2,126-centerX,subjectWidth*.56)),ry=Math.max(3,Math.min(6,subjectWidth*.075));
    p.ellipse(centerX,sy,rx,ry,3);p.ellipse(centerX,sy-1,rx*.84,Math.max(2,ry*.5),2);
  }else{p.ellipse(64,113,44,6,3);p.ellipse(64,112,37,3,2);}
  return {floor:base};
}
alcove.meta=meta('void');

// ---- sunburst: alternating wedges on whole-ratio boundaries ----
// 16 boundaries on clean slopes (0, 1/2, 1, 2 and their mirrors), tested
// with integer cross products: an angleBucket with clean edges. Unlit
// wedges are flat 0 everywhere. Each lit wedge is a ray of 3 out to its own
// length, alternating long and short (a compass star), then it ends in a
// plateau: flat 1 out to the frame, or, on a bounded badge, the 0 field.
// A solid 5 px hub of 3, behind the subject's centre, holds the point where
// the wedges meet. There is no inner disc, sun disc or rim and no checker
// seam: every other value step runs along a wedge edge or across one wedge,
// so no ring is shared by neighbouring wedges and nothing reads as a target
// round the subject (the stage adds no pool over a radial scene). Bright ray parts stay 4 rows
// clear of the title's calm zone; within 3 rows of the scene top a lit
// wedge is 1; calm pixels are never painted.
const RAYS=[[1,0],[2,1],[1,1],[1,2],[0,1],[-1,2],[-1,1],[-2,1],[-1,0],[-2,-1],[-1,-1],[-1,-2],[0,-1],[1,-2],[1,-1],[2,-1]];
export function rayBucket(dx,dy) {
  for(let k=0;k<16;k++){
    const [ax,ay]=RAYS[k],[bx,by]=RAYS[(k+1)&15];
    if(ax*dy-ay*dx>=0&&bx*dy-by*dx<0)return k;
  }
  return 0;
}
/** The bright length of each of the 16 wedges (0 for unlit ones): short
 * and long alternate over the lit wedges; a wedge whose upper edge would
 * carry its bright part above row `quiet` is shortened to end there. */
export function rayLengths(cx,cy,parity,stagger,short,long,quiet) {
  const out=new Float64Array(16);
  for(let k=0;k<16;k++){
    if(((k+parity)&1)!==1)continue;
    let L=((k>>1)+stagger)&1?short:long;
    for(const [ux,uy] of [RAYS[k],RAYS[(k+1)&15]])if(uy<0)L=Math.min(L,(cy-quiet)*Math.hypot(ux,uy)/-uy);
    out[k]=Math.max(0,L);
  }
  return out;
}
export function sunburst(p,r,ctx) {
  const v=ctx.variation,b=ctx.bounds,top=ctx.top+SCENE_TOP;
  const cx=b?Math.round((b.left+b.right+1)/2):64,cy=b?Math.round((b.top+b.bottom+1)/2):Math.round((ctx.top+128)/2);
  const parity=v.integer('sunburst-parity',0,1),stagger=v.integer('sunburst-stagger',0,1);
  const short=Math.round(v.wild('sunburst-inner',26,36,36,50)),long=short+v.integer('sunburst-long',10,18);
  // Either a bounded badge (its long rays end at the title band) or rays out
  // to the frame.
  const bounded=v.chance('sunburst-bounded',.35);
  const reach=bounded?Math.max(short+10,cy-top+v.integer('sunburst-reach',-2,6)):long;
  const quiet=Math.max(top+3,Math.ceil(ctx.extent??ctx.top)+7);
  const lengths=rayLengths(cx,cy,parity,stagger,Math.min(short,reach),Math.min(long,reach),quiet);
  const L2=Array.from(lengths,L=>Math.floor((2*L)**2));
  const far=bounded?0:1,HUB=(2*5)**2;
  p.sample(0,top,128,128-top,(px,py)=>{
    const X=Math.floor(px),Y=Math.floor(py);
    if(ctx.calm&&ctx.calm(X,Y))return null;
    const dx=2*X+1-2*cx,dy=2*Y+1-2*cy,d=dx*dx+dy*dy;
    // A solid hub where the 16 wedges would converge to 1 px tips.
    if(d<HUB)return Y<top+3?1:3;
    const k=rayBucket(dx,dy);
    if(((k+parity)&1)!==1)return 0;
    if(d>=L2[k])return far;
    return Y<top+3?1:3;
  });
  return {horizon:null};
}
sunburst.meta=meta('sunburst',{sky:'none',ground:false});

// ---- aurora: sine ribbons of 2 (one with a 9 lower edge) over dark peaks ----
const SIN64=Int16Array.from({length:64},(_,i)=>Math.round(256*Math.sin(Math.PI*i/32)));
/** One period of a clean-stepped wave, as row offsets in [-amp, amp] from
 * the trough. The rising half takes the SIN64 table's own run lengths,
 * sorted so they shrink toward the middle and grow toward both crests (the
 * table's rounding alone gives runs like 4,3,2,3,2,3); the falling half is
 * its mirror. A ribbon edge that follows it never jags. */
export function waveRows(period,amp) {
  const H=period>>1,raw=[];
  for(let c=0;c<H;c++)raw.push((amp*SIN64[((c*64/period|0)+48)&63]+128)>>8);
  const runs=[];
  for(let c=1,n=1;c<=H;c++){if(c<H&&raw[c]===raw[c-1])n++;else{runs.push(n);n=1;}}
  const sorted=[...runs].sort((u,w)=>w-u),order=new Array(runs.length);
  for(let i=0,lo=0,hi=runs.length-1;i<sorted.length;i++)if(i&1)order[hi--]=sorted[i];else order[lo++]=sorted[i];
  const table=new Int16Array(period);
  for(let i=0,c=0,level=raw[0];i<order.length;i++,level++)for(let j=0;j<order[i];j++,c++){table[c]=level;table[period-1-c]=level;}
  return table;
}
export function aurora(p,r,ctx) {
  const v=ctx.variation,top=ctx.top+SCENE_TOP,horizon=ctx.horizon??90;
  starfield(p,r,ctx,12+r(10),(x,y)=>y>=horizon-2);
  const ribbons=v.integer('aurora-ribbons',2,3),lead=v.integer('aurora-lead',0,ribbons-1);
  for(let k=0;k<ribbons;k++){
    const amp=Math.round(v.wild('aurora-amp'+k,2,6,6,10)),period=v.pick('aurora-period'+k,[64,96,128]),phase=v.integer('aurora-phase'+k,0,63);
    const thick=v.integer('aurora-thick'+k,2,3),base=top+10+k*Math.max(8,Math.floor((horizon-top-26)/ribbons))+v.integer('aurora-y'+k,0,4);
    const x0=v.integer('aurora-x0'+k,-20,30),x1=v.integer('aurora-x1'+k,96,148);
    const body=k===lead?2:3,edge=k===lead?9:2,curtain=k===lead?3:1;
    // The band from its top: two curtain rows (the darker tone: the falloff
    // into the sky, solid, no seam row), the body, then the lit lower edge.
    const wave=waveRows(period,amp),shift=Math.round((phase-48)*period/64),full=thick+2;
    for(let x=Math.max(0,x0);x<=Math.min(127,x1);x++){
      const y=base+wave[(((x+shift)%period)+period)%period],yTop=y-full+1;
      // Tapered ends: the band grows from its top, a row every 3 columns, so
      // a ribbon ends in curtain-tone wisps, never in a flat bright line.
      const h=Math.min(full,1+Math.floor(Math.min(x-x0,x1-x)/3));
      for(let j=0;j<h;j++){
        const yy=yTop+j,c=j<2?curtain:j<full-1?body:edge;
        if(yy>=top&&yy<horizon-1&&!(ctx.calm&&ctx.calm(x,yy)))p.dot(x,yy,c);
      }
    }
  }
  // Dark peaks against the lower sky, moonlit (3) on their light-facing slopes.
  ridge(p,r,Math.min(124,horizon+v.integer('aurora-peaks',14,26)),0,v.integer('aurora-peak-h',10,18),20,{rim:3,top});
  return {};
}
aurora.meta=meta('aurora',{ground:false});

export const INTERIOR_SCENES=Object.freeze({workshop,circuit,catacomb,crypt,cavern,void:alcove,sunburst,aurora});
