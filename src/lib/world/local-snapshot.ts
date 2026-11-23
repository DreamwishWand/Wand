/**
 * DB-04 browser-local World snapshot loader.
 * Binary ZIP parsing, raw deflate and SHA-256 verification execute in Rust/WASM
 * inside the TypeScript World Worker. Legacy catalog construction is a
 * separate migration debt; this module never uploads the source or writes Saves.
 */
import init,{WasmWorldZipReader} from './wasm/pkg/wand_world_core.js';
import wasmUrl from './wasm/pkg/wand_world_core_bg.wasm?url';
import {createWorldCatalog,WORLD_SCHEMA} from './catalog.mjs';

const MAX_ZIP_BYTES=96*1024*1024;
const CHUNK_BYTES=1024*1024;
let initializing:Promise<unknown>|null=null;
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);

export async function openLocalWorldZip(blob:Blob){
  if(!(blob instanceof Blob)||blob.size<22||blob.size>MAX_ZIP_BYTES)
    throw new TypeError('DB04_LOCAL_WORLD_ZIP: invalid local ZIP file');
  if(!initializing){
    initializing=init(wasmUrl).catch(error=>{
      initializing=null;
      throw error;
    });
  }
  await initializing;
  const reader=new WasmWorldZipReader();
  let sourceText='';
  try{
    for(let start=0;start<blob.size;start+=CHUNK_BYTES){
      const chunk=new Uint8Array(
        await blob.slice(start,Math.min(start+CHUNK_BYTES,blob.size)).arrayBuffer());
      reader.append_chunk(chunk);
      chunk.fill(0);
    }
    sourceText=reader.finish_json();
  }finally{
    reader.clear();
    reader.free();
  }
  const parsed:unknown=JSON.parse(sourceText);
  if(!obj(parsed)||!obj(parsed.manifest)||
    parsed.manifest.schema!==WORLD_SCHEMA||
    parsed.manifest.status!=='partial_game_native_evidence'||
    !Number.isSafeInteger(parsed.manifestFilesVerified))
    throw new TypeError('DB04_LOCAL_WORLD_ZIP: verified reader returned invalid data');
  const manifest=parsed.manifest;
  const catalog=createWorldCatalog({
    manifest,
    objects:parsed.objects,
    scenes:parsed.scenes,
    grids:parsed.grids,
    layouts:parsed.layouts,
    worlds:parsed.worlds,
    areas:parsed.areas,
    layoutObjects:parsed.layoutObjects
  });
  return {
    catalog,
    gameVersion:manifest.gameVersion as string,
    platform:typeof manifest.platform==='string'?manifest.platform:'unknown',
    sourceScopeVerified:manifest.sourceScopeVerified===true,
    manifestFilesVerified:parsed.manifestFilesVerified as number,
    integrity:'manifest_sha256_self_consistent_not_original_source_authenticated',
    originalSourceAuthenticated:false,
    privateDataUploaded:false
  };
}
