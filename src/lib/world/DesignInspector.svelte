<script lang="ts">
 import type {DesignPlacement,DesignItemGeometry} from './design-layout.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let locale:WandLanguage='ja';
 export let placements:readonly DesignPlacement[]=[];
 export let definitions:ReadonlyMap<number,DesignItemGeometry>;
 export let originX=0,originY=0,world=false,disabled=false;
 export let onMove:(dx:number,dy:number)=>boolean;
 export let onClose:()=>void;
 const words={ja:['精密配置','閉じる','移動量','選択範囲','マス','適用','座標'],en:['Precise placement','Close','Offset','Selection bounds','cells','Apply','Coordinates'],fr:['Placement précis','Fermer','Décalage','Limites de sélection','cases','Appliquer','Coordonnées'],it:['Posizionamento preciso','Chiudi','Spostamento','Limiti selezione','celle','Applica','Coordinate'],de:['Präzise Platzierung','Schließen','Versatz','Auswahlgrenzen','Zellen','Anwenden','Koordinaten'],'es-ES':['Colocación precisa','Cerrar','Desplazamiento','Límites de selección','celdas','Aplicar','Coordenadas'],'zh-CN':['精确放置','关闭','移动量','选区范围','格','应用','坐标'],'pt-BR':['Posicionamento preciso','Fechar','Deslocamento','Limites da seleção','células','Aplicar','Coordenadas']} as const;
 $: w=words[locale]??words.en;
 $: single=placements.length===1;
 $: first=placements[0];
 $: x0=single&&first?first.x+originX:0;
 $: y0=single&&first?first.y+originY:0;
 $: signature=JSON.stringify([originX,originY,placements.map(p=>[p.id,p.x,p.y,p.orientation])]);
 let seen='',x:number|undefined=0,y:number|undefined=0;
 $: if(signature!==seen){seen=signature;x=x0;y=y0;}
 $: left=placements.length?Math.min(...placements.map(p=>p.x)):0;
 $: bottom=placements.length?Math.min(...placements.map(p=>p.y)):0;
 $: right=placements.length?Math.max(...placements.map(p=>p.x+(definitions.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4]?.width??1))):0;
 $: top=placements.length?Math.max(...placements.map(p=>p.y+(definitions.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4]?.height??1))):0;
 $: valid=typeof x==='number'&&typeof y==='number'&&Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&(x!==x0||y!==y0);
 function apply(){if(valid&&typeof x==='number'&&typeof y==='number'&&onMove(x-x0,y-y0)&&!single){x=0;y=0;}}
</script>
<header><strong>{w[0]}</strong><button type="button" aria-label={w[1]} on:click={onClose}>×</button></header>
{#if placements.length}
 <p>{w[3]}: {right-left} × {top-bottom} {w[4]}</p>
 <form on:submit|preventDefault={apply}>
  <span>{single?w[6]:w[2]}</span>
  <div class="coords"><label>{single?'X':'ΔX'}<input type="number" step="1" bind:value={x} {disabled}/></label><label>{single?(world?'Z':'Y'):(world?'ΔZ':'ΔY')}<input type="number" step="1" bind:value={y} {disabled}/></label></div>
  <button type="submit" disabled={disabled||!valid}>{w[5]}</button>
 </form>
{/if}
<style>
 header,.coords{display:flex;gap:8px;align-items:center;justify-content:space-between}header strong{font-size:14px}p,span,label{font-size:12px;color:var(--wand-muted)}p{margin:8px 0}form{display:grid;gap:6px}label{display:grid;gap:3px;flex:1;min-width:0}input,button{font:inherit;box-sizing:border-box;min-width:0;color:var(--wand-text);background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:6px}input{width:100%}button:disabled{opacity:.45}button:focus-visible,input:focus-visible{outline:2px solid var(--wand-focus)}
</style>
