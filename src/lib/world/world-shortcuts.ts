/** Desktop editing keys. Do not consume text, IME, or unrelated browser commands. */
export type WorldShortcut='copy'|'cut'|'paste'|'duplicate'|'select-all'|'undo'|'redo'|'delete'|'cancel'|'confirm'|'rotate-left'|'rotate-right'|'left'|'right'|'up'|'down'|'zoom-in'|'zoom-out'|'fit';
export function worldShortcut(e:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'shiftKey'|'altKey'|'isComposing'|'repeat'>):WorldShortcut|null{
 if(e.isComposing||e.altKey||e.ctrlKey&&e.metaKey)return null;
 const k=e.key.toLowerCase();
 if(e.ctrlKey||e.metaKey){
  if(e.repeat)return null;
  if(k==='z')return e.shiftKey?'redo':'undo';
  if(e.shiftKey)return null;
  return ({c:'copy',x:'cut',v:'paste',d:'duplicate',a:'select-all',y:'redo'} as const)[k as 'c'|'x'|'v'|'d'|'a'|'y']??null;
 }
 if(k==='r')return e.shiftKey?'rotate-left':'rotate-right';
 if(k==='+'||k==='=')return 'zoom-in';if(k==='-'||k==='−')return 'zoom-out';if(k==='0')return 'fit';
 if(e.shiftKey)return null;
 return ({delete:'delete',backspace:'delete',escape:'cancel',enter:'confirm',arrowleft:'left',arrowright:'right',arrowup:'up',arrowdown:'down'} as const)[k as 'delete'|'backspace'|'escape'|'enter'|'arrowleft'|'arrowright'|'arrowup'|'arrowdown']??null;
}
export function worldShortcutTarget(e:KeyboardEvent,root:HTMLElement|undefined):boolean{
 if(e.defaultPrevented||!root?.isConnected||!root.getClientRects().length||document.querySelector('[aria-modal="true"]'))return false;
 const target=e.target;
 if(!(target instanceof HTMLElement))return false;
 if(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="dialog"]'))return false;
 // Do not hijack the shared header or another service. Body focus is allowed
 // after clicking the map; hidden map panels cannot handle commands.
 return target===document.body||root.contains(target);
}
export const NUDGE:Partial<Record<WorldShortcut,readonly [number,number]>>={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
