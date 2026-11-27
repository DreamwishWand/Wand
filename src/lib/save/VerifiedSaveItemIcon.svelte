<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import type {Db00ItemContext} from './common-db-context';
  import {fetchCurrentSaveItemWebp} from './verified-save-item-webp';

  export let context:Db00ItemContext;
  export let gameVersion:string|null=null;
  export let basePath:string;

  let host:HTMLSpanElement;
  let imageUrl:string|null=null;
  let active=false;
  let observer:IntersectionObserver|null=null;
  let controller:AbortController|null=null;
  function release(){
    controller?.abort();controller=null;
    if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}
  }
  async function load(row:Db00ItemContext,version:string|null,base:string){
    release();
    const request=new AbortController();controller=request;
    const bytes=await fetchCurrentSaveItemWebp(base,row,version,globalThis.fetch,request.signal);
    if(request.signal.aborted||!bytes)return;
    imageUrl=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));
  }
  $: if(active)void load(context,gameVersion,basePath);
  onMount(()=>{
    if(typeof IntersectionObserver!=='function'){active=true;return;}
    observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      active=true;observer?.disconnect();observer=null;
    },{rootMargin:'160px'});
    observer.observe(host);
  });
  onDestroy(()=>{observer?.disconnect();release();});
</script>

<span bind:this={host} class="item-icon" aria-hidden="true">
  {#if imageUrl}
    <img src={imageUrl} alt="" width="40" height="40" decoding="async"/>
  {/if}
</span>

<style>
  .item-icon{display:block;flex:0 0 40px;width:40px;height:40px;}
  img{width:40px;height:40px;object-fit:contain;display:block;}
</style>
