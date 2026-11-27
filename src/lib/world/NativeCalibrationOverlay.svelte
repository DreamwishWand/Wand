<script lang="ts">
 import {onMount} from 'svelte';
 import {base} from '$app/paths';
 import {bindMainland,type MainlandGrid} from './mainland-world-coordinates.ts';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 import {nativeCalibrationGridTransform,nativeCalibrationPixels} from './native-map-calibration-overlay.ts';
 export let scope:string;
 export let opacity=.35;
 export let onStatus:(s:'loading'|'ready'|'error')=>void=()=>{};
 let grids:MainlandGrid[]=[];
 let images=new Map<string,string>();
 onMount(()=>{
  const worker=new Worker(new URL('./public-world-terrain.worker.ts',import.meta.url),{type:'module'});
  let disposed=false,sequence=1,failed=false;
  const pending=new Map<number,MainlandGrid>();
  function fail(){if(disposed)return;failed=true;onStatus('error');worker.terminate();pending.clear();images=new Map();grids=[];}
  worker.onerror=fail;
  worker.onmessage=({data})=>{
   if(disposed||failed)return;
   try{
    if(data.requestId===1){
     if(data.kind!=='index'||!Array.isArray(data.grids))throw Error('terrain index');
     const source=(data.grids as (PublicTerrainGridRef&{scope:string})[]).filter(g=>g.scope===scope);
     const bound=bindMainland(source);if(!bound)throw Error('source world unavailable');
     grids=bound;
     for(const g of bound){const id=++sequence;pending.set(id,g);worker.postMessage({command:'terrain',key:g.key,requestId:id});}
     return;
    }
    const g=pending.get(data.requestId);if(!g)return;
    if(data.kind!=='terrain'||data.key!==g.key||data.sizeX!==g.sizeX||data.sizeY!==g.sizeY||!(data.nativeFloorValues instanceof Uint32Array))throw Error('terrain raster');
    const canvas=document.createElement('canvas');canvas.width=g.sizeX;canvas.height=g.sizeY;
    const context=canvas.getContext('2d');if(!context)throw Error('canvas');
    const image=context.createImageData(g.sizeX,g.sizeY);image.data.set(nativeCalibrationPixels({sizeX:g.sizeX,sizeY:g.sizeY,nativeFloorValues:data.nativeFloorValues}));
    context.putImageData(image,0,0);images=new Map(images).set(g.key,canvas.toDataURL());pending.delete(data.requestId);
    if(!pending.size){worker.terminate();onStatus('ready');}
   }catch{fail();}
  };
  onStatus('loading');worker.postMessage({command:'open',requestId:1,base});
  return ()=>{disposed=true;pending.clear();worker.terminate();};
 });
</script>
<g pointer-events="none" {opacity} aria-hidden="true">
 {#each [...grids].sort((a,b)=>a.origin.position[1]-b.origin.position[1]) as grid (grid.key)}
  {#if images.has(grid.key)}
   <image href={images.get(grid.key)} width={grid.sizeX} height={grid.sizeY} transform={nativeCalibrationGridTransform(grid)} preserveAspectRatio="none" style="image-rendering:pixelated"/>
  {/if}
 {/each}
</g>
