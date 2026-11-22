/**
 * Incremental Guide lists: load the next batch when the bottom approaches
 * the viewport. In browsers without IntersectionObserver, expose all of the
 * already-verified local index instead of leaving a manual pagination gate.
 *
 * The Svelte caller owns the count, resets it after filter changes, and keys
 * the sentinel by filter revision + count so the next near-end check is armed.
 */
export const GUIDE_AUTOLOAD_ROOT_MARGIN='480px 0px';

export function observeGuideListEnd(node,onApproach){
  if(!node||typeof onApproach!=='function'){
    throw new TypeError('Guide auto-load requires a node and callback');
  }
  if(typeof IntersectionObserver==='undefined'){
    onApproach(true);
    return {destroy(){}};
  }
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.target===node&&entry.isIntersecting)){
      onApproach(false);
    }
  },{root:null,rootMargin:GUIDE_AUTOLOAD_ROOT_MARGIN,threshold:0});
  observer.observe(node);
  return {destroy(){observer.disconnect()}};
}
