<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import type {CompleteItemMasterRecord,ItemMasterLocale} from './public-item-master';
  import {currentItemViewMaster} from './item-view-master';
  import {itemEntityHref,itemPageCopy} from './entity-item-url';
  import {itemPageNativeFacts,readItemPageRelations,type ItemPageRelations} from './item-page-details';
  import {formatPublicGuideText} from '$lib/guide/public-guide';
  import {collectionInterfaceCopy} from '$lib/collection/interface-copy';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  export let record:CompleteItemMasterRecord;
  export let locale:ItemMasterLocale;
  let mounted=false,loading=false,failed=false,sequence=0;
  let description='';
  let relations:ItemPageRelations|null=null;
  $: native=itemPageNativeFacts(record);
  $: copy=itemPageCopy(locale);
  $: interfaceCopy=collectionInterfaceCopy(locale);
  onMount(()=>{mounted=true;});
  onDestroy(()=>{sequence++;});
  async function load(row:CompleteItemMasterRecord,language:ItemMasterLocale){
    const ticket=++sequence;description='';relations=null;failed=false;loading=true;
    try{
      const db=await currentItemViewMaster(base);
      const [text,links]=await Promise.allSettled([db.getLocalizedItemText(row.itemId,language),readItemPageRelations(db,row,language)]);
      if(ticket!==sequence)return;
      if(text.status==='fulfilled')description=formatPublicGuideText(text.value?.Description?.text??text.value?.DescriptionText?.text??'');
      if(links.status==='fulfilled')relations=links.value;
      failed=text.status==='rejected'||links.status==='rejected'||relations?.partial===true;
    }catch{if(ticket===sequence)failed=true;}
    finally{if(ticket===sequence)loading=false;}
  }
  $: if(mounted)void load(record,locale);
</script>
{#if description||native.footprint||native.energy!==null}
  <section class="native-item-summary">
    <h2>{copy.attributes}</h2>
    {#if description}<p>{description}</p>{/if}
    {#if native.footprint||native.energy!==null}<dl>
      {#if native.footprint}<dt>{copy.dimensions}</dt><dd>{native.footprint.x} × {native.footprint.y}</dd>{/if}
      {#if native.energy!==null}<dt>{copy.energy}</dt><dd>{native.energy.toLocaleString(locale)}</dd>{/if}
    </dl>{/if}
  </section>
{/if}
{#if loading}<p role="status" class="optional-state">{interfaceCopy.loading}</p>{/if}
{#if failed}<p role="status" class="optional-state">{copy.incomplete}</p>{/if}
{#each [{title:copy.baseEntity,rows:relations?.parent??[]},{title:record.nativeCategory==='Character'?copy.dreamStyles:copy.mountStyles,rows:relations?.styles??[]},{title:copy.mountGear,rows:relations?.gear??[]},{title:copy.series,rows:relations?.series??[]},{title:copy.recipeUses,rows:relations?.recipeResults??[]}] as section}
  {#if section.rows.length}
    <section class="related-item-section">
      <h2>{section.title} <small>{section.rows.length}</small></h2>
      <div class="related-item-grid">
        {#each section.rows as row (row.itemId)}
          <a href={itemEntityHref(base,row.itemId,locale)} class="related-item-card">
            <span class="related-item-art"><ItemArtwork itemId={row.itemId} alt="" allowHistoricalFallback={false}/></span>
            <span class="related-item-name">{row.name}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/each}
<style>
  h2{font-size:16px;margin:0 0 10px}h2 small{font-size:12px;color:var(--wand-muted);font-weight:400}
  .native-item-summary,.related-item-section{margin:16px 0;min-width:0}
  .native-item-summary p{white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere}
  dl{display:flex;gap:8px 18px;flex-wrap:wrap;align-items:center}dt{color:var(--wand-muted)}dd{margin:0;font-weight:600}
  .related-item-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,112px),1fr));gap:8px}
  .related-item-card{display:grid;grid-template-rows:96px auto;gap:6px;padding:6px;border:1px solid var(--wand-line);border-radius:8px;background:var(--wand-card);color:var(--wand-text);text-align:center;text-decoration:none;min-width:0}
  .related-item-card:hover,.related-item-card:focus-visible{border-color:var(--wand-accent)}
  .related-item-art{display:grid;grid-template:minmax(0,1fr)/minmax(0,1fr);min-height:0;min-width:0;background:var(--wand-surface-raised);border-radius:5px;overflow:hidden}
  .related-item-name{font-size:12px;overflow-wrap:anywhere}.optional-state{font-size:12px;color:var(--wand-muted)}
</style>
