import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {parseIndoorRooms,parseOwnedFinishes,verifyFinishReceipt} from './indoor-room-view.ts';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(v:unknown)=>void};
scope.onmessage=async({data})=>{
 let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
 try{if(!['indoor-rooms','room-finish-preview'].includes(data?.command)||!(data.file instanceof File)||data.file.size<1||data.file.size>32*1024*1024)throw Error('request');
  bytes=new Uint8Array(await data.file.arrayBuffer());await init(wasmUrl);
  wasm=new WasmAmountPreview(data.file.name.toLowerCase().endsWith('.json')?'json':'p1g');
  for(let i=0;i<bytes.length;i+=1048576)wasm.append_chunk(bytes.subarray(i,i+1048576));
  wasm.finish_open();if(data.command==='room-finish-preview'){const result=JSON.parse(wasm.preview_indoor_finish(JSON.stringify(data.plan)));if(!verifyFinishReceipt(result))throw Error('receipt');scope.postMessage({kind:'room-finish-preview',result});}else{const result=JSON.parse(wasm.list_indoor_rooms());parseIndoorRooms(result);parseOwnedFinishes(result);scope.postMessage({kind:'indoor-rooms',result});}
 }catch{scope.postMessage({kind:'indoor-rooms-error'});}
 finally{bytes?.fill(0);wasm?.close();wasm?.free();}
};
