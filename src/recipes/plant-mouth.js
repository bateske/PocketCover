// Plants only. Sample all mouth materials through one rotated ellipse so
// neither the teeth nor the tongue can ever paint outside the open mouth.
export function carnivorousMouth(p,{x,y,rx,ry,upper,lower,angle=-.15}) {
  const c=Math.cos(angle),s=Math.sin(angle),extent=rx+ry;
  const teeth=(count,side)=>Array.from({length:count},(_,i)=>{
    const u=(i-(count-1)/2)*rx*1.42/Math.max(1,count);
    return {u,v:side*(ry*Math.sqrt(1-(u/rx)**2)+.6),side,
      width:Math.min(4,rx/(count+1)*.62),length:Math.min(ry*.82,3.5+rx/count*.25)};
  });
  const points=[...teeth(upper,-1),...teeth(lower,1)];
  p.sample(x-extent,y-extent,extent*2,extent*2,(px,py)=>{
    const u=(px-x)*c+(py-y)*s,v=-(px-x)*s+(py-y)*c;
    if((u/rx)**2+(v/ry)**2>=1)return null;
    for(const t of points){
      const depth=(t.v-v)*t.side;
      if(depth>=0&&depth<t.length&&Math.abs(u-t.u)<t.width*(1-depth/t.length))return t.side<0?8:7;
    }
    if((u/(rx*.6))**2+((v-ry*.52)/(ry*.34))**2<1)return 11;
    return 4;
  });
}
