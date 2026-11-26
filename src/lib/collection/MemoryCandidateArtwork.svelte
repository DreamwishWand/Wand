<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import ItemArtwork from './ItemArtwork.svelte';
  import type {SavedMemoryFlags} from '$lib/media/saved-memory-flags';
  import {memoryCandidateFlags} from '$lib/media/saved-memory-flags';
  export let itemId:number;
  export let flags:SavedMemoryFlags|null|undefined;
  export let alt='';
  export let large=false;
  export let sourcePath:string|null=null;
  let host:HTMLSpanElement;
  let canvas:HTMLCanvasElement;
  let visible=false;
  let ready=false;
  let mode:'contours'|'candidate'='contours';
  let controller:AbortController|null=null;
  let observer:IntersectionObserver|null=null;
  async function render(id:number,projection:SavedMemoryFlags|null|undefined,detail:boolean,active:boolean){
    controller?.abort();controller=null;ready=false;
    if(canvas){canvas.width=1;canvas.height=1;}
    mode='contours';
    if(!active)return;
    const request=new AbortController();controller=request;
    try{
      const [{getMemorySources},{enqueueMemoryCandidate},{maskPreviewEligible}]=await Promise.all([
        import('$lib/media/memory-media'),import('$lib/media/memory-candidate-render'),import('$lib/media/memory-mask-preview-evidence')
      ]);
      if(request.signal.aborted)return;
      const source=getMemorySources(id);
      if(!source)return;
      const value=maskPreviewEligible(source.mask.sha256,source.numberOfShards)?memoryCandidateFlags(projection,id,source.numberOfShards):null;
      mode=value===null?'contours':'candidate';
      await enqueueMemoryCandidate(canvas,source,value,detail,request.signal);
      if(!request.signal.aborted)ready=true;
    }catch{/* Preserve ordinary artwork, never fabricate a partial state. */}
  }
  $: void render(itemId,flags,large,visible);
  onMount(()=>{
    if(!('IntersectionObserver' in window)){visible=true;return;}
    observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;},{rootMargin:'100px'});
    observer.observe(host);
  });
  onDestroy(()=>{observer?.disconnect();controller?.abort();});
</script>
<span class="memory-candidate" bind:this={host} data-memory-candidate={ready?'rendered':'fallback'} data-memory-view={mode}>
  <canvas bind:this={canvas} hidden={!ready} role="img" aria-label={alt}></canvas>
  {#if !ready}<ItemArtwork {itemId} {alt} {sourcePath} {large}/>{/if}
</span>
<style>
  .memory-candidate{display:grid;place-items:center;width:100%;height:100%;min-width:0;min-height:0}
  canvas{display:block;width:100%;height:100%;object-fit:contain}
  canvas[hidden]{display:none}
</style>
