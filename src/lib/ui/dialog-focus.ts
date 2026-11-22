import type {Action} from 'svelte/action';

/** Keep keyboard navigation inside a shared shell dialog and return to its trigger. */
export interface DialogFocusOptions {
  fallback?:()=>HTMLElement|null;
}

const FOCUSABLE=[
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export const dialogFocus:Action<HTMLElement,DialogFocusOptions>=(panel,options={})=>{
  const active=document.activeElement;
  const previous=active instanceof HTMLElement&&active!==document.body?active:null;
  const available=()=>Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(element=>element.getClientRects().length>0&&element.getAttribute('aria-hidden')!=='true');

  panel.tabIndex=-1;
  (available()[0]??panel).focus();

  function onKeyDown(event:KeyboardEvent):void{
    if(event.key!=='Tab'||event.defaultPrevented)return;
    const elements=available();
    if(elements.length===0){
      event.preventDefault();panel.focus();return;
    }
    const first=elements[0],last=elements[elements.length-1];
    const focused=document.activeElement;
    if(event.shiftKey&&(focused===first||!panel.contains(focused))){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey&&(focused===last||!panel.contains(focused))){
      event.preventDefault();first.focus();
    }
  }
  panel.addEventListener('keydown',onKeyDown);
  return {destroy(){
    panel.removeEventListener('keydown',onKeyDown);
    queueMicrotask(()=>{
      const original=previous?.isConnected&&previous.getClientRects().length>0?previous:null;
      const target=original??options.fallback?.();
      if(target?.isConnected&&target.getClientRects().length>0)target.focus();
    });
  }};
};
