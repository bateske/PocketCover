// Subject occupancy is separate from color clustering. A white glint touching
// a blue body belongs to that body; it is NOT a detached foreground component.
export const TRANSPARENT=255;

function neighbors(index,size,visit){
  const x=index%size,y=Math.floor(index/size);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const nx=x+dx,ny=y+dy;
    if(nx>=0&&nx<size&&ny>=0&&ny<size)visit(ny*size+nx);
  }
}
const deliberate=(intent,index,color)=>{
  const mark=intent?.get(index);
  return mark?.color===color&&mark.reason.trim()?mark.reason:null;
};

/** Read-only, subject-only diagnostics. Same-color islands are review candidates,
 * not errors: eyes, glints, windows, thin diagonals and texture may justify them.
 * This cannot establish silhouette quality, lighting, banding or all jaggies. */
export function inspectSubject(layer,{size=128,intent}={}){
  if(layer.length!==size*size)throw Error('Subject dimensions do not match its pixels.');
  const detached=[],colorSingletons=[];
  for(let i=0;i<layer.length;i++){
    const color=layer[i];if(color===TRANSPARENT)continue;
    let touching=false,same=false;
    neighbors(i,size,j=>{if(layer[j]!==TRANSPARENT)touching=true;if(layer[j]===color)same=true;});
    const reason=deliberate(intent,i,color),point={x:i%size,y:Math.floor(i/size),color,...(reason?{reason}:{})};
    if(!touching)detached.push(point);
    if(!same)colorSingletons.push(point);
  }
  return {detached,colorSingletons};
}

/** Remove only unmarked ONE-pixel foreground components. No same-color majority
 * filter, erosion, smoothing, hue changes, or edits to title/background layers. */
export function cleanSubject(layer,{size=128,intent}={}){
  if(layer.length!==size*size)throw Error('Subject dimensions do not match its pixels.');
  const removed=[];
  for(let i=0;i<layer.length;i++){
    const color=layer[i];if(color===TRANSPARENT||deliberate(intent,i,color))continue;
    let connected=false;
    neighbors(i,size,j=>{if(layer[j]!==TRANSPARENT)connected=true;});
    if(!connected)removed.push(i);
  }
  // Classify the unchanged input first; never peel a line by repeated erosion.
  for(const i of removed)layer[i]=TRANSPARENT;
  return removed.map(i=>[i%size,Math.floor(i/size)]);
}
