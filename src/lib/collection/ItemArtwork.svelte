<script lang="ts">
  import { base } from '$app/paths';
  import { gameImageHref } from './game-images.mjs';
  export let itemId:number;
  export let alt:string='';
  export let large:boolean=false;
  let failed=false;
  $: href=gameImageHref(base,itemId);
  $: if (href) failed=false;
</script>
<span class="artwork" class:large>
  {#if href && !failed}
    <img src={href} alt={alt} loading="lazy" decoding="async" on:error={()=>failed=true} />
  {:else}
    <span class="fallback" aria-hidden="true">✦</span>
  {/if}
</span>
<style>
  .artwork { display:grid; place-items:center; width:100%; height:100%; min-width:0; min-height:0; }
  img { width:100%; height:100%; object-fit:contain; }
  .fallback { color:#aa90c1; font-size:18px; }
  .artwork.large .fallback { font-size:68px; }
</style>
