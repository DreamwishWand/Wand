/**
 * DB-04 read-only bridge: original Source PATH-PAIR candidates vs one
 * user-selected browser-local Save's Rust/WASM-projected object positions.
 *
 * Matching GridDefaultLayoutPath + GridDataPath never proves that Save X/Y
 * and original terrain GridData X/Y are the same coordinate space.
 * These points must be shown in their own numeric Save-coordinate plot,
 * NEVER overlaid on source terrain or treated as occupied/placeable cells.
 */
export const DB04_SAVED_SOURCE_CANDIDATE_CONTRACT=
  'wand.db04.saved-source-numeric-candidates@1' as const;

export interface SourceGridWitness {
  readonly layoutId:string;
  readonly gridDataPath:string;
  readonly nativeGridId:number;
  readonly nativeSizeX:number|null;
  readonly nativeSizeY:number|null;
  readonly tessellationFactor:number|null;
}
export interface SourceGridQuery {
  readonly viewKey:string;
  readonly nativeGridId:number;
  readonly sourceRefs:readonly SourceGridWitness[];
}
export type SavedSubgridSummary={readonly status:'resolved_full';readonly objectCount:number}|{readonly status:'unresolved';readonly objectCount:null};
export function parseSavedSubgridSummary(value:unknown):SavedSubgridSummary|null{
  if(value===undefined||value===null)return null;
  if(typeof value!=='object'||Array.isArray(value))throw Error('DB04_SUBGRID_INVALID');
  const row=value as Record<string,unknown>;
  if(row.status==='unresolved'&&row.objectCount===null)return {status:'unresolved',objectCount:null};
  if(row.status==='resolved_full'&&typeof row.objectCount==='number'&&Number.isSafeInteger(row.objectCount)&&row.objectCount>=0&&row.objectCount<=100000)
    return {status:'resolved_full',objectCount:row.objectCount};
  throw Error('DB04_SUBGRID_INVALID');
}
export interface SavedNumericPoint {
  readonly localOrdinal:number;
  readonly localGridOrdinal:number;
  readonly itemId:string;
  readonly x:number;
  readonly y:number;
  readonly orientation:string|null;
  readonly subgrid?:SavedSubgridSummary|null;
  readonly storage?:true;
  readonly storageEmpty?:true;
}
export interface SavedGridSourceCandidates {
  readonly contract:typeof DB04_SAVED_SOURCE_CANDIDATE_CONTRACT;
  readonly status:'full_path_pair_numeric_candidates'|
    'no_full_path_pair_candidates'|'save_grid_inconclusive';
  readonly viewKey:string;
  readonly nativeGridId:number;
  readonly matchedRecordCount:number;
  readonly displayedCount:number;
  readonly outsideSourceNumericEnvelopeCount:number;
  readonly rowsWithoutCoordinates:number;
  readonly otherOrAmbiguousSaveRecords:number;
  readonly sourceReferenceCount:number;
  readonly dataSampled:boolean;
  readonly points:readonly SavedNumericPoint[];
  readonly originalSourcePathsCompared:true;
  readonly saveGridIdentityVerified:false;
  readonly savedAndSourceCoordinatesEquivalent:false;
  readonly playerPlacementVerified:false;
  readonly sourceTerrainOccupancyVerified:false;
  readonly nativeCollisionRulesVerified:false;
  readonly legalPlacementVerified:false;
  readonly saveWritingAuthorized:false;
}

type Row=Record<string,unknown>;
const isRecord=(v:unknown):v is Row=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const int32=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&
  v>=-2147483648&&v<=2147483647;
const path=(v:unknown,prefix:string):v is string=>
  typeof v==='string'&&v.length<=512&&
  v.startsWith(prefix)&&v.endsWith('.json')&&
  !v.includes('..')&&!v.includes('\\')&&
  !/\p{Cc}/u.test(v);
