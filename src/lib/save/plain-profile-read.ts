/**
 * Rust/WASM-first plaintext Steam .profile decoder. Call only inside a
 * dedicated local Worker; never send the raw JSON to Svelte components.
 */
import init,{WasmPlainProfileReader} from './wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from './wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';

const CHUNK=1024*1024;
const MAX_PROFILE=128*1024*1024;
let initializing:Promise<unknown>|null=null;

export async function decodePlainProfileRust(source:Uint8Array):Promise<{jsonText:string}>{
  if(!(source instanceof Uint8Array)||source.byteLength<1||
      source.byteLength>MAX_PROFILE)
    throw new TypeError('DB05_RUST_PLAIN_SOURCE_INVALID');
  if(!initializing){
    initializing=init(wasmUrl).catch(error=>{
      initializing=null;throw error;
    });
  }
  await initializing;
  const reader=new WasmPlainProfileReader();
  let output:Uint8Array|null=null;
  try{
    for(let i=0;i<source.byteLength;i+=CHUNK)
      reader.append_chunk(source.subarray(i,i+CHUNK));
    const length=reader.finish_open();
    if(!Number.isSafeInteger(length)||length!==source.byteLength)
      throw new TypeError('DB05_RUST_PLAIN_LENGTH_MISMATCH');
    output=new Uint8Array(length);
    for(let i=0;i<length;i+=CHUNK){
      const count=Math.min(CHUNK,length-i);
      const part=reader.take_profile_chunk(count);
      if(!(part instanceof Uint8Array)||part.byteLength!==count)
        throw new TypeError('DB05_RUST_PLAIN_CHUNK_INVALID');
      output.set(part,i);
      part.fill(0);
    }
    return {jsonText:new TextDecoder('utf-8',{fatal:true}).decode(output)};
  }finally{
    output?.fill(0);
    reader.close();
    reader.free();
  }
}
