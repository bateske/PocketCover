// Underwater: dark water above the thermocline (the horizon sky's 0 into 1),
// then three depths with a value step each (common.js value plan):
// - far kelp strands in 3, rooted behind the bed's crest;
// - the seabed: a lit ridge in 3, rimmed in 2 where light from above grazes
//   its rising tops, fading through a 2-row seam into 1 at the very bottom;
// - near kelp strands in 2, lit in 9 along their left (key-light) edge.
// Rocks of 1 rest on the bed; bubbles are rings of 2 with a 9 glint on the
// rim's top-left. The bed top stays at least 10 rows above row 127, so the
// stage vignette's darkest ring never swallows it.
import {groundBand,ridgeTops} from './common.js';
import {raster} from '../raster.js';

const BED=117,BED_HIGHEST=104;

// One strand on a scratch mask: the engine-18 stroke and its leaf line.
function strandMask(mask,{x,y,height,lean}) {
  mask.fill(0);
  const m=raster(mask,128,{pixelArt:true}),leaf=Math.round(y-height*.4);
  m.stroke([[x,y],[x-3,leaf],[x+lean,Math.round(y-height*.7)],[x+lean,y-height]],1,2);
  m.line(x-2,leaf,x-5,Math.round(y-height*.6),1,2);
}
// Paint a strand mask in `body`; with `edge`, the left edge above row
// `litBelow` takes it (the key light is at the upper left).
function paintStrand(p,mask,body,edge=null,litBelow=128) {
  let x0=128,x1=-1,y0=128,y1=-1;
  for(let i=0;i<mask.length;i++)if(mask[i]){const x=i&127,y=i>>7;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;y1=y;}
  if(x1<0)return;
  // Run starts form the left edge; only those stacked on another run start
  // light up, so the lit edge is made of vertical segments and never leaves
  // lone pixels on a diagonal stretch.
  const start=i=>i>=0&&i<mask.length&&mask[i]&&((i&127)===0||!mask[i-1]);
  const lit=new Uint8Array(mask.length);
  if(edge!=null)for(let i=0;i<mask.length;i++)if((i>>7)<litBelow&&start(i)&&(start(i-128)||start(i+128)))lit[i]=1;
  const solid=mask.slice();
  p.sample(x0,y0,x1-x0+1,y1-y0+1,(px,py)=>{
    const i=Math.floor(py)*128+Math.floor(px);
    return solid[i]?lit[i]?edge:body:null;
  });
}

export function underwater(p,r,ctx) {
  const {top,counts}=ctx;
  // Keep the seabed stream stable: the two engine-18 light-ray draws.
  r(10);r(12);
  // A resting subject (a relic, a plant) sits on the bed; vehicles float.
  const bedY=ctx.bounds&&ctx.style!=='vehicles'?Math.max(BED_HIGHEST,Math.min(BED,ctx.floor+2)):BED;
  const bed=ridgeTops(r,bedY,12,16,top+3);
  // Strand geometry first (the engine-18 draws, in order). The outermost
  // strand of each bank is near, the next one in is far, and so on.
  const strands=[];
  for(const side of [0,1])for(let i=0;i<counts.kelp;i++){
    const x=5+side*102+i*4,y=122-r(4),height=12+r(19),lean=r(7)-3;
    const near=((side?counts.kelp-1-i:i)&1)===0;
    strands.push({x,y:near?y:y-4,height:near?height:Math.round(height*.8),lean,near});
  }
  const mask=new Uint8Array(128*128);
  for(const s of strands)if(!s.near){strandMask(mask,s);paintStrand(p,mask,3);}
  groundBand(p,bed,bedY,{band:5,lit:3,rim:2,dark:1});
  for(let i=0;i<counts.rocks;i++){
    const x=8+r(113),y=106+r(14),rx=3+r(7),ry=1+r(3);
    // Rocks lie in the lit bed, below its top line across their whole width
    // (a rock of 1 must never touch the water of 1), and off its seam.
    let rest=y;
    for(let k=Math.max(0,x-rx-1);k<=Math.min(127,x+rx+1);k++)rest=Math.max(rest,bed.tops[k]+ry+2);
    if(rest+ry<=bedY+5)p.ellipse(x,rest,rx,ry,1);
  }
  for(const s of strands)if(s.near){strandMask(mask,s);paintStrand(p,mask,2,9,Math.round(s.y-s.height*.35));}
  for(let i=0,n=2+r(3);i<n;i++){
    const x=r(2)?7+r(9):111+r(9),y=top+12+r(61),rx=2+r(2),ry=2+r(2);
    p.ring(x,y,rx,ry,2,1);
    // The glint: the rim pixel nearest the top-left (ties to the higher row).
    mask.fill(0);raster(mask,128,{pixelArt:true}).ring(x,y,rx,ry,1,1);
    let best=-1,score=Infinity;
    for(let yy=Math.max(0,y-ry-1);yy<=Math.min(127,y+ry+1);yy++)for(let xx=Math.max(0,x-rx-1);xx<=Math.min(127,x+rx+1);xx++){
      if(!mask[yy*128+xx])continue;
      const s=2*((xx-x)+(yy-y))+(yy-y>xx-x?1:0);
      if(s<score){score=s;best=yy*128+xx;}
    }
    if(best>=0)p.dot(best&127,best>>7,9);
  }
  return {floor:bedY};
}
underwater.meta=Object.freeze({id:'underwater',sky:'horizon',titleBand:false,ground:true,foreground:'kelp'});

export const WATER_SCENES=Object.freeze({underwater});
