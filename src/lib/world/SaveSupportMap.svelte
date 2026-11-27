<script lang="ts">
 import {onDestroy} from 'svelte';
 import SupportContentsMarker from './SupportContentsMarker.svelte';
 import {supportMapReceipts,supportMapWitnessKey,type SupportMapParent,type SupportMapContents} from './support-map-preview.ts';
 import {worldArtwork} from './world-artwork.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File|null,parents:readonly SupportMapParent[]=[],pixels:number,base='',locale:WandLanguage='ja',enabled=true;
 let source:File|null=null,own:Worker|null=null,cache=new Map<string,SupportMapContents>(),images=new Map<number,string>(),asked=new Set<number>();
 let timer:ReturnType<typeof setTimeout>|null=null;
 function stop(){own?.terminate();own=null;if(timer!==null)clearTimeout(timer);timer=null;}
 function reset(f:File|null){stop();source=f;cache=new Map();}
 function loadImages(rows:ReadonlyMap<string,SupportMapContents>){for(const children of rows.values())for(const c of children?.slice(0,4)??[]){if(asked.has(c.itemId))continue;asked.add(c.itemId);void worldArtwork(base,c.itemId).then(url=>{if(url)images=new Map(images).set(c.itemId,url);}).catch(()=>{});}}
 function read(f:File|null,visible:readonly SupportMapParent[],known:ReadonlyMap<string,SupportMapContents>,busy:Worker|null,show:boolean,scale:number){
  if(!f||f!==source||busy||!show||scale<5)return;
  const batch=visible.filter(p=>p.count!==0&&!known.has(supportMapWitnessKey(p))).slice(0,32);
  if(!batch.length)return;
  const job=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});own=job;
  const finish=(v:unknown)=>{job.terminate();if(own!==job||source!==f)return;if(timer!==null)clearTimeout(timer);timer=null;let rows:Map<string,SupportMapContents>;try{rows=supportMapReceipts(v,batch);}catch{rows=new Map(batch.map(p=>[supportMapWitnessKey(p),null]));}cache=new Map([...cache,...rows]);loadImages(rows);own=null;};
  timer=setTimeout(()=>finish(null),30000);job.onmessage=e=>finish(e.data);job.onerror=()=>finish(null);job.onmessageerror=()=>finish(null);
  job.postMessage({command:'inspect-support-map',file:f,parents:batch.map(({localOrdinal,itemId,x,y})=>({localOrdinal,itemId,x,y}))});
 }
 $: if(file!==source)reset(file);
 $: if(!enabled&&own)stop();
 $: read(file,parents,cache,own,enabled,pixels);
 onDestroy(stop);
</script>
{#if enabled}
 {#each parents as p (p.localOrdinal)}
  <SupportContentsMarker ordinal={p.localOrdinal} x={p.mapX+p.mapW/2} y={p.mapY+p.mapH/2} {pixels} contents={cache.get(supportMapWitnessKey(p))} count={p.count} {images} {locale} selectable={p.selectable}/>
 {/each}
{/if}
