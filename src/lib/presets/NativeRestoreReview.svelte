<script lang="ts">
 import {verifyTomItemReferences} from '../items/tom-source.ts';
 import {openPublicItemMaster} from '../items/public-item-master.ts';
 import {base} from '$app/paths';
 import {testSaveExportEnabled,testSaveWords} from '../world/test-save-export.ts';
 import {experimentalCopyDownload} from '../world/experimental-copy.ts';
 import {onDestroy} from 'svelte';
 import type {WandLanguage} from '$lib/ui/preferences';
 import {nativeReviewWords} from './native-review-words.ts';
 import type {SessionPreset} from './preset-session-format.ts';
 export let entry:SessionPreset;
 export let source:File|null;
 export let locale:WandLanguage;
 type Receipt={contract:string;schemaMatches:boolean;targetReadable:boolean;matchingDesigns:number|null;existingDesignsForItem:number|null;allocatorConsistent:boolean|null;requiresNewId:boolean;writerAuthorized:false;activeSlots:number|null;legacySlotLimit:number|null;decorationTestCandidate:boolean;replacementSlots:{slot:number;name:string}[];positiveBaseStock:number|null;baseItemId:number|null;designCount:number|null;configuredDesignLimit:number|null;componentStock:{itemId:number;subtype:number;positiveStock:number|null}[];visualStructureVerified:boolean;tomTestCandidate:boolean;currentSlotLimitSourceVerified:boolean};
 let worker:Worker|null=null,result:Receipt|null=null,busy=false,error=false,rehearsed=false,rehearsalError=false;
 let convertWorker:Worker|null=null,geometryWorker:Worker|null=null,copyUrl:string|null=null,copyName='';
 $: testWords=testSaveWords[locale];
 const testEnabled=typeof window!=='undefined'&&testSaveExportEnabled(window.location);
 let replaceSlot=0,dbIdentity:boolean|null=null,dbEpoch=0;
 $: void checkBase(result);
 async function checkBase(receipt:Receipt|null){const token=++dbEpoch;dbIdentity=null;if(!receipt?.baseItemId||!receipt.requiresNewId)return;
  try{const db=await openPublicItemMaster(base,fetch,{scope:'complete',gameVersion:'1.26.2'});const kind=entry.kind;
   const valid=(kind==='tom-furniture'||kind==='tom-clothing')&&await verifyTomItemReferences(db,kind,receipt.baseItemId,receipt.componentStock);
   if(token===dbEpoch)dbIdentity=valid;}catch{if(token===dbEpoch)dbIdentity=null;}
 }
 let previousFile:File|null=null,previousEntry:SessionPreset|null=null;
 $: w=nativeReviewWords[locale];
 $: if(previousFile!==source||previousEntry!==entry){previousFile=source;previousEntry=entry;clear();}
 function clear(){replaceSlot=0;dbEpoch++;dbIdentity=null;worker?.terminate();convertWorker?.terminate();geometryWorker?.terminate();worker=convertWorker=geometryWorker=null;if(copyUrl)URL.revokeObjectURL(copyUrl);copyUrl=null;copyName='';result=null;busy=false;error=false;rehearsed=false;rehearsalError=false;}
 onDestroy(clear);

 function restoreDecoration(slot=0){
  if(!testEnabled||!source||busy||(!result||slot===0&&!result.decorationTestCandidate||slot!==0&&!result.replacementSlots.some(s=>s.slot===slot))||entry.kind!=='native-decoration'||!window.confirm((slot? w[19]+' '+(result?.replacementSlots.find(s=>s.slot===slot)?.name??'')+'\n':'')+testWords[1]))return;
  if(copyUrl)URL.revokeObjectURL(copyUrl);copyUrl=null;
  const save=source,backup=entry.file;busy=true;rehearsalError=false;
  const cv=new Worker(new URL('./native-scene.worker.ts',import.meta.url),{type:'module'});convertWorker=cv;
  const fail=()=>{if(source!==save||entry.file!==backup)return;convertWorker?.terminate();geometryWorker?.terminate();worker?.terminate();convertWorker=geometryWorker=worker=null;busy=false;rehearsalError=true;};
  cv.onerror=fail;cv.onmessageerror=fail;
  cv.onmessage=e=>{
   cv.terminate();if(convertWorker!==cv||source!==save||entry.file!==backup)return;convertWorker=null;
   if(e.data?.kind!=='native-scene'||typeof e.data.raw!=='string'){fail();return;}
   const raw=e.data.raw,g=new Worker(new URL('../world/public-world-terrain.worker.ts',import.meta.url),{type:'module'});geometryWorker=g;
   g.onerror=fail;g.onmessageerror=fail;
   g.onmessage=event=>{
    if(geometryWorker!==g||source!==save||entry.file!==backup)return;
    const v=event.data;if(v?.requestId===1&&v.kind==='index'){g.postMessage({command:'native-scene-geometry',requestId:2,raw});return;}
    if(v?.requestId!==2||v.kind!=='native-scene-geometry'||v.valid!==true){fail();return;}
    g.terminate();geometryWorker=null;
    const own=new Worker(new URL('./native-preset.worker.ts',import.meta.url),{type:'module'});worker=own;own.onerror=fail;own.onmessageerror=fail;
    own.onmessage=event=>{
     own.terminate();if(worker!==own||source!==save||entry.file!==backup){event.data?.bytes?.fill?.(0);return;}worker=null;busy=false;
     try{if(event.data?.kind!=='decoration-copy')throw Error('copy');const out=experimentalCopyDownload(event.data,save);copyUrl=out.url;copyName=out.name.replace('-world-test','-preset-test');}
     catch{rehearsalError=true;}
    };
    own.postMessage({command:slot?'decoration-replace':'decoration-export',slot,file:save,backup,allowExperimentalCopy:true});
   };
   g.postMessage({command:'open',requestId:1,base});
  };
  cv.postMessage({command:'convert',file:backup});
 }

 function restoreTom(){
  if(!testEnabled||!source||busy||!result?.tomTestCandidate||dbIdentity!==true||!window.confirm(testWords[1]))return;
  if(copyUrl)URL.revokeObjectURL(copyUrl);copyUrl=null;
  const save=source,backup=entry.file;busy=true;rehearsalError=false;
  const own=new Worker(new URL('./native-preset.worker.ts',import.meta.url),{type:'module'});worker=own;
  const finish=(v:any)=>{own.terminate();if(worker!==own||source!==save||entry.file!==backup){v?.bytes?.fill?.(0);return;}worker=null;busy=false;
   try{if(v?.kind!=='tom-copy')throw Error('copy');const out=experimentalCopyDownload(v,save);copyUrl=out.url;copyName=out.name.replace('-world-test','-tom-test');}catch{rehearsalError=true;}
  };own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);
  own.postMessage({command:'tom-export',file:save,backup,base,allowExperimentalCopy:true});
 }
 function rehearse(){
  if(!source||busy||!result?.schemaMatches||!result.targetReadable||result.allocatorConsistent!==true||result.matchingDesigns!==0||!result.requiresNewId)return;
  busy=true;rehearsed=false;rehearsalError=false;
  const own=new Worker(new URL('./native-preset.worker.ts',import.meta.url),{type:'module'});worker=own;
  const finish=(v:any)=>{own.terminate();if(worker!==own)return;worker=null;busy=false;
   if(v?.kind==='rehearse'&&v.result?.contract==='wand.native-preset-rehearsal@1'&&v.result.writerAuthorized===false&&v.result.reopenVerified===true&&v.result.freshAllocation===true)rehearsed=true;else rehearsalError=true;
  };own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);
  own.postMessage({command:'rehearse',file:source,backup:entry.file});
 }
 function review(){
  if(!source||busy||!entry.privateBackup)return;clear();busy=true;
  const own=new Worker(new URL('./native-preset.worker.ts',import.meta.url),{type:'module'});worker=own;
  const finish=(v:any)=>{own.terminate();if(worker!==own)return;worker=null;busy=false;
   if(v?.kind==='review'&&v.result?.contract==='wand.native-preset-restore-review@1'&&v.result.writerAuthorized===false)result=v.result;else error=true;
  };
  own.onmessage=e=>finish(e.data);own.onerror=()=>finish(null);own.onmessageerror=()=>finish(null);
  own.postMessage({command:'review',file:source,backup:entry.file});
 }
