import {detectLocalSaveFormat} from '../save/save-diagnostics-worker-core.mjs';
/**
 * DB-04 one-shot, browser-local Save-coordinate comparison Worker.
 * Raw private Save bytes and decoded JSON never leave this isolated Worker.
 * Existing DB-05 Rust/WASM opens the Save, projects observed Grid objects,
 * and compares their original FULL Grid source-path candidate evidence.
 * No Save write method is ever called.
 */
import init,{WasmAmountPreview} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {
  validateSourceGridQuery,projectSavedSourceNumericCandidates,
} from './saved-grid-source-candidates.ts';

const MAX_INPUT=32*1024*1024,CHUNK=1024*1024;
const scope=self as unknown as {
  onmessage:((e:MessageEvent<unknown>)=>void)|null;
  postMessage:(data:unknown)=>void;
};
const record=(x:unknown):x is Record<string,unknown>=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);

scope.onmessage=async(event:MessageEvent<unknown>):Promise<void>=>{
  const message=event.data;
  const requestId=record(message)&&typeof message.requestId==='number'&&
    Number.isSafeInteger(message.requestId)&&message.requestId>0
    ?message.requestId:0;
  let bytes:Uint8Array|null=null,wasm:WasmAmountPreview|null=null;
  try{
    if(!record(message)||message.command!=='compare-source-grid'||
       requestId===0||!(message.file instanceof Blob)||
       !(message.file.size>0&&message.file.size<=MAX_INPUT)||
       typeof message.filename!=='string'||message.filename.length>200)
      throw new TypeError('DB04_SAVED_SOURCE_BAD_REQUEST');
    const query=validateSourceGridQuery(message.query);
    bytes=new Uint8Array(await message.file.arrayBuffer());
    const inputFormat=detectLocalSaveFormat(bytes);
    if(bytes.length!==message.file.size)
      throw new TypeError('DB04_SAVED_SOURCE_INCOMPLETE_FILE');
    await init(wasmUrl);
    wasm=new WasmAmountPreview(inputFormat);
    for(let start=0;start<bytes.length;start+=CHUNK)
      wasm.append_chunk(bytes.subarray(start,Math.min(bytes.length,start+CHUNK)));
    wasm.finish_open();
    // Only the selected original path-pair is sent to Rust, with all
    // distinct native IDs for that pair. A pair with >1 ID is ambiguous.
    const witness=JSON.stringify({
      contract:'wand.db05.db04-object-source-witness@1',
      gridRefs:query.sourceRefs,
    });
    const instances=JSON.parse(wasm.list_saved_grid_instances()) as unknown;
    const matched=JSON.parse(wasm.match_db04_grid_object_sources(witness)) as unknown;
    const receipt=projectSavedSourceNumericCandidates(query,instances,matched);
    scope.postMessage({kind:'saved-source-candidates',requestId,receipt});
  }catch{
    scope.postMessage({kind:'saved-source-candidates-error',requestId,
      message:'セーブの原本参照を照合できませんでした。'});
  }finally{
    bytes?.fill(0);
    wasm?.close();
    wasm?.free();
  }
};
