<script lang="ts">
 import type {NativeMapProgress} from '../media/native-map-renderer.ts';
 import type {WandLanguage} from '../ui/preferences';
 export let locale:WandLanguage='ja';
 export let progress:NativeMapProgress|null=null;
 export let compact=false;
 const labels={
  ja:'マップを読み込み中…',en:'Loading map…',fr:'Chargement de la carte…',it:'Caricamento della mappa…',
  de:'Karte wird geladen…','es-ES':'Cargando mapa…','zh-CN':'正在加载地图…','pt-BR':'Carregando mapa…'
 } as const;
 $: label=labels[locale]??labels.en;
</script>
<div class="map-loading" class:compact>
 <div class="loading-content">
  <span class="spinner" aria-hidden="true"></span>
  <span role="status">{label}</span>
  {#if progress&&progress.total>0}
   <progress max={progress.total} value={progress.done} aria-label={label}></progress>
   <small aria-hidden="true">{progress.done} / {progress.total}</small>
  {/if}
 </div>
</div>
<style>
 .map-loading{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:3}
 .loading-content{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:12px 16px;max-width:calc(100% - 24px);border-radius:8px;background:var(--wand-card,#20232a);color:var(--wand-text,#fff);border:1px solid var(--wand-line,#69717b);box-shadow:0 2px 8px #0004;font-size:13px}
 .compact{inset:auto 10px 10px auto;display:block}
 .compact .loading-content{padding:6px 10px;max-width:none}
 progress{width:100px;height:7px;accent-color:var(--wand-accent,#82b4ff)}
 small{font-variant-numeric:tabular-nums}
 .spinner{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
 @keyframes spin{to{transform:rotate(360deg)}}
 @media(prefers-reduced-motion:reduce){.spinner{animation:none}}
</style>
