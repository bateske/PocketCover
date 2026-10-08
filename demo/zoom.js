// 200% hover tooltip shared by the studio gallery and the scroller: a
// nearest-neighbour copy of the hovered 128px canvas at 256x256 CSS px that
// follows the cursor and flips to stay inside the viewport.
let zoom,zoomCanvas,zoomLabel;
function ensure(){
  if(zoom)return;
  zoom=document.getElementById('zoom');
  if(!zoom){zoom=document.createElement('div');zoom.id='zoom';zoom.setAttribute('aria-hidden','true');zoom.append(document.createElement('canvas'),document.createElement('div'));document.body.append(zoom);}
  zoomCanvas=zoom.querySelector('canvas');zoomLabel=zoom.querySelector('div');
}
function place(e){
  const w=zoom.offsetWidth||274,h=zoom.offsetHeight||300,gap=18;
  const x=e.clientX+gap+w>innerWidth?Math.max(4,e.clientX-gap-w):e.clientX+gap;
  const y=Math.min(innerHeight-h-4,Math.max(4,e.clientY-h/2));
  zoom.style.left=x+'px';zoom.style.top=y+'px';
}
export function attachZoom(target,canvas,label){
  target.addEventListener('mouseenter',e=>{
    ensure();zoomCanvas.width=canvas.width;zoomCanvas.height=canvas.height;
    const z=zoomCanvas.getContext('2d');z.imageSmoothingEnabled=false;z.clearRect(0,0,canvas.width,canvas.height);z.drawImage(canvas,0,0);
    zoomLabel.textContent=typeof label==='function'?label():label;zoom.style.display='block';place(e);
  });
  target.addEventListener('mousemove',e=>{if(zoom)place(e);});
  target.addEventListener('mouseleave',()=>{if(zoom)zoom.style.display='none';});
}
