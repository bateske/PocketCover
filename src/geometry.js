// Prefer repeating one-up/N-across slopes when choosing geometry. Keep this
// separate from rasterization: moving a stroke endpoint would break joins.
// Longer diagonals permit a slightly stronger preference; callers share the
// returned vector with every adjoining plane/detail.
export function preferredVector(dx,dy) {
  const ax=Math.abs(dx),ay=Math.abs(dy),major=Math.max(ax,ay),minor=Math.min(ax,ay);
  if(major<8||minor<1)return [dx,dy];
  const run=Math.max(1,Math.round(major/minor)),snapped=major/run;
  const tolerance=major<20?.045:.085;
  if(Math.abs(Math.atan2(snapped,major)-Math.atan2(minor,major))>tolerance)return [dx,dy];
  return ax>=ay?[dx,Math.sign(dy)*snapped]:[Math.sign(dx)*snapped,dy];
}

export function insidePolygon(x,y,points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [ax,ay]=points[i],[bx,by]=points[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}

// ---- Engine 19 geometry helpers (integer-friendly; no atan2) ----

// Whole-ratio slopes whose staircases repeat evenly: 1:8, 1:6, 1:4, 1:3, 1:2,
// 2:3 and 1:1, plus the axes. Transposes are the same ratios on the other axis.
const CLEAN_RATIOS=[0,1/8,1/6,1/4,1/3,1/2,2/3,1];
/** Snap a direction to the nearest clean ratio (or its transpose), keeping
 * the major extent and both signs. Nearest is by ratio value; ties keep the
 * smaller ratio. [0,0] stays [0,0]. */
export function cleanVector(dx,dy) {
  const ax=Math.abs(dx),ay=Math.abs(dy),major=Math.max(ax,ay);
  if(!(major>0))return [dx,dy];
  const ratio=Math.min(ax,ay)/major;
  let best=0;
  for(let i=1;i<CLEAN_RATIOS.length;i++)if(Math.abs(CLEAN_RATIOS[i]-ratio)<Math.abs(CLEAN_RATIOS[best]-ratio))best=i;
  const minor=major*CLEAN_RATIOS[best];
  return ax>=ay?[dx,(dy<0?-1:1)*minor]:[(dx<0?-1:1)*minor,dy];
}

/** Integer points, one per integer x, of a hanging cable: a parabola through
 * both (rounded) ends that sags by `sag` device pixels at its middle
 * (positive hangs down). Rounding alone leaves 1-2-1 kinks where the slope
 * changes slowly, so each side of the lowest run is regularised: its flat runs
 * are reordered to lengthen and its jumps to shrink toward the sag. Ends, the
 * lowest run and the multiset of run lengths are kept; level cables stay
 * exactly symmetric. */
export function catenary(x0,y0,x1,y1,sag) {
  const a=Math.round(x0),b=Math.round(x1),n=Math.abs(b-a),step=b<a?-1:1;
  if(!n)return [[a,Math.round(y0)+0]];
  const ys=[];
  for(let k=0;k<=n;k++)ys.push(Math.round(y0+(y1-y0)*k/n+4*sag*k*(n-k)/(n*n))+0);
  if(sag){
    const runs=[];
    for(const y of ys)if(runs.length&&runs[runs.length-1][0]===y)runs[runs.length-1][1]++;else runs.push([y,1]);
    let low=0;
    for(let i=1;i<runs.length;i++)if(Math.sign(sag)*(runs[i][0]-runs[low][0])>0)low=i;
    // Runs from..to-1 lie on one side of the lowest run. Toward the sag, flat
    // runs grow and jumps shrink; the run next to the lowest one keeps its y.
    const settle=(from,to,toward)=>{
      if(to-from<2)return;
      const lengths=runs.slice(from,to).map(r=>r[1]).sort((p,q)=>toward*(p-q));
      const jumps=[];
      for(let i=from;i<to;i++)jumps.push(toward>0?runs[i+1][0]-runs[i][0]:runs[i][0]-runs[i-1][0]);
      jumps.sort((p,q)=>toward*(Math.abs(q)-Math.abs(p)));
      for(let i=from;i<to;i++)runs[i][1]=lengths[i-from];
      if(toward>0){let y=runs[to][0];for(let i=to-1;i>=from;i--){y-=jumps[i-from];runs[i][0]=y;}}
      else{let y=runs[from-1][0];for(let i=from;i<to;i++){y+=jumps[i-from];runs[i][0]=y;}}
    };
    settle(0,low,1);settle(low+1,runs.length,-1);
    let k=0;for(const [y,length] of runs)for(let i=0;i<length;i++)ys[k++]=y;
  }
  return ys.map((y,k)=>[a+k*step,y]);
}

/** n points (n >= 2, both ends included) on the quadratic Bezier p0,p1,p2. */
export function bezier(p0,p1,p2,n=24) {
  n=Math.max(2,Math.floor(n));
  const points=[];
  for(let i=0;i<n;i++){
    const t=i/(n-1),u=1-t,a=u*u,b=2*u*t,c=t*t;
    points.push([a*p0[0]+b*p1[0]+c*p2[0],a*p0[1]+b*p1[1]+c*p2[1]]);
  }
  return points;
}

/** Twice the signed shoelace area. Positive means clockwise on a y-down screen. */
export function polygonArea2(points) {
  let area=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++)area+=points[j][0]*points[i][1]-points[i][0]*points[j][1];
  return area;
}

/** Outward unit normal [nx,ny] of each edge points[i] -> points[i+1] (closed).
 * The sign comes from the shoelace area, so reversing the winding (a flipX
 * part) keeps every normal outward. Zero-length edges give [0,0]. */
export function edgeNormals(points) {
  const sign=polygonArea2(points)<0?-1:1,normals=[];
  for(let i=0;i<points.length;i++){
    const [ax,ay]=points[i],[bx,by]=points[(i+1)%points.length],dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);
    normals.push(length>0?[sign*dy/length+0,-sign*dx/length+0]:[0,0]);
  }
  return normals;
}

// Sector boundary directions per sector count, built once. A vector lies in
// sector k when it is on or after boundary k and before boundary k+1, tested
// with cross products only (the tangent-ratio comparison), never atan2.
const SECTORS=new Map();
function sectorTable(n) {
  let table=SECTORS.get(n);
  if(!table){
    const snap=v=>Math.abs(v)<1e-12?0:v;
    table=Float64Array.from({length:2*n},(_,i)=>{const a=2*Math.PI*(i>>1)/n;return snap(i&1?Math.sin(a):Math.cos(a));});
    SECTORS.set(n,table);
  }
  return table;
}
/** Sector index 0..n-1 of direction (dx,dy). Sector 0 starts at +x and the
 * index grows toward +y (clockwise on a y-down screen); a vector exactly on a
 * boundary belongs to the sector that starts there. (0,0) gives 0. */
export function angleBucket(dx,dy,n) {
  n=Math.floor(n);
  if(!(n>1)||(!dx&&!dy))return 0;
  if(n===2)return dy>0||(dy===0&&dx>0)?0:1;
  const table=sectorTable(n);
  for(let k=0;k<n;k++){
    const j=(k+1)%n,startX=table[2*k],startY=table[2*k+1],endX=table[2*j],endY=table[2*j+1];
    if(startX*dy-startY*dx>=0&&endX*dy-endY*dx<0)return k;
  }
  return 0;
}
