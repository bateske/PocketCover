import {raster} from './raster.js';
import {hash,random} from './random.js';
import {layoutTitle,prepareTitle} from './title.js';
import {cleanSubject,inspectSubject,TRANSPARENT} from './quality.js';
import {renderBackground} from './backgrounds.js';
import {adjustPlacement,chooseComposition,compositionMeta,placeSubject,subjectBounds} from './composition.js';
import {recordDrawing} from './drawing.js';
import {createVariation} from './variation.js';
import {chooseLook} from './look.js';
import {DARKEN1,DARKEN2,DARKER,LIGHTER} from './roles.js';
import {framePass,renderStage} from './stage.js';
import {renderDepth,renderForeground} from './depth.js';

export const VERSION=19;
export const SIZE=128;
// Shared, read-only role steps handed to recipes and passes.
const LUT=Object.freeze({darker:DARKER,lighter:LIGHTER});

const finite=v=>typeof v==='number'&&Number.isFinite(v);
const isPoint=v=>Array.isArray(v)&&v.length>=2&&finite(v[0])&&finite(v[1]);
const isPlace=v=>v&&typeof v==='object'&&finite(v.x)&&finite(v.y);

/** Map the light and shadow traits a recipe returns from recipe space into
 * screen space through `frame` {x,y,scale}: x' = frame.x + x*scale,
 * y' = frame.y + y*scale, radii and lengths times scale. Only well-formed keys
 * the recipe returned are mapped; directions, ratios and step counts pass
 * through. The result is new objects that never alias `traits`. */
export function mapTraits(traits,frame) {
  const {x:fx,y:fy,scale}=frame,X=x=>fx+x*scale,Y=y=>fy+y*scale,S=v=>v*scale,screen={};
  if(isPoint(traits.focal))screen.focal=[X(traits.focal[0]),Y(traits.focal[1])];
  if(Array.isArray(traits.emitters))screen.emitters=traits.emitters.filter(isPlace)
    .map(e=>({...e,x:X(e.x),y:Y(e.y),...(finite(e.r)?{r:S(e.r)}:{})}));
  if(Array.isArray(traits.groundShadows)){
    const shadows=[];
    for(const s of traits.groundShadows){
      if(s?.kind==='ellipse'&&isPlace(s))shadows.push({...s,x:X(s.x),y:Y(s.y),...(finite(s.rx)?{rx:S(s.rx)}:{}),...(finite(s.ry)?{ry:S(s.ry)}:{})});
      else if(s?.kind==='poly'&&Array.isArray(s.points)&&s.points.every(isPoint))shadows.push({...s,points:s.points.map(([x,y])=>[X(x),Y(y)])});
      else if(s?.kind==='project'&&finite(s.groundY))shadows.push({...s,groundY:Y(s.groundY),...(isPoint(s.shear)?{shear:[s.shear[0],s.shear[1]]}:{})});
      else if(s?.kind==='line'&&finite(s.x0)&&finite(s.x1)&&finite(s.y))shadows.push({...s,x0:X(s.x0),x1:X(s.x1),y:Y(s.y)});
    }
    screen.groundShadows=shadows;
  }
  if(isPlace(traits.lamp))screen.lamp={...traits.lamp,x:X(traits.lamp.x),y:Y(traits.lamp.y)};
  if(Array.isArray(traits.beams))screen.beams=traits.beams.filter(isPlace)
    .map(b=>({...b,x:X(b.x),y:Y(b.y),...(finite(b.length)?{length:S(b.length)}:{})}));
  if(isPoint(traits.heading))screen.heading=[traits.heading[0],traits.heading[1]];
  if(traits.aura&&typeof traits.aura==='object')screen.aura={...traits.aura};
  if(typeof traits.grounded==='boolean')screen.grounded=traits.grounded;
  return screen;
}

