// Building-local geometry: a 2:1 projected footprint, architectural faces and
// a small visibility graph. Other recipes need none of this module.
// The painter compares overlapping projected faces along the viewing ray.
// This is why a near eave can cover a tall rear wall without hiding its roof.
const EPS=1e-7;
const insideTri=(pts,x,y)=>{let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [a,b]=pts[i],[c,d]=pts[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}return inside;};
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const area=points=>points.reduce((sum,a,i)=>sum+cross(a,points[(i+1)%points.length]),0)/2;

function intersection(subject,clip) {
  let output=subject;
  for(let k=0;k<clip.length&&output.length;k++){
    const a=clip[k],b=clip[(k+1)%clip.length],edge=sub(b,a),input=output;output=[];
    let previous=input.at(-1),before=cross(edge,sub(previous,a));
    for(const current of input){
      const after=cross(edge,sub(current,a));
      if((before>=-EPS)!==(after>=-EPS)){
        const t=before/(before-after);
        output.push([previous[0]+(current[0]-previous[0])*t,previous[1]+(current[1]-previous[1])*t]);
      }
      if(after>=-EPS)output.push(current);
      previous=current;before=after;
    }
  }
  return output;
}

export function buildingGeometry(p,{x=64,y=77,bayAdjustment=0,pitchAdjustment=0,windowWidth=5,windowHeight=5}={}) {
  const faces=[];
  const project=([u,v,z])=>[x+u-v,y+(u+v)/2-z];
  function face(points,color){
    const polygon=points.map(project);
    if(area(polygon)<.02)return null; // Back-facing or edge-on surface.
    const a=sub(points[1],points[0]),b=sub(points[2],points[0]);
    const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const k=n.reduce((s,v,i)=>s+v*points[0][i],0),sum=n[0]+n[1]+n[2];
    const f={points,polygon,color,marks:[],edges:[],next:[],incoming:0,id:faces.length,
      left:Math.min(...polygon.map(a=>a[0])),right:Math.max(...polygon.map(a=>a[0])),
      top:Math.min(...polygon.map(a=>a[1])),bottom:Math.max(...polygon.map(a=>a[1])),
      centerDepth:points.reduce((s,a)=>s+a[0]+a[1]+a[2],0)/points.length,
      depth:(sx,sy)=>(k-n[0]*(sx-x)-n[2]*((sx-x)/2-(sy-y)))/sum};
    faces.push(f);return f;
  }
  const mark=(f,points,color,checker=false)=>{if(f)f.marks.push({points,color,checker});};
  const edge=(f,points,color=4,width=1)=>{if(f)f.edges.push({points,color,width});};
  function box(u,v,w,d,z,h,{front=6,side=5,roof=7}={}){
    const a=u+w,b=v+d,t=z+h;
    const top=face([[u,v,t],[a,v,t],[a,b,t],[u,b,t]],roof);
    const right=face([[a,v,z],[a,b,z],[a,b,t],[a,v,t]],side);
    const left=face([[u,b,z],[u,b,t],[a,b,t],[a,b,z]],front);
    // Lit roof edge and shaded corner describe planes, not a black inner box.
    edge(top,[[u,b,t],[u,v,t],[a,v,t]],7);
    edge(left,[[u,b,t],[a,b,t]],5);
    return {u,v,w,d,z,h,top,right,left};
  }
  function wallMap(b,side,a,z){return side==='right'?[b.u+b.w,b.v+a,b.z+z]:[b.u+a,b.v+b.d,b.z+z];}
  function panel(b,side,a,z,w,h,color){
    mark(b[side],[wallMap(b,side,a,z),wallMap(b,side,a+w,z),wallMap(b,side,a+w,z+h),wallMap(b,side,a,z+h)],color);
  }
  function window(b,side,a,z,w=4,h=6,lit=true,arched=false){
    const f=b[side],M=(aa,zz)=>wallMap(b,side,aa,zz);
    const color=lit?(side==='right'?11:10):3;
    if(arched)mark(f,[M(a,z),M(a,z+h-2),M(a+w/2,z+h),M(a+w,z+h-2),M(a+w,z)],color);
    else panel(b,side,a,z,w,h,color);
  }
  function windows(b,{columns=3,rows=3,phase=0,style='rect',door=false,pitch=11}={}){
    columns=Math.max(1,columns+bayAdjustment);pitch=Math.max(8,pitch+pitchAdjustment);
    for(const side of ['left','right']){
      const span=side==='left'?b.w:b.d,cols=side==='left'?columns:Math.max(1,Math.floor(columns*b.d/b.w));
      const cell=span/(cols+1),ww=style==='slit'?2:Math.min(windowWidth,Math.max(3,cell-3)),wh=style==='slit'?7:windowHeight;
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const z=4+row*pitch,a=cell*(col+1)-ww/2;
        if(z+wh>b.h-3)continue;
        if(door&&side==='left'&&row===0&&Math.abs(a+ww/2-span/2)<7)continue;
        window(b,side,a,z,ww,wh,(col+row*2+phase)%5!==0,style==='arched');
      }
    }
  }
  function band(b,z,h=1,front=9,side=5){panel(b,'left',0,z,b.w,h,front);panel(b,'right',0,z,b.d,h,side);}
  function door(b,{width=8,height=11,offset=0,arched=false}={}){
    const a=b.w/2-width/2+offset,z=0;
    window(b,'left',a,z,width,height,false,arched);
  }
  function hip(u,v,w,d,z,rise=6,inset=7,{lit=10,shade=11,top=7}={}){
    const a=u+w,b=v+d,i=Math.min(inset,w/2-.25,d/2-.25),t=z+rise;
    const back=face([[u,v,z],[a,v,z],[a-i,v+i,t],[u+i,v+i,t]],lit);
    const far=face([[u,b,z],[u,v,z],[u+i,v+i,t],[u+i,b-i,t]],7);
    const right=face([[a,v,z],[a,b,z],[a-i,b-i,t],[a-i,v+i,t]],shade);
    const front=face([[a,b,z],[u,b,z],[u+i,b-i,t],[a-i,b-i,t]],lit);
    const cap=face([[u+i,v+i,t],[a-i,v+i,t],[a-i,b-i,t],[u+i,b-i,t]],top);
    edge(front,[[u,b,z],[a,b,z]],4);edge(right,[[a,b,z],[a,v,z]],4);
    edge(front,[[u+.8,b-.8,z+1],[a-.8,b-.8,z+1]],7);
    return {u:u+i,v:v+i,w:w-2*i,d:d-2*i,z:t,front,right,back,far,cap};
  }
  function pyramid(u,v,w,d,z,rise,{lit=10,shade=11}={}){
    const a=u+w,b=v+d,tip=[u+w/2,v+d/2,z+rise];
    face([[u,v,z],[a,v,z],tip],lit);face([[u,b,z],[u,v,z],tip],7);
    const right=face([[a,v,z],[a,b,z],tip],shade),front=face([[a,b,z],[u,b,z],tip],lit);
    edge(front,[[u,b,z],[a,b,z]],4);edge(right,[[a,v,z],[a,b,z]],4);
    return tip;
  }
  function cylinder(u,v,radius,z,h,{front=6,side=5,roof=7,sides=8,windows:rows=0,phase=0}={}){
    const ring=Array.from({length:sides},(_,i)=>[u+Math.cos(i*Math.PI*2/sides)*radius,v+Math.sin(i*Math.PI*2/sides)*radius]);
    for(let i=0;i<sides;i++){
      const a=ring[i],b=ring[(i+1)%sides],du=b[0]-a[0],dv=b[1]-a[1];
      const f=face([[...a,z],[...b,z],[...b,z+h],[...a,z+h]],dv>-du?side:front);
      if(!f)continue;
      const M=(t,zz)=>[a[0]+du*t,a[1]+dv*t,zz];
      for(let row=0;row<rows;row++){
        const zz=z+6+row*12;if(zz+6>z+h-3)continue;
        mark(f,[M(.3,zz),M(.7,zz),M(.7,zz+6),M(.3,zz+6)],(i+row+phase)%4?10:3);
      }
      edge(f,[[...a,z+h],[...b,z+h]],5);
    }
    const top=face(ring.map(a=>[...a,z+h]),roof);
    return {u,v,radius,z,h,ring,top};
  }
  // Cones are a separate roof material: accent ramp, a glint down the face
  // that best meets the upper-left light, slate courses on the shaded faces
  // and an ink eave seam so the cap never merges with the wall beneath.
  function cone(u,v,radius,z,height,{lit=10,shade=11,glint=8,courses=true,sides=8}={}){
    const ring=Array.from({length:sides},(_,i)=>[u+Math.cos(i*Math.PI*2/sides)*radius,v+Math.sin(i*Math.PI*2/sides)*radius,z]);
    const apex=[u,v,z+height],lerp=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
    let best=null,bestScore=-Infinity;
    const isShaded=i=>{const a=ring[i%sides],b=ring[(i+1)%sides];return b[1]-a[1]>a[0]-b[0];};
    for(let i=0;i<sides;i++){
      const a=ring[i],b=ring[(i+1)%sides],shaded=isShaded(i),f=face([a,b,apex],shaded?shade:lit);
      if(!f)continue;
      edge(f,[a,b],4,1);
      // Soften the lit/shade terminator: a checker sliver of the lit tone on
      // the shaded face, along the edge it shares with a lit neighbour.
      if(shaded){
        if(!isShaded(i+sides-1))mark(f,[a,lerp(a,b,.4),apex],lit,true);
        if(!isShaded(i+1))mark(f,[b,lerp(b,a,.4),apex],lit,true);
      }
      const mid=lerp(a,b,.5),score=-(mid[0]-u)+(mid[1]-v);
      if(!shaded&&score>bestScore){best={f,mid};bestScore=score;}
      if(shaded&&courses&&height>=6)for(const t of height>=12?[.3,.6]:[.45])edge(f,[lerp(a,apex,t),lerp(b,apex,t)],4);
    }
    if(best&&glint!=null)edge(best.f,[lerp(best.mid,apex,.12),lerp(best.mid,apex,.8)],glint);
  }
  function render(){
    // Physical depth at the intersection, not an arbitrary y-sort. Projected
    // upper tiers may overlap lower eaves although their anchors are farther.
    for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
      const a=faces[i],b=faces[j];
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)<.05||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<.05)continue;
      const overlap=intersection(a.polygon,b.polygon);if(overlap.length<3||Math.abs(area(overlap))<.05)continue;
      const sx=overlap.reduce((s,a)=>s+a[0],0)/overlap.length,sy=overlap.reduce((s,a)=>s+a[1],0)/overlap.length;
      const delta=a.depth(sx,sy)-b.depth(sx,sy);if(Math.abs(delta)<.001)continue;
      const far=delta<0?a:b,near=delta<0?b:a;far.next.push(near);near.incoming++;
    }
    const pending=new Set(faces),sorted=[];let fallback=0;
    while(pending.size){
      let ready=[...pending].filter(f=>!f.incoming);
      if(!ready.length){ready=[...pending];fallback++;}
      ready.sort((a,b)=>a.centerDepth-b.centerDepth||a.id-b.id);
      const f=ready[0];pending.delete(f);sorted.push(f);for(const n of f.next)n.incoming--;
    }
    p.group(q=>{
      for(const f of sorted){
        q.poly(f.polygon,f.color);
        for(const m of f.marks){
          const pts=m.points.map(project);
          if(!m.checker){q.poly(pts,m.color);continue;}
          const xs=pts.map(a=>a[0]),ys=pts.map(a=>a[1]),x0=Math.min(...xs),y0=Math.min(...ys);
          q.sample(x0,y0,Math.max(...xs)-x0,Math.max(...ys)-y0,(px,py,dx,dy)=>insideTri(pts,px,py)&&((Math.floor(dx)+Math.floor(dy))&1)?m.color:null);
        }
        for(const e of f.edges)q.stroke(e.points.map(project),e.color,e.width);
      }
    },{outline:2,color:4,shadow:{x:4,y:4,color:4},exteriorOnly:true});
    const groundPoints=faces.flatMap(f=>f.points.filter(a=>a[2]<=3));
    return {faces:faces.length,painterFallbacks:fallback,
      groundRearY:groundPoints.length?Math.min(...groundPoints.map(a=>project(a)[1])):y};
  }
  return {project,face,mark,edge,box,windows,window,panel,band,door,hip,pyramid,cylinder,cone,render};
}
