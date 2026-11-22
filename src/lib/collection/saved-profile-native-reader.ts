/**
 * Collection Save ingestion: Rust/WASM is the primary decoder.
 * Private JSON never leaves this Worker. Legacy JS is a narrowly scoped,
 * temporary fallback for archive layouts not yet supported by Rust.
 */
import init,{WasmLocalProfileReader} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {decodeP1gPackagedProfile} from './private-p1g-codec.js';

export interface NativeProfileRead {
  readonly jsonText:string;
  readonly nativeReaderUsed:boolean;
  readonly legacyEnvelopeUsed:boolean;
}
const CHUNK=1024*1024;
const MAX_BYTES=128*1024*1024;
let initialization:Promise<unknown>|null=null;

function sourceIsPlainJson(bytes:Uint8Array):boolean{
  let i=0;
  while(i<bytes.length &&
    (bytes[i]===32||bytes[i]===9||bytes[i]===10||bytes[i]===13))i++;
  return bytes[i]===123;
}

export async function decodeNativeFirstLocalProfile(bytes:Uint8Array):Promise<NativeProfileRead>{
  if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>MAX_BYTES)
    throw new TypeError('COLLECTION_LOCAL_SOURCE_INVALID');
  if(!initialization)
    initialization=init(wasmUrl).catch(error=>{
      initialization=null;throw error;
    });
  await initialization;
  let reader:WasmLocalProfileReader|null=null;
  try{
    reader=new WasmLocalProfileReader('auto');
    for(let i=0;i<bytes.byteLength;i+=CHUNK)
      reader.append_chunk(bytes.subarray(i,i+CHUNK));
    const jsonText=reader.finish_json_text();
    if(typeof jsonText!=='string'||jsonText.length===0)
      throw new TypeError('COLLECTION_NATIVE_PROFILE_EMPTY');
    return Object.freeze({jsonText,nativeReaderUsed:true,legacyEnvelopeUsed:false});
  }catch(error){
    // Fail closed for all bad ciphertexts, integrity failures and malformed
    // profiles. Do not let a parser error masquerade as an unsupported ZIP.
    const isUnsupported=String(error)==='DB05_NATIVE_ENVELOPE_UNSUPPORTED';
    if(!isUnsupported||sourceIsPlainJson(bytes)||bytes.byteLength>32*1024*1024)
      throw new TypeError('COLLECTION_NATIVE_PROFILE_REJECTED');
    const legacy=await decodeP1gPackagedProfile(bytes);
    return Object.freeze({
      jsonText:legacy.jsonText,nativeReaderUsed:false,legacyEnvelopeUsed:true
    });
  }finally{
    reader?.close();
    reader?.free();
  }
}
