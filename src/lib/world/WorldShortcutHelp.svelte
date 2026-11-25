<script lang="ts">
 import type {WandLanguage} from '../ui/preferences.ts';
 export let locale:WandLanguage='ja';
 export let designMode=false;
 let open=false;
 const translations={
 ja:['キーボードショートカット','閉じる','コピー','切り取り','貼り付け','複製','全選択','取り消し','やり直し','削除','移動（1マス）','回転','取消・選択解除','確定','拡大・縮小','全体表示','セーブ編集ではコピー・切り取り・貼り付け・複製・削除は未対応です。'],
 en:['Keyboard shortcuts','Close','Copy','Cut','Paste','Duplicate','Select all','Undo','Redo','Delete','Move one cell','Rotate','Cancel / deselect','Confirm','Zoom in / out','Fit map','Copy, cut, paste, duplicate and delete are not yet available in Save editing.'],
 fr:['Raccourcis clavier','Fermer','Copier','Couper','Coller','Dupliquer','Tout sélectionner','Annuler','Rétablir','Supprimer','Déplacer d’une case','Pivoter','Annuler / désélectionner','Confirmer','Zoom avant / arrière','Vue entière','Copier, couper, coller, dupliquer et supprimer ne sont pas encore disponibles dans les sauvegardes.'],
 it:['Scorciatoie da tastiera','Chiudi','Copia','Taglia','Incolla','Duplica','Seleziona tutto','Annulla','Ripristina','Elimina','Sposta di una casella','Ruota','Annulla / deseleziona','Conferma','Zoom avanti / indietro','Vista intera','Copia, taglia, incolla, duplica ed elimina non sono ancora disponibili nel salvataggio.'],
 de:['Tastenkürzel','Schließen','Kopieren','Ausschneiden','Einfügen','Duplizieren','Alles auswählen','Rückgängig','Wiederholen','Löschen','Eine Zelle verschieben','Drehen','Abbrechen / abwählen','Bestätigen','Vergrößern / verkleinern','Gesamtansicht','Kopieren, Ausschneiden, Einfügen, Duplizieren und Löschen sind für Spielstände noch nicht verfügbar.'],
 'es-ES':['Atajos de teclado','Cerrar','Copiar','Cortar','Pegar','Duplicar','Seleccionar todo','Deshacer','Rehacer','Eliminar','Mover una casilla','Girar','Cancelar / deseleccionar','Confirmar','Ampliar / reducir','Vista completa','Copiar, cortar, pegar, duplicar y eliminar aún no están disponibles en la edición de partidas.'],
 'zh-CN':['键盘快捷键','关闭','复制','剪切','粘贴','创建副本','全选','撤销','重做','删除','移动一格','旋转','取消／取消选择','确认','放大／缩小','全图','存档编辑暂不支持复制、剪切、粘贴、创建副本及删除。'],
 'pt-BR':['Atalhos de teclado','Fechar','Copiar','Recortar','Colar','Duplicar','Selecionar tudo','Desfazer','Refazer','Excluir','Mover uma célula','Girar','Cancelar / desmarcar','Confirmar','Ampliar / reduzir','Mapa inteiro','Copiar, recortar, colar, duplicar e excluir ainda não estão disponíveis na edição de salvamentos.']
 } as const;
 $: labels=translations[locale]??translations.en;
 const keys=['Ctrl / ⌘ + C','Ctrl / ⌘ + X','Ctrl / ⌘ + V','Ctrl / ⌘ + D','Ctrl / ⌘ + A','Ctrl / ⌘ + Z','Ctrl / ⌘ + Shift + Z · Ctrl + Y','Delete / Backspace','↑ ↓ ← →','R / Shift + R','Esc','Enter','+ / −','0'];
 const unavailable=new Set([0,1,2,3,7]);
 const navigationWords={ja:['対象を切り替える','対象を選択','パン'],en:['Cycle objects','Select object','Pan'],fr:['Parcourir les objets','Sélectionner','Déplacer la vue'],it:['Scorri gli oggetti','Seleziona oggetto','Sposta vista'],de:['Objekte durchgehen','Objekt auswählen','Ansicht verschieben'],'es-ES':['Recorrer objetos','Seleccionar objeto','Desplazar vista'],'zh-CN':['切换物品','选择物品','平移视图'],'pt-BR':['Percorrer objetos','Selecionar objeto','Mover vista']} as const;
 $: nw=navigationWords[locale]??navigationWords.en;
</script>
<div class="shortcut-help">
 <button class="trigger" type="button" aria-label={labels[0]} title={labels[0]} aria-expanded={open} on:click={()=>open=!open}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 15h10"/></svg>
 </button>
 {#if open}<section aria-label={labels[0]} class="shortcut-panel">
  <header><strong>{labels[0]}</strong><button type="button" aria-label={labels[1]} on:click={()=>open=false}>×</button></header>
  <dl>{#each keys as key,i}<div class:unavailable={!designMode&&unavailable.has(i)}><dt>{labels[i+2]}</dt><dd><kbd>{key}</kbd></dd></div>{/each}{#if designMode}<div><dt>{nw[0]}</dt><dd><kbd>[ / ]</kbd></dd></div><div><dt>{nw[1]}</dt><dd><kbd>Enter / Space</kbd></dd></div><div><dt>{nw[2]}</dt><dd><kbd>Space + Drag / Middle Drag</kbd></dd></div>{/if}</dl>
  {#if !designMode}<p>{labels[16]}</p>{/if}
 </section>{/if}
</div>
<style>
 .shortcut-help{position:absolute;z-index:15;right:6px;top:6px}
 button{display:grid;place-items:center;border:1px solid var(--wand-line);border-radius:6px;background:var(--wand-menu);color:var(--wand-text);cursor:pointer}
 .trigger{width:38px;height:38px}.trigger svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
 .shortcut-panel{position:absolute;right:0;top:44px;width:min(390px,calc(100vw - 12px));max-height:calc(100dvh - 155px);overflow:auto;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:7px;padding:10px;color:var(--wand-text);box-shadow:0 4px 20px #0004}
 header{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:14px}header button{width:30px;height:30px}
 dl{display:grid;gap:3px;margin:8px 0 0}dl div{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--wand-line)}dt,dd,p{font-size:12px;margin:0}dd{text-align:right}kbd{font-family:inherit;white-space:normal}.unavailable{opacity:.45}p{margin-top:8px;color:var(--wand-muted)}
</style>
