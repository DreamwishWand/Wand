import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {testSaveExportEnabled} from './test-save-export.ts';
import {readExperimentalCopy} from './experimental-copy.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{
  const restore=data?.command==='restore';
  if(!['backup','restore'].includes(data?.command)||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024||restore&&(!testSaveExportEnabled(self.location)||data.allowExperimentalCopy!==true||!(data.backup instanceof File)||data.backup.size<1||data.backup.size>4*1024*1024))throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);wasm=new WasmAmountPreview(detectLocalSaveFormat(bytes));
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  if(restore){
   const raw=await data.backup.text(),target=typeof data.scope==='string'?data.scope:'null';
   const copy=readExperimentalCopy(data.restorePose===true?wasm.prepare_private_storage_pose_copy(raw,target,true):wasm.prepare_private_storage_contents_copy(raw,target,true),n=>wasm!.take_copy_chunk(n));
   scope.postMessage({kind:'restored',...copy},[copy.bytes.buffer]);
  }else{
   const raw=wasm.export_private_storage_contents(typeof data.scope==='string'?data.scope:'null'),doc=JSON.parse(raw);
   if(doc.schema!=='wand.private.storage-contents@2'||!Array.isArray(doc.rows)||!Number.isSafeInteger(doc.skipped))throw Error('backup');
   scope.postMessage({kind:'backup',raw,count:doc.rows.length,skipped:doc.skipped});
  }
 }catch{scope.postMessage({kind:'error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
