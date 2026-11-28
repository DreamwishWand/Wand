<script lang="ts">
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {testSaveExportEnabled} from './test-save-export.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File,locale:WandLanguage='ja',blocked=false,scopeJson='null';
 const words={
 ja:['収納内容バックアップ','保存','復元','復元済みセーブをダウンロード','処理中…','対象なし・復元先不一致・未対応状態・変更なし','既存収納の内容のみ。共有プリセットには登録しません。','対象','対象外'],
 en:['Storage contents backup','Back up','Restore','Download restored Save','Working…','No eligible contents, incompatible target, unsupported state or no change','Existing storage contents only. Not added to shared presets.','Included','Excluded'],
 fr:['Sauvegarde des rangements','Sauvegarder','Restaurer','Télécharger la sauvegarde restaurée','Traitement…','Aucun contenu compatible ou aucune modification','Contenu des rangements existants uniquement. Aucun partage.','Inclus','Exclus'],
 it:['Backup dei contenitori','Salva','Ripristina','Scarica il salvataggio ripristinato','Elaborazione…','Nessun contenuto compatibile o modifica','Solo contenuti dei contenitori esistenti. Nessuna condivisione.','Inclusi','Esclusi'],
 de:['Lagerinhalt sichern','Sichern','Wiederherstellen','Wiederhergestellten Spielstand laden','Verarbeitung…','Kein kompatibler Inhalt oder keine Änderung','Nur bestehende Lagerinhalte. Keine Freigabe.','Enthalten','Ausgeschlossen'],
 'es-ES':['Copia del almacenamiento','Guardar','Restaurar','Descargar partida restaurada','Procesando…','Sin contenido compatible o cambios','Solo contenido de almacenamiento existente. No se comparte.','Incluidos','Excluidos'],
 'zh-CN':['储物内容备份','备份','恢复','下载恢复后的存档','处理中…','无兼容内容或无更改','仅限现有储物内容，不加入共享预设。','已包含','已排除'],
 'pt-BR':['Backup de armazenamento','Salvar','Restaurar','Baixar jogo restaurado','Processando…','Sem conteúdo compatível ou alterações','Somente conteúdo existente. Sem compartilhamento.','Incluídos','Excluídos']
 } as const;
 const poseWords={
 ja:['位置・向きも復元','別のエリアに移動した収納も元の配置へ戻します。現在の家具と重なる場合があります。'],
 en:['Also restore position and rotation','Returns storage from other areas to its saved position; it may overlap current furniture.'],
 fr:['Restaurer aussi position et orientation','Le rangement revient à sa position enregistrée, même depuis une autre zone, avec chevauchement possible.'],
 it:['Ripristina anche posizione e rotazione','Il contenitore torna alla posizione salvata anche da un\'altra area, con possibili sovrapposizioni.'],
 de:['Auch Position und Drehung wiederherstellen','Rückkehr zur gespeicherten Position auch aus anderen Gebieten; Überschneidungen sind möglich.'],
 'es-ES':['Restaurar también posición y giro','Vuelve a su posición guardada incluso desde otra zona; puede solaparse con muebles actuales.'],
 'zh-CN':['同时恢复位置和朝向','将其他区域的储物家具移回保存的位置，可能与当前家具重叠。'],
 'pt-BR':['Restaurar também posição e rotação','Retorna à posição salva mesmo de outra área; pode sobrepor móveis atuais.']
 } as const;
 function poseScope(raw:string){try{return ['outdoor','room','floor','building'].includes(JSON.parse(raw)?.kind);}catch{return false;}}
 let restorePose=false;
 $: canRestorePose=poseScope(scopeJson);
 const allowed=browser&&testSaveExportEnabled(window.location);
 let own:Worker|null=null,seen:File|null=null,input:HTMLInputElement,copy:ReturnType<typeof experimentalCopyDownload>|null=null,report='',error=false;
 $: w=words[locale];
 let seenScope='';
 $: if(seen!==file||seenScope!==scopeJson||blocked){clear();restorePose=false;seen=file;seenScope=scopeJson;}
 function clear(){own?.terminate();own=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;error=false;report='';}
 function run(backup?:File){
  if(own||blocked||backup&&!allowed)return;clear();const source=file,selectedScope=scopeJson,worker=new Worker(new URL('./private-storage-backup.worker.ts',import.meta.url),{type:'module'});own=worker;
  const done=(d:any)=>{worker.terminate();if(own!==worker||file!==source||scopeJson!==selectedScope||blocked){d?.bytes?.fill(0);return;}own=null;try{
   if(d?.kind==='restored'&&backup){copy=experimentalCopyDownload(d,source);return;}
   if(d?.kind!=='backup'||backup||typeof d.raw!=='string'||!Number.isSafeInteger(d.count)||!Number.isSafeInteger(d.skipped))throw Error('backup');
   report=w[7]+': '+d.count+' · '+w[8]+': '+d.skipped;if(!d.count){error=true;return;}
   const url=URL.createObjectURL(new Blob([d.raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wand-private-storage-contents.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{error=true;}};
  worker.onmessage=e=>done(e.data);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);
  worker.postMessage({command:backup?'restore':'backup',file:source,scope:selectedScope,...(backup?{backup,allowExperimentalCopy:true,restorePose:canRestorePose&&restorePose}:{})});
 }
 function apply(){if(!allowed||blocked||!copy||!commitWorldCheckpoint(file,copy.file)){error=true;return;}clear();}
 function open(e:Event){const el=e.currentTarget as HTMLInputElement,f=el.files?.[0];el.value='';if(f)run(f);}
 onDestroy(clear);
</script>
<details class="private-storage">
 <summary>{w[0]}</summary>
 <small>{w[6]}</small>
 {#if allowed&&canRestorePose}<label><input type="checkbox" bind:checked={restorePose} disabled={blocked||!!own||!!copy}/>{poseWords[locale][0]}</label>{#if restorePose}<small>{poseWords[locale][1]}</small>{/if}{/if}
 <div><button type="button" disabled={blocked||!!own} on:click={()=>run()}>{w[1]}</button>
 {#if allowed}<input hidden type="file" accept=".json,application/json" bind:this={input} on:change={open}/><button type="button" disabled={blocked||!!own} on:click={()=>input.click()}>{w[2]}</button>{/if}</div>
 {#if own}<small role="status">{w[4]}</small>{/if}
 {#if report}<small role="status">{report}</small>{/if}
 {#if error}<small role="alert">{w[5]}</small>{/if}
 {#if copy&&!blocked}<button type="button" on:click={apply}>{checkpointWords[locale][0]}</button><a href={copy.url} download={copy.name}>{w[3]}</a>{/if}
</details>
<style>
 .private-storage{font-size:12px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:5px;max-width:280px}.private-storage summary{cursor:pointer}.private-storage div{display:flex;gap:5px;margin-top:5px}.private-storage small,.private-storage a{display:block;margin-top:4px}.private-storage button{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:4px}
</style>
