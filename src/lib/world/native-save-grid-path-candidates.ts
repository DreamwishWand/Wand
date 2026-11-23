/**
 * DB-04 -> DB-05 source-only candidate resolver for an observed FULL Save Grid.
 *
 * The game's FULL GridCollection record can expose two literal source
 * paths: GridDefaultLayoutPath and GridDataPath. They narrow the original
 * GridCollection reference graph, but DO NOT establish a saved Grid identity,
 * a native numeric Grid.ID equivalence or a DiffGrid hash witness.
 *
 * This never reads a Save, mutates any data, or makes a placement decision.
 * Caller must separately verify the Save version/schema; the supplied
 * declaredVersion is solely a conservative version-comparison guard.
 */
import {
  WorldReferenceIndex,
  type NativeGridReference
} from './reference-graph.ts';

export const DB04_SAVE_FULL_GRID_PATH_CANDIDATES=
  'wand.db04.save-full-grid-source-path-candidates@1' as const;

export interface ObservedSaveFullGridSourcePaths {
  /** Caller-provided decoded version, NOT authenticated by this function. */
  readonly declaredVersion:string;
  readonly gridDefaultLayoutPath:string;
  readonly gridDataPath:string;
}

export type SaveFullGridSourcePathStatus=
  'source_version_mismatch'|
  'layout_not_in_partial_source'|
  'griddata_not_in_partial_source'|
  'source_layout_does_not_reference_griddata'|
  'source_layout_reference_missing_griddata_file'|
  'one_source_candidate'|
  'multiple_source_candidates';

export interface SaveFullGridSourcePathCandidates {
  readonly contract:typeof DB04_SAVE_FULL_GRID_PATH_CANDIDATES;
  readonly status:SaveFullGridSourcePathStatus;
  readonly sourceGameVersion:string;
  readonly sourceWorldManifestSha256:string;
  readonly suppliedVersionMatchesSource:boolean;
  readonly layoutPath:string;
  readonly gridDataPath:string;
  readonly sourceLayoutPresent:boolean;
  readonly originalGridDataFilePresent:boolean;
  readonly sourceGridReferenceCount:number;
  readonly originalCandidateGrids:readonly Readonly<NativeGridReference>[];
  readonly exactSourcePathPairCompared:boolean;
  readonly sourceCoverageComplete:false;
  readonly saveVersionAuthenticated:false;
  readonly numericSavedGridIdUsedAsNativeKey:false;
  readonly nativeDiffGridHashCodeVerified:false;
  readonly nativeDiffGridDataHashCodeVerified:false;
  readonly savedGridIdentityVerified:false;
  readonly savedObjectPlacementVerified:false;
  readonly worldCoordinatesVerified:false;
  readonly gameplayPlacementLegalityVerified:false;
  readonly saveWritingAuthorized:false;
}

const layoutId=/^SceneLayouts\/(?:[A-Za-z0-9_!.\-]+\/)*[A-Za-z0-9_!.\-]+\.json$/;
const dataId=/^GridData\/(?:[A-Za-z0-9_!.\-]+\/)*[A-Za-z0-9_!.\-]+\.json$/;
const validPath=(p:unknown,pattern:RegExp):p is string=>
  typeof p==='string'&&p.length<=512&&pattern.test(p)&&
  !p.split('/').some(part=>part==='.'||part==='..');
const isRecord=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);

export function findOriginalGridCandidatesForSaveFullGrid(
  index:WorldReferenceIndex,
  observation:ObservedSaveFullGridSourcePaths
):SaveFullGridSourcePathCandidates{
  if(!(index instanceof WorldReferenceIndex)||
     !isRecord(observation)||
     !/^\d+\.\d+\.\d+$/.test(String(observation.declaredVersion))||
     !validPath(observation.gridDefaultLayoutPath,layoutId)||
     !validPath(observation.gridDataPath,dataId)||
     Object.keys(observation).sort().join(',')!==
       'declaredVersion,gridDataPath,gridDefaultLayoutPath')
    throw new TypeError('DB04_SAVE_FULL_GRID_SOURCE_PATHS_INVALID');

  const versionOk=observation.declaredVersion===index.target.gameVersion;
  const layoutPresent=versionOk&&
    index.getLayout(observation.gridDefaultLayoutPath)!==null;
  const data=versionOk?
    index.originalGridDataPathCandidates(observation.gridDataPath):null;
  const originalGridDataFilePresent=Boolean(data?.originalGridDataFile);
  const matched=versionOk&&layoutPresent&&data?
    data.sourceGridReferences.filter(
      g=>g.layoutId===observation.gridDefaultLayoutPath):[];
  const candidateGrids=Object.freeze(
    matched.map(g=>Object.freeze({...g})));
  const hasGridReference=matched.length>0;
  const status:SaveFullGridSourcePathStatus=
    !versionOk?'source_version_mismatch':
    !layoutPresent?'layout_not_in_partial_source':
    !data||data.sourcePresence==='not_in_partial_source'?
      'griddata_not_in_partial_source':
    !hasGridReference?'source_layout_does_not_reference_griddata':
    !originalGridDataFilePresent?
      'source_layout_reference_missing_griddata_file':
    matched.length===1?'one_source_candidate':'multiple_source_candidates';
  return Object.freeze({
    contract:DB04_SAVE_FULL_GRID_PATH_CANDIDATES,
    status,sourceGameVersion:index.target.gameVersion,
    sourceWorldManifestSha256:index.target.nativeWorldManifestSha256,
    suppliedVersionMatchesSource:versionOk,
    layoutPath:observation.gridDefaultLayoutPath,
    gridDataPath:observation.gridDataPath,
    sourceLayoutPresent:layoutPresent,
    originalGridDataFilePresent,
    sourceGridReferenceCount:matched.length,
    originalCandidateGrids:candidateGrids,
    exactSourcePathPairCompared:versionOk&&layoutPresent&&data!==null,
    sourceCoverageComplete:false as const,
    saveVersionAuthenticated:false as const,
    numericSavedGridIdUsedAsNativeKey:false as const,
    nativeDiffGridHashCodeVerified:false as const,
    nativeDiffGridDataHashCodeVerified:false as const,
    savedGridIdentityVerified:false as const,
    savedObjectPlacementVerified:false as const,
    worldCoordinatesVerified:false as const,
    gameplayPlacementLegalityVerified:false as const,
    saveWritingAuthorized:false as const
  });
}
