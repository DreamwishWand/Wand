/** An accessible, reusable intersection sentinel for progressive list rendering.
 * Consumers own list state and enforce their source-specific page-size limit.
 * A resettable observer also fills short viewports without a load-more button.
 */
export function autoAppend(node:HTMLElement,options:{hasMore:()=>boolean;load:()=>void}){
  if(typeof IntersectionObserver==='undefined')return {destroy:()=>{}};
  let destroyed=false;
  let scheduled=false;
  const observer=new IntersectionObserver(records=>{
    if(destroyed||scheduled||!records.some(entry=>entry.isIntersecting)||!options.hasMore())return;
    scheduled=true;
    options.load();
    window.requestAnimationFrame(()=>{
      scheduled=false;
      if(!destroyed){observer.unobserve(node);observer.observe(node);}
    });
  },{rootMargin:'520px 0px'});
  observer.observe(node);
  return {destroy(){destroyed=true;observer.disconnect();}};
}
