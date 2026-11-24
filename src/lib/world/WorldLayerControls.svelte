<script lang="ts">
 import {WORLD_LAYERS,toggleWorldLayer,defaultWorldLayers,type WorldLayerState} from './world-layer-state.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let locale:WandLanguage='ja';
 export let state:WorldLayerState;
 export let disabled=false;
 export let onChange:(value:WorldLayerState)=>void;
 const words={
 ja:['レイヤー','家具','建物・家','景観・樹木','支持面専用','道・地面','フェンス','固定・保護物','その他・未分類','表示','非表示','ロック','ロック解除','リセット'],
 en:['Layers','Furniture','Buildings & houses','Landscaping','Surface-only','Paths & ground','Fences','Fixed / protected objects','Other / unclassified','Show','Hide','Lock','Unlock','Reset'],
 fr:['Calques','Meubles','Bâtiments et maisons','Paysage','Surfaces','Chemins et sol','Clôtures','Objets fixes','Autres / non classés','Afficher','Masquer','Verrouiller','Déverrouiller','Réinitialiser'],
 it:['Livelli','Mobili','Edifici e case','Paesaggio','Superfici','Sentieri e terreno','Recinzioni','Oggetti fissi','Altro / non classificato','Mostra','Nascondi','Blocca','Sblocca','Ripristina'],
 de:['Ebenen','Möbel','Gebäude und Häuser','Landschaft','Oberflächen','Wege und Boden','Zäune','Feste Objekte','Sonstiges / unbekannt','Anzeigen','Ausblenden','Sperren','Entsperren','Zurücksetzen'],
 'es-ES':['Capas','Muebles','Edificios y casas','Paisaje','Superficies','Caminos y suelo','Vallas','Objetos fijos','Otros / sin clasificar','Mostrar','Ocultar','Bloquear','Desbloquear','Restablecer'],
 'zh-CN':['图层','家具','建筑与房屋','景观与树木','仅支撑面','道路与地面','围栏','固定物体','其他／未分类','显示','隐藏','锁定','解锁','重置'],
 'pt-BR':['Camadas','Móveis','Edifícios e casas','Paisagem','Superfícies','Caminhos e chão','Cercas','Objetos fixos','Outros / não classificados','Mostrar','Ocultar','Bloquear','Desbloquear','Redefinir']
 } as const;
 $: labels=words[locale]??words.en;
</script>
<section class="world-layer-controls" aria-label={labels[0]}>
 <header><strong>{labels[0]}</strong><button type="button" title={labels[13]} aria-label={labels[13]} {disabled} on:click={()=>onChange(defaultWorldLayers())}><svg viewBox="0 0 24 24"><path d="M4 11a8 8 0 1 1 2 6M4 4v7h7"/></svg></button></header>
 {#each WORLD_LAYERS as layer,i}
  <div class="layer-row">
   <span>{labels[i+1]}</span>
   <button type="button" class:muted={state.hidden.includes(layer)} aria-label={(state.hidden.includes(layer)?labels[9]:labels[10])+' '+labels[i+1]} title={(state.hidden.includes(layer)?labels[9]:labels[10])+' '+labels[i+1]} aria-pressed={!state.hidden.includes(layer)} {disabled} on:click={()=>onChange(toggleWorldLayer(state,layer,'hidden'))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{#if state.hidden.includes(layer)}<path d="m3 3 18 18"/>{/if}</svg></button>
   <button type="button" class:muted={!state.locked.includes(layer)} aria-label={(state.locked.includes(layer)?labels[12]:labels[11])+' '+labels[i+1]} title={(state.locked.includes(layer)?labels[12]:labels[11])+' '+labels[i+1]} aria-pressed={state.locked.includes(layer)} {disabled} on:click={()=>onChange(toggleWorldLayer(state,layer,'locked'))}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/>{#if state.locked.includes(layer)}<path d="M8 10V7a4 4 0 0 1 8 0v3"/>{:else}<path d="M8 10V7a4 4 0 0 1 7.6-1.7"/>{/if}</svg></button>
  </div>
 {/each}
</section>
<style>
 .world-layer-controls{display:grid;gap:2px;padding:5px;color:var(--wand-text);background:var(--wand-card);min-width:180px}
 header,.layer-row{display:grid;grid-template-columns:minmax(0,1fr) 32px 32px;gap:3px;align-items:center;font-size:12px}header{grid-template-columns:1fr 32px}header strong{font-size:13px}.layer-row span{overflow-wrap:anywhere}
 button{display:grid;place-items:center;width:32px;height:32px;padding:3px;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:4px;cursor:pointer}button.muted{opacity:.52}button:disabled{cursor:default;opacity:.4}button:focus-visible{outline:2px solid var(--wand-focus)}svg{width:19px;height:19px;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;fill:none}
</style>
