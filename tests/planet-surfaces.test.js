import test from 'node:test';
import assert from 'node:assert/strict';
import {raster,viewport,part} from '../src/raster.js';
import {recordDrawing} from '../src/drawing.js';
import {sphereUV,orbitBand} from '../src/recipes/planet-surfaces.js';

test('machine texture coordinates invert a tilted globe rather than a flat disk',()=>{
  const pitch=.4,roll=.13,cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
  const screen=(lon,lat)=>{
    const x=Math.sin(lon)*Math.cos(lat),y=Math.sin(lat),z=Math.cos(lon)*Math.cos(lat);
    const yy=y*cp+z*sp,zz=z*cp-y*sp;
    return [x*cr-yy*sr,yy*cr+x*sr,zz];
  };
  for(const lon of [-1,-.5,0,.5,1])for(const lat of [-.6,0,.6]){
    const point=screen(lon,lat);assert.ok(point[2]>0);
    const uv=sphereUV(...point,pitch,roll);
    assert.ok(Math.abs(uv[0]-lon)<1e-12);assert.ok(Math.abs(uv[1]-lat)<1e-12);
  }
  const a=screen(0,0),b=screen(.3,0),c=screen(.9,0),d=screen(1.2,0);
  assert.ok(Math.hypot(d[0]-c[0],d[1]-c[1])<Math.hypot(b[0]-a[0],b[1]-a[1]),'equal surface cells compress at the limb');
  assert.ok(Math.abs(screen(-1,0)[1]+screen(1,0)[1]-2*screen(0,0)[1])>.1,'a latitude row bows instead of staying a straight screen line');
});

test('multicolor orbital bands fill every interior sample and retain an open center',()=>{
  const size=128;
  for(const scale of [.45,.73,1])for(const angle of [-.6,0,.5])for(const bands of [2,3,4]){
    const data=new Uint8Array(size*size).fill(255),frame={x:12.3,y:17.7,scale};
    const p=viewport(raster(data,size,{pixelArt:true}),frame),settings={cx:55,cy:46,rx:43,ry:15,width:10,angle,bands};
    orbitBand(p,{...settings,back:true});orbitBand(p,{...settings,back:false});
    const co=Math.cos(angle),si=Math.sin(angle),inner=1-settings.width/settings.rx;
    let filled=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const dx=(x+.5-frame.x)/scale-settings.cx,dy=(y+.5-frame.y)/scale-settings.cy;
      const radius=Math.hypot((dx*co+dy*si)/settings.rx,(dy*co-dx*si)/settings.ry);
      if(radius>inner&&radius<1){assert.notEqual(data[y*size+x],255,'no background leaks between colored stripes');filled++;}
      if(radius<inner-.2)assert.equal(data[y*size+x],255,'central opening is never filled');
    }
    assert.ok(filled>30);assert.ok(new Set(data.filter(v=>v!==255)).size>=2,'material has multiple colors');
  }
});

test('satellite shading stays inside symmetric circles after fitting and command replay',()=>{
  const size=64;
  for(const radius of [3,4,5,6])for(const scale of [.37,.63,1,1.3]){
    const plain=new Uint8Array(size*size).fill(255),shaded=plain.slice();
    const frame={x:4.17,y:5.31,scale},transform=p=>part(viewport(p,frame),{x:1.23,y:2.57,scaleX:1.2,scaleY:.9});
    transform(raster(plain,size,{pixelArt:true})).sphere(20,20,radius,6);
    const recording=recordDrawing();
    recording.p.sphere(20,20,radius,(nx,ny,nz)=>{
      assert.ok(Math.abs(nx*nx+ny*ny+nz*nz-1)<1e-12);
      return -nx*.45-ny*.4+nz*.65>.5?8:5;
    });
    recording.draw(transform(raster(shaded,size,{pixelArt:true})));
    const points=Array.from(plain.keys()).filter(i=>plain[i]!==255),xs=points.map(i=>i%size),ys=points.map(i=>Math.floor(i/size));
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    assert.equal(right-left,bottom-top,'round even under an anisotropic part transform');
    assert.ok(right-left+1>=4,'tiny satellites retain a readable circle');
    for(let i=0;i<plain.length;i++)assert.equal(plain[i]!==255,shaded[i]!==255,'shade cannot change the silhouette');
    for(const i of points){
      const x=i%size,y=Math.floor(i/size);
      assert.notEqual(plain[y*size+left+right-x],255,'horizontal symmetry');
      assert.notEqual(plain[(top+bottom-y)*size+x],255,'vertical symmetry');
    }
  }
});
