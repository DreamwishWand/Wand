/** One shared native observer across all Explore grids. */
const callbacks=new Map<Element,(visible:boolean)=>void>();
let observer:IntersectionObserver|undefined;
export function observeCatalogChunk(node:HTMLElement,visible:(value:boolean)=>void){
  if(typeof IntersectionObserver==='undefined'){visible(true);return {destroy(){}};}
  if(!observer)observer=new IntersectionObserver(entries=>{
    for(const entry of entries)callbacks.get(entry.target)?.(entry.isIntersecting);
  },{rootMargin:'180px 0px',threshold:0});
  callbacks.set(node,visible);
  observer.observe(node);
  return {destroy(){
    observer?.unobserve(node);callbacks.delete(node);
    if(!callbacks.size){observer?.disconnect();observer=undefined;}
  }};
}
