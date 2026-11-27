<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import ItemArtwork from './ItemArtwork.svelte';
  import type {SavedMemoryFlags} from '$lib/media/saved-memory-flags';
  import {memoryCandidateFlags} from '$lib/media/saved-memory-flags';
  import {getMemorySources} from '$lib/media/memory-media';
  import {maskPreviewEligible} from '$lib/media/memory-mask-preview-evidence';
  import {completeMemoryBits,knownMemoryBits,exactMemoryHit,memoryMaskPixel} from '$lib/media/memory-piece-state';
  import type {CollectionEntry} from './runtime';
  export let itemId:number;
  export let flags:SavedMemoryFlags|null|undefined=undefined;
  export let entry:CollectionEntry|undefined=undefined;
  export let alt='';
  export let large=false;
  export let sourcePath:string|null=null;
  export let showPieces=false;
  export let editable=false;
  export let disabled=false;
  export let saveSelected=false;
  export let unknownLabel='';
  export let unavailableLabel='';
  export let onPiece:(bit:number)=>void=()=>{};
  let host:HTMLElement;
  let canvas:HTMLCanvasElement;
  let visible=false;
  let ready=false;
  let unavailable=false;
  let mode:'contours'|'candidate'|'manual'|'complete'|'unknown'='contours';
  let controller:AbortController|null=null;
  let observer:IntersectionObserver|null=null;
  let maskBitmap:ImageBitmap|null=null;
  let maskHash='';
  let picking=false;
  async function render(id:number,projection:SavedMemoryFlags|null|undefined,record:CollectionEntry|undefined,detail:boolean,active:boolean,split:boolean,hasSave:boolean){
    controller?.abort();controller=null;ready=false;unavailable=false;
    if(canvas){canvas.width=1;canvas.height=1;}
    const source=getMemorySources(id);
    if(!source)return;
    const full=completeMemoryBits(source.numberOfShards);
    const bits=knownMemoryBits(record,source.numberOfShards,hasSave);
    const eligible=maskPreviewEligible(source.mask.sha256,source.numberOfShards);
    const candidate=eligible?memoryCandidateFlags(projection,id,source.numberOfShards):null;
    const value=candidate??bits;
    mode=candidate!==null?'candidate':value===null?'unknown':value===full&&!split?'complete':eligible?'manual':'contours';
    if(!active||mode==='complete')return;
    const request=new AbortController();controller=request;
    try{
      const {enqueueMemoryCandidate}=await import('$lib/media/memory-candidate-render');
      if(request.signal.aborted)return;
      await enqueueMemoryCandidate(canvas,source,eligible&&value!==null?value:null,detail,request.signal);
      if(!request.signal.aborted)ready=true;
    }catch{if(!request.signal.aborted)unavailable=true;}
  }
  $: void render(itemId,flags,entry,large,visible,showPieces,saveSelected);
  async function pick(event:MouseEvent){
    const source=getMemorySources(itemId),request=controller;
    if(!editable||disabled||picking||!ready||mode!=='manual'||!source||!request)return;
    const point=memoryMaskPixel(event.clientX,event.clientY,canvas.getBoundingClientRect(),canvas.width,canvas.height,source.mask.width,source.mask.height);
    if(!point)return;
    picking=true;
    try{
      if(maskHash!==source.mask.sha256||!maskBitmap){
        const {verifiedBitmap}=await import('$lib/media/memory-mask-preview');
        const next=await verifiedBitmap(source.mask,request.signal);
        if(request.signal.aborted){next.close();return;}
        maskBitmap?.close();maskBitmap=next;maskHash=source.mask.sha256;
      }
      if(request.signal.aborted||!maskBitmap)return;
      const pixel=document.createElement('canvas');pixel.width=pixel.height=1;
      const ctx=pixel.getContext('2d',{willReadFrequently:true});
      if(!ctx)return;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(maskBitmap,point.x,point.y,1,1,0,0,1,1);
      const bit=exactMemoryHit(ctx.getImageData(0,0,1,1).data,source.numberOfShards);
      if(bit!==null&&!request.signal.aborted)onPiece(bit);
    }catch{/* Ambiguous or unavailable mask pixels do not change records. */}
    finally{picking=false;}
  }
  onMount(()=>{
    if(!('IntersectionObserver' in window)){visible=true;return;}
    observer=new IntersectionObserver(([e])=>{visible=e.isIntersecting;},{rootMargin:'100px'});
    observer.observe(host);
  });
  onDestroy(()=>{observer?.disconnect();controller?.abort();maskBitmap?.close();});
</script>
<span class="memory-candidate" bind:this={host} data-memory-candidate={ready?'rendered':'fallback'} data-memory-view={mode}>
  <canvas bind:this={canvas} hidden={!ready} role="img" aria-label={alt}></canvas>
  {#if !ready}
    <span class="memory-fallback" class:concealed={mode!=='complete'}>
      <ItemArtwork {itemId} {alt} {sourcePath} {large}/>
    </span>
  {/if}
  {#if mode==='unknown'||mode==='contours'||(unavailable&&mode!=='complete')}
    <span class="memory-uncertain" role="img" aria-label={mode==='unknown'?unknownLabel:unavailableLabel} title={mode==='unknown'?unknownLabel:unavailableLabel}>?</span>
  {/if}
  {#if editable&&ready&&mode==='manual'}
    <button type="button" class="piece-hit" disabled={disabled||picking} aria-label={alt} on:click={pick}></button>
  {/if}
</span>
<style>
  .memory-candidate{position:relative;display:grid;place-items:center;width:100%;height:100%;min-width:0;min-height:0}
  canvas{display:block;width:100%;height:100%;object-fit:contain}
  canvas[hidden]{display:none}
  .memory-fallback{width:100%;height:100%;min-width:0;min-height:0;display:grid;place-items:center}
  .memory-fallback.concealed{opacity:.25;filter:grayscale(1)}
  .memory-uncertain{position:absolute;inset-inline-end:4px;inset-block-end:4px;display:grid;place-items:center;width:1.4em;height:1.4em;border-radius:50%;color:#fff;background:#34465c;border:1px solid #91b9dc;font-size:.85em;font-weight:700;pointer-events:none}
  .piece-hit{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:crosshair}
  .piece-hit:disabled{cursor:default}
</style>
