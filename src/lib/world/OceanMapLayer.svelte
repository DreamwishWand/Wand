<svelte:options namespace="svg"/>
<script lang="ts">
  import type {OceanComposition} from '../media/ocean-composition.ts';
  import {oceanChannelMatrix} from '../media/ocean-composition.ts';
  import {visibleMapParts} from '../media/world-map-parts.ts';
  import type {MapExtent} from './map-camera.ts';
  let {composition,viewport,onImageError=()=>{}}:{composition:OceanComposition;viewport:MapExtent;onImageError?:(sha:string)=>void}=$props();
  const prefix=$props.id();
  let visible=$derived(visibleMapParts(composition.parts,viewport));
  const rgb=(c:readonly number[])=>'rgb('+c.slice(0,3).join(',')+')';
</script>
<defs>
  {#each composition.parts as p,i}
    {#if p.kind==='sdf'}
      <filter id={prefix+'-sdf-'+i} x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values={oceanChannelMatrix(composition.transfer.channel)}/>
        <feComponentTransfer result="coverage">
          <feFuncA type="table" tableValues={composition.transfer.table.join(' ')}/>
        </feComponentTransfer>
        <feFlood flood-color={rgb(p.rgba)} flood-opacity={p.rgba[3]/255} result="water"/>
        <feComposite in="water" in2="coverage" operator="in"/>
      </filter>
    {/if}
  {/each}
</defs>
<g pointer-events="none">
  {#each visible as p (p)}
    <g transform={'matrix('+p.imageToCanvas.join(' ')+')'}>
      {#if p.kind==='fill'}
        <rect width="1" height="1" fill={rgb(p.rgba)} fill-opacity={p.rgba[3]/255}/>
      {:else}
        <image href={p.url} width={p.width} height={p.height} preserveAspectRatio="none"
          filter={p.kind==='sdf'?'url(#'+prefix+'-sdf-'+composition.parts.indexOf(p)+')':undefined}
          onerror={()=>onImageError(p.sha256)}/>
      {/if}
    </g>
  {/each}
</g>
