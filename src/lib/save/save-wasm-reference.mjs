/**
 * DB-05 worker-only Rust/WASM reference parity.
 * Must be called only with JSON already verified by the strict local P1G/JSON
 * decoder. Rust serde_json is not the Codec, Writer or a byte-roundtrip proof.
 *
 * The report retains only fixed counts and booleans; no input values, IDs,
 * map keys, user names, original text or Rust report are returned.
 */
import init, {probe_save_references_json} from './wasm/pkg/ddv_save_schema.js';
import wasmUrl from './wasm/pkg/ddv_save_schema_bg.wasm?url';
import {probeSaveReferences} from './references.mjs';

export const SAVE_WASM_REFERENCE_PARITY_CONTRACT='wand.db05.wasm-reference-parity@1';
const MAX_WASM_TEXT_CHARS=24*1024*1024;
let initializing=null;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

function jsonSame(a,b){
  if(Object.is(a,b))return true;
  if(Array.isArray(a)||Array.isArray(b))
    return Array.isArray(a)&&Array.isArray(b)&&
      a.length===b.length&&a.every((x,i)=>jsonSame(x,b[i]));
  if(!obj(a)||!obj(b))return false;
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.length===bk.length &&
    ak.every((k,i)=>k===bk[i]&&jsonSame(a[k],b[k]));
}
function status(name,executed,matched,ruleCount){
  return Object.freeze({
    contract:SAVE_WASM_REFERENCE_PARITY_CONTRACT,
    status:name,
    wasmExecuted:executed,
    rulesCompared:ruleCount,
    wasmAndJsEqual:matched,
    originalSaveBytesReencoded:false,
    strictDecodingPerformedByExistingCodec:true,
    allReferenceClosureVerified:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
}
/**
 * Strictly decoded JSON text remains only inside the dedicated worker.
 * If WebAssembly is unavailable, JS diagnostics still operate independently.
 */
export async function probeWasmReferenceParity(strictJsonText,decoded){
  if(typeof strictJsonText!=='string'||!obj(decoded))
    throw new TypeError('DB05_WASM_REFERENCE_STRICT_SOURCE_REQUIRED');
  if(strictJsonText.length>MAX_WASM_TEXT_CHARS)
    return status('skipped_large_save',false,false,0);
  if(!initializing)
    initializing=init(wasmUrl).catch(e=>{initializing=null;throw e;});
  await initializing;
  const rust=JSON.parse(probe_save_references_json(strictJsonText));
  const js=probeSaveReferences(decoded);
  if(!obj(rust)||rust.contract!=='wand.db05.save-reference-probe@1'||
     rust.writerAuthorized!==false||rust.exportAuthorized!==false||
     !Array.isArray(rust.rules)||rust.rules.length!==14||
     !Array.isArray(js.rules)||js.rules.length!==14)
    return status('diverged',true,false,14);
  const equal=jsonSame(rust,js);
  return status(equal?'matched':'diverged',true,equal,14);
}
/** Worker-safe fixed reply when a WASM module or glue failed to load. */
export function wasmReferenceUnavailable(){
  return status('unavailable',false,false,0);
}
