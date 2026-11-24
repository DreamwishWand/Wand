<script lang="ts">
 import type {WandLanguage} from '../ui/preferences.ts';
 import type {DesignCatalogItem} from './design-layout.ts';
 export let locale:WandLanguage='ja';
 export let count=0;
 export let options:readonly DesignCatalogItem[]=[];
 export let value=0;
 export let loading=false;
 export let valid=false;
 export let onChange:(id:number)=>void;
 export let onConfirm:()=>void;
 export let onCancel:()=>void;
 const copy={
 ja:['スタイル置換','変更先','選択してください','確定','取消','接続範囲の数量','読み込み中…','形状または接続条件が一致しません。'],
 en:['Replace style','New style','Choose a style','Confirm','Cancel','Connected units','Loading…','Shape or connection conditions do not match.'],
 fr:['Remplacer le style','Nouveau style','Choisir un style','Confirmer','Annuler','Unités connectées','Chargement…','La forme ou les connexions ne correspondent pas.'],
 it:['Sostituisci stile','Nuovo stile','Scegli uno stile','Conferma','Annulla','Unità connesse','Caricamento…','Forma o connessioni non compatibili.'],
 de:['Stil ersetzen','Neuer Stil','Stil auswählen','Bestätigen','Abbrechen','Verbundene Einheiten','Wird geladen…','Form oder Verbindung nicht kompatibel.'],
 'es-ES':['Cambiar estilo','Nuevo estilo','Elige un estilo','Confirmar','Cancelar','Unidades conectadas','Cargando…','La forma o las conexiones no coinciden.'],
 'zh-CN':['替换样式','新样式','请选择样式','确认','取消','连接单位','加载中…','形状或连接条件不匹配。'],
 'pt-BR':['Substituir estilo','Novo estilo','Escolha um estilo','Confirmar','Cancelar','Unidades conectadas','Carregando…','Forma ou conexões incompatíveis.']
 } as const;
 $: labels=copy[locale]??copy.en;
</script>
<section class="network-style-controls" aria-label={labels[0]}>
 <strong>{labels[0]}</strong><small>{labels[5]}: {count}</small>
 <label>{labels[1]}<select aria-label={labels[1]} value={value} on:change={e=>onChange(Number(e.currentTarget.value))}>
  <option value={0}>{labels[2]}</option>{#each options as item (item.itemId)}<option value={item.itemId}>{item.name}</option>{/each}
 </select></label>
 {#if loading}<small role="status">{labels[6]}</small>{:else if value&&!valid}<small role="status">{labels[7]}</small>{/if}
 <div class="actions"><button type="button" disabled={!valid||loading} on:click={onConfirm}>{labels[3]}</button><button type="button" on:click={onCancel}>{labels[4]}</button></div>
</section>
<style>
 .network-style-controls{display:grid;gap:5px;padding:7px;background:var(--wand-card);color:var(--wand-text);font-size:12px}.network-style-controls label{display:grid;gap:3px}.network-style-controls select{width:100%;min-height:32px}.actions{display:flex;gap:4px}button,select{background:var(--wand-menu);color:inherit;border:1px solid var(--wand-line);border-radius:4px;padding:5px 8px}button:disabled{opacity:.4}small{color:var(--wand-muted)}
</style>
