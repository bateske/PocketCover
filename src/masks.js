// Binary selection operations. Widths and offsets are integer device pixels.
// A Euclidean disk gives a cardinal one-pixel border with no square corner
// blocks. Wider strokes expand the original selection once, never its border.
//
// Every operation takes an optional `box` {left,top,right,bottom}: inclusive
// device bounds that contain every set source pixel (a superset is fine; the
// bounds sink of raster.js records one). Loops then run only over that box
// grown by the operation's reach, and the result equals the full-frame result.
// Without a box the whole canvas is scanned.

// Inclusive [x0,y0,x1,y1] of `box` grown by `pad`, clipped to the canvas.
function region(size,box,pad=0) {
  if(!box)return [0,0,size-1,size-1];
  if(box.right<box.left||box.bottom<box.top)return [0,0,-1,-1];
  return [Math.max(0,box.left-pad),Math.max(0,box.top-pad),Math.min(size-1,box.right+pad),Math.min(size-1,box.bottom+pad)];
}

export function outlineMask(source,size,width=1,{exteriorOnly=false,box=null}={}) {
  if(!Number.isInteger(width)||width<0||width>size)throw Error('Outline width must be an integer between zero and the canvas size.');
  const result=new Uint8Array(source.length),offsets=[];
  for(let y=-width;y<=width;y++)for(let x=-width;x<=width;x++)if(x*x+y*y<=width*width)offsets.push([x,y]);
  const [x0,y0,x1,y1]=region(size,box);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(source[y*size+x]){
    for(const [dx,dy] of offsets){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<size&&yy>=0&&yy<size&&!source[yy*size+xx])result[yy*size+xx]=1;}
  }
  if(exteriorOnly){
    // Four-connected background is the dual of eight-connected pixel shapes:
    // diagonal joins close a silhouette without filling its enclosed openings.
    const outside=outsideMask(source,size,{box,pad:width+1}),[a,b,c,d]=region(size,box,width);
    for(let y=b;y<=d;y++)for(let x=a;x<=c;x++)if(!outside[y*size+x])result[y*size+x]=0;
  }
  return result;
}

/** Background pixels four-connected to the canvas border. With a box only the
 * box grown by `pad` (clipped) is flooded and set; pixels beyond it stay 0
 * although they are outside, so read the result only inside that region. The
 * flood seeds from the region's border, which is equivalent to seeding from the
 * canvas border because every source pixel lies inside the box. */
export function outsideMask(source,size,{box=null,pad=1}={}) {
  const outside=new Uint8Array(source.length),[x0,y0,x1,y1]=region(size,box,pad);
  if(x1<x0||y1<y0)return outside;
  const queue=new Int32Array((x1-x0+1)*(y1-y0+1));let head=0,tail=0;
  const add=i=>{if(!source[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}};
  for(let x=x0;x<=x1;x++){add(y0*size+x);add(y1*size+x);}
  for(let y=y0;y<=y1;y++){add(y*size+x0);add(y*size+x1);}
  while(head<tail){
    const i=queue[head++],x=i%size,y=(i-x)/size;
    if(x>x0)add(i-1);if(x<x1)add(i+1);if(y>y0)add(i-size);if(y<y1)add(i+size);
  }
  return outside;
}

// No outline enters this calculation. The source protects itself from shadow.
export function dropShadowMask(source,size,x=2,y=3,{box=null}={}) {
  if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('Shadow offsets must be integer pixels.');
  const result=new Uint8Array(source.length),[x0,y0,x1,y1]=region(size,box);
  for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)if(source[j*size+i]){
    const xx=i+x,yy=j+y;
    if(xx>=0&&xx<size&&yy>=0&&yy<size&&!source[yy*size+xx])result[yy*size+xx]=1;
  }
  return result;
}

/** The integer Bresenham steps from (0,0) to (x,y), excluding (0,0), stepped
 * like raster.js line(). */
export function shadowPath(x,y) {
  if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('Shadow offsets must be integer pixels.');
  const steps=[],dx=Math.abs(x),sx=x<0?-1:1,dy=-Math.abs(y),sy=y<0?-1:1;
  let px=0,py=0,error=dx+dy;
  while(px!==x||py!==y){
    const twice=2*error;if(twice>=dy){error+=dy;px+=sx;}if(twice<=dx){error+=dx;py+=sy;}
    steps.push([px,py]);
  }
  return steps;
}

/** A cast shadow swept along the light: the union of the source shifted to
 * every Bresenham step from (0,0) to (x,y), minus the source. Where a single
 * drop offset detaches the shadow of a steep or thin edge, this stays joined. */
export function sweptShadowMask(source,size,x=2,y=3,{box=null}={}) {
  const steps=shadowPath(x,y),result=new Uint8Array(source.length),[x0,y0,x1,y1]=region(size,box);
  for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)if(source[j*size+i])for(const [dx,dy] of steps){
    const xx=i+dx,yy=j+dy;
    if(xx>=0&&xx<size&&yy>=0&&yy<size&&!source[yy*size+xx])result[yy*size+xx]=1;
  }
  return result;
}

