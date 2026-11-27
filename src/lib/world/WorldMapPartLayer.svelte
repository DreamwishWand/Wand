<svelte:options namespace="svg"/>
<script lang="ts">
  import {visibleMapParts} from '../media/world-map-parts.ts';
  import type {RenderableMapPart} from '../media/public-world-map-parts.ts';
  import type {MapExtent} from './map-camera.ts';
  export let parts:readonly RenderableMapPart[]=[];
  export let viewport:MapExtent;
  export let onImageError:(sha256:string)=>void=()=>{};
  $: visible=visibleMapParts(parts,viewport);
</script>
<g class="world-map-part-layer" pointer-events="none">
  {#each visible as p (p)}
    <image href={p.url} width={p.width} height={p.height} preserveAspectRatio="none"
      transform={'matrix('+p.imageToCanvas.join(' ')+')'} on:error={()=>onImageError(p.sha256)}/>
  {/each}
</g>
