import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
/** Private local-only structural rehearsal. Only a boolean receipt leaves WASM. */
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import {testSaveExportEnabled} from './test-save-export.ts';
import {readExperimentalCopy} from './experimental-copy.ts';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{
  const exporting=data?.command==='transfer-export',transfer=exporting||data?.command==='transfer-preview';
  if(exporting&&(!testSaveExportEnabled(self.location)||data.allowExperimentalCopy!==true))throw Error('test-only');
  if(!transfer&&data?.command!=='structure-preview'||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024||
    !data.plan||typeof data.plan!=='object')throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());
  await init(wasmUrl);
  wasm=new WasmAmountPreview(detectLocalSaveFormat(bytes));
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  if(exporting){const copy=readExperimentalCopy(wasm.prepare_grid_transfer_experimental_copy(JSON.stringify(data.plan),true),n=>wasm!.take_copy_chunk(n));scope.postMessage({kind:'transfer-copy',...copy},[copy.bytes.buffer]);return;}
  const r=JSON.parse(transfer?wasm.preview_plain_grid_transfer(JSON.stringify(data.plan)):wasm.preview_plain_grid_structure(JSON.stringify(data.plan)));
  if(r?.contract!==(transfer?'wand.db05.grid-transfer-preview@1':'wand.db05.grid-structure-preview@1')||r.changed!==true||r.lexicalBytesPreserved!==true||
     r.structureValidated!==true||r.exportAuthorized!==false||r.runtimeReferencesVerified!==false)throw Error('receipt');
  scope.postMessage({kind:transfer?'transfer-preview':'structure-preview',validated:true});
 }catch(e){const code=e instanceof Error?e.message:typeof e==='string'?e:'';scope.postMessage({kind:'structure-preview-error',dependencyBlocked:code.includes('DEPENDENCY_BLOCKED')});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
