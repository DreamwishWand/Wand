/**
 * Rust-first encrypted P1G reader. Worker-only adapter; never import from a
 * Svelte page or post the decrypted profile across a Worker boundary.
 *
 * Game cryptography, ZIP integrity and strict profile validation run in
 * ddv-p1g-codec (Rust/WASM). TS/JS only handles bounded Worker transport.
 * No JS fallback is allowed in this production reader.
 */
import init,{WasmP1gProfileReader} from '../save/wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from '../save/wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';

const MAX_CIPHER=32*1024*1024;
const MAX_PROFILE=128*1024*1024;
const CHUNK=1024*1024;
let ready=null;

/** Only call from a dedicated, short-lived browser Worker. */
export async function readRustP1gProfileInWorker(ciphertext){
  if(!(ciphertext instanceof Uint8Array)||ciphertext.byteLength<16||
      ciphertext.byteLength>MAX_CIPHER||ciphertext.byteLength%16!==0)
    throw new TypeError('RUST_P1G_WORKER_SOURCE_INVALID');
  if(typeof WorkerGlobalScope==='undefined'||
      !(globalThis instanceof WorkerGlobalScope))
    throw new TypeError('RUST_P1G_WORKER_REQUIRED');
  if(ready===null)ready=init(wasmUrl).catch(error=>{ready=null;throw error;});
  await ready;
  const reader=new WasmP1gProfileReader();
  let profile=null;
  try{
    for(let offset=0;offset<ciphertext.byteLength;offset+=CHUNK)
      reader.append_chunk(ciphertext.subarray(offset,offset+CHUNK));
    const size=reader.finish_open();
    if(!Number.isSafeInteger(size)||size<1||size>MAX_PROFILE)
      throw new TypeError('RUST_P1G_PROFILE_SIZE_INVALID');
    profile=new Uint8Array(size);
    for(let offset=0;offset<size;offset+=CHUNK){
      const chunk=reader.take_profile_chunk(Math.min(CHUNK,size-offset));
      if(!(chunk instanceof Uint8Array)||
          chunk.byteLength!==Math.min(CHUNK,size-offset))
        throw new TypeError('RUST_P1G_PROFILE_INCOMPLETE');
      profile.set(chunk,offset);
      chunk.fill(0);
    }
    // Rust has already authenticated exact ZIP CRC and strict JSON. The
    // text exists only inside this Worker and is never returned to the UI.
    return {jsonText:new TextDecoder('utf-8',{fatal:true}).decode(profile)};
  }finally{
    if(profile)profile.fill(0);
    reader.close();
    reader.free();
  }
}
