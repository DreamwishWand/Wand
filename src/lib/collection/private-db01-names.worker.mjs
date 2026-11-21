/** One-shot local DB-01 release ZIP name resolver. No network/file writes. */
import { inspectPrivateDb01Names } from './private-db01-names-worker-core.mjs';
let started=false;
self.onmessage=async ({data})=>{
  if(started)return;
  started=true;
  const archive=data?.archive;
  let response={kind:'error'};
  try{
    if(data?.command!=='inspect-private-db01'||!(archive instanceof Uint8Array)||
       !Array.isArray(data.itemIds)||Object.keys(data).sort().join(',')!=='archive,command,itemIds')
      throw new TypeError('DB01_PRIVATE_WORKER_COMMAND');
    const result=await inspectPrivateDb01Names(archive,data.itemIds);
    response={kind:'result',result};
  }catch{
    // No private names, original bytes, or file paths in diagnostics.
  } finally {
    if(archive instanceof Uint8Array&&archive.byteLength)archive.fill(0);
  }
  self.postMessage(response);
  self.close();
};