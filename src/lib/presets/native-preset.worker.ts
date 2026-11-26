import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{
  if(!['index','backup'].includes(data?.command)||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024)throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(detectLocalSaveFormat(bytes));
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  if(data.command==='index')scope.postMessage({kind:'index',result:JSON.parse(wasm.list_native_presets())});
  else{if(!Number.isSafeInteger(data.ordinal)||data.ordinal<1)throw Error('ordinal');scope.postMessage({kind:'backup',raw:wasm.export_native_preset_backup(data.ordinal)});}
 }catch{scope.postMessage({kind:'error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
