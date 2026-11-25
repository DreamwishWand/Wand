<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {openCurrentItemDatabase,type ItemMasterRecord} from '../items/public-item-master.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {parseIndoorRooms,indoorWords,type IndoorRoom} from './indoor-room-view.ts';
 import type {WandLanguage} from '../ui/preferences';
 export let file:File|null,locale:WandLanguage='ja',onClose:()=>void;
 let seen:File|null=null,own:Worker|null=null,rooms:IndoorRoom[]=[],status:'loading'|'ready'|'error'='loading',selected=0,surface=0,query='',limit=80;
 let records=new Map<number,ItemMasterRecord>(),images=new Map<number,string>(),asked=new Set<number>();
 let db:ReturnType<typeof openCurrentItemDatabase>|null=null;
 $: w=indoorWords[locale]??indoorWords.en;
 $: if(file!==seen)load(file);
 $: room=rooms[selected]??null;
 $: face=room?.surfaces[surface]??null;
 $: filtered=(face?.items??[]).filter(p=>name(p.itemId,records,locale,w[12]).normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').toLocaleLowerCase().trim()));
 $: visible=filtered.slice(0,limit);
 $: if(room)loadItems([...room.surfaces.map(s=>s.finish),room.ceiling,...(face?.items.map(p=>p.itemId)??[])].filter((n):n is number=>typeof n==='number'&&n>0),visible.map(p=>p.itemId));
 function name(id:number|null,dict:ReadonlyMap<number,ItemMasterRecord>,lang:WandLanguage,unknown:string){return id===null?unknown:dict.get(id)?.names[lang]??dict.get(id)?.names.en??unknown;}
 function load(next:File|null){seen=next;own?.terminate();own=null;rooms=[];selected=0;surface=0;query='';status='loading';if(!next){status='ready';return;}
  const worker=new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'});own=worker;
  const done=(v:unknown)=>{worker.terminate();if(own!==worker||file!==next)return;own=null;try{rooms=parseIndoorRooms(v);status='ready';}catch{status='error';}};
  worker.onmessage=e=>done(e.data?.kind==='indoor-rooms'?e.data.result:null);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);worker.postMessage({command:'indoor-rooms',file:next});
 }
 function loadItems(ids:number[],art:number[]){const fresh=[...new Set(ids)].filter(id=>!asked.has(id));for(const id of fresh)asked.add(id);
  if(fresh.length){db??=openCurrentItemDatabase(base);void db.then(async d=>{for(let i=0;i<fresh.length;i+=128){const rows=await d.getItems(fresh.slice(i,i+128));const next=new Map(records);for(const row of rows)if(row)next.set(row.itemId,row);records=next;}}).catch(()=>{});}
  for(const id of new Set([...(room?.surfaces.map(s=>s.finish)??[]),room?.ceiling,...art]))if(typeof id==='number'&&id>0&&!images.has(id)){images=new Map(images).set(id,'');void worldArtwork(base,id).then(url=>{if(url)images=new Map(images).set(id,url);}).catch(()=>{});}
 }
 function choose(i:number){selected=i;surface=0;query='';limit=80;}
 onDestroy(()=>own?.terminate());
</script>
<div class="indoor-room-view" role="dialog" aria-label={w[0]} aria-modal="true">
 <header><strong>{w[0]}</strong><button type="button" on:click={onClose} aria-label={w[7]}>×</button></header>
 {#if status==='loading'}<p role="status">{w[8]}</p>{:else if status==='error'}<p role="alert">{w[10]}</p>{:else if !rooms.length}<p>{w[9]}</p>{:else if room}
 <div class="room-body">
  <nav aria-label={w[3]}>{#each rooms as r,i}<button type="button" aria-pressed={i===selected} on:click={()=>choose(i)}>{w[1]} {r.house} / {w[2]} {r.floor} · {r.name||w[3]+' '+r.ordinal}</button>{/each}</nav>
  <div class="room-content">
   <div class="finish-heading"><strong>{w[15]}</strong></div>
   <div class="finishes">
    {#each room.surfaces as s,i}<button type="button" class="finish-card" aria-pressed={surface===i} on:click={()=>{surface=i;query='';limit=80;}}><span>{i===0?w[4]:w[5]+' '+i}</span>{#if s.finish&&images.get(s.finish)}<img src={images.get(s.finish)} alt="" loading="lazy"/>{/if}<small>{s.finish===0?w[11]:name(s.finish,records,locale,w[12])}</small></button>{/each}
    <div class="finish-card"><span>{w[6]}</span>{#if room.ceiling&&images.get(room.ceiling)}<img src={images.get(room.ceiling)} alt="" loading="lazy"/>{/if}<small>{room.ceiling===0?w[11]:name(room.ceiling,records,locale,w[12])}</small></div>
   </div>
   <div class="room-items-header"><strong>{w[13]} · {face?.items.reduce((n,p)=>n+p.quantity,0)??0}</strong><input type="search" aria-label={w[17]} placeholder={w[17]} bind:value={query} on:input={()=>limit=80}/></div>
   {#if face?.gridStatus!=='full'}<p>{w[16]}</p>{:else}
    <div class="room-items" on:scroll={e=>{const el=e.currentTarget;if(el.scrollTop+el.clientHeight>=el.scrollHeight-100)limit=Math.min(filtered.length,limit+80);}}>
     {#each visible as item (item.itemId)}<div class="room-item">{#if images.get(item.itemId)}<img src={images.get(item.itemId)} alt="" loading="lazy"/>{/if}<span>{name(item.itemId,records,locale,w[12])}</span><strong>×{item.quantity}</strong></div>{/each}
    </div>
   {/if}
  </div>
 </div>
 {/if}
 <footer>{w[14]}</footer>
</div>
<style>
 .indoor-room-view{position:absolute;inset:0;z-index:22;background:var(--wand-bg);color:var(--wand-text);display:flex;flex-direction:column;min-width:0;overflow:hidden;padding:8px;gap:6px}
 header,.finish-heading,.room-items-header{display:flex;align-items:center;gap:6px}header strong,.room-items-header strong{flex:1}button,input{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:5px}button[aria-pressed=true]{outline:2px solid var(--wand-accent)}.room-body{display:flex;flex:1;min-height:0;gap:8px}nav{width:min(220px,35%);display:flex;flex-direction:column;gap:4px;overflow:auto}nav button{text-align:start;overflow-wrap:anywhere}.room-content{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px}.finishes{display:flex;gap:5px;overflow:auto;flex:none;max-height:40%}.finish-card{min-width:100px;max-width:145px;display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--wand-card);padding:5px;border-radius:5px}.finish-card img{width:64px;height:64px;object-fit:contain}.finish-card small{text-align:center;overflow-wrap:anywhere}.room-items{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:4px;align-content:start}.room-item{display:flex;flex-direction:column;align-items:center;text-align:center;background:var(--wand-card);border-radius:5px;padding:4px;overflow-wrap:anywhere;font-size:12px}.room-item img{width:52px;height:52px;object-fit:contain}footer{font-size:12px;color:var(--wand-muted)}@media(max-width:600px){.room-body{flex-direction:column}nav{width:100%;max-height:24%;flex-direction:row;flex-wrap:wrap}.room-items-header input{width:45%}}
</style>
