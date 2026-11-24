<script lang="ts">
 import type {RoadTool} from './road-design.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let locale:WandLanguage='ja';
 export let tool:RoadTool='brush';
 export let fence=false;
 const fenceLabel={ja:'フェンスの描画',en:'Draw fences',fr:'Tracer des clôtures',it:'Disegna recinzioni',de:'Zäune zeichnen','es-ES':'Dibujar vallas','zh-CN':'绘制围栏','pt-BR':'Desenhar cercas'} as const;
 export let valid=true;
 export let added=0;
 export let removed=0;
 export let onChange:(value:RoadTool)=>void;
 const tools:RoadTool[]=['brush','line','outline','fill','erase'];
 const copy={
 ja:['道の描画','自由描画','直線','矩形枠','塗りつぶし','消しゴム','追加','削除','配置範囲・別の道との重複を確認'],
 en:['Draw paths','Freehand','Line','Rectangle outline','Fill rectangle','Erase','Add','Remove','Check boundaries and other paths'],
 fr:['Tracer des chemins','Dessin libre','Ligne','Contour rectangle','Remplir rectangle','Effacer','Ajouter','Retirer','Vérifiez les limites et autres chemins'],
 it:['Disegna sentieri','Mano libera','Linea','Bordo rettangolo','Riempi rettangolo','Cancella','Aggiungi','Rimuovi','Controlla limiti e altri sentieri'],
 de:['Wege zeichnen','Freihand','Linie','Rechteckrahmen','Rechteck füllen','Radieren','Hinzufügen','Entfernen','Grenzen und andere Wege prüfen'],
 'es-ES':['Dibujar caminos','Trazo libre','Línea','Borde rectangular','Rellenar rectángulo','Borrar','Añadir','Quitar','Comprueba límites y otros caminos'],
 'zh-CN':['绘制道路','自由绘制','直线','矩形边框','矩形填充','橡皮擦','添加','移除','检查边界和其他道路'],
 'pt-BR':['Desenhar caminhos','Traço livre','Linha','Contorno retangular','Preencher retângulo','Apagar','Adicionar','Remover','Verifique limites e outros caminhos']
 } as const;
 const icons=['M3 17l5-9 5 8 7-10','M4 20 20 4','M4 4h16v16H4z','M4 4h16v16H4zM4 8h16M4 12h16M4 16h16','m3 14 10-10 8 8-8 8H9zM8 9l8 8M13 20h9'];
 $: words=copy[locale]??copy.en;
</script>
<div class="road-design-controls" role="group" aria-label={fence?fenceLabel[locale]:words[0]}>
 {#each tools as mode,i}
 {#if !fence||mode!=='fill'}<button type="button" title={words[i+1]} aria-label={words[i+1]} aria-pressed={tool===mode} on:click={()=>onChange(mode)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[i]}/></svg></button>{/if}
 {/each}
 {#if added||removed}<small>{words[6]} {added} / {words[7]} {removed}</small>{/if}
 {#if !valid}<small role="status">{words[8]}</small>{/if}
</div>
<style>
 .road-design-controls{display:flex;gap:3px;align-items:center;flex-wrap:wrap;padding:5px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;color:var(--wand-text)}button{width:32px;height:32px;padding:4px;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:4px;cursor:pointer}button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover)}svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round}small{font-size:11px;color:var(--wand-muted)}
</style>
