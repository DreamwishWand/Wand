/** One-shot, Rust/WASM-owned encrypted save reader. No network requests. */
import {inspectEncryptedSavedStore} from './saved-store-worker-core.mjs';
import {readRustP1gProfileInWorker} from './rust-p1g-profile-reader.ts';

const worker=self as unknown as {
  onmessage:((event:MessageEvent<unknown>)=>void)|null;
  postMessage:(value:unknown)=>void;
  close:()=>void;
};
let started=false;
worker.onmessage=async({data})=>{
  if(started)return;
  started=true;
  const command=data&&typeof data==='object'&&!Array.isArray(data)?
    data as Record<string,unknown>:null;
  const ciphertext=command?.ciphertext;
  let response:{kind:'error'|'result';result?:unknown}={kind:'error'};
  try{
    if(command?.command!=='inspect-local-p1g'||
      !(ciphertext instanceof Uint8Array)||
      Object.keys(command).sort().join(',')!=='ciphertext,command')
      throw new TypeError('LOCAL_P1G_WORKER_COMMAND_INVALID');
    const result=await inspectEncryptedSavedStore(
      ciphertext,readRustP1gProfileInWorker);
    response={kind:'result',result};
  }catch{
    // Never forward private decoder errors, input names or source bytes.
  }finally{
    if(ciphertext instanceof Uint8Array && ciphertext.byteLength)
      ciphertext.fill(0);
  }
  worker.postMessage(response);
  worker.close();
};
