/** Two private files, one ephemeral Worker. No HTTP, no raw profile return. */
import { decodeP1gPackagedProfile } from './private-p1g-codec.js';
import { openLocalWorldZip } from '../world/local-snapshot.mjs';
import { reconcileSavedWorldWithDb04 } from './saved-world-db04-join.mjs';

export async function inspectLocalDb04SaveJoin(ciphertext,archive){
  if(!(ciphertext instanceof Uint8Array)||ciphertext.byteLength<16||
    ciphertext.byteLength>32*1024*1024||ciphertext.byteLength%16!==0||
    !(archive instanceof Uint8Array)||archive.byteLength<22||
    archive.byteLength>96*1024*1024)
    throw new TypeError('COLLECTION_DB04_INVALID_LOCAL_INPUT');
  // Both parsers have strict crypto, JSON, ZIP CRC and declared digest guards.
  // This pair is NEVER transmitted to a server or persisted.
  const decoded=await decodeP1gPackagedProfile(ciphertext);
  const root=JSON.parse(decoded.jsonText);
  const source=await openLocalWorldZip(new Blob([archive]));
  return reconcileSavedWorldWithDb04(root,source);
}
