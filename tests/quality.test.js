import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanSubject,inspectSubject,TRANSPARENT} from '../src/quality.js';
import {generateCover,createGenerator,styles} from '../src/index.js';
const blank=(size=8)=>new Uint8Array(size*size).fill(TRANSPARENT);

test('occupancy cleanup removes a detached pixel, not a one-color glint on a body',()=>{
  const layer=blank();
  for(let y=2;y<5;y++)for(let x=2;x<5;x++)layer[y*8+x]=6;
  layer[3*8+3]=8;layer[7]=7;
  const before=inspectSubject(layer,{size:8});
  assert.deepEqual(before.detached,[{x:7,y:0,color:7}]);
  assert.ok(before.colorSingletons.some(p=>p.x===3&&p.y===3));
  assert.deepEqual(cleanSubject(layer,{size:8}),[[7,0]]);
  assert.equal(layer[3*8+3],8);assert.equal(layer[7],TRANSPARENT);
});
test('diagonal connections, two-pixel marks and border positions are preserved correctly',()=>{
  const layer=blank();for(let i=1;i<6;i++)layer[i*8+i]=6;
  layer[6*8+1]=7;layer[6*8+2]=7;
  assert.deepEqual(cleanSubject(layer,{size:8}),[]);
  const edges=blank();edges[7]=6;edges[8]=6;
  assert.deepEqual(cleanSubject(edges,{size:8}),[[7,0],[0,1]],'rows must not wrap into false neighbors');
});
test('an intentional detached mark is preserved only while its exact color survives',()=>{
  const layer=blank();layer[20]=8;
  const intent=new Map([[20,{color:8,reason:'One distant star'}]]);
  assert.deepEqual(cleanSubject(layer,{size:8,intent}),[]);
  layer[20]=6;
  assert.deepEqual(cleanSubject(layer,{size:8,intent}),[[4,2]],'overwritten intent is stale');
});
test('engine requires a reason for deliberate isolated details and scopes cleanup before text',()=>{
  const definition={id:'probe',revision:1,render({p}){p.detail(11,11,8,'Intentional signal light');p.dot(100,80,7);return {};}};
  const engine=createGenerator([definition]);
  const c=engine.generateCover('I!?',{diagnostics:true});
  assert.equal(c.quality.removedDetachedPixels,1);
  assert.equal(c.quality.afterCleanup.detached.length,1);
  assert.equal(c.quality.afterCleanup.detached[0].reason,'Intentional signal light');
  assert.ok(c.indices.slice(0,c.titleBottom*128).some(i=>i===10));
  assert.throws(()=>createGenerator([{...definition,render({p}){p.detail(1,1,8,'');}}]).generateCover('Test'));
});
test('seed sweep has no unmarked detached one-pixel subjects; diagnostics never change pixels',()=>{
  for(const {id} of styles.filter(s=>s.id!=='mascot'))for(let variant=0;variant<16;variant++){
    const title=variant%2?'ABCDEFGHIJKLMNOPQRSTUVWXYZ12345':'Potato Pancake';
    const c=generateCover(title,{style:id,variant,diagnostics:true});
    assert.ok(c.quality.afterCleanup.detached.every(p=>p.reason),`${id} ${variant}: unmarked detached pixel`);
    if(variant===0)assert.deepEqual(c.indices,generateCover(title,{style:id,variant}).indices);
  }
});