/** Four-neighbour erosion: source pixels whose four neighbours are all source
 * pixels on the canvas. */
export function erodeMask4(source,size,{box=null}={}) {
  const result=new Uint8Array(source.length),[x0,y0,x1,y1]=region(size,box);
  for(let y=Math.max(1,y0);y<=Math.min(size-2,y1);y++)for(let x=Math.max(1,x0);x<=Math.min(size-2,x1);x++){
    const i=y*size+x;
    if(source[i]&&source[i-1]&&source[i+1]&&source[i-size]&&source[i+size])result[i]=1;
  }
  return result;
}

/** Directional bevel classes for the top-left key light: 1 hi, 2 lo, 0 flat.
 * A pixel is lo when its lower neighbour is out and its vertical run of source
 * pixels is at least `min` long, or its right neighbour is out and its
 * horizontal run is at least `min`; hi likewise on the upper and left sides.
 * Lo wins where both apply. Out means not in the source (with `exterior`, in
 * the four-connected outside flood instead, so counters stay flat); off the
 * canvas is out. */
export function bevelMask(source,size,{min=3,exterior=false,box=null}={}) {
  if(!Number.isInteger(min)||min<1)throw Error('Bevel thickness must be a positive integer.');
  const result=new Uint8Array(source.length),[x0,y0,x1,y1]=region(size,box);
  if(x1<x0||y1<y0)return result;
  const outside=exterior?outsideMask(source,size,{box,pad:1}):null;
  const out=(x,y)=>x<0||y<0||x>=size||y>=size||(outside?outside[y*size+x]===1:!source[y*size+x]);
  // Thickness from per-row and per-column runs of material.
  const thickH=new Uint8Array(source.length),thickV=new Uint8Array(source.length);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;){
    if(!source[y*size+x]){x++;continue;}
    let end=x;while(end<x1&&source[y*size+end+1])end++;
    if(end-x+1>=min)for(let k=x;k<=end;k++)thickH[y*size+k]=1;
    x=end+1;
  }
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;){
    if(!source[y*size+x]){y++;continue;}
    let end=y;while(end<y1&&source[(end+1)*size+x])end++;
    if(end-y+1>=min)for(let k=y;k<=end;k++)thickV[k*size+x]=1;
    y=end+1;
  }
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const i=y*size+x;if(!source[i])continue;
    if((thickV[i]&&out(x,y+1))||(thickH[i]&&out(x+1,y)))result[i]=2;
    else if((thickV[i]&&out(x,y-1))||(thickH[i]&&out(x-1,y)))result[i]=1;
  }
  return result;
}

/** Extrusion layers: for each pixel outside the source, the smallest k in
 * 1..depth for which the pixel minus k*(dx,dy) is a source pixel, else 0.
 * With `crumbs`, a lone pixel (no four-neighbour in the layer) is dropped
 * unless it plugs a gap: its neighbour against the vertical direction (above
 * when dy>=0) is source and its neighbour against the horizontal direction
 * (left when dx>=0) is source or layer. Classified on the unchanged layer. */
export function extrudeMask(source,size,dx=1,dy=1,depth=2,{crumbs=true,box=null}={}) {
  if(![-1,0,1].includes(dx)||![-1,0,1].includes(dy)||!(dx||dy))throw Error('Extrusion directions are -1, 0 or 1 and not both zero.');
  if(!Number.isInteger(depth)||depth<1||depth>4)throw Error('Extrusion depth is an integer from 1 to 4.');
  const result=new Uint8Array(source.length),[bx0,by0,bx1,by1]=region(size,box);
  if(bx1<bx0||by1<by0)return result;
  const x0=Math.max(0,bx0+Math.min(0,depth*dx)),x1=Math.min(size-1,bx1+Math.max(0,depth*dx));
  const y0=Math.max(0,by0+Math.min(0,depth*dy)),y1=Math.min(size-1,by1+Math.max(0,depth*dy));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(source[y*size+x])continue;
    for(let k=1;k<=depth;k++){
      const sx=x-k*dx,sy=y-k*dy;
      if(sx>=0&&sx<size&&sy>=0&&sy<size&&source[sy*size+sx]){result[y*size+x]=k;break;}
    }
  }
  if(crumbs){
    const at=(a,x,y)=>x>=0&&y>=0&&x<size&&y<size&&a[y*size+x]!==0;
    const vy=dy<0?1:-1,hx=dx<0?1:-1,drop=[];
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if(!result[y*size+x]||at(result,x-1,y)||at(result,x+1,y)||at(result,x,y-1)||at(result,x,y+1))continue;
      if(at(source,x,y+vy)&&(at(source,x+hx,y)||at(result,x+hx,y)))continue;
      drop.push(y*size+x);
    }
    for(const i of drop)result[i]=0;
  }
  return result;
}