const exact=(v:Row,keys:readonly string[]):boolean=>
  Object.keys(v).sort().join(',')===[...keys].sort().join(',');

/** A witness must contain ALL original IDs for the selected path-pair.
 * Multiple native IDs sharing the pair are deliberately ambiguous. */
export function validateSourceGridQuery(input:unknown):SourceGridQuery{
  if(!isRecord(input)||!exact(input,['viewKey','nativeGridId','sourceRefs'])||
     typeof input.viewKey!=='string'||input.viewKey.length<1||
     input.viewKey.length>2048||!uint(input.nativeGridId)||
     !Array.isArray(input.sourceRefs)||input.sourceRefs.length<1||
     input.sourceRefs.length>2048)
    throw new TypeError('DB04_SAVE_SOURCE_WITNESS_INVALID');
  const seen=new Set<number>();
  let selected=false,identity='';
  const sourceRefs:SourceGridWitness[]=input.sourceRefs.map(value=>{
    if(!isRecord(value)||!exact(value,[
      'layoutId','gridDataPath','nativeGridId','nativeSizeX',
      'nativeSizeY','tessellationFactor'
    ])||!path(value.layoutId,'SceneLayouts/')||
       !path(value.gridDataPath,'GridData/')||
       !uint(value.nativeGridId)||seen.has(value.nativeGridId)||
       (value.nativeSizeX===null)!==(value.nativeSizeY===null)||
       (value.nativeSizeX!==null&&(
         !uint(value.nativeSizeX)||value.nativeSizeX<1||
         value.nativeSizeX>65536||!uint(value.nativeSizeY)||
         value.nativeSizeY<1||value.nativeSizeY>65536||
         value.nativeSizeX*value.nativeSizeY>16_777_216))||
       (value.tessellationFactor!==null&&(
         !uint(value.tessellationFactor)||value.tessellationFactor>256)))
      throw new TypeError('DB04_SAVE_SOURCE_WITNESS_ROW_INVALID');
    seen.add(value.nativeGridId);
    if(!identity)identity=value.layoutId+'\0'+value.gridDataPath;
    if(identity!==value.layoutId+'\0'+value.gridDataPath)
      throw new TypeError('DB04_SAVE_SOURCE_WITNESS_MIXED_PATHS');
    if(value.nativeGridId===input.nativeGridId)selected=true;
    return value as unknown as SourceGridWitness;
  });
  if(!selected)
    throw new TypeError('DB04_SAVE_SOURCE_WITNESS_SELECTED_GRID_MISSING');
  return {viewKey:input.viewKey as string,
    nativeGridId:input.nativeGridId as number,sourceRefs};
}

/** Existing DB-05 Rust receipts are validated independently before any
 * lightweight TS UI projection. This function never parses raw Save JSON.
 */
