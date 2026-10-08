// Planets-only material projection. Rectangles belong to the unwrapped surface,
// then longitude/latitude bend and compress them toward the visible limb.
export function sphereUV(nx,ny,nz,pitch=.38,roll=.12) {
  const cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const x=nx*cr+ny*sr,y=ny*cr-nx*sr;
  return [Math.atan2(x,nz*cp+y*sp),Math.asin(Math.max(-1,Math.min(1,y*cp-nz*sp)))];
}

// A single filled annulus; every radius between the boundaries has a material
// color. Front and back use complementary halves of the same rotated ellipse.
export function orbitBand(p,{cx,cy,rx,ry,width,angle,bands,back}) {
  const co=Math.cos(angle),si=Math.sin(angle),bx=Math.hypot(rx*co,ry*si),by=Math.hypot(rx*si,ry*co);
  const inner=1-width/rx,colors=[9,10,11,7],outer=colors[(bands-1)%colors.length];
  p.sample(cx-bx-1,cy-by-1,bx*2+2,by*2+2,(x,y)=>{
    const dx=x-cx,dy=y-cy,u=(dx*co+dy*si)/rx,v=(dy*co-dx*si)/ry;
    const radius=Math.hypot(u,v);
    if(radius>1||radius<inner||(back?v>=0:v<0))return null;
    return colors[Math.min(bands-1,Math.floor((radius-inner)/(1-inner)*bands))%colors.length];
  });
  // The shared digital contour keeps shallow, subpixel-wide tips connected.
  // This is a colored material edge, not an additional black outline.
  p.arc(cx,cy,rx,ry,outer,1,angle,back?Math.PI:0,back?Math.PI*2:Math.PI);
}
