<script lang="ts">
  import type {Snippet} from 'svelte';
  import type {SeriesShelf,DesignTile} from './series';
  import {designTiles} from './series';
  import {catalogGridLayout,seriesBlockSpan} from './viewport-grid';
  let {groups,block}:{groups:readonly SeriesShelf[];block:Snippet<[SeriesShelf,DesignTile[],number]>}=$props();
  let width=$state(0);
  const columns=$derived(catalogGridLayout(width,0,width<600?88:104).columns);
  const entries=$derived(groups.map(group=>({group,designs:designTiles(group.items)})));
</script>
<div class="series-block-grid" data-series-block-grid data-columns={columns}
  style:grid-template-columns={'repeat('+columns+',minmax(0,1fr))'} bind:clientWidth={width}>
  {#each entries as {group,designs} (group.key)}
    {@const span=seriesBlockSpan(designs.length,columns)}
    <div class="series-block" data-series-block={group.key} data-span={span} style:grid-column={'span '+span}>
      {@render block(group,designs,span)}
    </div>
  {/each}
</div>
<style>
  .series-block-grid{display:grid;gap:8px;align-items:start;min-width:0}
  .series-block{min-width:0;box-sizing:border-box;border:1px solid var(--wand-line);border-radius:8px;padding:5px;align-self:start}
</style>
