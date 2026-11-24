<script lang="ts">
 import {onMount} from 'svelte';
 import {watchWandLanguage,type WandLanguage} from '../ui/preferences';
 export let zoom=1;
 export let maxZoom=1;
 export let onZoom:(value:number)=>void;
 export let onFit:()=>void;
 export let onPan:((dx:number,dy:number)=>void)|undefined=undefined;
 let locale:WandLanguage='ja';
 onMount(()=>watchWandLanguage(v=>locale=v));
 const copy={
 ja:['拡大','縮小','全体表示','左へ移動','右へ移動','上へ移動','下へ移動'],
 en:['Zoom in','Zoom out','Fit map','Pan left','Pan right','Pan up','Pan down'],
 fr:['Agrandir','Réduire','Vue entière','Déplacer à gauche','Déplacer à droite','Déplacer en haut','Déplacer en bas'],
 it:['Ingrandisci','Riduci','Vista intera','Sposta a sinistra','Sposta a destra','Sposta in alto','Sposta in basso'],
 de:['Vergrößern','Verkleinern','Gesamtansicht','Nach links','Nach rechts','Nach oben','Nach unten'],
 'es-ES':['Ampliar','Reducir','Vista completa','Mover a la izquierda','Mover a la derecha','Mover arriba','Mover abajo'],
 'zh-CN':['放大','缩小','全图','向左移动','向右移动','向上移动','向下移动'],
 'pt-BR':['Ampliar','Reduzir','Mapa inteiro','Mover à esquerda','Mover à direita','Mover para cima','Mover para baixo']
 } as const;
 $: labels=copy[locale]??copy.en;
</script>
<div class="map-camera-controls" role="group" aria-label={labels[2]}>
 <button type="button" aria-label={labels[0]} title={labels[0]} disabled={zoom>=maxZoom} on:click={()=>onZoom(zoom*2)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
 <button type="button" aria-label={labels[1]} title={labels[1]} disabled={zoom<=1} on:click={()=>onZoom(zoom/2)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
 <button type="button" aria-label={labels[2]} title={labels[2]} on:click={onFit}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/></svg></button>
 {#if onPan&&zoom>1}
  <div class="pan-controls">
  {#each [[-.4,0,'M14 5l-7 7 7 7'],[.4,0,'M10 5l7 7-7 7'],[0,-.4,'M5 14l7-7 7 7'],[0,.4,'M5 10l7 7 7-7']] as entry,i}
   <button type="button" title={labels[i+3]} aria-label={labels[i+3]} on:click={()=>onPan?.(Number(entry[0]),Number(entry[1]))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={String(entry[2])}/></svg></button>
  {/each}
  </div>
 {/if}
</div>
<style>
 .map-camera-controls{position:absolute;z-index:3;right:10px;bottom:10px;display:flex;flex-direction:column;gap:3px;padding:3px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:8px;box-shadow:0 2px 10px #0003}
 button{display:grid;place-items:center;width:38px;height:38px;padding:0;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px}
 button:hover:not(:disabled){background:var(--wand-header-hover)}button:disabled{opacity:.45}button:focus-visible{outline:2px solid var(--wand-focus);outline-offset:1px}
 svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
 .pan-controls{display:grid;grid-template-columns:repeat(2,1fr);gap:2px}.pan-controls button{width:18px;height:26px}.pan-controls svg{width:15px;height:15px}
 @media(pointer:coarse){button{width:44px;height:44px}.pan-controls{display:none}}
</style>