/** Include only the recipes a host needs. No global registry or runtime deps. */
export function createGenerator(recipes,{defaultStyle=recipes[0]?.id}={}) {
  const registry=new Map();
  for(const recipe of recipes) {
    if(!recipe||typeof recipe.id!=='string'||typeof recipe.render!=='function'||registry.has(recipe.id))
      throw Error('Recipes need unique string IDs and a render function.');
    registry.set(recipe.id,recipe);
  }
  if(!registry.has(defaultStyle))throw Error('The default style must be an included recipe.');
  const styles=Object.freeze([...registry.values()].map(({id,label,revision,features=[],specializedFeatures=[],featureNotes})=>
    Object.freeze({id,label,revision,features:Object.freeze([...features]),specializedFeatures:Object.freeze([...specializedFeatures]),...(featureNotes?{featureNotes}: {})})));

  // The engine-19 pipeline (engine-contract 1.1). Steps marked E1-E10 are
  // Phase-0 no-ops in their own modules; the output equals engine 18.
  function generateCover(title,{variant=0,style=defaultStyle,diagnostics=false,framing='varied',rgb=true}={}) {
    if(typeof title!=='string'||!/^[\x20-\x7e]{1,31}$/.test(title)||!title.trim())
      throw Error('Give the game a title using 1–31 printable ASCII characters.');
    if(!Number.isSafeInteger(variant)||variant<0)throw Error('Cover variant must be a nonnegative safe integer.');
    if(framing!=='varied'&&framing!=='classic')throw Error('Framing must be varied or classic.');
    if(typeof rgb!=='boolean')throw Error('The rgb option must be true or false.');
    const recipe=registry.get(style);
    if(!recipe)throw Error('Unknown cover style: '+style);
    title=title.trim().replace(/ +/g,' ');
    // compat (classic mascot) must reproduce mascot v8 byte for byte.
    const seedTitle=variant?title+' '+variant:title,legacy=recipe.id==='mascot',compat=legacy&&framing==='classic';
    const seedKey=legacy?'pocket-cover:2:'+seedTitle:`pocket-cover:${style}:${recipe.revision}:${seedTitle}`;
    // 1. Seed, recipe stream and setup.
    const r=random(hash(seedKey)),pick=items=>items[r(items.length)];
    const setup=recipe.setup?.({r,pick})||{};
    // 2. Look (E1). The mascot palette draws from `r`, so this stays here.
    const look=chooseLook({r,seedKey,seedTitle,title,variant,style,recipe,legacy,compat,framing}),{palette,wildness}=look;
    // 3-4. Title layout and preparation (E6); area and scale read its fields.
    const layout=layoutTitle(title.toUpperCase(),{compat,look,recipe,style});
    const titleArt=prepareTitle(layout,{compat,look,recipe,style});
    // Debug-only primitive record for the whole cover (not for the mascot).
    const provenance=diagnostics&&!legacy?new Uint8Array(SIZE*SIZE):null,subjectProvenance=provenance&&new Uint8Array(SIZE*SIZE);
    const indices=new Uint8Array(SIZE*SIZE),screen=raster(indices,SIZE,{pixelArt:!legacy,provenance});
    // 5. Composition (E8).
    const coverSpace=legacy||recipe.coordinateSpace==='cover';
    const placement=framing==='varied'?chooseComposition(random(hash(seedKey+':composition')),style,{recipe,look}):null;
    const room=!!compositionMeta(style,recipe).room;
    const area=room?{x:2,y:layout.roomTop,width:124,height:126-layout.roomTop}:{x:4,y:layout.areaTop,width:120,height:123-layout.areaTop};
    const scale=Math.min(1,(124-layout.classicTop)/96);
    let frame=coverSpace?{x:0,y:0,scale:1}:{x:(SIZE-128*scale)/2,y:layout.classicTop,scale};
    // A separate subject layer lets us distinguish floating fragments from stars,
    // lettering and same-color islands within a multi-color connected object.
    const layer=legacy?indices:new Uint8Array(SIZE*SIZE).fill(TRANSPARENT);
    const intent=new Map(),drawing=!coverSpace?recordDrawing():null;
    const p=legacy?screen:drawing?drawing.p:raster(layer,SIZE,{pixelArt:true,intent,provenance:subjectProvenance});
    const variation=createVariation(seedKey+':parameters',{wildness,cycleSeed:legacy?null:'pocket-cover:'+style+':'+recipe.revision+':'+title,index:variant});
    // 6. Render, then place: probe, fit, render, align (legacy paints directly).
    const traits=recipe.render({p,r,pick,variation,indices:layer,layout,palette,seedTitle,setup,placement,look:look.summary,lut:LUT,area})||{};
    adjustPlacement(placement,style,traits,recipe);
    if(drawing)frame=placeSubject({drawing,placement,area,room,frame,layer,intent,provenance:subjectProvenance,traits,recipe,style,look});
    const bounds=!legacy?subjectBounds(layer):null;
    if(Number.isFinite(traits.groundRearY))traits.groundRearScreenY=frame.y+traits.groundRearY*frame.scale;
    // 7. Hook context (engine-contract 1.2). Values that depend on framing go
    // here, never into traits: classic and varied traits must stay equal.
    const calmMask=titleArt.calm;
    const ctx={style,recipe,seedKey,seedTitle,title,variant,framing,legacy,compat,diagnostics,
      look,palette,lut:LUT,layout,titleArt,
      calm:calmMask?(x,y)=>{x=Math.floor(x);y=Math.floor(y);return x>=0&&x<SIZE&&y>=0&&y<SIZE&&calmMask[y*SIZE+x]!==0;}:()=>false,
      placement,camera:placement?.camera??null,frame,area,room,traits,layer,intent,drawing,bounds,
      screen:legacy?{}:mapTraits(traits,frame),scenery:{},indices,screenRaster:screen,provenance,
      // Scenes are dealt per block of 12 variants (backgrounds.js cycle('scene-deck',12)).
      sceneryVariation:createVariation(seedKey+':scenery',{wildness,cycleSeed:legacy?null:'pocket-cover:'+style+':'+recipe.revision+':'+title,index:variant}),
      depthVariation:createVariation(seedKey+':depth',{wildness}),
      stageVariation:createVariation(seedKey+':stage',{wildness})};
    if(!legacy){
      // 8. Scenery (E9), then 9. depth (E10) and 10. stage (E7).
      traits.background=renderBackground(screen,random(hash(seedKey+':background')),{kind:recipe.background,style,traits,top:layout.bottom,
        subjectBounds:placement?bounds:null,variation:ctx.sceneryVariation,
        scenes:recipe.scenes,calm:ctx.calm,subjectLayer:layer,look,camera:placement?.camera,wildness,scenery:ctx.scenery,extent:titleArt.extent});
      renderDepth(ctx);
      renderStage(ctx);
    }
    // 11. Inspect and clean the subject layer.
    const inspection=!legacy&&diagnostics?inspectSubject(layer,{intent}):null;
    const removed=legacy?[]:cleanSubject(layer,{intent});
    if(!legacy){
      // 12. Composite; DARKEN markers darken whatever lies underneath.
      for(let i=0;i<indices.length;i++){
        const v=layer[i];if(v===TRANSPARENT)continue;
        indices[i]=v===DARKEN1?DARKER[indices[i]]:v===DARKEN2?DARKER[DARKER[indices[i]]]:v;
        if(provenance)provenance[i]=subjectProvenance[i];
      }
      // 13. Foreground (E10).
      renderForeground(ctx);
    }
    // 14. Frame pass (E7), then 15. the title (E6).
    if(!compat)framePass(ctx);
    titleArt.paint(screen,indices);
    // Diagnostics only: mark title pixels (16 glint, 1 dot) in provenance.
    if(provenance&&titleArt.footprint)for(let i=0;i<indices.length;i++)if(titleArt.footprint[i])provenance[i]=titleArt.footprint[i]===2?16:1;
    return {width:SIZE,height:SIZE,pixels:rgb?Uint32Array.from(indices,i=>palette[i]):null,indices,palette,title,variant,style,
      version:VERSION,styleVersion:recipe.revision,framing,composition:placement?{...placement,...(coverSpace?{x:traits.cx,y:traits.cy,scale:traits.scale}:frame)}:null,traits,titleLines:layout.lines,titleBottom:layout.bottom,
      titleExtent:titleArt.extent,look:look.summary,
      quality:{policy:legacy?(placement?'mascot-mask-v14':'legacy-v8'):'mask-effects-v14',bounds,removedDetachedPixels:removed.length,
        ...(inspection?{beforeCleanup:inspection,afterCleanup:inspectSubject(layer,{intent}),removed,subjectLayer:layer.slice()}: {}),
        ...(provenance?{provenance}:{}),...(diagnostics&&titleArt.footprint?{titleMask:titleArt.footprint}:{}),...(diagnostics&&ctx.stage?{stage:{kind:ctx.stage.kind,cx:ctx.stage.cx,cy:ctx.stage.cy,rx:ctx.stage.rx,ry:ctx.stage.ry}}:{})}};
  }

  function drawCover(canvas,title,options) {
    const cover=generateCover(title,{...options,rgb:true});
    canvas.width=canvas.height=SIZE;
    const ctx=canvas.getContext('2d'),image=ctx.createImageData(SIZE,SIZE);
    cover.pixels.forEach((rgb,i)=>{image.data[i*4]=rgb>>16;image.data[i*4+1]=(rgb>>8)&255;image.data[i*4+2]=rgb&255;image.data[i*4+3]=255;});
    ctx.putImageData(image,0,0);
    return cover;
  }
  return {generateCover,drawCover,styles};
}
