<script lang="ts">
 import type {SavedShapeObject} from './saved-shape-map.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import {worldObjectName} from './world-object-search.ts';
 export let locale:WandLanguage='ja';
 export let query='';
 export let results:readonly SavedShapeObject[]=[];
 export let names:ReadonlyMap<number,string>;
 export let images:ReadonlyMap<number,string>;
 export let onQuery:(q:string)=>void;
 export let onPick:(id:number)=>void;
 export let onClose:()=>void;
 const words={ja:['配置済み家具を検索','閉じる','該当なし'],en:['Find placed items','Close','No results'],fr:['Rechercher les objets placés','Fermer','Aucun résultat'],it:['Cerca oggetti posizionati','Chiudi','Nessun risultato'],de:['Platzierte Objekte suchen','Schließen','Keine Ergebnisse'],'es-ES':['Buscar objetos colocados','Cerrar','Sin resultados'],'zh-CN':['搜索已放置物品','关闭','无结果'],'pt-BR':['Buscar objetos colocados','Fechar','Nenhum resultado']} as const;
 $: w=words[locale]??words.en;
 let limit=80,seen='';
 $: if(query!==seen){seen=query;limit=80;}
 function more(e:Event){const el=e.currentTarget as HTMLElement;if(el.scrollTop+el.clientHeight>=el.scrollHeight-100)limit=Math.min(results.length,limit+80);}
</script>
<header><strong>{w[0]}</strong><button type="button" aria-label={w[1]} on:click={onClose}>×</button></header>
<input type="search" aria-label={w[0]} placeholder={w[0]} value={query} on:input={e=>onQuery(e.currentTarget.value)}/>
<div class="results" on:scroll={more}>
 {#each results.slice(0,limit) as o (o.localOrdinal)}
  <button type="button" on:click={()=>onPick(o.localOrdinal)}>{#if images.has(Number(o.itemId))}<img src={images.get(Number(o.itemId))} alt="" loading="lazy"/>{/if}<span>{worldObjectName(o,names)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/></svg></button>
 {:else}<p>{w[2]}</p>{/each}
</div>
<style>
 header{display:flex;align-items:center;justify-content:space-between;gap:6px}strong{font-size:14px}input,button{font:inherit;color:var(--wand-text);background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:6px}input{width:100%;box-sizing:border-box;margin:6px 0}.results{display:grid;gap:3px;max-height:45vh;overflow:auto}.results button{display:flex;align-items:center;gap:6px;text-align:left;font-size:12px}.results span{flex:1;overflow-wrap:anywhere}.results img{width:32px;height:32px;object-fit:contain}.results svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;flex:none}p{font-size:12px;color:var(--wand-muted)}button:focus-visible,input:focus-visible{outline:2px solid var(--wand-focus)}
</style>
