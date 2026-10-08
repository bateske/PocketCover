import {raster} from './raster.js';

// Match the pair's pixel contours; derive their proportions from the head.
export function drawFace(pixels,body,{cx,cy,scale,shape,headMask=body,faceColor=0x4466aa},r) {
  // Linear-light luminance catches yellows, lime and pale high-key colors.
  // HSV value alone cannot distinguish bright yellow from saturated blue.
  const linear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
  const brightness=.2126*linear(faceColor>>>16)+.7152*linear((faceColor>>>8)&255)+.0722*linear(faceColor&255);
  const p=raster(pixels),style=r(100),eyes=brightness>=.78||style<70?'black':'ivory',mouth=['neutral','happy','smirk','grin','small-smile'][r(5)];
  const size=r(100),eyeSize=size<20?'tiny':size>=80?'large':'regular';
  const eyeY=Math.round(cy-4*scale);
  // Sample only the uninterrupted central head, excluding ears and tails.
  // A median of three rows avoids one star tip changing the face proportions.
  const spans=[-3,0,3].map(offset=>{
    const y=eyeY+Math.round(offset*scale),x=Math.round(cx);let left=x,right=x;
    while(left>0&&headMask[y*128+left-1])left--;
    while(right<127&&headMask[y*128+right+1])right++;
    return right-left+1;
  }).sort((a,b)=>a-b);
  const headWidth=spans[1],variation=eyeSize==='tiny'?.82:eyeSize==='large'?1.22:.94+(size%11)/100;
  const width=Math.max(eyes==='ivory'?6:4,Math.round(headWidth*(eyes==='ivory'?.15:.115)*variation));
  const height=Math.max(eyes==='ivory'?9:8,Math.round(headWidth*.28*variation+r(4)*scale));
  const gap=Math.max(width+3,Math.round(headWidth*.28));
  let lean=r(5)-2;
  if(r(100)<25&&lean)lean+=Math.sign(lean)*2;
  lean=Math.sign(lean)*Math.min(Math.abs(lean),Math.floor((height-3)/2));
  const layout=[];
  const pupilSize=2+r(Math.max(1,Math.min(width-3,height-5)-1)),gazeX=r(3)-1,gazeY=r(3)-1;
  for(const side of [-1,1]) {
    // Identical contours and staircase timing keep the pair equally thick.
    const h=height,x=Math.round(cx+side*gap/2-width/2),y=eyeY-Math.floor(h/2),rows=[],pupilRows=[];
    for(let j=0;j<h;j++) {
      // Hold the cap's shear to its neighboring row. The old endpoint rounding
      // put a lone sideways step on the last row, creating a teardrop hook.
      const t=Math.max(0,Math.min(1,(j-1)/(h-3)));
      const shift=Math.round(lean*t)-Math.round(lean/2),cap=(j===0||j===h-1)&&width>=4?1:0;
      rows.push([x+shift+cap,y+j,width-cap*2]);
    }
    if(eyes==='ivory') {
      const d=pupilSize,py=Math.max(y+2,Math.min(y+h-d-2,eyeY-Math.floor(d/2)+gazeY));
      const occupied=rows.slice(py-y,py-y+d);
      const left=Math.max(...occupied.map(row=>row[0]+1)),right=Math.min(...occupied.map(row=>row[0]+row[2]-d-1));
      const px=Math.max(left,Math.min(right,Math.round(x+(width-d)/2)+gazeX));
      // Small rounded squares float in the whites instead of tracing the eye.
      for(let j=0;j<d;j++){
        const cap=d>=4&&(j===0||j===d-1)?1:0;
        pupilRows.push([px+cap,py+j,d-cap*2]);
      }
    }
    // Fit complete contours, never clip their edges.
    let dx=0,dy=0;
    const fits=()=>rows.every(([x,y,w])=>Array.from({length:w},(_,i)=>body[(y+dy)*128+x+dx+i]).every(Boolean));
    for(let attempt=0;!fits()&&attempt<8;attempt++){dx-=side;if(attempt%2)dy++;}
    const visible=fits();
    for(const runs of [rows,pupilRows])for(const row of runs){row[0]+=dx;row[1]+=dy;}
    if(visible) {
      for(const [x,y,w] of rows)p.rect(x,y,w,1,eyes==='black'?4:8);
      for(const [x,y,w] of pupilRows)p.rect(x,y,w,1,4);
    }
    layout.push({rows,pupilRows,width,height:h,lean});
  }
  // Curated pixel runs avoid oversampling collisions and hooked corners.
  const patterns={
    neutral:['.......','..###..','.......'],
    happy:['#.....#','.#...#.','..###..'],
    smirk:['.....##','#####..','.......'],
    grin:['#######','.#####.','..###..'],
    'small-smile':['.......','##...##','..###..'],
  };
  const mirror=!!r(2),mouthY=Math.round(cy+10*scale);
  patterns[mouth].forEach((row,y)=>[...row].forEach((c,x)=>{
    const px=Math.round(cx)+(mirror?3-x:x-3),py=mouthY+y;
    if(c==='#'&&body[py*128+px])p.dot(px,py,4);
  }));
  return {eyes,eyeSize,headWidth,mouth,eyeGeometry:layout};
}
