<script lang="ts">
 import {MAP_ALIGNMENT,type MapAlignment} from './map-alignment.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let locale:WandLanguage='ja';
 export let count=0;
 export let selected:MapAlignment|null=null;
 export let valid=false;
 export let busy=false;
 export let onPick:(mode:MapAlignment)=>void;
 export let onCommit:()=>void;
 export let onCancel:()=>void;
 const words={
 ja:['整列・均等配置','左揃え','右揃え','上揃え','下揃え','水平中央揃え','垂直中央揃え','水平均等配置','垂直均等配置','確定','取消','整数マス・範囲・編集制限を確認してください。変更がない場合も確定できません。'],
 en:['Align and distribute','Align left','Align right','Align top','Align bottom','Align horizontal centers','Align vertical centers','Distribute horizontally','Distribute vertically','Confirm','Cancel','Check whole-cell positions, boundaries and edit restrictions. No change cannot be committed.'],
 fr:['Aligner et répartir','Aligner à gauche','Aligner à droite','Aligner en haut','Aligner en bas','Centrer horizontalement','Centrer verticalement','Répartir horizontalement','Répartir verticalement','Confirmer','Annuler','Vérifiez les cases entières, les limites et les restrictions. Aucun changement ne peut être validé.'],
 it:['Allinea e distribuisci','Allinea a sinistra','Allinea a destra','Allinea in alto','Allinea in basso','Centra orizzontalmente','Centra verticalmente','Distribuisci in orizzontale','Distribuisci in verticale','Conferma','Annulla','Verifica celle intere, limiti e restrizioni. Nessuna modifica da confermare.'],
 de:['Ausrichten und verteilen','Linksbündig','Rechtsbündig','Oben ausrichten','Unten ausrichten','Horizontal zentrieren','Vertikal zentrieren','Horizontal verteilen','Vertikal verteilen','Bestätigen','Abbrechen','Ganze Zellen, Grenzen und Bearbeitungsregeln prüfen. Keine Änderung zum Bestätigen.'],
 'es-ES':['Alinear y distribuir','Alinear a la izquierda','Alinear a la derecha','Alinear arriba','Alinear abajo','Centrar horizontalmente','Centrar verticalmente','Distribuir horizontalmente','Distribuir verticalmente','Confirmar','Cancelar','Comprueba las celdas enteras, límites y restricciones. No hay cambios que confirmar.'],
 'zh-CN':['对齐和分布','左对齐','右对齐','顶部对齐','底部对齐','水平居中','垂直居中','水平等距分布','垂直等距分布','确认','取消','请检查整数格、边界和编辑限制。没有变化时无法确认。'],
 'pt-BR':['Alinhar e distribuir','Alinhar à esquerda','Alinhar à direita','Alinhar acima','Alinhar abaixo','Centralizar horizontalmente','Centralizar verticalmente','Distribuir horizontalmente','Distribuir verticalmente','Confirmar','Cancelar','Verifique células inteiras, limites e restrições. Não há alterações para confirmar.']
 } as const;
 $: labels=words[locale]??words.en;
 const icons=['M4 3v18M7 5h8v5H7zM7 14h13v5H7z','M20 3v18M9 5h8v5H9zM4 14h13v5H4z','M3 4h18M5 7h5v8H5zM14 7h5v13h-5z','M3 20h18M5 9h5v8H5zM14 4h5v13h-5z','M12 3v18M8 5h8v5H8zM5 14h14v5H5z','M3 12h18M5 8h5v8H5zM14 5h5v14h-5z','M3 4v16M21 4v16M5 7h3v10H5zM11 5h3v14h-3zM17 7h2v10h-2z','M4 3h16M4 21h16M7 5h10v3H7zM5 11h14v3H5zM7 17h10v2H7z'];
</script>
<div class="alignment-tools" role="group" aria-label={labels[0]}>
 <div class="alignment-icons">
  {#each MAP_ALIGNMENT as mode,i}
   <button type="button" title={labels[i+1]} aria-label={labels[i+1]} aria-pressed={selected===mode} disabled={busy||count<(i>=6?3:2)} on:click={()=>onPick(mode)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[i]}/></svg></button>
  {/each}
 </div>
 {#if selected}<div class="alignment-confirm">
  <button type="button" disabled={busy||!valid} on:click={onCommit}>{labels[9]}</button>
  <button type="button" on:click={onCancel}>{labels[10]}</button>
 </div>{#if !valid}<small role="status">{labels[11]}</small>{/if}{/if}
</div>
<style>
 .alignment-tools{display:grid;gap:4px;min-width:0}.alignment-icons,.alignment-confirm{display:flex;align-items:center;flex-wrap:wrap;gap:3px}.alignment-icons button{width:34px;height:34px;padding:4px;display:grid;place-items:center}.alignment-confirm button{min-height:32px;padding:4px 12px}
 button{color:var(--wand-text);background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;cursor:pointer}button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover)}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:2px solid var(--wand-focus)}svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round}small{font-size:11px;color:var(--wand-muted)}
</style>
