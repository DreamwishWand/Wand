<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {memoryCandidateFlags} from '$lib/media/saved-memory-flags';
  import {getMemorySources,memoryItemIds,type MemorySources} from '$lib/media/memory-media';
  import {maskPreviewEligible,memoryMaskEvidence} from '$lib/media/memory-mask-preview-evidence';
  import {openMaskPreview,type MaskPreview} from '$lib/media/memory-mask-preview';

  import {PUZZLE_MATERIALS,type PuzzleMaterial} from '$lib/media/memory-puzzle-formula';
  let canvas:HTMLCanvasElement;
  let itemId=130000001;
  let source:MemorySources|null=null;
  const memoryIds=memoryItemIds();
  let selected=0;
  let nativeFormula=true;
  let artworkSlot0=false;
  let invertFlags=true;
  let material:PuzzleMaterial='mask';
  let opacity:number=PUZZLE_MATERIALS.mask.alpha;
  let linearMask=false;
  function selectMaterial(value:PuzzleMaterial){material=value;opacity=PUZZLE_MATERIALS[value].alpha;redraw();}
  let error='';
  let loading=false;
  let renderer:MaskPreview|null=null;
  let controller:AbortController|null=null;
  $: evidence=source?memoryMaskEvidence(source.mask.sha256,source.numberOfShards):null;
  $: eligible=source!==null&&memoryMaskEvidence(source.mask.sha256,source.numberOfShards)!==null;
  function redraw(){
    try{renderer?.draw(selected,nativeFormula,artworkSlot0,invertFlags,material,opacity,linearMask);}catch(e){error=e instanceof Error?e.message:String(e);}
  }
  async function load(id:number){
    controller?.abort();renderer?.dispose();renderer=null;
    const request=new AbortController();controller=request;
    itemId=id;source=getMemorySources(id);selected=source?2**source.numberOfShards-1:0;error='';loading=false;
    if(!source||!memoryMaskEvidence(source.mask.sha256,source.numberOfShards))return;
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
  // Read-only comparison with the same Save session that Collection uses.
  // This route never decodes another copy or modifies a record.
  $: savedFlags=$localSaveSession.memoryFlags;
  $: savedMemoryIds=Object.keys(savedFlags?.entries??{}).map(Number).filter(id=>{
    const candidate=getMemorySources(id);
    return candidate&&memoryMaskEvidence(candidate.mask.sha256,candidate.numberOfShards)&&
      memoryCandidateFlags(savedFlags,id,candidate.numberOfShards)!==null;
  }).sort((a,b)=>a-b);
  $: candidateFlags=source?memoryCandidateFlags(savedFlags,itemId,source.numberOfShards):null;
  function applySavedFlags(){
    if(candidateFlags===null)return;
    selected=candidateFlags;redraw();
  }
</script>
<svelte:head>
  <title>Memory mask preview · Dreamwish Wand</title>
  <meta name="robots" content="noindex,nofollow"/>
</svelte:head>
<main class="preview">
  <h1>Memory mask preview</h1>
  <p>Development comparison only. Custom/Puzzle fragment arithmetic is source-derived. Serialized Material tint, alpha and blend are source-derived. Texture slot assignment, sampler state, runtime opacity and saved-bit polarity remain candidate inputs. A Save is optional. The default view shows the original contour over completed artwork; selecting pieces is a simulation, not a saved unlock state. No Save is modified.</p>
  <label>Memory (all published artwork)
    <select value={itemId} on:change={(event)=>void load(Number(event.currentTarget.value))}>
      {#each memoryIds as id}
        <option value={id}>{id} · {getMemorySources(id)?.numberOfShards} pieces</option>
      {/each}
    </select>
  </label>
  <div class="controls">
    {#if savedMemoryIds.length}
      <label>Memory from current local Save
        <select value={savedMemoryIds.includes(itemId)?String(itemId):''} on:change={(event)=>{const id=Number(event.currentTarget.value);if(id>0)void load(id);}}>
          <option value="">Select recorded Memory</option>
          {#each savedMemoryIds as id}<option value={String(id)}>{id}</option>{/each}
        </select>
      </label>
      <button type="button" disabled={candidateFlags===null||loading} on:click={applySavedFlags}>Use observed Save flags for comparison</button>
    {:else}
      <p>For a local Save comparison, load the Save in Collection first, then navigate here within the same session. Absent or incompatible values are not interpreted as zero.</p>
    {/if}
  </div>
  {#if evidence}
    <p>Exact dominant one-hot coverage: {(100*evidence[4]/evidence[5]).toFixed(3)}% · {evidence[3]} / {evidence[1]} expected dominant values</p>
    {#if source&&!maskPreviewEligible(source.mask.sha256,source.numberOfShards)}<p role="status">Exceptional mask: native arithmetic can be inspected, but piece coverage is not verified.</p>{/if}
  {/if}
  {#if source&&eligible}
    <div class="controls">
      {#each Array.from({length:source.numberOfShards},(_,i)=>i) as i}
        <button type="button" aria-pressed={(selected&(1<<i))!==0} on:click={()=>{selected^=1<<i;redraw();}}>{i+1}</button>
      {/each}
      <button type="button" on:click={()=>{selected=0;redraw();}}>None</button>
      <button type="button" on:click={()=>{selected=2**(source?.numberOfShards??0)-1;redraw();}}>All</button>
      <label><input type="checkbox" checked={nativeFormula} on:change={(event)=>{nativeFormula=event.currentTarget.checked;redraw();}}/> Native fragment arithmetic</label>
      {#if nativeFormula}
        <label>Material
          <select value={material} on:change={(event)=>selectMaterial(event.currentTarget.value==='show'?'show':'mask')}>
            <option value="mask">mat_Puzzle_mask</option>
            <option value="show">mat_Puzzle_show</option>
          </select>
        </label>
        <label>Opacity <input type="range" min="0" max="1" step="0.01" value={opacity} on:input={(event)=>{opacity=Number(event.currentTarget.value);redraw();}}/> {opacity.toFixed(2)}</label>
        <button type="button" on:click={()=>{selected=PUZZLE_MATERIALS[material].pieces&((2**(source?.numberOfShards??0))-1);invertFlags=false;opacity=PUZZLE_MATERIALS[material].alpha;redraw();}}>Serialized flags (within piece count)</button>
        <label><input type="checkbox" checked={linearMask} on:change={(event)=>{linearMask=event.currentTarget.checked;redraw();}}/> Linear mask sampling (candidate)</label>
        <label><input type="checkbox" checked={artworkSlot0} on:change={(event)=>{artworkSlot0=event.currentTarget.checked;redraw();}}/> Use artwork instead of black in candidate t0 slot</label>
        <label><input type="checkbox" checked={invertFlags} on:change={(event)=>{invertFlags=event.currentTarget.checked;redraw();}}/> Invert selected flags (candidate)</label>
      {/if}
    </div>
  {:else if source}
    <p role="status">Unknown mask and shard-count pair.</p>
  {/if}
  {#if loading}<p role="status">Loading and verifying the three existing CDN textures…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="comparison">
    <figure hidden={!source||!eligible||loading||!!error}>
      <canvas bind:this={canvas} aria-label="Diagnostic selected Memory regions"></canvas>
      <figcaption>Source-derived arithmetic / candidate composition</figcaption>
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
