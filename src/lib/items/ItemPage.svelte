<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {afterNavigate,goto} from '$app/navigation';
  import {page} from '$app/stores';
  import {itemEntityHref,itemPageCopy} from './entity-item-url';
  import type {CompleteItemMasterRecord} from './public-item-master';
  import {currentItemViewMaster} from './item-view-master';
  import {displayItemName} from './display-name';
  import {collectionFamilyLabel} from '$lib/collection/copy';
  import {CollectionRuntime,type CollectionItem,type CollectionEntry} from '$lib/collection/runtime';
  import {collectionInterfaceCopy} from '$lib/collection/interface-copy';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import ItemPageExtra from './ItemPageExtra.svelte';
  import MemoryCandidateArtwork from '$lib/collection/MemoryCandidateArtwork.svelte';
  import ItemMasterDetails from '$lib/collection/ItemMasterDetails.svelte';
  import CurrentItemFacts from '$lib/collection/CurrentItemFacts.svelte';
  import AcquisitionEvidence from '$lib/collection/AcquisitionEvidence.svelte';
  import RelatedQuests from '$lib/collection/RelatedQuests.svelte';
  import {getMemorySources} from '$lib/media/memory-media';
  import {maskPreviewEligible} from '$lib/media/memory-mask-preview-evidence';
  import {knownMemoryBits,completeMemoryBits,memoryPieceCount} from '$lib/media/memory-piece-state';
  import {memoryPieceCopy} from '$lib/collection/memory-piece-copy';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {editHistory} from '$lib/ui/edit-history';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  export let itemId:number;
  export let locale:WandLanguage;
  let record:CompleteItemMasterRecord|null=null;
  let runtime:CollectionRuntime|null=null;
  let item:CollectionItem|null=null;
  let entry:CollectionEntry={};
  let loading=true,failed=false,recordFailed=false,busy=false,expert=false,showPieces=false;
  let alive=true,detach=()=>{};
  let fromInApp=false;
  afterNavigate(({from})=>{if(from&&from.url.origin===location.origin)fromInApp=true;});
  $: copy=collectionInterfaceCopy(locale);
  $: labels=itemPageCopy(locale);
  $: memoryCopy=memoryPieceCopy(locale);
  $: name=record?displayItemName(record.names,locale)??'':'';
  $: memory=getMemorySources(itemId);
  $: bits=memory?knownMemoryBits(entry,memory.numberOfShards,Boolean($localSaveSession.file)):null;
  $: eligible=memory?maskPreviewEligible(memory.mask.sha256,memory.numberOfShards):false;
  $: if(runtime&&locale)refresh(runtime,locale);
  function refresh(db:CollectionRuntime,language:string){
    try{const found=db.item(itemId,language);item=found.itemId===itemId?found:null;
      const state=db.state;entry=state.workspaces.find(w=>w.id===state.active)?.entries[String(itemId)]??{};
    }catch{item=null;entry={};}
  }
  async function load(){
    loading=true;failed=false;
    try{
      const found=await (await currentItemViewMaster(base)).getItem(itemId);
      if(!alive)return;
      record=found?.itemId===itemId&&found.definitionScope!=='other_definition'&&
        displayItemName(found.names,locale)!==null?found:null;
    }catch{if(alive)failed=true;}
    finally{if(alive)loading=false;}
    if(!alive||!record)return;
    try{
      const db=await CollectionRuntime.open(base);
      if(!alive){db.close();return;}
      runtime=db;detach=editHistory.attachCollection(db);refresh(db,locale);
    }catch{if(alive)recordFailed=true;}
  }
  onMount(()=>{
    alive=true;void load();
    let initial=true;
    const stop=watchWandLanguage(language=>{
      if(initial){initial=false;return;}
      if(language!==locale)void goto(itemEntityHref(base,itemId,language)+$page.url.search,{replaceState:true});
    });
    const restored=()=>{if(runtime)refresh(runtime,locale);};
    window.addEventListener('wand:collection-history-restored',restored);
    return()=>{alive=false;stop();window.removeEventListener('wand:collection-history-restored',restored);detach();if(!busy)runtime?.close();};
  });
  async function change(patch:Parameters<CollectionRuntime['setEntry']>[1]){
    const db=runtime;if(!db||!item||busy||recordFailed)return;
    busy=true;editHistory.beginCollectionEdit();
    try{
      const before=db.state;await db.setEntry(itemId,patch);
      editHistory.recordCollection(before,db.state,{title:name,change:copy.collectionRecord});
      if(alive)refresh(db,locale);
    }catch{if(alive)recordFailed=true;}
    finally{busy=false;editHistory.endCollectionEdit();if(!alive)db.close();}
  }
  function setBits(value:number){
    if(!memory||!item||!Number.isInteger(value)||value<0||value>completeMemoryBits(memory.numberOfShards))return;
    if(!eligible&&value!==0&&value!==completeMemoryBits(memory.numberOfShards))return;
    if(value===0&&bits!==0&&!window.confirm(memoryCopy.confirmClear))return;
    void change({memoryPieces:value});
  }
  function toggleBit(bit:number){if(eligible&&bits!==null)setBits(bits^bit);}
  function back(){
    // Only use browser history for same-origin in-app navigation.
    if(fromInApp&&history.length>1)history.back();
    else void goto(base+'/collection/');
  }
