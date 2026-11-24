<script lang="ts">
  import type {Snippet} from 'svelte';
  import type {DesignTile} from './series';
  import {catalogGridLayout} from './viewport-grid';
  import CatalogWindowChunk from './CatalogWindowChunk.svelte';
  let {items,tile,width}:{items:readonly DesignTile[];tile:Snippet<[DesignTile]>;width:number}=$props();
  // Use the actual catalog column width (including moodboard and mobile).
  let layout=$derived(catalogGridLayout(width,items.length,width<600?78:94));
</script>
<div class="virtual-grid" data-explore-grid data-total={items.length} data-columns={layout.columns} data-row-height={layout.tileSize+6}>
  {#each layout.chunks as chunk (chunk.start)}
    <CatalogWindowChunk {items} {chunk} columns={layout.columns} tileSize={layout.tileSize} {tile}/>
  {/each}
</div>
<style>
  .virtual-grid{display:grid;gap:6px;min-width:0;width:100%}
</style>
