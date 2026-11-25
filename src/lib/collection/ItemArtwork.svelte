<script lang="ts">
  import { base } from '$app/paths';
  import { gameImageHref } from './game-images';
  import {itemMedia} from '$lib/media/item-media.ts';
  import {onDestroy} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  export let itemId:number;
  export let alt:string='';
  export let large:boolean=false;
  export let sourcePath:string|null=null;
  let failed=false;
  let currentMedia:string|null=null;
  let ticket=0;
  async function resolveMedia(id:number,original:boolean){
    const request=++ticket;currentMedia=null;
    try{const image=await itemMedia.getItemImage(id,original?'original':'thumbnail');if(ticket===request)currentMedia=image?.url??null;}catch{/* retained published fallback */}
  }
  $: void resolveMedia(itemId,large);
  onDestroy(()=>{ticket++;});
  $: fallbackHref=gameImageHref(base,itemId,sourcePath ?? '');
  $: href=currentMedia??fallbackHref;
  $: if (href) failed=false;
</script>
<span class="artwork" class:large>
  {#if href && !failed}
    <img src={href} alt={alt} loading="lazy" decoding="async" on:error={()=>{if(currentMedia&&fallbackHref&&currentMedia!==fallbackHref)currentMedia=null;else failed=true;}} />
  {:else}
    <span class="fallback" aria-hidden="true"><WandIcon name="sparkles" size={large?50:20} strokeWidth={1.45}/></span>
  {/if}
</span>
<style>
  .artwork { display:grid; place-items:center; width:100%; height:100%; min-width:0; min-height:0; }
  img { width:100%; height:100%; object-fit:contain; }
  .fallback { color:#aa90c1; font-size:18px; }
  .artwork.large .fallback { font-size:68px; }
</style>
