<script lang="ts">
  import { base } from '$app/paths';
  import { gameImageHref } from './game-images';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  export let itemId:number;
  export let alt:string='';
  export let large:boolean=false;
  export let sourcePath:string|null=null;
  let failed=false;
  $: href=gameImageHref(base,itemId,sourcePath ?? '');
  $: if (href) failed=false;
</script>
<span class="artwork" class:large>
  {#if href && !failed}
    <img src={href} alt={alt} loading="lazy" decoding="async" on:error={()=>failed=true} />
  {:else}
    <span class="fallback" aria-hidden="true"><WandIcon name="sparkles" size={large?50:20} strokeWidth={1.45}/></span>
  {/if}
</span>
<style>
  .artwork { display:grid; place-items:center; width:100%; height:100%; min-width:0; min-height:0; }
  img { width:100%; height:100%; object-fit:contain; }
  .fallback { color:var(--wand-muted); font-size:18px; }
  .artwork.large .fallback { font-size:68px; }
</style>
