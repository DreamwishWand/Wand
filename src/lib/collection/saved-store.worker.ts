/** One-shot, isolated, Rust/WASM-first local Save reader. No network. */
import {inspectLocalSavedStore} from './saved-store-worker-core.ts';

let started=false;
type Request = { command?:string; bytes?:Uint8Array; [key:string]:unknown };
self.onmessage=async ({data}:MessageEvent<Request>)=>{
  if(started)return;
  started=true;
  const bytes=data?.bytes;
  let response:{kind:'error'|'result';result?:unknown}={kind:'error'};
  try{
    if(data?.command!=='inspect-local-save' ||
       !(bytes instanceof Uint8Array) ||
       Object.keys(data).sort().join(',')!=='bytes,command')
      throw new TypeError('COLLECTION_LOCAL_SAVE_COMMAND_INVALID');
    // The Rust/WASM decoder runs in this Worker. The page receives only
    // bounded IDs/booleans/summary evidence, not private profile text.
    const result=await inspectLocalSavedStore(bytes);
    response={kind:'result',result};
  }catch{
    // Do not forward private data or arbitrary parser exceptions.
  }finally{
    if(bytes instanceof Uint8Array && bytes.byteLength)bytes.fill(0);
  }
  self.postMessage(response);
  self.close();
};