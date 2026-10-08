export function hash(text) {
  let h=2166136261;
  for(let i=0;i<text.length;i++) h=Math.imul(h^text.charCodeAt(i),16777619);
  return h>>>0;
}
export function random(seed) {
  return n=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),seed|1);
    t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)%n;};
}
