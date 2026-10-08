// FROZEN - mascot v8 classic snapshot; never edit.
// Verbatim engine-18 copies of palette.js:1-28 (createPalette, with private
// copies of color, vivid and the bootloader guard) and title.js:3-44
// (titleLayout, drawTitle), renamed legacy*. tests/mascot-v8.json and
// `npm run digest -- --scope compat` check these bytes. Engine-19 palettes
// and titles are built in palette.js and title.js, never here.
import {fonts} from './font.js';
const SIZE=128;

function color(h,s,l) {
  h=((h%360)+360)%360/60;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),m=l-c/2;
  const rgb=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h)];
  return rgb.reduce((v,c)=>(v<<8)|Math.round((c+m)*255),0);
}
// HSV value reaches full channel range on the LCD.
function vivid(h,s,v=1) {return color(h,s*v/(1-Math.abs(v*(2-s)-1)),v*(1-s/2));}

// CHGame spec/chgame.md: #FF00FF selects animated palette slot 15. Also
// exclude nearby RGB888 values that would collapse to its RGB565 encoding.
function bootloaderSafeColor(rgb) {
  const red=rgb>>>16&255,green=rgb>>>8&255,blue=rgb&255;
  return red>=248&&green<8&&blue>=248?(rgb&0xffff00)|240:rgb;
}

export function legacyPalette(r) {
  const hue=r(360),bgHue=hue+150+r(61);
  // Twelve colors: scenery, ink, mascot, ivory, moon, and two title tones.
  // Fits the CHGame limit of 11 custom colors plus its reserved menu colors.
  return Uint32Array.from([
    color(bgHue,.32,.12),color(bgHue,.34,.17),color(bgHue,.30,.25),color(bgHue,.32,.20),
    0x101217,vivid(hue,.68,.60),vivid(hue,.62),vivid(hue,.48),
    0xfff4d6,color(bgHue,.24,.40),
    vivid(hue+(bgHue-hue)/2+180,.50),vivid(hue+(bgHue-hue)/2+180,.45,.82),
  ],bootloaderSafeColor);

}

export function legacyTitleLayout(title) {
  // Each size is a different native bitmap face, never enlarged source pixels.
  for(const font of [0,1,2]) {
    // This display face reuses digit drawings for some punctuation (e.g. &).
    // Use the complete smaller face instead of silently changing the title.
    if(font===0&&!/^[A-Z0-9 !?.,'-]+$/.test(title))continue;
    const glyph=c=>fonts[font][c.charCodeAt(0)-32];
    const measure=s=>{
      let pen=0,left=0,right=0,top=0,bottom=0;
      for(const c of s){const [advance,w,bearing,t,...rows]=glyph(c);
        left=Math.min(left,pen+bearing);right=Math.max(right,pen+bearing+w);
        top=Math.max(top,t);bottom=Math.max(bottom,rows.length-t);pen+=advance;
      }
      return {width:right-left,left,top,bottom};
    };
    const candidates=[];
    if(measure(title).width<=116)candidates.push([title]);
    for(let i=1;i<title.length;i++){
      if(font<2&&title[i]!==' ')continue;
      const lines=[title.slice(0,i).trim(),title.slice(i).trim()];
      if(lines.every(line=>line&&measure(line).width<=116))candidates.push(lines);
    }
    if(candidates.length){
      candidates.sort((a,b)=>a.length-b.length||Math.abs(measure(a[0]).width-measure(a[1]||'').width)-Math.abs(measure(b[0]).width-measure(b[1]||'').width));
      const lines=candidates[0],metrics=lines.map(measure);
      const top=Math.max(...metrics.map(m=>m.top)),bottom=Math.max(...metrics.map(m=>m.bottom));
      return {lines,font,measure,top,lineHeight:top+bottom+3,bottom:7+lines.length*(top+bottom)+(lines.length-1)*3};
    }
  }
  throw Error('Title is too wide.');
}

export function legacyDrawTitle(p,layout) {
  const {lines,font,measure,top,lineHeight}=layout;
  const drawText=(line,y,dx,dy,c)=>{
    const bounds=measure(line);let x=Math.round((SIZE-bounds.width)/2)-bounds.left;
    for(const ch of line){const [advance,w,left,top,...rows]=fonts[font][ch.charCodeAt(0)-32];
      rows.forEach((bits,j)=>{const row=bounds.top-top+j;for(let i=0;i<w;i++)if(bits&(1<<(w-1-i)))p.dot(x+left+i+dx,y-top+j+dy,c===10?(row===0?8:row<(bounds.top+bounds.bottom)*.66?10:11):c);});x+=advance;
    }
  };
  lines.forEach((line,i)=>{const y=7+top+i*lineHeight;drawText(line,y,1,2,4);drawText(line,y,0,0,10);});
}
