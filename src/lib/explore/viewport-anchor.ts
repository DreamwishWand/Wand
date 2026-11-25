/** Retain the currently viewed design row when responsive column counts change.
 * Use geometry, not mounted artwork, so this also works after a direct jump. */
import {GRID_GAP} from './viewport-grid.ts';
export interface CatalogAnchor{universe:string;index:number;offset:number}
function viewportTop(catalog:HTMLElement):number{
  const header=document.querySelector('.site-header');
  const filter=catalog.querySelector('.browse-types');
  return Math.max(0,header?.getBoundingClientRect().bottom??0,filter?.getBoundingClientRect().bottom??0);
}
export function captureCatalogAnchor(catalog:HTMLElement):CatalogAnchor|null{
  const top=viewportTop(catalog);
  for(const section of catalog.querySelectorAll<HTMLElement>('[data-explore-universe]')){
    const grid=section.querySelector<HTMLElement>('[data-explore-grid]');
    if(!grid||grid.getBoundingClientRect().bottom<=top||grid.getBoundingClientRect().top>=window.innerHeight)continue;
    const columns=Number(grid.dataset.columns),stride=Number(grid.dataset.rowHeight);
    if(columns<1||stride<=GRID_GAP)continue;
    for(const chunk of grid.querySelectorAll<HTMLElement>('[data-explore-chunk]')){
      const rect=chunk.getBoundingClientRect();
      if(rect.bottom<=top)continue;
      const start=Number(chunk.dataset.exploreChunk),end=Number(chunk.dataset.chunkEnd);
      const row=Math.min(Math.ceil((end-start)/columns)-1,Math.max(0,Math.floor((top-rect.top)/stride)));
      return {universe:section.dataset.exploreUniverse??'',index:start+row*columns,offset:rect.top+row*stride-top};
    }
  }
  return null;
}
export function restoreCatalogAnchor(catalog:HTMLElement,anchor:CatalogAnchor):void{
  const section=Array.from(catalog.querySelectorAll<HTMLElement>('[data-explore-universe]')).find(e=>e.dataset.exploreUniverse===anchor.universe);
  const grid=section?.querySelector<HTMLElement>('[data-explore-grid]');
  if(!grid)return;
  const columns=Number(grid.dataset.columns),stride=Number(grid.dataset.rowHeight);
  if(columns<1||stride<=GRID_GAP)return;
  const chunk=Array.from(grid.querySelectorAll<HTMLElement>('[data-explore-chunk]')).find(e=>Number(e.dataset.exploreChunk)<=anchor.index&&anchor.index<Number(e.dataset.chunkEnd));
  if(!chunk)return;
  const row=Math.floor((anchor.index-Number(chunk.dataset.exploreChunk))/columns);
  const delta=chunk.getBoundingClientRect().top+row*stride-viewportTop(catalog)-anchor.offset;
  if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});
}
