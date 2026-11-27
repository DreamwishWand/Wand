<script lang="ts">
  import {base} from '$app/paths';
  import {onMount} from 'svelte';
  import PosePreview from './PosePreview.svelte';
  import {loadPagesPoseIndex,bodyTypes,assetUrl,loadPreviewScene,relatedPoseItems,type PreviewIndex} from './pages-preview.ts';
  import {poseCopy} from './preview-copy.ts';
  import {collectionItemHref} from '$lib/collection/item-permalink.ts';
  let {itemId,locale,getRelatedName}:{itemId:number;locale:string;getRelatedName?:(id:number,locale:string)=>Promise<string|null>}=$props();
  let index=$state<PreviewIndex|null>(null);
  let expanded=$state(false);
  let copy=$derived(poseCopy(locale));
  let row=$derived(index?.items[String(itemId)]);
  let options=$derived.by(()=>{
    const m=index,r=row,c=copy;
    if(!m||!r)return [];
    return bodyTypes.flatMap((b,i)=>{
      const entry=r[b];
      return entry?[{id:b,iconUrl:assetUrl(base,m.bodyIcons[b],'.png'),label:c.bodyType+' '+(i+1),load:(signal:AbortSignal)=>loadPreviewScene(base,itemId,b,m,entry,c.companion,signal)}]:[];
    });
  });
  let playerOnly=$derived(bodyTypes.some(b=>{const o=row?.[b];return o?.kind==='player'&&o.companionIncluded!==false}));
  let companionOnly=$derived(bodyTypes.some(b=>{const o=row?.[b];return o?.kind==='player'&&o.companionIncluded===false}));
  let related=$derived(index?relatedPoseItems(index,itemId):[]);
  let names=$derived(expanded&&getRelatedName?Promise.all(related.map(async id=>({id,name:await getRelatedName!(id,locale).catch(()=>null)}))):Promise.resolve([]));
  onMount(()=>{
    let alive=true;
    void loadPagesPoseIndex(base).then(m=>{if(alive)index=m}).catch(()=>{});
    return()=>{alive=false};
  });
</script>
{#if options.length}
  <details class="pose-test" bind:open={expanded}>
    <summary>{copy.title}</summary>
    {#if expanded}
      <p>{copy.note} {#if options.length===1}{copy.partial}{/if} {#if playerOnly}{copy.playerOnly}{/if} {#if companionOnly}{copy.companionOnly}{/if}</p>
      <PosePreview {options} {copy}/>
      {#await names then items}
        {@const found=items.filter(x=>x.name)}
        {#if found.length}
          <div class="related-poses"><strong>{copy.related}</strong>
            {#each found as item (item.id)}
              <a href={collectionItemHref(base,item.id)}>{item.name}</a>
            {/each}
          </div>
        {/if}
      {/await}
    {/if}
  </details>
{/if}
<style>
  .pose-test{margin:8px 0;color:var(--wand-text)}
  summary{cursor:pointer;font-weight:600}
  p{font-size:.8rem}
  .related-poses{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;font-size:.8rem;align-items:center}
  .related-poses a{color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;background:var(--wand-menu);padding:4px 6px}
  .related-poses a:focus-visible{outline:2px solid var(--wand-focus)}
</style>
