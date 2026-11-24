<script lang="ts">
 import type {DesignSymmetry,SymmetryMode} from './design-symmetry.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let locale:WandLanguage='ja';
 export let value:DesignSymmetry|null;
 export let width:number;
 export let height:number;
 export let picking=false;
 export let count=0;
 export let valid=false;
 export let busy=false;
 export let onChange:(s:DesignSymmetry|null)=>void;
 export let onPick:()=>void;
 export let onMirror:()=>void;
 const copy={
 ja:['対称編集','無効','垂直軸','水平軸','点対称','軸・中心を指定','マップ上で位置を選択','中央に戻す','選択を対称複製','半マス単位で指定できます。','現在の形状・向き・範囲では対称配置できません。'],
 en:['Symmetry','Off','Vertical axis','Horizontal axis','Point symmetry','Pick axis / center','Pick a location on the map','Reset to center','Mirror selection','Half-cell positions are supported.','The selected shapes, directions or bounds do not allow symmetry.'],
 fr:['Symétrie','Désactivée','Axe vertical','Axe horizontal','Symétrie centrale','Choisir axe / centre','Choisir sur la carte','Recentrer','Dupliquer en miroir','Les demi-cases sont prises en charge.','Symétrie impossible avec ces formes, orientations ou limites.'],
 it:['Simmetria','Disattiva','Asse verticale','Asse orizzontale','Simmetria centrale','Scegli asse / centro','Scegli sulla mappa','Ripristina il centro','Duplica simmetricamente','Sono supportate le mezze celle.','Simmetria impossibile per forme, orientamenti o limiti.'],
 de:['Symmetrie','Aus','Vertikale Achse','Horizontale Achse','Punktsymmetrie','Achse / Mittelpunkt wählen','Position auf der Karte wählen','Zur Mitte zurück','Auswahl spiegeln','Halbe Zellen werden unterstützt.','Form, Richtung oder Grenzen verhindern Symmetrie.'],
 'es-ES':['Simetría','Desactivar','Eje vertical','Eje horizontal','Simetría central','Elegir eje / centro','Elige una posición en el mapa','Restablecer centro','Duplicar selección en espejo','Se admiten medias celdas.','Las formas, orientaciones o límites impiden la simetría.'],
 'zh-CN':['对称编辑','关闭','垂直轴','水平轴','中心对称','指定轴／中心','在地图上选择位置','重置为中心','对称复制所选物品','支持半格坐标。','当前形状、方向或范围无法对称放置。'],
 'pt-BR':['Simetria','Desativar','Eixo vertical','Eixo horizontal','Simetria central','Escolher eixo / centro','Escolha uma posição no mapa','Voltar ao centro','Duplicar seleção em espelho','Posições de meia célula são aceitas.','As formas, direções ou limites impedem a simetria.']
 } as const;
 $: labels=copy[locale]??copy.en;
 function select(mode:SymmetryMode|null){onChange(mode?{mode,x2:value?.x2??width,y2:value?.y2??height}:null);}
 function coordinate(axis:'x2'|'y2',e:Event){if(!value)return;const n=(e.currentTarget as HTMLInputElement).valueAsNumber*2,max=axis==='x2'?width*2:height*2;if(Number.isSafeInteger(n)&&n>=0&&n<=max)onChange({...value,[axis]:n});}
</script>
<section class="world-symmetry-controls" aria-label={labels[0]}>
 <strong>{labels[0]}</strong>
 <div class="symmetry-modes">
  <button type="button" aria-pressed={!value} disabled={busy} on:click={()=>select(null)}>{labels[1]}</button>
  {#each ['vertical','horizontal','point'] as mode,i}<button type="button" aria-pressed={value?.mode===mode} disabled={busy} on:click={()=>select(mode as SymmetryMode)}>{labels[i+2]}</button>{/each}
 </div>
 {#if value}
 <div class="coordinates">
  {#if value.mode!=='horizontal'}<label>X <input type="number" aria-label="X" min="0" max={width} step=".5" value={value.x2/2} disabled={busy} on:change={e=>coordinate('x2',e)}/></label>{/if}
  {#if value.mode!=='vertical'}<label>Y <input type="number" aria-label="Y" min="0" max={height} step=".5" value={value.y2/2} disabled={busy} on:change={e=>coordinate('y2',e)}/></label>{/if}
 </div>
 <button type="button" aria-pressed={picking} disabled={busy} on:click={onPick}>{picking?labels[6]:labels[5]}</button>
 <button type="button" disabled={busy} on:click={()=>value&&onChange({...value,x2:width,y2:height})}>{labels[7]}</button>
 <button type="button" disabled={busy||!count||!valid||picking} on:click={onMirror}>{labels[8]}</button>
 {#if count&&!valid}<small role="status">{labels[10]}</small>{/if}
 <small>{labels[9]}</small>
 {/if}
</section>
<style>
 .world-symmetry-controls{display:grid;gap:5px;padding:6px;color:var(--wand-text);background:var(--wand-card);font-size:12px}.symmetry-modes,.coordinates{display:flex;gap:4px;flex-wrap:wrap}.coordinates label{display:flex;align-items:center;gap:4px;flex:1}.coordinates input{width:70px;min-width:0;padding:4px;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:4px}button{padding:5px 8px;min-height:30px;background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:4px;cursor:pointer}button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover)}button:disabled{opacity:.45;cursor:default}small{color:var(--wand-muted);font-size:11px}
</style>