</script>
<div class="restore-review">
 <button type="button" disabled={!source||busy} on:click={review}>{w[0]}</button>
 {#if error}<small role="alert">{w[10]}</small>{/if}
 {#if result}<div class="review-result" role="status">
  <strong>{result.schemaMatches?w[1]:w[2]}</strong>
  {#if !result.targetReadable}<small>{w[3]}</small>{:else}
   {#if result.matchingDesigns!==null&&result.matchingDesigns>0}<small>{w[4]} ×{result.matchingDesigns}</small>{/if}
   <small>{w[5]}: {result.existingDesignsForItem??'—'}</small>
   {#if result.requiresNewId}<small>{dbIdentity===true?w[15]:w[16]}</small><small>{result.positiveBaseStock!==null?w[17]+': '+result.positiveBaseStock:w[18]}</small><small>{result.allocatorConsistent===true?w[6]:w[7]}</small>{/if}
  {/if}
  {#if result.requiresNewId&&result.schemaMatches&&result.targetReadable&&result.allocatorConsistent===true&&result.matchingDesigns===0}<button type="button" disabled={busy} on:click={rehearse}>{w[11]}</button>{/if}
  {#if result.requiresNewId&&result.configuredDesignLimit!==null}<small>{result.designCount} / {result.configuredDesignLimit} · {w[21]}</small>
   <small>{w[22]}: {result.componentStock.filter(v=>v.positiveStock!==null).length}/{result.componentStock.length}</small>
   {#if !result.visualStructureVerified}<small>{w[23]}</small>{/if}
  {/if}
  {#if testEnabled&&result.tomTestCandidate&&dbIdentity===true}<small>{testWords[1]}</small><button type="button" disabled={busy} on:click={restoreTom}>{testWords[0]}</button>{/if}
  {#if result.activeSlots!==null&&result.legacySlotLimit!==null}<small>{result.activeSlots} / {result.legacySlotLimit} ({result.currentSlotLimitSourceVerified?w[24]:w[14]})</small>{/if}
  {#if testEnabled&&result.decorationTestCandidate}<small>{testWords[1]}</small><button type="button" disabled={busy} on:click={()=>restoreDecoration()}>{testWords[0]}</button>{/if}
  {#if testEnabled&&result.replacementSlots.length}
    <label>{w[19]}<select bind:value={replaceSlot} disabled={busy}><option value={0}>—</option>{#each result.replacementSlots as target (target.slot)}<option value={target.slot}>{target.name} · {target.slot}</option>{/each}</select></label>
    <button type="button" disabled={busy||!replaceSlot} on:click={()=>restoreDecoration(replaceSlot)}>{w[20]}</button>
  {/if}
  {#if copyUrl}<a href={copyUrl} download={copyName}>{testWords[2]}</a>{/if}
  {#if rehearsed}<small role="status">{w[12]}</small>{/if}{#if rehearsalError}<small role="alert">{w[13]}</small>{/if}
  <small>{w[8]}</small><button type="button" on:click={clear}>{w[9]}</button>
 </div>{/if}
</div>
<style>.restore-review,.review-result{display:grid;gap:6px}button{font:inherit;color:inherit;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:7px}button:disabled{opacity:.5}</style>
