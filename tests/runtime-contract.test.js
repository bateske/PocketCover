import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('cover runtime has only local JavaScript dependencies and no image-input APIs',()=>{
  // Follow the actual renderer graph. Gallery PNGs and exported examples are
  // outputs; title font tables are deliberately retained as typography.
  const seen=new Set();
  function audit(url){
    if(seen.has(url.href))return;seen.add(url.href);
    const source=readFileSync(url,'utf8');
    assert.doesNotMatch(source,/\b(?:fetch|Image|createImageBitmap|drawImage|XMLHttpRequest)\s*\(/,url.pathname);
    for(const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)){
      assert.match(match[1],/^\.\.?\/.*\.js$/,url.pathname+' dependency '+match[1]);
      audit(new URL(match[1],url));
    }
  }
  audit(new URL('../src/index.js',import.meta.url));
  assert.ok(seen.size>20,'checks recipes and shared renderer, not just entrypoint');
});
