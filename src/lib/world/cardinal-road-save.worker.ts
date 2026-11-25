import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {testSaveExportEnabled} from './test-save-export.ts';
import {readExperimentalCopy} from './experimental-copy.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{
  if(!['cardinal-road-copy','cardinal-fence-copy','cardinal-fence-erase'].includes(data?.command)||data.allowExperimentalCopy!==true||!testSaveExportEnabled(self.location)||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024)throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(data.file.name.toLowerCase().endsWith('.json')?'json':'p1g');
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  const copy=readExperimentalCopy(data.command==='cardinal-fence-erase'?wasm.prepare_fence_erase_experimental_copy(JSON.stringify(data.plan),true):data.command==='cardinal-fence-copy'?wasm.prepare_isolated_fence_experimental_copy(JSON.stringify(data.plan),true):wasm.prepare_cardinal_road_experimental_copy(JSON.stringify(data.plan),true),n=>wasm!.take_copy_chunk(n));
  scope.postMessage({kind:'cardinal-road-copy',...copy},[copy.bytes.buffer]);
 }catch{scope.postMessage({kind:'cardinal-road-error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
