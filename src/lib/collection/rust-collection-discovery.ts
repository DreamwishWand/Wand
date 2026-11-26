/** Browser Save Worker only. Rust/WASM owns CollectionSet structure traversal.
 * Decoded JSON is never posted to the UI, written to IndexedDB, or uploaded.
 */
import init,{probe_collection_read_projections_json}
  from '../save/wasm/pkg/ddv_save_schema.js';
import wasmUrl from '../save/wasm/pkg/ddv_save_schema_bg.wasm?url';
import {sanitizeSavedCollectionDiscovery,
  type SavedCollectionDiscoveryProjection} from './saved-collection-discovery.ts';

import {sanitizeSavedMemoryFlags,type SavedMemoryFlags} from '../media/saved-memory-flags.ts';

const MAX_PROFILE_JSON=128*1024*1024;
let initializing:Promise<unknown>|null=null;

/** A Rust-only, immutable, ID/boolean-only projection. No JS fallback. */
export async function projectCollectionDiscoveryRust(
  decodedJson:string
):Promise<SavedCollectionDiscoveryProjection & {memoryFlags:SavedMemoryFlags}>{
  if(typeof decodedJson!=='string'||!decodedJson.length||
     decodedJson.length>MAX_PROFILE_JSON)
    throw new TypeError('SAVE_COLLECTION_DISCOVERY_INPUT_INVALID');
  if(!initializing){
    initializing=init(wasmUrl).catch(error=>{
      initializing=null;
      throw error;
    });
  }
  await initializing;
  const result=JSON.parse(probe_collection_read_projections_json(decodedJson));
  // The Rust response is also sanitized at the UI boundary (in addition to
  // this Worker-side validation). Invalid or incomplete evidence fails closed.
  return {...sanitizeSavedCollectionDiscovery(result.discovery),memoryFlags:sanitizeSavedMemoryFlags(result.memoryFlags)};
}
