/** Dedicated one-shot local dual-file source+save reconciliation. */
import { inspectLocalDb04SaveJoin } from './saved-world-db04-join-worker-core.mjs';

let started=false;
self.onmessage=async({data})=>{
  if(started)return;
  started=true;
  const ciphertext=data?.ciphertext,archive=data?.archive;
  let response={kind:'error'};
  try{
    if(data?.command!=='join-local-db04'||
      !(ciphertext instanceof Uint8Array)||
      !(archive instanceof Uint8Array)||
      Object.keys(data).sort().join(',')!=='archive,ciphertext,command')
      throw new TypeError('COLLECTION_DB04_INVALID_WORKER_COMMAND');
    const result=await inspectLocalDb04SaveJoin(ciphertext,archive);
    response={kind:'result',result};
  }catch{
    // Suppress private local archive/save filenames and exception messages.
  }finally{
    if(ciphertext instanceof Uint8Array&&ciphertext.byteLength)ciphertext.fill(0);
    if(archive instanceof Uint8Array&&archive.byteLength)archive.fill(0);
  }
  self.postMessage(response);
  self.close();
};
