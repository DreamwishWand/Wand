<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import ItemArtwork from './ItemArtwork.svelte';
  import type {SavedMemoryFlags} from '$lib/media/saved-memory-flags';
  import {memoryCandidateFlags} from '$lib/media/saved-memory-flags';
  import {getMemorySources} from '$lib/media/memory-media';
  import {maskPreviewEligible} from '$lib/media/memory-mask-preview-evidence';
  import {completeMemoryBits,recordedMemoryBits,exactMemoryHit} from '$lib/media/memory-piece-state';
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
  export let onPiece:(bit:number)=>void=()=>{};
  let host:HTMLElement;
  let canvas:HTMLCanvasElement;
  let visible=false;
  let ready=false;
  let mode:'contours'|'candidate'|'manual'|'complete'='contours';
  let controller:AbortController|null=null;
  let observer:IntersectionObserver|null=null;
  let maskBitmap:ImageBitmap|null=null;
  let maskHash='';
  let picking=false;
  async function render(id:number,projection:SavedMemoryFlags|null|undefined,record:CollectionEntry|undefined,detail:boolean,active:boolean,split:boolean){
    controller?.abort();controller=null;ready=false;
    if(canvas){canvas.width=1;canvas.height=1;}
    const source=getMemorySources(id);
    if(!source)return;
    const full=completeMemoryBits(source.numberOfShards);
    const bits=recordedMemoryBits(record,source.numberOfShards);
    const eligible=maskPreviewEligible(source.mask.sha256,source.numberOfShards);
    const candidate=eligible?memoryCandidateFlags(projection,id,source.numberOfShards):null;
    const value=candidate??bits;
    mode=candidate!==null?'candidate':value===full&&!split?'complete':eligible?'manual':'contours';
    if(!active||mode==='complete')return;
    const request=new AbortController();controller=request;
    try{
      const {enqueueMemoryCandidate}=await import('$lib/media/memory-candidate-render');
      if(request.signal.aborted)return;
      await enqueueMemoryCandidate(canvas,source,eligible?value:null,detail,request.signal);
      if(!request.signal.aborted)ready=true;
    }catch{/* Preserve ordinary artwork if original assets or GPU are unavailable. */}
  }
  $: void render(itemId,flags,entry,large,visible,showPieces);
  async function pick(event:MouseEvent){
    const source=getMemorySources(itemId),request=controller;
    if(!editable||disabled||picking||!ready||mode==='contours'||!source||!request)return;
    const rect=canvas.getBoundingClientRect();
    const scale=Math.min(rect.width/canvas.width,rect.height/canvas.height);
    const w=canvas.width*scale,h=canvas.height*scale;
    const u=(event.clientX-rect.left-(rect.width-w)/2)/w;
    const v=(event.clientY-rect.top-(rect.height-h)/2)/h;
    if(u<0||u>=1||v<0||v>=1)return;
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
      ctx.drawImage(maskBitmap,Math.floor(u*maskBitmap.width),Math.floor(v*maskBitmap.height),1,1,0,0,1,1);
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
  {#if !ready}<ItemArtwork {itemId} {alt} {sourcePath} {large}/>{/if}
  {#if editable&&ready&&mode!=='contours'}
    <button type="button" class="piece-hit" disabled={disabled||picking} aria-label={alt} on:click={pick}></button>
  {/if}
</span>
<style>
  .memory-candidate{position:relative;display:grid;place-items:center;width:100%;height:100%;min-width:0;min-height:0}
  canvas{display:block;width:100%;height:100%;object-fit:contain}
  canvas[hidden]{display:none}
  .piece-hit{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:crosshair}
  .piece-hit:disabled{cursor:default}
</style>
