<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {getMemorySources,type MemorySources} from '$lib/media/memory-media';
  import {MASK_PREVIEW_EVIDENCE,maskPreviewEligible,memoryMaskEvidence} from '$lib/media/memory-mask-preview-evidence';
  import {openMaskPreview,type MaskPreview} from '$lib/media/memory-mask-preview';

  let canvas:HTMLCanvasElement;
  let itemId=130000001;
  let source:MemorySources|null=null;
  let selected=1;
  let showOutline=false;
  let error='';
  let loading=false;
  let renderer:MaskPreview|null=null;
  let controller:AbortController|null=null;
  $: evidence=source?memoryMaskEvidence(source.mask.sha256,source.numberOfShards):null;
  $: eligible=source!==null&&maskPreviewEligible(source.mask.sha256,source.numberOfShards);
  function redraw(){
    try{renderer?.draw(selected,showOutline);}catch(e){error=e instanceof Error?e.message:String(e);}
  }
  async function load(id:number){
    controller?.abort();renderer?.dispose();renderer=null;
    const request=new AbortController();controller=request;
    itemId=id;source=getMemorySources(id);selected=1;showOutline=false;error='';loading=false;
    if(!source||!maskPreviewEligible(source.mask.sha256,source.numberOfShards))return;
    loading=true;
    try{
      const next=await openMaskPreview(canvas,source,request.signal);
      if(request.signal.aborted){next.dispose();return;}
      renderer=next;redraw();
    }catch(e){if(!request.signal.aborted)error=e instanceof Error?e.message:String(e);}
    finally{if(!request.signal.aborted)loading=false;}
  }
  onMount(()=>{void load(itemId);});
  onDestroy(()=>{controller?.abort();renderer?.dispose();});
</script>
<svelte:head>
  <title>Memory mask preview · Dreamwish Wand</title>
  <meta name="robots" content="noindex,nofollow"/>
</svelte:head>
<main class="preview">
  <h1>Memory mask preview</h1>
  <p>Development comparison only. Exact one-hot pixels are shown; amber indicates unresolved samples. Neither native shader parity nor saved-bit order is verified. No Save is loaded or modified.</p>
  <label>Representative Memory
    <select value={itemId} on:change={(event)=>void load(Number(event.currentTarget.value))}>
      {#each MASK_PREVIEW_EVIDENCE as row}
        <option value={row[0]}>{row[0]} · {row[1]} pieces{row[1]===row[3]?'':' · exception'}</option>
      {/each}
    </select>
  </label>
  {#if evidence}
    <p>Exact dominant one-hot coverage: {(100*evidence[4]/evidence[5]).toFixed(3)}% · {evidence[3]} / {evidence[1]} expected dominant values</p>
  {/if}
  {#if source&&eligible}
    <div class="controls">
      {#each Array.from({length:source.numberOfShards},(_,i)=>i) as i}
        <button type="button" aria-pressed={(selected&(1<<i))!==0} on:click={()=>{selected^=1<<i;redraw();}}>{i+1}</button>
      {/each}
      <button type="button" on:click={()=>{selected=0;redraw();}}>None</button>
      <button type="button" on:click={()=>{selected=2**(source?.numberOfShards??0)-1;redraw();}}>All</button>
      <label><input type="checkbox" checked={showOutline} on:change={(event)=>{showOutline=event.currentTarget.checked;redraw();}}/> Candidate outline multiply</label>
    </div>
  {:else if source}
    <p role="status">This mask and shard-count pair is not eligible for one-hot preview.</p>
  {/if}
  {#if loading}<p role="status">Loading and verifying the three existing CDN textures…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="comparison">
    <figure hidden={!source||!eligible||loading||!!error}>
      <canvas bind:this={canvas} aria-label="Diagnostic selected Memory regions"></canvas>
      <figcaption>Diagnostic composition</figcaption>
    </figure>
    {#if source}
      <figure><img src={source.thumbnail.url} alt="Completed Memory" loading="lazy"/><figcaption>Completed artwork</figcaption></figure>
      <figure><img src={source.outline.url} alt="Native boundary texture" loading="lazy"/><figcaption>Native outline</figcaption></figure>
    {/if}
  </div>
</main>
<style>
  .preview{padding:1rem;max-width:1200px;margin:auto;}
  .controls{display:flex;flex-wrap:wrap;gap:.4rem;margin:.8rem 0;align-items:center;}
  .controls button[aria-pressed="true"]{outline:2px solid currentColor;outline-offset:1px;}
  .controls label{display:flex;gap:.4rem;align-items:center;}
  select,button{padding:.4rem .6rem;}
  .comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:.8rem;}
  figure{margin:0;min-width:0;}
  canvas,img{display:block;max-width:100%;width:100%;height:auto;object-fit:contain;}
  figcaption{padding:.3rem 0;}
</style>
