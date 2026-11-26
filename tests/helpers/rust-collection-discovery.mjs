/** Node integration fixture for the SAME generated Rust/WASM used in the browser.
 * Only synthetic JSON is passed in tests; no owner Save is ever read. */
import {readFileSync} from 'node:fs';
import init,{probe_collection_discovery_json,probe_collection_read_projections_json}
  from '../../src/lib/save/wasm/pkg/ddv_save_schema.js';
import {sanitizeSavedCollectionDiscovery}
  from '../../src/lib/collection/saved-collection-discovery.ts';

let initializing=null;
async function ready(){
  if(!initializing){
    const bytes=new Uint8Array(readFileSync(
      new URL('../../src/lib/save/wasm/pkg/ddv_save_schema_bg.wasm',import.meta.url)));
    initializing=init(bytes);
  }
  await initializing;
}
export async function projectSavedCollectionDiscovery(root){
  await ready();
  return sanitizeSavedCollectionDiscovery(
    JSON.parse(probe_collection_discovery_json(JSON.stringify(root))));
}
export async function projectRustDiscoveryText(decodedJson){
  await ready();
  return sanitizeSavedCollectionDiscovery(
    JSON.parse(probe_collection_discovery_json(decodedJson)));
}

export async function projectRustReadProjectionsText(decodedJson){
  await ready();
  const result=JSON.parse(probe_collection_read_projections_json(decodedJson));
  return {...sanitizeSavedCollectionDiscovery(result.discovery),memoryFlags:result.memoryFlags};
}
