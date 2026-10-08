// Record geometry once so composition can measure it before rendering at its
// final scale. No random numbers are consumed during replay. This is optional
// engine infrastructure: recipes and raster still work without a recorder.
import {effectMargins} from './group.js';
export function recordDrawing() {
  const commands=[],p={};
  const margins={left:0,right:0,top:0,bottom:0};
  // Engine 19 adds the device-space primitives; replay passes them through
  // whatever surface (viewport, part, recolor) the drawing is drawn into.
  for(const name of ['dot','rect','ellipse','sphere','poly','round','superellipse','line','stroke','pipe','ring','arc','sample','detail',
    'inkPath','streak','glint','stamp','facetPoly'])
    p[name]=(...args)=>commands.push([name,args]);
  p.group=(draw,options={})=>{
    const child=recordDrawing();draw(child.p);commands.push(['group',child,options]);
    const effect=effectMargins(options);
    margins.left=Math.max(margins.left,child.margins.left+effect.left);
    margins.right=Math.max(margins.right,child.margins.right+effect.right);
    margins.top=Math.max(margins.top,child.margins.top+effect.top);
    margins.bottom=Math.max(margins.bottom,child.margins.bottom+effect.bottom);
  };
  return {p,margins,draw(target){for(const [name,args,options] of commands)name==='group'?target.group(q=>args.draw(q),options):target[name](...args);}};
}
