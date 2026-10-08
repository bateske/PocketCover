import {hash} from './random.js';
// Shared, surface-clipped dithering. Pattern coordinates live on the final
// device grid, while masks and lighting stay in the recipe's own coordinates.
// Checker is deliberately only four tonal steps: at 50% every orthogonal
// neighbor alternates. The old 4x4 Bayer matrix is explicit compatibility only.
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const CHECKER=[0,2,3,1];
// Quantized ramp blending for continuous surfaces. Shares the overlay's exact
// 2x2 thresholds; lighting is continuous but output stays in the input palette.
// `seam` is the width of the dithered transition between neighbouring ramp
// steps, as a fraction of one step: with a=.5-seam/2 the in-step fraction f
// becomes 0 below a, 1 above 1-a and (f-a)/seam between, so flat plateaus are
// separated by narrow checker seams. seam<=0 gives hard bands; the default
// seam=1 is the engine-18 full-width blend, bit for bit.
function toneIndex(light,n,x,y,seam) {
  const value=Math.max(0,Math.min(1,light))*(n-1),lo=Math.floor(value);
  const rank=CHECKER[((Math.floor(y)&1)<<1)+(Math.floor(x)&1)];
  let f=value-lo;
  if(seam!==1){
    if(!(seam>0))f=f>=.5?1:0;
    else{const a=.5-seam/2;f=f<a?0:f>1-a?1:(f-a)/seam;}
  }
  return Math.min(n-1,lo+(rank<Math.round(f*4)?1:0));
}
export function ditherTone(light,ramp,x,y,seam=1) {
  return ramp[toneIndex(light,ramp.length,x,y,seam)];
}
/** A ramp level 0..n-1 (fractions blend) painted with a narrow seam:
 * ditherTone(level/(n-1), ramp, x, y, soft). */
export function levelTone(level,ramp,x,y,soft=.4) {
  return ramp.length<2?ramp[0]:ditherTone(level/(ramp.length-1),ramp,x,y,soft);
}
export function dither(p,{x,y,w,h,color,density=.25,mask=()=>true,cell=1,phase=0,pattern='checker'}) {
  if(!['checker','lines','crosshatch','ordered'].includes(pattern))throw Error('Unknown dither pattern: '+pattern);
  cell=Math.max(1,Math.floor(cell));
  p.sample(x,y,w,h,(px,py,deviceX=px,deviceY=py)=>{
    if(!mask(px,py))return null;
    const amount=Math.max(0,Math.min(1,typeof density==='function'?density(px,py):density));
    const ix=Math.floor(deviceX/cell)+phase,iy=Math.floor(deviceY/cell);
    if(pattern==='ordered')return amount>(BAYER[((iy&3)<<2)+(ix&3)]+.5)/16?color:null;
    const level=Math.round(amount*4);
    let rank;
    if(pattern==='checker')rank=CHECKER[((iy&1)<<1)+(ix&1)];
    else if(pattern==='lines')rank=(ix+iy)&3;
    else {const a=ix&3,b=iy&3;rank=a===b?0:a+b===3?1:(a&1)?2:3;}
    return rank<level?color:null;
  });
}

/** The key light, toward the upper left and the viewer: [-.55,-.65,.52]
 * normalised. Device-space x right, y down, z toward the viewer. */
export const KEY=Object.freeze((()=>{const l=Math.hypot(-.55,-.65,.52);return [-.55/l,-.65/l,.52/l];})());
/** Lambert diffuse of a unit normal under KEY, clamped to [0,1]. */
export function lambert(nx,ny,nz) {
  return Math.max(0,Math.min(1,nx*KEY[0]+ny*KEY[1]+nz*KEY[2]));
}

/** A lit cylinder: one sample() over the quad around the axis (x0,y0)->(x1,y1)
 * of width w. t runs 0..1 along the axis (half-open), u = signed cross offset
 * / (w/2) in [-1,1). The u<0 side faces `light` (default KEY's x,y), measured
 * in the coordinates p draws in: under a flipX part, pass a mirrored light.
 * - tone = ditherTone(.5-.55u, ramp, deviceX, deviceY, seam): checker phase
 *   stays on the device grid;
 * - bands: one ramp step darker where frac(t*bands) < .22 (grip wraps);
 * - spec: a colour (true means cream 8) where -.72<u<-.55 and .08<=t<=.30.
 * The callback is pure; every parameter is fixed before sampling. */
export function shaft(p,{x0,y0,x1,y1,w,ramp,bands=0,spec=null,seam=.35,light=KEY}) {
  const ax=x1-x0,ay=y1-y0,length2=ax*ax+ay*ay;
  if(!(length2>0&&w>0)||!ramp?.length)return;
  const length=Math.sqrt(length2),half=w/2,specColor=spec===true?8:spec;
  let nx=ay/length,ny=-ax/length;
  if(nx*light[0]+ny*light[1]>0){nx=-nx;ny=-ny;}
  const hx=Math.abs(nx)*half,hy=Math.abs(ny)*half;
  const left=Math.min(x0,x1)-hx,top=Math.min(y0,y1)-hy,right=Math.max(x0,x1)+hx,bottom=Math.max(y0,y1)+hy;
  p.sample(left,top,right-left,bottom-top,(px,py,dx=px,dy=py)=>{
    const qx=px-x0,qy=py-y0,t=(qx*ax+qy*ay)/length2;
    if(t<0||t>=1)return null;
    const u=(qx*nx+qy*ny)/half;
    if(u<-1||u>=1)return null;
    if(specColor!=null&&u>-.72&&u<-.55&&t>=.08&&t<=.30)return specColor;
    let i=toneIndex(.5-.55*u,ramp.length,dx,dy,seam);
    if(bands>0){const f=t*bands-Math.floor(t*bands);if(f<.22)i=Math.max(0,i-1);}
    return ramp[i];
  });
}

// Lattice values come from random.js's FNV-1a hash, run over the seed text
// once and then over the eight bytes of the two lattice coordinates.
let noiseSeed=null,noiseBase=0;
function lattice(base,i,j) {
  let h=base;
  for(let k=0;k<32;k+=8)h=Math.imul(h^((i>>>k)&255),16777619);
  for(let k=0;k<32;k+=8)h=Math.imul(h^((j>>>k)&255),16777619);
  h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;
  return (h>>>0)&255;
}
/** Integer value noise 0..255: bilinear between hashed lattice values every
 * `scale` pixels, with Q8 weights (exact on the device). */
export function noise2(seed,x,y,scale=8) {
  if(seed!==noiseSeed){noiseSeed=seed;noiseBase=hash(String(seed));}
  const s=scale>0?scale:1,u=x/s,v=y/s,i=Math.floor(u),j=Math.floor(v);
  const wx=Math.min(255,Math.floor((u-i)*256)),wy=Math.min(255,Math.floor((v-j)*256));
  const a=lattice(noiseBase,i,j)*(256-wx)+lattice(noiseBase,i+1,j)*wx;
  const b=lattice(noiseBase,i,j+1)*(256-wx)+lattice(noiseBase,i+1,j+1)*wx;
  return (a*(256-wy)+b*wy)>>16;
}
