/**
 * DB-05 ↔ DB-04, source-provenance-aware read-only comparison.
 *
 * DB-04 owns the WorldReferenceIndex. This code NEVER derives a player's
 * world, placement, unlock, DLC rights, edit permission or effective placed
 * count from a shared Item ID. It compares saved *item reference presence*
 * with DB-04's independently verified *native default-source references*.
 * A full Save grid identity join requires the specific layout/grid/hash
 * witnesses and is not performed by this Item-ID-only projection.
 */
import {WorldReferenceIndex} from '../world/reference-graph.ts';

export interface SavedGridItemReference {
  readonly itemId:string;
  readonly fullGridReferences:number;
  readonly diffModifiedReferences:number;
}
export interface SaveDb04ReferenceRow {
  readonly itemId:string;
  readonly savedFullGridReferences:number;
  readonly savedDiffModifiedReferences:number;
  readonly nativeSourceInitialInstances:number;
  readonly sourceInitialStatus:'source_native_verified'|'unverified';
  readonly saveGridIdentityMatched:false;
  readonly playerPlacedWorldVerified:false;
  readonly effectivePlacedCountVerified:false;
  readonly editPermissionFromWorld:false;
}
export interface SaveDb04ReferenceComparison {
  readonly contract:'wand.db05.db04-source-only-comparison@1';
  readonly sourceGameVersion:string;
  readonly sourceWorldManifestSha256:string;
  readonly sourceCoverageComplete:false;
  readonly saveToSourceGridIdentityVerified:false;
  readonly worldOfPlayerPlacementVerified:false;
  readonly exportAuthorized:false;
  readonly rows:readonly SaveDb04ReferenceRow[];
}
const nonnegative=(n:unknown):n is number=>typeof n==='number'&&
  Number.isSafeInteger(n)&&n>=0&&n<=100000;
const itemId=(id:unknown):id is string=>typeof id==='string'&&
  /^(?:0|[1-9][0-9]*)$/.test(id)&&id!=='0'&&
  id.length<=20&&BigInt(id)<=18446744073709551615n;

/** Requires an already constructor-verified DB-04 index, not raw public
 * Save data nor a caller's unverified world name mapping.
 */
export function compareSavedGridItemsWithDb04(
  saved:readonly SavedGridItemReference[],source:WorldReferenceIndex
):SaveDb04ReferenceComparison{
  if(!(source instanceof WorldReferenceIndex)||
    !Array.isArray(saved)||saved.length>20000||
    source.target.platform!=='Steam'||
    source.coverage.sourceCoverageComplete!==false)
    throw new TypeError('DB05_DB04_VERIFIED_SOURCE_REQUIRED');
  let last=0n;
  const rows=saved.map((savedRow):SaveDb04ReferenceRow=>{
    if(!savedRow||Object.keys(savedRow).sort().join(',')!==
       'diffModifiedReferences,fullGridReferences,itemId'||
      !itemId(savedRow.itemId)||
      !nonnegative(savedRow.fullGridReferences)||
      !nonnegative(savedRow.diffModifiedReferences)||
      savedRow.fullGridReferences+savedRow.diffModifiedReferences===0||
      BigInt(savedRow.itemId)<=last)
      throw new TypeError('DB05_DB04_SAVED_GRID_REFERENCE_INVALID');
    last=BigInt(savedRow.itemId);
    const initial=source.initialSourcePlacement(savedRow.itemId);
    const sourceInstances=initial.values.reduce((sum,ref)=>sum+ref.instanceCount,0);
    return Object.freeze({
      itemId:savedRow.itemId,
      savedFullGridReferences:savedRow.fullGridReferences,
      savedDiffModifiedReferences:savedRow.diffModifiedReferences,
      nativeSourceInitialInstances:sourceInstances,
      sourceInitialStatus:initial.status,
      saveGridIdentityMatched:false,
      playerPlacedWorldVerified:false,
      effectivePlacedCountVerified:false,
      editPermissionFromWorld:false
    });
  });
  return Object.freeze({
    contract:'wand.db05.db04-source-only-comparison@1',
    sourceGameVersion:source.target.gameVersion,
    sourceWorldManifestSha256:source.target.nativeWorldManifestSha256,
    sourceCoverageComplete:false,
    saveToSourceGridIdentityVerified:false,
    worldOfPlayerPlacementVerified:false,
    exportAuthorized:false,
    rows:Object.freeze(rows)
  });
}
