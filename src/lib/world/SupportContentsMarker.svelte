<script lang="ts">
 import type {SupportMapContents} from './support-map-preview.ts';
 import {supportMapWords} from './support-map-preview.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let ordinal:number,x:number,y:number,pixels:number,contents:SupportMapContents|undefined=undefined,count:number|null|undefined=undefined,images:ReadonlyMap<number,string>=new Map(),locale:WandLanguage='ja',selectable=false,flip=false;
 $: n=contents?.length??count;
 $: scale=1/Math.max(0.1,pixels);
 $: shown=contents&&pixels>=5?contents.slice(0,4):[];
 $: width=shown.length?shown.length*22+24:24;
 $: words=supportMapWords[locale];
</script>
{#if pixels>=1&&n!==0}
 <g class="support-map-marker" transform={'translate('+x+' '+y+') scale('+scale+' '+(flip?-scale:scale)+')'} pointer-events={selectable?'all':'none'} opacity={selectable?1:.85}>
  <title>{words[1]}{n===null||n===undefined?'': ' · '+n}</title>
  <g data-support-map-parent={selectable?ordinal:undefined}>
   <rect x={-width/2} y="-13" width={width} height="26" rx="5" fill="#28313b" stroke="#d6a6ef" stroke-width="1"/>
   <text x={width/2-12} y="4" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">{n??'?'}</text>
  </g>
  {#each shown as child,i (child.index)}
   <g data-support-map-parent={selectable?ordinal:undefined} data-support-map-child={selectable?child.index:undefined}>
    <rect x={-width/2+2+i*22} y="-10" width="20" height="20" rx="3" fill="#566070"/>
    {#if images.get(child.itemId)}<image href={images.get(child.itemId)} x={-width/2+2+i*22} y="-10" width="20" height="20" preserveAspectRatio="xMidYMid meet"/>{:else}<circle cx={-width/2+12+i*22} cy="0" r="4" fill="#d6a6ef"/>{/if}
    {#if child.nested}<circle cx={-width/2+19+i*22} cy="7" r="3" fill="#d6a6ef"/>{/if}
   </g>
  {/each}
 </g>
{/if}
<style>.support-map-marker{cursor:default}.support-map-marker [data-support-map-parent]{cursor:pointer}</style>
