import {writable} from 'svelte/store';
import type {Snippet} from 'svelte';
const current=writable<Snippet|null>(null);
export const serviceToolbar={subscribe:current.subscribe};
let active:Snippet|null=null;
/** Route owns its controls and state; shell only hosts the active snippet. */
export function registerServiceToolbar(snippet:Snippet):()=>void{
  active=snippet;current.set(snippet);
  return ()=>{if(active===snippet){active=null;current.set(null);}};
}
