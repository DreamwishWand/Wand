import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array<ArrayBuffer>|null=null,wasm:WasmAmountPreview|null=null;
 try{
  if(!(data.file instanceof Blob)||data.file.size<1||data.file.size>32*1024*1024)throw Error('Invalid local Save');
  bytes=new Uint8Array(await data.file.arrayBuffer());const format=detectLocalSaveFormat(bytes);
  await init(wasmUrl);wasm=new WasmAmountPreview(format);
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  scope.postMessage({kind:'area-flags',result:JSON.parse(wasm.list_saved_area_flags())});
 }catch{scope.postMessage({kind:'error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
