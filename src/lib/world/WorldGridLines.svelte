<svelte:options namespace="svg"/>
<script lang="ts">
 import {worldGridLines} from './world-grid-lines.ts';
 import type {MapExtent} from './map-camera.ts';
 export let bounds:MapExtent,view:MapExtent,pixels:number,majorStep=1,minorStep=1;
 $: lines=worldGridLines(bounds,view,pixels,majorStep,minorStep);
</script>
{#if lines.minor}<path d={lines.minor} fill="none" stroke="#c1ccd5" stroke-opacity=".20" stroke-width=".65" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
{#if lines.major}<path d={lines.major} fill="none" stroke="#e2e9ee" stroke-opacity=".36" stroke-width=".8" vector-effect="non-scaling-stroke" pointer-events="none"/>{/if}
