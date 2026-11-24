<script lang="ts">
 import {base} from '$app/paths';
 import {gameImageHref} from '$lib/collection/game-images.ts';
 import WandIcon from '$lib/ui/WandIcon.svelte';
 export let characterId:string;
 export let name:string;
 let failed=false;
 $: href=gameImageHref(base,characterId);
 $: if(href)failed=false;
</script>
{#if href&&!failed}<img src={href} alt={name} loading="lazy" decoding="async" on:error={()=>failed=true}/>{:else}<WandIcon name="character" size={21}/>{/if}
<style>img{width:100%;height:100%;object-fit:contain}</style>
