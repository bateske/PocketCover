import {drawCover,styles} from '../src/index.js';
const $=s=>document.querySelector(s),gallery=$('#gallery'),titleInput=$('#title'),styleInput=$('#style');
const params=new URLSearchParams(location.search);
for(const style of styles){const option=document.createElement('option');option.value=style.id;option.textContent=style.label;styleInput.append(option);}
styleInput.value=styles.some(s=>s.id===params.get('style'))?params.get('style'):'spaceships';
titleInput.value=params.get('title')||'Star Patrol';
const start=Number(params.get('variant')||0);
let selectedVariant=Number.isSafeInteger(start)&&start>=0?start:0,offset=Math.floor(selectedVariant/12)*12,currentCover,appliedTitle,appliedStyle;
const pretty=text=>text.replaceAll('-',' ');
function select(variant){
  selectedVariant=variant;currentCover=drawCover($('#preview'),appliedTitle,{style:appliedStyle,variant});
  const style=styles.find(s=>s.id===currentCover.style);
  $('#selected-title').textContent=pretty(currentCover.traits.archetype||currentCover.traits.creature||style.label);
  $('#selected-meta').textContent=`${style.label} · variant ${variant} · generator ${currentCover.version}`;
  $('#palette').replaceChildren(...[...currentCover.palette].map(color=>{const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background='#'+color.toString(16).padStart(6,'0');swatch.title=swatch.style.background;return swatch;}));
  for(const button of gallery.children)button.setAttribute('aria-pressed',String(Number(button.dataset.variant)===variant));
  // Local-file previews work without an HTTP origin or history permissions.
  if(location.protocol!=='file:')history.replaceState(null,'','?'+new URLSearchParams({title:currentCover.title,style:currentCover.style,variant:String(variant)}));
}
function render(){
  try{
    // Validate before replacing the currently usable gallery.
    const cards=[];
    for(let i=0;i<12;i++){
      const variant=offset+i;if(!Number.isSafeInteger(variant))break;
      const button=document.createElement('button'),canvas=document.createElement('canvas'),caption=document.createElement('span'),number=document.createElement('span'),trait=document.createElement('span');
      const cover=drawCover(canvas,titleInput.value,{style:styleInput.value,variant});
      button.type='button';button.className='sample';button.dataset.variant=variant;button.setAttribute('aria-label',`Select variant ${variant}, ${pretty(cover.traits.archetype||cover.traits.creature||cover.style)}`);
      canvas.setAttribute('aria-hidden','true');caption.className='caption';number.className='number';number.textContent='VARIANT '+String(variant).padStart(2,'0');trait.className='trait';trait.textContent=pretty(cover.traits.archetype||cover.traits.creature||cover.style);
      caption.append(number,trait);button.append(canvas,caption);button.onclick=()=>{try{select(variant);$('#message').textContent='Selected variant '+variant+'.';}catch(e){$('#message').textContent=e.message;}};cards.push(button);
    }
    appliedTitle=titleInput.value;appliedStyle=styleInput.value;
    gallery.replaceChildren(...cards);select(selectedVariant>=offset&&selectedVariant<offset+12?selectedVariant:offset);
    $('#download').disabled=false;
    $('#gallery-title').textContent=styles.find(s=>s.id===styleInput.value).label;
    $('#range').textContent=`Variants ${offset}–${offset+cards.length-1} · all previews at 2×`;
    $('#previous').disabled=offset===0;$('#next').disabled=!Number.isSafeInteger(offset+12);
    $('#message').textContent='Same title, style and variant always reproduce the same cover.';
  }catch(error){$('#message').textContent=error.message;}
}
$('form').onsubmit=e=>{e.preventDefault();offset=selectedVariant=0;render();};
styleInput.onchange=()=>{offset=selectedVariant=0;render();};
$('#previous').onclick=()=>{offset=Math.max(0,offset-12);selectedVariant=offset;render();};
$('#next').onclick=()=>{if(Number.isSafeInteger(offset+12)){offset+=12;selectedVariant=offset;render();}};
$('#download').disabled=true;
$('#download').onclick=()=>{if(!currentCover)return;const cover=currentCover;$('#preview').toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${cover.title.replace(/[^a-z0-9]+/gi,'-')}-${cover.style}-v${cover.variant}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');};
render();
