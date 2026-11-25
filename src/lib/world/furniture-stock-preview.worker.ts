import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
/** Local furniture stock rehearsal and explicit test-only copy output. */
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import {testSaveExportEnabled} from './test-save-export.ts';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null,copy:Uint8Array|null=null;
 try{
  const pickup=data?.command==='group-pickup-export',paste=data?.command==='group-paste-export',cut=data?.command==='group-cut-export';
  const exporting=data?.command==='furniture-stock-export'||pickup||paste||cut;
  if(exporting&&(!testSaveExportEnabled(self.location)||data.allowExperimentalCopy!==true))throw Error('test-only');
  if((!exporting&&data?.command!=='furniture-stock-preview')||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024||!data.plan||typeof data.plan!=='object')throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(detectLocalSaveFormat(bytes));
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  if(exporting){
   const length=cut?wasm.prepare_group_cut_experimental_copy(JSON.stringify(data.plan),true):pickup?wasm.prepare_group_pickup_experimental_copy(JSON.stringify(data.plan),true):paste?wasm.prepare_group_paste_experimental_copy(JSON.stringify(data.plan),true):wasm.prepare_furniture_stock_experimental_copy(JSON.stringify(data.plan),JSON.stringify(data.destination??null),true);
   if(!Number.isSafeInteger(length)||length<1||length>32*1024*1024)throw Error('copy size');
   copy=new Uint8Array(length);
   for(let i=0;i<length;i+=1048576){const n=Math.min(1048576,length-i),part=wasm.take_copy_chunk(n);if(part.byteLength!==n){part.fill(0);throw Error('copy chunk');}copy.set(part,i);part.fill(0);}
   scope.postMessage({kind:'furniture-stock-copy',replay:{command:data.command,plan:data.plan,...(data.command==='furniture-stock-export'?{destination:data.destination??null}:{})},bytes:copy,receipt:{contract:'wand.db05.experimental-copy@1',copyBytes:length,originalUnchanged:true,independentReopenVerified:true,experimentalCopyOnly:true,productionWriterAuthorized:false}},[copy.buffer]);copy=null;return;
  }
  const r=JSON.parse(wasm.preview_furniture_stock_structure(JSON.stringify(data.plan),JSON.stringify(data.destination??null)));
  if(r?.contract!=='wand.db05.furniture-stock-preview@1'||r.changed!==true||r.lexicalBytesPreserved!==true||r.structureValidated!==true||r.reopenVerified!==true||r.exportAuthorized!==false||r.runtimeReferencesVerified!==false||
   !Number.isSafeInteger(r.stockBefore)||!Number.isSafeInteger(r.stockAfter)||r.stockBefore<0||r.stockAfter<0||r.stockAfter-r.stockBefore!==(data.plan.action==='remove'?1:-1))throw Error('receipt');
  scope.postMessage({kind:'furniture-stock-preview',validated:true,stockBefore:r.stockBefore,stockAfter:r.stockAfter});
 }catch{scope.postMessage({kind:'furniture-stock-preview-error'});}
 finally{copy?.fill(0);bytes?.fill(0);wasm?.close();wasm?.free();}
};