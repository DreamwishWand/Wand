<script lang="ts">
 import {base} from '$app/paths';
 import {browser} from '$app/environment';
 import {onDestroy} from 'svelte';
 import {openCurrentItemDatabase,type ItemMasterRecord,type CompleteItemMasterRecord} from '../items/public-item-master.ts';
 import {worldArtwork} from './world-artwork.ts';
 import {biomeFurnitureWords} from './biome-furniture-preset.ts';
 import {indoorBackupWords} from './indoor-decoration-backup.ts';
 import type {RestoreStockRow} from './restore-stock-review.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let rows:readonly RestoreStockRow[]=[],locale:WandLanguage='ja';
 const words={
  ja:['家具・仕上げの変更内訳','名称未確認'],en:['Furniture and finish changes','Unknown name'],fr:['Modifications des meubles et finitions','Nom inconnu'],it:['Modifiche a mobili e finiture','Nome sconosciuto'],de:['Möbel- und Oberflächenänderungen','Unbekannter Name'],'es-ES':['Cambios de muebles y acabados','Nombre desconocido'],'zh-CN':['家具及饰面变更','未知名称'],'pt-BR':['Alterações de móveis e acabamentos','Nome desconhecido']
 } as const;
 let limit=24,previous:readonly RestoreStockRow[]|null=null,alive=true,db:ReturnType<typeof openCurrentItemDatabase>|null=null;
 let records=new Map<number,ItemMasterRecord|CompleteItemMasterRecord>(),images=new Map<number,string>(),requested=new Set<number>();
 $: w=words[locale];$: bw=biomeFurnitureWords[locale];$: iw=indoorBackupWords[locale];
 $: if(rows!==previous){previous=rows;limit=24;}
 $: visible=rows.slice(0,limit);
 $: if(browser)load(visible);
 function load(items:readonly RestoreStockRow[]){
  const ids=items.map(r=>r.itemId).filter(id=>!requested.has(id));if(!ids.length)return;
  for(const id of ids)requested.add(id);
  db??=openCurrentItemDatabase(base);
  void db.then(d=>d.getItems(ids)).then(items=>{if(!alive)return;const next=new Map(records);for(const p of items)if(p)next.set(p.itemId,p);records=next;}).catch(()=>{});
  for(const id of ids)void worldArtwork(base,id).then(url=>{if(alive&&url)images=new Map(images).set(id,url);}).catch(()=>{});
 }
 function more(e:Event){const el=e.currentTarget as HTMLElement;if(el.scrollTop+el.clientHeight>=el.scrollHeight-80)limit=Math.min(rows.length,limit+24);}
 onDestroy(()=>{alive=false;});
</script>
{#if rows.length}
 <section class="restore-stock-review" aria-label={w[0]}>
  <div class="review-heading"><strong>{w[0]}</strong><small>{rows.length}</small></div>
  <div class="review-items" role="region" aria-label={w[0]} tabindex="0" on:scroll={more}>
   {#each visible as row (row.itemId)}
    <div class="review-item">
     {#if images.has(row.itemId)}<img src={images.get(row.itemId)} alt="" loading="lazy"/>{:else}<span class="image-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 4h18v16H3zM3 15l5-5 5 5 3-3 5 5"/></svg></span>{/if}
     <div><span>{records.get(row.itemId)?.names[locale]??records.get(row.itemId)?.names.en??w[1]}</span>
      <div class="quantities">{#if row.returned}<small>{bw[5]} {row.returned}</small>{/if}{#if row.required}<small>{bw[6]} {row.required}</small>{/if}{#if row.missing}<small class="missing">{bw[8]} {row.missing}</small>{/if}{#if row.finishes}<small>{iw[9]} {row.finishes}</small>{/if}</div>
     </div>
    </div>
   {/each}
  </div>
 </section>
{/if}
<style>
 .restore-stock-review{display:grid;gap:4px;min-width:0;width:100%;font-size:12px}
 .review-heading{display:flex;justify-content:space-between;align-items:center}
 .review-items{display:grid;max-height:min(38vh,280px);overflow:auto;overscroll-behavior:contain}
 .review-item{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--wand-line)}
 .review-item img,.image-placeholder{width:34px;height:34px;object-fit:contain;display:grid;place-items:center}
 .image-placeholder svg{width:20px;fill:none;stroke:currentColor;opacity:.5}
 .review-item>div{min-width:0;overflow-wrap:anywhere}
 .quantities{display:flex;gap:5px;flex-wrap:wrap}.missing{color:#e66b65;font-weight:600}
</style>
