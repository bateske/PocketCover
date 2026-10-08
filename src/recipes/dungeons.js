import {dither} from '../materials.js';

// FEATURE (dungeons only): integer isometric tile projection and extruded blocks.
// Recipe-local, so the engine keeps no dungeon or map state.
export default {
  id:'dungeons', label:'Dungeon dioramas', revision:3, background:'void',
  features:['dot','rect','poly','ellipse','line','stroke','sample','group'],
  specializedFeatures:['isometric room projection','tile occupancy','extruded walls'],
  // Framing metadata (composition.js): a wide room area under the title, and
  // a large subject at every camera.
  composition:{room:true,sizeRange:[.88,1]},
  render({p,r,pick,variation}) {
    const kind=pick(['lava crossing','sunken shrine','treasure vault','summoning chamber','forgotten prison']);
    const columns=4+r(3),rows=4+r(3),oy=27+r(4);
    // A broad 112-unit footprint keeps every room substantial in the frame.
    // Retain the old conditional draw; only the dimensions change.
    if(columns+rows<=10)r(2);
    const tw=112/(columns+rows),th=tw/2,ox=64-(columns-rows)*tw/2;
    const floorPattern=r(3), wallHeight=17+r(5), doorLeft=1.3+r(5)*.15, doorWidth=1.25+r(3)*.15;
    const wallStyle=pick(['masonry','ribbed stone','mossy ruins']),equipment=pick(['supply barrel','reliquary','crystal lantern','none']);
    let door,waterway;
    p.group(q=>{
    const p=q;
    const worldIso=(x,y,z=0)=>[ox+(x-y)*tw,oy+(x+y)*th-z];
    // Placement uses room-relative anchors, while actual floor cells retain the
    // same 2:1 projection for square, broad, and deep room footprints.
    const iso=(x,y,z=0)=>worldIso(x*columns/5,y*rows/5,z);
    const face=(points,c)=>p.poly(points.map(([x,y,z=0])=>iso(x,y,z)),c);
    function tile(x,y,c) {
      p.poly([[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([a,b])=>worldIso(a,b)),4);
      p.poly([worldIso(x+.06,y+.08),worldIso(x+.94,y+.08),worldIso(x+.94,y+.91),worldIso(x+.06,y+.91)],c);
    }
    function block(x,y,w,d,h,c=6) {
      face([[x,y,h],[x+w,y,h],[x+w,y+d,h],[x,y+d,h]],4);
      face([[x,y,h],[x,y+d,h],[x,y+d],[x,y]],4);
      face([[x,y+d,h],[x+w,y+d,h],[x+w,y+d],[x,y+d]],4);
      face([[x+w,y,h],[x+w,y+d,h],[x+w,y+d],[x+w,y]],4);
      face([[x+.08,y+.08,h],[x+w-.08,y+.08,h],[x+w-.08,y+d-.08,h],[x+.08,y+d-.08,h]],c);
      face([[x+.06,y+d,h-1],[x+w-.06,y+d,h-1],[x+w-.06,y+d,1],[x+.06,y+d,1]],5);
      face([[x+w,y+.08,h-1],[x+w,y+d-.08,h-1],[x+w,y+d-.08,1],[x+w,y+.08,1]],3);
    }
    function torch(x,y) {
      const [sx,sy]=iso(x,y,13);
      p.line(sx,sy+7,sx,sy,4,3); p.line(sx,sy+6,sx,sy+1,9);
      p.poly([[sx-3,sy],[sx-3,sy-4],[sx,sy-9],[sx+3,sy-3],[sx+2,sy]],11);
      p.poly([[sx-1,sy],[sx-1,sy-4],[sx+1,sy-6],[sx+2,sy-1]],10); p.dot(sx,sy-2,8);
    }
    // Floor slab and two rear walls create a readable open-front cutaway.
    face([[0,0],[5,0],[5,5],[0,5]],9);
    face([[0,5],[5,5],[5,5,-5],[0,5,-5]],5);
    face([[5,0],[5,5],[5,5,-5],[5,0,-5]],3);
    face([[0,5,-1],[5,5,-1],[5,5,-4],[0,5,-4]],5);
    face([[5,0,-1],[5,5,-1],[5,5,-4],[5,0,-4]],3);
    for(let y=0;y<rows;y++) for(let x=0;x<columns;x++) {
      const light=floorPattern===0?(x+y)%2:floorPattern===1?x%2:(x===y || x+y===Math.min(columns,rows)-1);
      tile(x,y,light?9:2);
    }
    face([[0,0],[0,5],[0,5,wallHeight],[0,0,wallHeight]],5);
    face([[0,0],[5,0],[5,0,wallHeight],[0,0,wallHeight]],6);
    face([[.02,.05,2],[.02,4.95,2],[.02,4.95,wallHeight-1],[.02,.05,wallHeight-1]],5);
    face([[.06,0,2],[4.96,0,2],[4.96,0,wallHeight-1],[.06,0,wallHeight-1]],6);
    // An inset lower-wall band describes damp or rough stone, with a pattern
    // confined to its plane and away from the silhouette and mortar joints.
    dither(p,{x:ox-rows*tw+2,y:oy-wallHeight+2,w:rows*tw-4,h:rows*th+wallHeight-4,
      color:wallStyle==='mossy ruins'?6:3,density:wallStyle==='mossy ruins'?.35:.18,
      mask:(x,y)=>{const z=oy+(ox-x)/2-y;return z>2&&z<8&&x<ox-3;}});
    const courseHeight=(wallStyle==='ribbed stone'?8:6)+variation.integer('masonry-course',-1,1),joints=variation.integer('masonry-joints',4,6);
    for(let z=courseHeight;z<wallHeight;z+=courseHeight) {
      p.line(...iso(0,0,z),...iso(0,5,z),4);
      p.line(...iso(0,0,z),...iso(5,0,z),5);
      for(let j=0;j<joints;j++) {
        const s=(j+(Math.round(z/courseHeight)%2?.5:0))*5/joints;
        const courseTop=Math.min(z+courseHeight-1,wallHeight-1);
        if(s<5) { p.line(...iso(0,s,z),...iso(0,s,courseTop),4); p.line(...iso(s,0,z),...iso(s,0,courseTop),5); }
      }
    }
    p.line(...iso(0,5,wallHeight),...iso(0,0,wallHeight),7,2);
    p.line(...iso(0,0,wallHeight),...iso(5,0,wallHeight),8,2);
    if(r(3)!==0) {
      // A banner hangs from the left wall and belongs to the same room plane.
      const bx=1.8+r(5)*.2;
      face([[0,bx,wallHeight-4],[0,bx+.75,wallHeight-4],[0,bx+.75,9],[0,bx+.35,7],[0,bx,9]],4);
      face([[.02,bx+.1,wallHeight-5],[.02,bx+.65,wallHeight-5],[.02,bx+.65,10],[.02,bx+.35,9],[.02,bx+.1,10]],11);
      p.line(...iso(.03,bx+.35,wallHeight-7),...iso(.03,bx+.35,12),10);
    }
    // Far wall doorway is part of the composition for every room.
    const doorTop=wallHeight-4, arch=r(2)?3:0, doorRight=doorLeft+doorWidth;
    door=arch?'arch':'lintel';
    face([[doorLeft,0,1],[doorRight,0,1],[doorRight,0,doorTop-arch],
      [doorRight-.3,0,doorTop],[doorLeft+.3,0,doorTop],[doorLeft,0,doorTop-arch]],4);
    p.line(...iso(doorLeft-.05,0,2),...iso(doorLeft-.05,0,doorTop-arch),9,2);
    p.line(...iso(doorLeft-.05,0,doorTop-arch),...iso(doorLeft+.3,0,doorTop),9,2);
    p.line(...iso(doorLeft+.3,0,doorTop),...iso(doorRight-.3,0,doorTop),7,2);
    torch(.1,variation.range('left-torch',.7,1.3)); torch(variation.range('right-torch',4.1,4.5),.1);
    function chest(x,y) {
      block(x,y,1,.7,6,10);
      const a=iso(x,y,6), b=iso(x+1,y+.7,6);
      p.line(a[0],a[1],b[0],b[1],8);
      const [lx,ly]=iso(x+.5,y+.72,3); p.rect(lx-1,ly-1,3,3,4); p.dot(lx,ly,8);
    }
    function statue(x,y) {
      block(x-.4,y-.4,.8,.8,3,9);
      const [sx,sy]=iso(x,y,3);
      p.poly([[sx-5,sy-1],[sx-4,sy-10],[sx-7,sy-13],[sx-4,sy-16],[sx+4,sy-16],
        [sx+7,sy-13],[sx+3,sy-9],[sx+5,sy-1]],4);
      p.poly([[sx-3,sy-2],[sx-2,sy-10],[sx-5,sy-13],[sx-3,sy-14],[sx+3,sy-14],
        [sx+4,sy-12],[sx+1,sy-9],[sx+3,sy-2]],9);
      p.ellipse(sx,sy-19,4,5,4); p.ellipse(sx-1,sy-20,2,3,8);
      p.line(sx-2,sy-12,sx-2,sy-3,8); p.dot(sx+1,sy-19,10);
    }
    if(kind==='lava crossing' || kind==='sunken shrine') {
      const isLava=kind==='lava crossing';
      // Pick a long axis, then position a bounded channel in room coordinates.
      // Its bridge always crosses the short axis and reaches both banks.
      const axis=r(2)?'x':'y',length=2+r(11)*.2,width=1.1+r(6)*.2;
      const start=.65+r(5)*Math.max(0,4.85-.65-length)/4,bank=1.25+r(4)*.12;
      const map=(along,across,z=0)=>axis==='x'?[along,across,z]:[across,along,z];
      const corners=(inset)=>[[start+inset,bank+inset],[start+length-inset,bank+inset],
        [start+length-inset,bank+width-inset],[start+inset,bank+width-inset]].map(([a,b])=>map(a,b));
      face(corners(0),4);face(corners(.12),11);
      for(let a=start+.25;a<start+length-.3;a+=.65)for(let b=bank+.25;b<bank+width-.25;b+=.6){
        const point=(aa,bb)=>iso(...map(aa,bb));
        const ripple=isLava?[[a,b],[a+.12,b-.05],[a+.28,b+.1],[a+.34,b]]:[[a,b],[a+.28,b]];
        p.stroke(ripple.map(([aa,bb])=>point(aa,bb)),10);
      }
      const crossing=start+length*(.35+r(4)*.1)-.3,span=width+.7,count=Math.ceil(span/.45),plank=span/count;
      for(let n=0;n<count;n++){
        const across=bank-.35+n*plank,[x,y]=map(crossing,across);
        block(x,y,axis==='x'?.6:plank-.04,axis==='x'?plank-.04:.6,2,9);
        p.line(...iso(...map(crossing,across,2)),...iso(...map(crossing+.6,across,2)),7);
      }
      waterway={axis,length,width,start,bank,bridgeStart:bank-.35,bridgeEnd:bank+width+.35};
      const prop=map(Math.min(3.55,start+length-.6),4.25);
      if(isLava)chest(prop[0]-.25,prop[1]-.2);else statue(prop[0],prop[1]);
      block(.3,3.5+r(4)*.1,.5,.5,6+r(5),9);
    } else if(kind==='treasure vault') {
      chest(1.8+r(4)*.15,1.4+r(4)*.15); chest(3.4+r(3)*.15,2.3+r(4)*.15);
      [[1.7,3.4],[3.3,3.7],[3.8,3.1]].forEach(([x,y])=>{
        const [sx,sy]=iso(x,y); p.ellipse(sx,sy,6,3,4);
        for(let j=0,n=variation.integer('coins:'+x+':'+y,5,9);j<n;j++) p.rect(sx-4+r(8),sy-3+r(4),2,2,pick([7,8,10]));
      });
      statue(.7,3.2+r(5)*.15);
      const [x,y]=iso(3.4,1.2); p.line(x,y,x,y-13,4,3); p.line(x,y-1,x,y-13,8);
      p.line(x-4,y-7,x+4,y-7,10);
    } else if(kind==='summoning chamber') {
      const rune=[], runeSize=1.1+r(4)*.1,sides=variation.integer('ritual-sides',5,8); for(let n=0;n<sides;n++) {
        const a=n*Math.PI*2/sides;
        rune.push(iso(2.8+Math.cos(a)*runeSize,2.9+Math.sin(a)*runeSize));
      }
      p.stroke(rune,4,3,true); p.stroke(rune,10,1,true);
      for(let i=0;i<sides;i++)p.line(...rune[i],...rune[(i+2)%sides],10);
      block(2.42,2.55,.7,.7,4,9);
      const [x,y]=iso(2.8,2.9,7);
      p.poly([[x,y-16],[x+6,y-8],[x+4,y],[x,y+3],[x-5,y-1],[x-6,y-8]],4);
      p.poly([[x,y-14],[x+4,y-8],[x+3,y-1],[x,y+1],[x-4,y-2],[x-4,y-8]],10);
      p.poly([[x,y-14],[x,y+1],[x-4,y-2],[x-4,y-8]],8);
      statue(.7,3.3+r(5)*.1); chest(3.5+r(3)*.15,.9);
    } else {
      // An open floor pit, barred cell and abandoned table.
      const pitLeft=1.2+r(4)*.15,pitRight=3+r(3)*.15;
      face([[pitLeft,2.2],[pitRight,2.2],[pitRight,4.1],[pitLeft,4.1]],4);
      p.line(...iso(pitLeft,2.2),...iso(pitRight,2.2),5,2);
      p.line(...iso(pitLeft,2.2),...iso(pitLeft,4.1),3,2);
      const bars=variation.integer('prison-bars',4,6);
      for(let j=0;j<bars;j++) {
        const x=doorLeft+.1+j*(doorWidth-.2)/(bars-1);
        p.line(...iso(x,0,1),...iso(x,0,doorTop-2),9);
      }
      block(.3,3.5,.6,1,5,5); block(3.7,1.3,.9,.6,5,9);
      const [sx,sy]=iso(4.2,3.5); p.ellipse(sx,sy-2,5,4,4); p.ellipse(sx-1,sy-3,3,3,8);
      p.dot(sx-2,sy-3,4); p.dot(sx+1,sy-3,4); p.line(sx-2,sy+1,sx+4,sy+2,9);
    }
    // Each theme may borrow a small item from the others. The rear-left bay is
    // reserved for this prop, separate from the main bridge, pit, or ritual.
    const ex=.75,ey=waterway?.axis==='x'?.65:1.35;
    if(equipment==='supply barrel') {
      const [x,y]=iso(ex,ey);p.ellipse(x,y-4,4,6,4);p.ellipse(x-1,y-5,2.5,4.5,5);
      p.line(x-3,y-7,x+3,y-7,9);p.line(x-3,y-2,x+3,y-2,9);
    } else if(equipment==='reliquary')chest(ex-.3,ey-.2);
    else if(equipment==='crystal lantern') {
      const [x,y]=iso(ex,ey);block(ex-.2,ey-.2,.4,.4,3,9);
      p.poly([[x,y-15],[x+4,y-9],[x+2,y-4],[x-2,y-4],[x-4,y-9]],4);
      p.poly([[x,y-13],[x+2,y-9],[x+1,y-5],[x-2,y-8]],10);p.line(x,y-12,x,y-7,8);
    }
    },{outline:1,color:4,shadow:{x:2,y:3,color:4}});
    return {subject:kind,archetype:kind,projection:'2:1 dimetric',roomSize:`${columns} × ${rows} tiles`,
      columns,rows,wallHeight,wallStyle,equipment,floorPattern,door,...(waterway?{waterway}:{}),canonicalWidth:112,outlinePixels:1};
  }
};
