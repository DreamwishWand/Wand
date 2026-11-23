/** One-shot, owner-local DB-01 exact-name Worker.
 * All private original processing remains off the UI thread.
 * Nothing is sent to a server, retained in app storage or written to Save.
 */
import {inspectPrivateDb01Names} from './private-db01-names-worker-core.ts';

interface PrivateNamesRequest{
  readonly command:'inspect-private-db01';
  readonly archive:Uint8Array;
  readonly itemIds:readonly number[];
}
let started=false;
self.onmessage=async ({data}:MessageEvent<unknown>):Promise<void>=>{
  if(started)return;
  started=true;
  const input=data as Partial<PrivateNamesRequest>|null;
  const archive=input?.archive;
  let response:
    | Readonly<{kind:'error'}>
    | Readonly<{kind:'result';result:Awaited<ReturnType<typeof inspectPrivateDb01Names>>}> =
      {kind:'error'};
  try{
    if(input?.command!=='inspect-private-db01'||
      !(archive instanceof Uint8Array)||
      !Array.isArray(input.itemIds)||
      Object.keys(input).sort().join(',')!=='archive,command,itemIds')
      throw new TypeError('DB01_PRIVATE_WORKER_COMMAND');
    const result=await inspectPrivateDb01Names(archive,input.itemIds);
    response={kind:'result',result};
  }catch{
    // Private names, game source bytes, archive paths and Save values are
    // deliberately excluded from diagnostic responses.
  }finally{
    if(archive instanceof Uint8Array&&archive.byteLength)
      archive.fill(0);
  }
  self.postMessage(response);
  self.close();
};
