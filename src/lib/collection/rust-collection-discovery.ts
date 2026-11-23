/** Browser Save Worker only. Rust/WASM owns CollectionSet structure traversal.
 * Decoded JSON is never posted to the UI, written to IndexedDB, or uploaded.
 */
import init,{probe_collection_discovery_json,probe_positive_list_inventory_json}
  from '../save/wasm/pkg/ddv_save_schema.js';
import wasmUrl from '../save/wasm/pkg/ddv_save_schema_bg.wasm?url';
import {sanitizePositiveListInventoryOwnership,
  type PositiveListInventoryProjection} from './saved-list-positive-ownership.ts';
import {sanitizeSavedCollectionDiscovery,
  type SavedCollectionDiscoveryProjection} from './saved-collection-discovery.ts';

const MAX_PROFILE_JSON=128*1024*1024;
let initializing:Promise<unknown>|null=null;

/** A Rust-only, immutable, ID/boolean-only projection. No JS fallback. */
export async function projectCollectionDiscoveryRust(
  decodedJson:string
):Promise<SavedCollectionDiscoveryProjection>{
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
  const result=probe_collection_discovery_json(decodedJson);
  // The Rust response is also sanitized at the UI boundary (in addition to
  // this Worker-side validation). Invalid or incomplete evidence fails closed.
  return sanitizeSavedCollectionDiscovery(JSON.parse(result) as unknown);
}

/** Same initialized Rust/WASM module; no JS save-amount traversal or fallback. */
export async function projectPositiveListInventoryRust(
  decodedJson:string
):Promise<PositiveListInventoryProjection>{
  if(typeof decodedJson!=='string'||!decodedJson.length||
     decodedJson.length>MAX_PROFILE_JSON)
    throw new TypeError('SAVE_LIST_OWNERSHIP_INPUT_INVALID');
  if(!initializing){
    initializing=init(wasmUrl).catch(error=>{
      initializing=null;
      throw error;
    });
  }
  await initializing;
  return sanitizePositiveListInventoryOwnership(
    JSON.parse(probe_positive_list_inventory_json(decodedJson)) as unknown);
}
