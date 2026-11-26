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
  let controller:AbortController|null=null;
  let observer:IntersectionObserver|null=null;
  async function render(id:number,projection:SavedMemoryFlags|null|undefined,detail:boolean,active:boolean){
    controller?.abort();controller=null;ready=false;
    if(!active||!projection||!Object.hasOwn(projection.entries,String(id)))return;
    const request=new AbortController();controller=request;
    try{
      const [{getMemorySources},{enqueueMemoryCandidate}]=await Promise.all([
        import('$lib/media/memory-media'),import('$lib/media/memory-candidate-render')
      ]);
      if(request.signal.aborted)return;
      const source=getMemorySources(id);
      if(!source)return;
      const value=memoryCandidateFlags(projection,id,source.numberOfShards);
      if(value===null)return;
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
<span class="memory-candidate" bind:this={host} data-memory-candidate={ready?'rendered':'fallback'}>
  <canvas bind:this={canvas} hidden={!ready} role="img" aria-label={alt}></canvas>
  {#if !ready}<ItemArtwork {itemId} {alt} {sourcePath} {large}/>{/if}
</span>
<style>
  .memory-candidate{display:grid;place-items:center;width:100%;height:100%;min-width:0;min-height:0}
  canvas{display:block;width:100%;height:100%;object-fit:contain}
  canvas[hidden]{display:none}
</style>
