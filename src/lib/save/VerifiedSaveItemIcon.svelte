<script lang="ts">
  import {onMount} from 'svelte';
  import type {Db00ItemContext} from './common-db-context';
  import {fetchVerifiedSaveItemWebp} from './verified-save-item-webp';

  export let media:NonNullable<Db00ItemContext['media']>;
  export let basePath:string;

  let host:HTMLSpanElement;
  let imageUrl:string|null=null;
  onMount(()=>{
    let disposed=false;
    let started=false;
    const controller=new AbortController();
    let observer:IntersectionObserver|null=null;
    const load=async()=>{
      if(started)return;
      started=true;
      const bytes=await fetchVerifiedSaveItemWebp(
        basePath,media,globalThis.fetch,controller.signal
      );
      if(disposed||!bytes)return;
      imageUrl=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));
    };
    if(typeof IntersectionObserver==='function'){
      observer=new IntersectionObserver(entries=>{
        if(!entries.some(entry=>entry.isIntersecting))return;
        observer?.disconnect();
        void load();
      },{rootMargin:'160px'});
      observer.observe(host);
    }else{
      void load();
    }
    return ()=>{
      disposed=true;
      controller.abort();
      observer?.disconnect();
      if(imageUrl)URL.revokeObjectURL(imageUrl);
    };
  });
</script>

<span bind:this={host} class:ready={imageUrl!==null} class="item-icon" aria-hidden="true">
  {#if imageUrl}
    <img src={imageUrl} alt="" width="40" height="40" />
  {/if}
</span>

<style>
  .item-icon{display:block;flex:0 0 1px;width:1px;height:1px;}
  .item-icon.ready{flex-basis:40px;width:40px;height:40px;}
  img{width:40px;height:40px;object-fit:contain;display:block;}
</style>
