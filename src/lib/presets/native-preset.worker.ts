import {testSaveExportEnabled} from '../world/test-save-export.ts';
import {verifyTomItemReferences} from '../items/tom-source.ts';
import {openPublicItemMaster} from '../items/public-item-master.ts';
import {readExperimentalCopy} from '../world/experimental-copy.ts';
import {readPresetText} from './preset-file.ts';
import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{
  if(!['index','backup','review','rehearse','decoration-export','decoration-replace','tom-export'].includes(data?.command)||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024)throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(detectLocalSaveFormat(bytes));
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  if(data.command==='tom-export'){
   if(!testSaveExportEnabled(self.location)||data.allowExperimentalCopy!==true||!(data.backup instanceof File)||typeof data.base!=='string'||!/^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(data.base))throw Error('test-only');
   const raw=await readPresetText(data.backup),review=JSON.parse(wasm.review_native_preset_restore(raw));
   if(review.tomTestCandidate!==true||!Number.isSafeInteger(review.baseItemId)||!Array.isArray(review.componentStock))throw Error('candidate');
   const db=await openPublicItemMaster(data.base,fetch,{scope:'complete',gameVersion:'1.26.2'});
   if(!['tom-furniture','tom-clothing'].includes(review.kind)||!await verifyTomItemReferences(db,review.kind,review.baseItemId,review.componentStock))throw Error('item identity or customization eligibility');
   const copy=readExperimentalCopy(wasm.prepare_tom_restore_experimental_copy(raw,true),n=>wasm!.take_copy_chunk(n));
   scope.postMessage({kind:'tom-copy',...copy},[copy.bytes.buffer]);return;
  }
  if(data.command==='decoration-export'||data.command==='decoration-replace'){
   if(!testSaveExportEnabled(self.location)||data.allowExperimentalCopy!==true||!(data.backup instanceof File))throw Error('test-only');
   const raw=await readPresetText(data.backup);
   if(data.command==='decoration-replace'&&(!Number.isSafeInteger(data.slot)||data.slot<1||data.slot>4096))throw Error('slot');
   const length=data.command==='decoration-replace'?wasm.prepare_native_decoration_replace_experimental_copy(raw,data.slot,true):wasm.prepare_native_decoration_experimental_copy(raw,true);
   const copy=readExperimentalCopy(length,n=>wasm!.take_copy_chunk(n));
   scope.postMessage({kind:'decoration-copy',...copy},[copy.bytes.buffer]);return;
  }
  if(data.command==='index')scope.postMessage({kind:'index',result:JSON.parse(wasm.list_native_presets())});
  else if(data.command==='review'||data.command==='rehearse'){if(!(data.backup instanceof File))throw Error('backup');const raw=await readPresetText(data.backup);scope.postMessage({kind:data.command,result:JSON.parse(data.command==='review'?wasm.review_native_preset_restore(raw):wasm.rehearse_tom_restore(raw))});}
  else{if(!Number.isSafeInteger(data.ordinal)||data.ordinal<1)throw Error('ordinal');scope.postMessage({kind:'backup',raw:wasm.export_native_preset_backup(data.ordinal)});}
 }catch{scope.postMessage({kind:'error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
