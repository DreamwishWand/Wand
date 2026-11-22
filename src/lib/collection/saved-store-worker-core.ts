/**
 * Collection's production Save projection coordinator. Pure TS Worker glue:
 * Rust/WASM alone decodes the local profile; legacy JS projections are
 * preserved only until their Rust equivalents are integrated.
 * No decoded values or private JSON are returned to the page.
 */
import {decodeNativeFirstLocalProfile} from './saved-profile-native-reader';
import {parseSafeJson} from './safe-profile-json.mjs';
import {inspectDecodedWorldStores} from '../acquisition/world-store-save.mjs';
import {createSavedStorePreview} from './saved-store-preview.mjs';
import {createSavedCollectionPresence} from './saved-collection-presence.mjs';
import {projectSavedCollectionDiscovery} from './saved-collection-discovery.mjs';
import {projectPositiveListInventoryOwnership} from './saved-list-positive-ownership.mjs';
import {projectSavedGridFurnitureReferences} from './saved-grid-furniture-references.mjs';

const MAX_LOCAL_BYTES=128*1024*1024;
const staticStallUnavailable=Object.freeze({getStallStaticCatalog:()=>null});

export async function inspectLocalSavedStore(bytes:Uint8Array) {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||
    bytes.byteLength>MAX_LOCAL_BYTES)
      throw new TypeError('COLLECTION_LOCAL_SOURCE_INVALID');
  const decoded=await decodeNativeFirstLocalProfile(bytes);
  if(typeof decoded.jsonText!=='string'||decoded.jsonText.length===0)
    throw new TypeError('COLLECTION_NATIVE_PROFILE_INVALID');
  // JS projections are a temporary migration debt. This strict numerical
  // scanner prevents JS number rounding while Rust owns the codec.
  const root=parseSafeJson(decoded.jsonText);
  if(!root.GameInfo||typeof root.GameInfo!=='object'||
    Array.isArray(root.GameInfo)||!root.Player||typeof root.Player!=='object'||
    Array.isArray(root.Player)||!root.World||typeof root.World!=='object'||
    Array.isArray(root.World))
      throw new TypeError('COLLECTION_NATIVE_REQUIRED_ROOT_INVALID');
  const evidence=inspectDecodedWorldStores(staticStallUnavailable,root);
  return Object.freeze({
    kind:'saved-store-summary',
    saveSchema:Number.isSafeInteger(root.GameInfo.Version)?root.GameInfo.Version:null,
    summary:createSavedStorePreview(evidence,[]),
    collection:createSavedCollectionPresence(root),
    discovery:projectSavedCollectionDiscovery(root),
    positiveOwnership:projectPositiveListInventoryOwnership(root),
    gridFurniture:projectSavedGridFurnitureReferences(root)
  });
}
