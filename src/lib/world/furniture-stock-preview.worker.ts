/** Local furniture and stock rehearsal: no raw Save or candidate bytes leave the Worker. */
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{
  if(data?.command!=='furniture-stock-preview'||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024||!data.plan||typeof data.plan!=='object')throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(data.file.name.toLowerCase().endsWith('.json')?'json':'p1g');
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();
  const r=JSON.parse(wasm.preview_furniture_stock_structure(JSON.stringify(data.plan),JSON.stringify(data.destination??null)));
  if(r?.contract!=='wand.db05.furniture-stock-preview@1'||r.changed!==true||r.lexicalBytesPreserved!==true||r.structureValidated!==true||r.reopenVerified!==true||r.exportAuthorized!==false||r.runtimeReferencesVerified!==false||
   !Number.isSafeInteger(r.stockBefore)||!Number.isSafeInteger(r.stockAfter)||r.stockBefore<0||r.stockAfter<0||r.stockAfter-r.stockBefore!==(data.plan.action==='remove'?1:-1))throw Error('receipt');
  scope.postMessage({kind:'furniture-stock-preview',validated:true,stockBefore:r.stockBefore,stockAfter:r.stockAfter});
 }catch{scope.postMessage({kind:'furniture-stock-preview-error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};