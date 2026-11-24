<script lang="ts">
  import type {CollectionEntry,CollectionItem} from './runtime.ts';
  import type {CollectionInterfaceKey} from './interface-copy.ts';
  import {collectionHasQuantity,collectionQuantityPatch} from './manual-record.ts';
  export let item:CollectionItem;
  export let entry:CollectionEntry={};
  export let copy:Readonly<Record<CollectionInterfaceKey,string>>;
  export let disabled=false;
  export let onToggle:()=>void;
  export let onQuantity:(value:string)=>void;

  function finishQuantity(event:Event):void{
    const input=event.currentTarget as HTMLInputElement;
    const patch=collectionQuantityPatch(input.value);
    if(!patch){input.value=String(entry.quantity??0);return;}
    if(patch.quantity!==(entry.quantity??0))onQuantity(input.value);
  }
</script>

<div class="quick-record">
  <input type="checkbox" class="item-state-toggle"
    checked={entry.status==='owned'} {disabled}
    aria-label={item.label+(entry.status==='owned'?copy.markMissing:copy.markOwned)}
    title={entry.status==='owned'?copy.ownedTip:copy.missingTip}
    on:change={onToggle}/>
  {#if collectionHasQuantity(item)}
    <input type="number" class="item-quantity-input" min="0" max="999999" step="1" inputmode="numeric"
      value={entry.quantity??0} {disabled}
      aria-label={item.label+' · '+copy.manualQuantity} title={copy.manualQuantity}
      on:focus={event=>event.currentTarget.select()}
      on:change={finishQuantity}
      on:keydown={event=>{
        if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}
        if(event.key==='Escape'){event.currentTarget.value=String(entry.quantity??0);event.currentTarget.blur();}
      }}/>
  {/if}
</div>
<style>
  .quick-record{display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:0;flex-shrink:0}
  .quick-record input[type="checkbox"]{appearance:auto;width:19px;height:19px;min-width:19px;margin:0;cursor:pointer;accent-color:var(--wand-accent,#6584b7)}
  .quick-record input[type="checkbox"]:disabled{cursor:default;opacity:.55}
  .item-quantity-input{box-sizing:border-box;width:48px;min-width:0;min-height:26px;padding:2px 4px;text-align:right;font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:5px}
  .item-quantity-input:disabled{opacity:.55}
</style>
