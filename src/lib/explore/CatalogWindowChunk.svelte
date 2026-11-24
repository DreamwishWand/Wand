<script lang="ts">
  import type {Snippet} from 'svelte';
  import type {DesignTile} from './series';
  import {observeCatalogChunk} from './viewport-observer';
  import type {GridChunk} from './viewport-grid';
  let {items,chunk,columns,tileSize,tile}:{
    items:readonly DesignTile[];chunk:GridChunk;columns:number;tileSize:number;tile:Snippet<[DesignTile]>
  }=$props();
  let visible=$state(false);
  let focusWithin=$state(false);
  function lostFocus(event:FocusEvent){
    if(!(event.relatedTarget instanceof Node)||!(event.currentTarget as HTMLElement).contains(event.relatedTarget))focusWithin=false;
  }
</script>
<div class="window-chunk" data-explore-chunk={chunk.start} data-mounted={visible||focusWithin}
  style:height={chunk.height+'px'} use:observeCatalogChunk={(value)=>visible=value}
  onfocusin={()=>focusWithin=true} onfocusout={lostFocus}>
  {#if visible||focusWithin}
    <div class="window-tiles" style:grid-template-columns={'repeat('+columns+',minmax(0,1fr))'} style:grid-auto-rows={tileSize+'px'}>
      {#each items.slice(chunk.start,chunk.end) as design (design.key)}
        {@render tile(design)}
      {/each}
    </div>
  {/if}
</div>
<style>
  .window-chunk{min-width:0;position:relative}
  .window-tiles{display:grid;gap:6px;min-width:0}
</style>
