<script lang="ts">
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {testSaveExportEnabled} from './test-save-export.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {rememberReplayStep} from './checkpoint-journal.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session';
 import {currentWorldEdits,type WorldEditTimeline} from './saved-map-batch.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 export let file:File;
 export let timeline:WorldEditTimeline;
 export let locale:WandLanguage='ja';
 let open=false,busy=false,checked='',url='',name='',error=false,worker:Worker|null=null,epoch=0,copyFile:File|null=null;
 const testExport=browser&&testSaveExportEnabled(window.location);
 $: cw=checkpointWords[locale];
 function applyCopy(){if(!testExport||busy||!copyFile||checked!==signature)return;if(!commitWorldCheckpoint(file,copyFile)){error=true;return;}reset();open=false;}
 const words={ja:['変更の出力','一括変更を検証','編集コピーを作成','編集済みコピーを保存','原本は変更しません。ゲーム内の配置可否は未確認です。','変更を検証できませんでした。','閉じる'],en:['Export changes','Validate batch','Create edited copy','Save edited copy','Original unchanged. In-game placement legality is unverified.','Unable to validate changes.','Close'],fr:['Exporter','Vérifier','Créer une copie','Enregistrer la copie','Original inchangé. Placement en jeu non vérifié.','Vérification impossible.','Fermer'],it:['Esporta','Verifica','Crea copia','Salva copia','Originale invariato. Posizionamento non verificato.','Verifica non riuscita.','Chiudi'],de:['Exportieren','Prüfen','Kopie erstellen','Kopie speichern','Original unverändert. Platzierung im Spiel ungeprüft.','Prüfung fehlgeschlagen.','Schließen'],'es-ES':['Exportar','Verificar','Crear copia','Guardar copia','Original intacto. Colocación no verificada.','No se pudo verificar.','Cerrar'],'zh-CN':['导出更改','验证更改','创建副本','保存编辑副本','原始存档不变，游戏内放置规则尚未验证。','无法验证更改。','关闭'],'pt-BR':['Exportar','Verificar','Criar cópia','Salvar cópia','Original intacto. Posicionamento não verificado.','Falha na verificação.','Fechar']} as const;
 $: w=words[locale]??words.en;
 $: edits=currentWorldEdits(timeline);
 $: plans=edits.map(e=>e.plan);
 $: signature=JSON.stringify(plans);
 let seenFile:File|null=null,seenSignature='';
 $: if(file!==seenFile||signature!==seenSignature){seenFile=file;seenSignature=signature;reset();}
 function reset(){epoch++;worker?.terminate();worker=null;busy=false;checked='';error=false;if(url)URL.revokeObjectURL(url);url='';copyFile=null;}
 onDestroy(reset);
 async function run(exporting:boolean){
  const source=file,requestSignature=signature,requestPlans=plans;
  if(busy||!requestPlans.length||source.size<1||source.size>32*1024*1024||exporting&&checked!==requestSignature)return;
  const id=++epoch;busy=true;error=false;if(url)URL.revokeObjectURL(url);url='';copyFile=null;
  let bytes:Uint8Array|null=null;
  try{
   bytes=new Uint8Array(await source.arrayBuffer());if(id!==epoch)return;
   const own=new Worker(new URL('../save/save-amount-preview.worker.ts',import.meta.url),{type:'module'});worker=own;
   const finish=(v:{kind?:string;bytes?:Uint8Array;receipt?:Record<string,unknown>})=>{
    own.terminate();if(id!==epoch||source!==file||signature!==requestSignature){v.bytes?.fill(0);return;}
    worker=null;busy=false;const receipt=v.receipt;
    if(!exporting&&v.kind==='result'&&receipt?.contract==='wand.db05.grid-mixed-batch-preview@1'&&receipt.changedCount===requestPlans.length&&receipt.lexicalBytesPreserved===true&&receipt.reopenVerified===true&&receipt.exportAuthorized===false){checked=requestSignature;return;}
    if(exporting&&v.kind==='copy'&&v.bytes instanceof Uint8Array&&v.bytes.byteLength>0&&v.bytes.byteLength<=32*1024*1024&&receipt?.contract==='wand.db05.experimental-copy@1'&&receipt.copyBytes===v.bytes.byteLength&&receipt.originalUnchanged===true&&receipt.independentReopenVerified===true&&receipt.experimentalCopyOnly===true&&receipt.productionWriterAuthorized===false){
     try{copyFile=new File([v.bytes.slice().buffer as ArrayBuffer],source.name,{type:source.type||'application/octet-stream'});rememberReplayStep(copyFile,'export-grid-mixed-batch-copy',requestPlans);url=URL.createObjectURL(copyFile);const dot=source.name.lastIndexOf('.');name=dot>0?source.name.slice(0,dot)+'-world-edited'+source.name.slice(dot):source.name+'-world-edited';}catch{error=true;}finally{v.bytes.fill(0);}return;
    }
    v.bytes?.fill(0);checked='';error=true;
   };
   own.onmessage=e=>finish(e.data);own.onerror=e=>{e.preventDefault();finish({kind:'error'});};own.onmessageerror=()=>finish({kind:'error'});
   const request={command:exporting?'export-grid-mixed-batch-copy':'preview-grid-mixed-batch',format:source.name.toLowerCase().endsWith('.json')?'json':'auto',bytes,edits:requestPlans};
   own.postMessage(exporting?{...request,allowExperimentalCopy:true}:request,[bytes.buffer]);bytes=null;
  }catch{if(id===epoch){worker?.terminate();worker=null;busy=false;checked='';error=true;}}
  finally{bytes?.fill(0);}
 }
</script>
<button class="export-trigger" type="button" aria-expanded={open} on:click={()=>open=!open}>{w[0]} · {edits.length}</button>
{#if open}<section class="export-panel" aria-label={w[0]}>
 <header><strong>{w[0]}</strong><button type="button" aria-label={w[6]} on:click={()=>open=false}>×</button></header>
 <div class="review">{#each edits as e (e.plan.localOrdinal)}<div><span>{e.name}</span>{#if e.warning}<small>{e.warning}</small>{/if}</div>{/each}</div>
 <small>{w[4]}</small>
 <button type="button" disabled={busy||!plans.length} on:click={()=>run(false)}>{w[1]}</button>
 {#if checked===signature}<button type="button" disabled={busy} on:click={()=>run(true)}>{w[2]}</button>{/if}
 {#if url}{#if testExport}<button type="button" on:click={applyCopy}>{cw[0]}</button>{/if}<a href={url} download={name}>{w[3]}</a>{/if}
 {#if error}<small role="alert">{w[5]}</small>{/if}
</section>{/if}
<style>
 button,a{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:5px;padding:6px 9px;cursor:pointer;text-align:center}button:disabled{opacity:.45}.export-trigger{background:var(--wand-card);font-size:13px}.export-panel{position:absolute;bottom:38px;right:0;width:min(300px,80vw);max-height:60vh;overflow:auto;display:grid;gap:6px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px;padding:8px}header{display:flex;justify-content:space-between;align-items:center;gap:6px}.review{display:grid;gap:4px;max-height:25vh;overflow:auto}.review div{display:grid;gap:3px;border-bottom:1px solid var(--wand-line);padding:4px;font-size:12px}small{font-size:11px;color:var(--wand-muted)}a{color:var(--wand-accent)}
</style>
