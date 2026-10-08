import {drawCover,styles} from '../src/index.js';
const $=s=>document.querySelector(s),grid=$('#grid'),titleInput=$('#title'),zoom=$('#zoom'),zoomCanvas=zoom.querySelector('canvas'),zoomLabel=zoom.querySelector('div');
const params=new URLSearchParams(location.search);
if(params.get('title'))titleInput.value=params.get('title');
let rows=0,busy=false;
const toast=text=>{const t=$('#toast');t.textContent=text;t.style.opacity=1;clearTimeout(toast.id);toast.id=setTimeout(()=>t.style.opacity=0,1200);};
function reset(){
  document.body.style.setProperty('--head',document.querySelector('header').offsetHeight+'px');
  grid.replaceChildren();rows=0;
  grid.style.setProperty('--cols',styles.length);
  for(const s of styles){const h=document.createElement('div');h.className='colhead';h.textContent=s.id;grid.append(h);}
  more(4);fill();
}
// One row = one new variant for every style, in a stable column order.
function more(n=4){
  if(busy)return;busy=true;
  const title=titleInput.value.trim()||'Pocket Worlds';
  for(let k=0;k<n;k++,rows++)for(const s of styles){
    const cell=document.createElement('div'),canvas=document.createElement('canvas'),tag=document.createElement('div'),sub=document.createElement('div');
    cell.className='cell';tag.className='tag';sub.className='sub';
    const ref=`${s.id} #${rows}`;
    try{
      const c=drawCover(canvas,title,{style:s.id,variant:rows});
      tag.textContent=ref;
      sub.textContent=[c.traits.archetype||c.traits.creature,c.look&&`${c.look.mood}/${c.look.treatment}`,c.look&&`T${c.look.tier}`].filter(Boolean).join(' · ');
    }catch(e){tag.textContent=ref+' (error)';sub.textContent=e.message;}
    canvas.title=`${ref} — "${title}"`;
    canvas.onclick=()=>{const text=`${ref} "${title}"`;navigator.clipboard?.writeText(text);toast('Copied: '+text);};
    canvas.onmouseenter=()=>{const z=zoomCanvas.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(canvas,0,0);zoomLabel.textContent=ref;zoom.style.display='block';};
    canvas.onmouseleave=()=>zoom.style.display='none';
    canvas.onmousemove=e=>{const w=264,h=290,x=e.clientX+18+w>innerWidth?e.clientX-18-w:e.clientX+18,y=Math.min(innerHeight-h-4,Math.max(4,e.clientY-h/2));zoom.style.left=x+'px';zoom.style.top=y+'px';};
    cell.append(canvas,tag,sub);grid.append(cell);
  }
  busy=false;
}
// Keep adding rows while the bottom is within reach. An IntersectionObserver
// alone stalls on tall windows: it never re-fires if the sentinel stays visible.
const near=()=>$('#sentinel').getBoundingClientRect().top<innerHeight+900;
function fill(){let guard=0;while(near()&&guard++<20)more(2);}
addEventListener('scroll',()=>requestAnimationFrame(fill),{passive:true});
addEventListener('resize',fill);
titleInput.onchange=reset;
reset();
