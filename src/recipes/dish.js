import {ditherTone} from '../materials.js';
// Shared by machines and survey vehicles. A shallow bowl, its inside shadow,
// rim and focal receiver are geometry/materials, not a special raster mode.
export function dish(p,{x,y,rx=22,ry=11,angle=.55,accent=10}) {
  const c=Math.cos(angle),s=Math.sin(angle),depth=ry*.42;
  p.ellipse(x-s*depth,y+c*depth,rx*.88,ry,5,angle);
  p.ellipse(x,y,rx,ry,9,angle);
  const extent=rx+ry;
  p.sample(x-extent,y-extent,extent*2,extent*2,(px,py,dx,dy)=>{
    const u=((px-x)*c+(py-y)*s)/rx,v=(-(px-x)*s+(py-y)*c)/ry;
    const rr=u*u+v*v;
    if(rr>.78)return null;
    // The raised upper lip shadows the hollow. Light catches the opposite
    // inside wall; a convex dome would put its highlight on the other side.
    const light=.3+v*.65+u*.18+Math.sqrt(Math.max(0,1-rr))*.25;
    return ditherTone(light,[5,6,7],dx,dy);
  });
  p.arc(x,y,rx,ry,7,1,angle,Math.PI,Math.PI*1.82);
  const focus=ry*1.8,fx=x+s*focus,fy=y-c*focus;
  p.line(x,y,fx,fy,9,Math.max(1,rx/12));
  p.ellipse(fx,fy,Math.max(1.5,rx*.11),Math.max(1.5,rx*.09),accent,angle);
}
