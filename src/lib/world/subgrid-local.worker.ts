import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
import {testSaveExportEnabled} from './test-save-export.ts';
import {readExperimentalCopy} from './experimental-copy.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{
  if(!['inspect-subgrid','support-parent-copy','support-child-copy'].includes(data?.command)||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024)throw Error('request');
  const exporting=data.command!=='inspect-subgrid';
  if(exporting&&(!testSaveExportEnabled(self.location)||data.allowExperimentalCopy!==true))throw Error('test-only');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(detectLocalSaveFormat(bytes));
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  if(exporting){
   const copy=readExperimentalCopy(data.command==='support-child-copy'?wasm.prepare_support_child_experimental_copy(JSON.stringify(data.plan),true):wasm.prepare_support_parent_experimental_copy(JSON.stringify(data.plan),true),n=>wasm!.take_copy_chunk(n));
   scope.postMessage({kind:data.command,...copy},[copy.bytes.buffer]);
  }else{
   const p=data.parent;
   if(!p||!Number.isSafeInteger(p.localOrdinal)||p.localOrdinal<1||p.localOrdinal>20000||!Number.isSafeInteger(p.itemId)||p.itemId<1||p.itemId>0xffffffff||![p.x,p.y].every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647))throw Error('parent');
   scope.postMessage({kind:'subgrid-local',result:JSON.parse(wasm.inspect_subgrid(p.localOrdinal,p.itemId,p.x,p.y))});
  }
 }catch{scope.postMessage({kind:'subgrid-error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