export function projectSavedSourceNumericCandidates(
  queryInput:unknown,instancesInput:unknown,
  sourcesInput:unknown,maxPoints=1200
):SavedGridSourceCandidates {
  const query=validateSourceGridQuery(queryInput);
  if(!Number.isSafeInteger(maxPoints)||maxPoints<1||maxPoints>2000||
     !isRecord(instancesInput)||!isRecord(sourcesInput)||
     instancesInput.contract!=='wand.db05.grid-instance-preview@2'||
     sourcesInput.contract!=='wand.db05.db04-grid-object-source-context@2'||
     !Array.isArray(instancesInput.rows)||
     !Array.isArray(sourcesInput.rows)||
     instancesInput.rows.length!==sourcesInput.rows.length||
     instancesInput.rows.length>20000||
     instancesInput.effectivePlacementVerified!==false||
     instancesInput.legalPlacementVerified!==false||
     instancesInput.sourceGridIdentityVerified!==false||
     instancesInput.stableInstanceIdentityVerified!==false||
     instancesInput.saveWritingAuthorized!==false||
     sourcesInput.savedGridIdentityVerified!==false||
     sourcesInput.savedSourceCoordinateEquivalenceVerified!==false||
     sourcesInput.worldCoordinateTransformVerified!==false||
     sourcesInput.placementLegalityVerified!==false||
     sourcesInput.editPermissionAuthorized!==false||
     sourcesInput.sourceCoverageComplete!==false||
     sourcesInput.sourceArchiveRechecked!==false||
     typeof instancesInput.sampled!=='boolean'||
     !uint(instancesInput.invalidRecords))
    throw new TypeError('DB04_SAVE_SOURCE_RECEIPT_INVALID');
  const complete=!instancesInput.sampled&&instancesInput.invalidRecords===0;
  let count=0,outside=0,missing=0,other=0;
  const points:SavedNumericPoint[]=[];
  for(let i=0;i<instancesInput.rows.length;i++){
    const row=instancesInput.rows[i],match=sourcesInput.rows[i];
    if(!isRecord(row)||!isRecord(match)||
       row.localOrdinal!==i+1||match.localOrdinal!==i+1||
       !uint(row.localGridOrdinal)||row.localGridOrdinal===0||
       typeof row.itemId!=='string'||
       !/^[1-9][0-9]{0,19}$/.test(row.itemId)||
       !['full','diff_modified'].includes(String(row.recordKind))||
       typeof row.coordinatesObserved!=='boolean'||
       (row.x!==null&&!int32(row.x))||
       (row.y!==null&&!int32(row.y))||
       (row.orientation!==null&&(typeof row.orientation!=='string'||
         row.orientation.length>32))||
       !uint(match.candidateCount)||match.candidateCount>2048||
       typeof match.sourceStatus!=='string')
      throw new TypeError('DB04_SAVE_SOURCE_RECEIPT_ROW_INVALID');
    if(!complete||row.recordKind!=='full'||
       match.sourceStatus!=='full_exact_source_path_candidate'||
       match.candidateCount!==1||query.sourceRefs.length!==1){
      other++;continue;
    }
    if(row.coordinatesObserved!==true||row.x===null||row.y===null){
      missing++;continue;
    }
    count++;
    // Purely a numeric-range diagnostic, NEVER the occupied GridData index.
    const witness=query.sourceRefs[0];
    const factor=witness.tessellationFactor;
    const sx=witness.nativeSizeX,sy=witness.nativeSizeY;
    if(sx!==null&&sy!==null&&(factor===1||factor===2)&&
       (row.x<0||row.y<0||row.x>=sx*factor||row.y>=sy*factor))outside++;
    if(points.length<maxPoints)points.push({
      localOrdinal:i+1,localGridOrdinal:row.localGridOrdinal as number,
      itemId:row.itemId,x:row.x as number,y:row.y as number,
      orientation:row.orientation as string|null
    });
  }
  const status:SavedGridSourceCandidates['status']=!complete
    ?'save_grid_inconclusive'
    :count>0?'full_path_pair_numeric_candidates'
    :'no_full_path_pair_candidates';
  return {
    contract:DB04_SAVED_SOURCE_CANDIDATE_CONTRACT,status,
    viewKey:query.viewKey,nativeGridId:query.nativeGridId,
    matchedRecordCount:complete?count:0,
    displayedCount:complete?points.length:0,
    outsideSourceNumericEnvelopeCount:complete?outside:0,
    rowsWithoutCoordinates:complete?missing:0,
    otherOrAmbiguousSaveRecords:other,
    sourceReferenceCount:query.sourceRefs.length,
    dataSampled:!complete||count>points.length,
    points:complete?points:[],
    originalSourcePathsCompared:true,
    saveGridIdentityVerified:false,
    savedAndSourceCoordinatesEquivalent:false,
    playerPlacementVerified:false,sourceTerrainOccupancyVerified:false,
    nativeCollisionRulesVerified:false,legalPlacementVerified:false,
    saveWritingAuthorized:false
  };
}