</script>
<svelte:head><title>{name?name+' · ':''}Dreamwish Wand</title></svelte:head>
<article class="shared-item-page" data-item-page={record?.itemId??''}>
  <div class="item-page-tools">
    <button type="button" on:click={back}><WandIcon name="chevron" size={18}/>{labels.back}</button>
    {#if record}<label><input type="checkbox" bind:checked={expert}/>{labels.expert}</label>{/if}
  </div>
  {#if loading}<p role="status">{copy.loading}</p>
  {:else if failed}<p role="alert">{copy.failed}</p>
  {:else if !record}<p role="status">{labels.missing}</p>
  {:else}
    <div class="item-page-overview">
      <div class="item-page-art">
        {#if memory}<MemoryCandidateArtwork {itemId} {entry} showPieces={showPieces} saveSelected={Boolean($localSaveSession.file)} unknownLabel={memoryCopy.unknown} unavailableLabel={memoryCopy.unavailable} editable={Boolean(item)&&!busy&&!recordFailed} disabled={busy||recordFailed} onPiece={toggleBit} alt={name} large/>
        {:else}<ItemArtwork {itemId} alt={name} large allowHistoricalFallback={false}/>{/if}
      </div>
      <div class="item-page-identity">
        <h1>{name||labels.missing}</h1>
        {#if item}<p>{collectionFamilyLabel(locale,item.family)}</p>{/if}
        {#if memory}
          <div class="item-page-actions"><strong>{bits===null?'?':memoryPieceCount(bits)} / {memory.numberOfShards}</strong>
            <label><input type="checkbox" bind:checked={showPieces}/>{memoryCopy.split}</label>
            <button type="button" disabled={!item||busy||recordFailed||bits===completeMemoryBits(memory.numberOfShards)} on:click={()=>setBits(completeMemoryBits(memory!.numberOfShards))}>{memoryCopy.all}</button>
            <button type="button" disabled={!item||busy||recordFailed||bits===0} on:click={()=>setBits(0)}>{memoryCopy.clear}</button>
            {#if bits===null}<small>{memoryCopy.unknown}</small>{:else if !eligible}<small>{memoryCopy.unverified}</small>{:else if showPieces||bits!==completeMemoryBits(memory.numberOfShards)}
              <div class="item-page-actions">{#each Array.from({length:memory.numberOfShards},(_,i)=>i) as i}<button type="button" disabled={!item||busy||recordFailed} aria-label={memoryCopy.piece+' '+(i+1)} aria-pressed={(bits&(1<<i))!==0} on:click={()=>toggleBit(1<<i)}>{i+1}</button>{/each}</div>
            {/if}
          </div>
        {/if}
        <section class="item-page-record">
          <h2>{copy.collectionRecord}</h2>
          {#if recordFailed}<p role="alert">{copy.failed}</p>
          {:else if !runtime}<p role="status">{copy.loading}</p>
          {:else if !item}<p role="status">{copy.unrecorded}</p>{/if}
          {#if item}
            {#if !memory}<div class="item-page-actions">
              <button type="button" disabled={busy||recordFailed} aria-pressed={entry.status==='owned'} on:click={()=>change({status:'owned'})}>{copy.owned}</button>
              <button type="button" disabled={busy||recordFailed} aria-pressed={entry.status!=='owned'} on:click={()=>change({status:'missing'})}>{copy.missing}</button>
            </div>{/if}
            {#if ['QUANTITY_STOCK','OWNERSHIP_STOCK_AND_DISCOVERY'].includes(item.stateSemantic)}
              <label>{copy.manualQuantity}<input type="number" min="0" max="999999" step="1" value={entry.quantity??''} disabled={busy||recordFailed} on:change={event=>change({quantity:event.currentTarget.value===''?null:Number(event.currentTarget.value)})}/></label>
            {/if}
            {#if item.stateSemantic.includes('DISCOVERY')||entry.discovered!==undefined}
              <label><input type="checkbox" checked={entry.discovered===true} disabled={busy||recordFailed} on:change={event=>change({discovered:event.currentTarget.checked})}/>{copy.discovered}</label>
            {/if}
            <label><input type="checkbox" checked={entry.favorite===true} disabled={busy||recordFailed} on:change={event=>change({favorite:event.currentTarget.checked})}/>{copy.favorite}</label>
          {/if}
        </section>
      </div>
    </div>
    <div class="item-page-information">
      <AcquisitionEvidence {itemId} {locale}/>
      <CurrentItemFacts {itemId} {locale}/>
      <RelatedQuests {itemId} {locale}/>
    </div>
    <ItemPageExtra {record} {locale}/>
    <ItemMasterDetails {itemId} {locale} {expert}/>
  {/if}
</article>
<style>
  .shared-item-page{width:100%;min-height:calc(100dvh - 60px);box-sizing:border-box;padding:clamp(14px,2.4vw,36px);color:var(--wand-text);background:var(--wand-bg)}
  .item-page-tools{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px}
  button,input{font:inherit;color:inherit} button{border:1px solid var(--wand-line);background:var(--wand-card);border-radius:6px;padding:7px 12px;cursor:pointer}button:disabled{opacity:.5;cursor:default}button[aria-pressed="true"]{background:var(--wand-accent);color:var(--wand-accent-contrast,#fff)}
  .item-page-overview{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:clamp(16px,3vw,44px);align-items:start}
  .item-page-art{height:clamp(200px,36vw,530px);min-width:0;min-height:0;background:var(--wand-surface-raised);border-radius:12px;overflow:hidden;display:grid;grid-template:minmax(0,1fr)/minmax(0,1fr)}
  .item-page-identity{min-width:0} h1{font-size:clamp(22px,3vw,42px);margin:0 0 12px;overflow-wrap:anywhere}h2{font-size:16px;margin:0 0 10px}
  .item-page-record,.item-page-information :global(.inspector-details){padding:14px;border:1px solid var(--wand-line);border-radius:10px;background:var(--wand-card);color:var(--wand-text)}
  .item-page-record label,.item-page-tools label,.item-page-actions label{display:flex;align-items:center;gap:8px;margin:8px 0}.item-page-record input[type=number]{width:100px}
  .item-page-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
  .item-page-information{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:14px;margin-top:20px;align-items:start}
  @media(max-width:720px){.item-page-overview{grid-template-columns:1fr}.item-page-art{height:280px}}
</style>
