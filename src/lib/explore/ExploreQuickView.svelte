<script lang="ts">
  import {base} from '$app/paths';
  import {onDestroy,type Snippet} from 'svelte';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {collectionAcquisitionCopy} from '$lib/collection/acquisition-copy';
  import {acquireCollectionEvidenceClient,type CollectionEvidenceHandle} from '$lib/collection/source-evidence-client';
  import type {CollectionAcquisitionWithDistribution} from '$lib/collection/distribution-evidence';
  import type {WandLanguage} from '$lib/ui/preferences';
  import {exploreLabel} from './copy';
  import {itemEntityHref} from '$lib/items/entity-item-url';
  import {ITEM_ENTITY_PAGE_AVAILABLE} from './item-page-availability';
  import type {ExploreItem} from './model';
  let {item,name,locale,sourcePath,attributes,owned,actions,variants,close,relatedWorks}:{
    item:ExploreItem;name:string;locale:WandLanguage;sourcePath:string|null;
    attributes:readonly {label:string;values:readonly string[]}[];
    owned:boolean;actions:Snippet;variants?:Snippet;close:()=>void;
    relatedWorks?:Snippet<[number]>;
  }=$props();
  const label=(key:string)=>exploreLabel(locale,key);
  let acquisition=$state.raw<CollectionAcquisitionWithDistribution|null>(null);
  let loading=$state(false);
  let failed=$state(false);
  let attempt=$state(0);
  let client:CollectionEvidenceHandle|undefined;
  onDestroy(()=>client?.release());
  const copy=$derived(collectionAcquisitionCopy(locale));
  $effect(()=>{
    const id=item.itemId;void attempt;
    let live=true;
    acquisition=null;loading=true;failed=false;
    client??=acquireCollectionEvidenceClient();
    void client.loadAcquisition(id,base).then(result=>{
      if(live){acquisition=result;loading=false;}
    },()=>{if(live){loading=false;failed=true;}});
    return()=>{live=false;};
  });
</script>
<svelte:window onkeydown={e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();close();}}}/>
<aside class="quick-view" aria-label={label('quickView')} data-quick-view data-item-id={item.itemId}>
  <header><h2>{name}</h2><button class="close" aria-label={label('close')} title={label('close')} onclick={close}><WandIcon name="close" size={20}/></button></header>
  <div class="quick-art"><ItemArtwork itemId={item.itemId} alt={name} {sourcePath} large/></div>
  <div class="quick-actions">{@render actions()}</div>
  {#if variants}{@render variants()}{/if}
  {#if attributes.length}
    <dl class="attributes">
      {#each attributes as row (row.label)}
        {#if row.values.length}<div><dt>{row.label}</dt><dd>{row.values.join(' · ')}</dd></div>{/if}
      {/each}
    </dl>
  {/if}
  {#if relatedWorks}{@render relatedWorks(item.itemId)}{/if}
  {#if owned}<p class="owned"><WandIcon name="owned" size={16}/>{label('ownedConfirmed')}</p>{/if}
  {#if loading}<p class="minor" role="status">{copy.loading}</p>
  {:else if failed}<p class="minor">{copy.error} <button onclick={()=>attempt++}>{copy.retry}</button></p>
  {:else if acquisition?.kinds.length}
    <div class="minor"><strong>{copy.title}</strong><p>{acquisition.kinds.map(k=>copy.kinds[k]).join(' · ')}</p><small>{copy.caveat}</small></div>
  {/if}
  {#if ITEM_ENTITY_PAGE_AVAILABLE}
    <a class="page-link" href={itemEntityHref(base,item.itemId,locale)}>{label('itemPage')}<WandIcon name="arrow" size={18}/></a>
  {:else}
    <button class="page-link" disabled title={label('itemPagePending')}>{label('itemPage')}<WandIcon name="arrow" size={18}/></button>
    <small class="pending">{label('itemPagePending')}</small>
  {/if}
</aside>
<style>
  .quick-view{min-width:0;padding:12px;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:10px;overflow:auto;box-sizing:border-box}
  header{display:flex;align-items:flex-start;gap:8px;justify-content:space-between;margin-bottom:8px}
  h2{font-size:1.05rem;line-height:1.4;overflow-wrap:anywhere;margin:0}
  button,a{border:1px solid var(--wand-line);border-radius:7px;background:var(--wand-menu);color:inherit;padding:6px 9px}
  .close{flex:none;display:grid;place-items:center;padding:4px;min-width:32px;min-height:32px;cursor:pointer}
  .quick-art{display:block;width:100%;height:clamp(156px,25vh,260px);min-height:0;overflow:hidden}
  .quick-actions{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px}
  .attributes{display:grid;gap:7px;margin:12px 0}
  .attributes>div{display:grid;grid-template-columns:minmax(74px,32%) minmax(0,1fr);gap:8px;align-items:baseline;font-size:.83rem}
  dt{opacity:.72}dd{margin:0;overflow-wrap:anywhere}
  .owned{display:flex;align-items:center;gap:5px;font-size:.82rem}
  .minor{font-size:.78rem;line-height:1.4;margin:8px 0}
  .minor p{margin:3px 0}.minor small,.pending{opacity:.75}
  .page-link{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;box-sizing:border-box;text-decoration:none;margin-top:10px;font-weight:600}
  .page-link:not(:disabled){background:var(--wand-accent-strong);color:var(--wand-accent-contrast)}
  .page-link:disabled{opacity:.6;cursor:not-allowed}.pending{display:block;margin-top:4px;font-size:.72rem}
</style>
