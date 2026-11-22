/**
 * DB-04 source graph → local terrain/initial-anchor ZIP navigation.
 *
 * Uses the original layout ID + native Grid.ID + exact GridDataPath triple.
 * The two owner-private archives are independently self-consistent; an
 * identical triple is NOT a verified binary hash, Save Grid ID, world
 * coordinate transformation, DLC entitlement or edit permission.
 */
export const DB04_SOURCE_TERRAIN_NAVIGATION='wand.db04.source-terrain-navigation@1' as const;

export interface SourceGridNavigationRequest {
  readonly sourceGameVersion:string;
  readonly sourceWorldManifestSha256:string;
  readonly layoutId:string;
  readonly nativeGridId:number;
  readonly gridDataPath:string;
}
export interface TerrainZipNavigationLayout {
  readonly viewKey:string;
  readonly layoutId:string;
  readonly kind:'gridCollection'|'villageArea';
  readonly regionKey:string;
  readonly grids:readonly Readonly<{
    gridIdNative:number;
    gridDataPath:string;
    knownGridData:boolean;
  }>[];
}
export interface TerrainZipNavigationInput {
  readonly gameVersion:string|null;
  readonly platform:string|null;
  readonly layouts:readonly TerrainZipNavigationLayout[];
}
export type TerrainZipNavigationStatus=
  'ready'|'zip_not_loaded'|'source_version_mismatch'|
  'not_in_terrain_source'|'ambiguous_terrain_view';
export interface TerrainZipNavigationResult {
  readonly contract:typeof DB04_SOURCE_TERRAIN_NAVIGATION;
  readonly status:TerrainZipNavigationStatus;
  readonly viewKey:string|null;
  readonly regionKey:string|null;
  readonly nativeGridId:number|null;
  readonly sourceLayoutAndGridDataPathExactMatched:boolean;
  readonly independentOriginalArchiveBinaryIdentityVerified:false;
  readonly savedGridIdentityVerified:false;
  readonly worldCoordinatesVerified:false;
  readonly gameplayPlacementLegalityVerified:false;
  readonly saveWritingAuthorized:false;
}
const fileId=/^SceneLayouts\/(?:[A-Za-z0-9_!.\-]+\/)*[A-Za-z0-9_!.\-]+\.json$/;
const dataId=/^GridData\/(?:[A-Za-z0-9_!.\-]+\/)*[A-Za-z0-9_!.\-]+\.json$/;
function validPath(value:string,pattern:RegExp){
  return value.length<=1024&&pattern.test(value)&&
    !value.split('/').some(part=>part==='.'||part==='..');
}
function result(
  status:TerrainZipNavigationStatus,
  selected:TerrainZipNavigationLayout|null,
  gridId:number|null
):TerrainZipNavigationResult{
  return Object.freeze({
    contract:DB04_SOURCE_TERRAIN_NAVIGATION,
    status,viewKey:selected?.viewKey??null,regionKey:selected?.regionKey??null,
    nativeGridId:gridId,
    sourceLayoutAndGridDataPathExactMatched:status==='ready',
    independentOriginalArchiveBinaryIdentityVerified:false as const,
    savedGridIdentityVerified:false as const,
    worldCoordinatesVerified:false as const,
    gameplayPlacementLegalityVerified:false as const,
    saveWritingAuthorized:false as const
  });
}
export function matchSourceGridToLocalTerrain(
  request:SourceGridNavigationRequest,
  zip:TerrainZipNavigationInput
):TerrainZipNavigationResult{
  if(!request||typeof request!=='object'||
    typeof request.sourceGameVersion!=='string'||
    typeof request.sourceWorldManifestSha256!=='string'||
    !/^[a-f0-9]{64}$/.test(request.sourceWorldManifestSha256)||
    typeof request.layoutId!=='string'||
    !validPath(request.layoutId,fileId)||
    typeof request.gridDataPath!=='string'||
    !validPath(request.gridDataPath,dataId)||
    !Number.isSafeInteger(request.nativeGridId)||request.nativeGridId<0||
    request.nativeGridId>0xffffffff)
    throw new TypeError('DB04_TERRAIN_NAV_INVALID_ORIGINAL_GRID_REFERENCE');
  if(!zip||typeof zip!=='object'||!Array.isArray(zip.layouts))
    throw new TypeError('DB04_TERRAIN_NAV_INVALID_LOCAL_ZIP');
  if(zip.gameVersion===null||zip.platform===null)
    return result('zip_not_loaded',null,null);
  if(request.sourceGameVersion!=='1.26.2'||zip.gameVersion!=='1.26.2'||
    zip.platform!=='Steam')
    return result('source_version_mismatch',null,null);
  const matches=zip.layouts.filter(layout=>
    layout.layoutId===request.layoutId&&
    layout.grids.some((grid:TerrainZipNavigationLayout['grids'][number])=>
      grid.gridIdNative===request.nativeGridId&&
      grid.gridDataPath===request.gridDataPath&&grid.knownGridData)
  );
  // GridCollections have one direct view and can also be represented by
  // multiple Village Area views. Prefer the unique direct view; never guess
  // among duplicate native GridCollection identities.
  const direct=matches.filter(layout=>layout.kind==='gridCollection');
  const chosen=direct.length===1?direct[0]:
    direct.length===0&&matches.length===1?matches[0]:null;
  if(chosen)return result('ready',chosen,request.nativeGridId);
  return result(matches.length?'ambiguous_terrain_view':'not_in_terrain_source',
    null,null);
}
