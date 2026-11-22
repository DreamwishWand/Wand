/**
 * DB-04 read-only finder for exact ORIGINAL default GridObject anchors.
 *
 * This API never maps coordinates to a player Save, world-space position,
 * terrain cell, occupancy footprint or legal placement. Scan runs in the
 * dedicated local World Worker, never on the Svelte main thread.
 */
import {getSourceAnchorDomain} from './native-anchor-domain.ts';

export const DB04_NATIVE_ITEM_ANCHOR_FINDER=
  'wand.db04.native-item-anchor-finder@1' as const;

export type OriginalItemAnchorFindStatus=
  'found'|'not_in_source_grid'|'original_grid_not_in_source'|
  'source_game_version_unverified'|'original_anchor_domain_unverified'|
  'match_index_out_of_range';

export interface OriginalItemAnchorFindResult {
  readonly contract:typeof DB04_NATIVE_ITEM_ANCHOR_FINDER;
  readonly status:OriginalItemAnchorFindStatus;
  readonly sourceLayoutId:string;
  readonly nativeGridId:number;
  readonly itemId:number;
  readonly requestedMatchIndex:number;
  readonly matchingOriginalDefaultObjectCount:number;
  readonly matchedIndex:number|null;
  readonly gridObjectIdNative:number|null;
  readonly sourceAnchorX:number|null;
  readonly sourceAnchorY:number|null;
  readonly coordinateBasis:'original_native_grid_local_anchor_only';
  readonly partialSourceOnly:true;
  readonly savedGridIdentityVerified:false;
  readonly worldCoordinatesVerified:false;
  readonly terrainCellProjectionVerified:false;
  readonly footprintOccupancyVerified:false;
  readonly placementLegalityVerified:false;
}
type Row=Record<string,unknown>;
type IndexedSource={
  manifest:Row;
  layoutObjectsByGrid:Map<string,Map<number,Row[]>>;
};
const record=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const uint=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function checkedSource(value:unknown):IndexedSource{
  if(!record(value)||!record(value.manifest)||
     !(value.layoutObjectsByGrid instanceof Map))
    throw new TypeError('DB04_ITEM_ANCHOR_SOURCE_INDEX_REQUIRED');
  return value as unknown as IndexedSource;
}
function reply(
  status:OriginalItemAnchorFindStatus,
  layoutId:string,gridId:number,itemId:number,offset:number,
  count:number,found:Row|null
):OriginalItemAnchorFindResult {
  return Object.freeze({
    contract:DB04_NATIVE_ITEM_ANCHOR_FINDER,
    status,sourceLayoutId:layoutId,nativeGridId:gridId,itemId,
    requestedMatchIndex:offset,
    matchingOriginalDefaultObjectCount:count,
    matchedIndex:status==='found'?offset:null,
    gridObjectIdNative:status==='found'?found!.gridObjectIdNative as number:null,
    sourceAnchorX:status==='found'?found!.x as number:null,
    sourceAnchorY:status==='found'?found!.y as number:null,
    coordinateBasis:'original_native_grid_local_anchor_only' as const,
    partialSourceOnly:true as const,
    savedGridIdentityVerified:false as const,
    worldCoordinatesVerified:false as const,
    terrainCellProjectionVerified:false as const,
    footprintOccupancyVerified:false as const,
    placementLegalityVerified:false as const
  });
}

/**
 * Find one requested occurrence of a numeric Item ID in ONE exact source
 * (SceneLayouts path, native Grid.ID) pair. Returns source-local X/Y only.
 * The response is deliberately bounded regardless of match count.
 */
export function findOriginalItemAnchor(
  source:unknown,layoutId:string,nativeGridId:number,
  itemId:number,requestedMatchIndex=0
):OriginalItemAnchorFindResult {
  const catalog=checkedSource(source);
  if(typeof layoutId!=='string'||layoutId.length>1024||
     !/^SceneLayouts\/(?:[A-Za-z0-9_!.-]+\/)*[A-Za-z0-9_!.-]+\.json$/.test(layoutId)||
     layoutId.split('/').some(part=>part==='.'||part==='..')||
     !uint(nativeGridId)||nativeGridId>0xffffffff||
     !uint(itemId)||itemId===0||
     !uint(requestedMatchIndex)||requestedMatchIndex>1_000_000)
    throw new TypeError('DB04_ITEM_ANCHOR_INVALID_EXACT_SOURCE_QUERY');
  if(catalog.manifest.platform!=='Steam'||
     catalog.manifest.gameVersion!=='1.26.2')
    return reply('source_game_version_unverified',layoutId,nativeGridId,
      itemId,requestedMatchIndex,0,null);
  const domain=getSourceAnchorDomain(source,layoutId,nativeGridId);
  if(!domain)return reply('original_grid_not_in_source',layoutId,
    nativeGridId,itemId,requestedMatchIndex,0,null);
  if(domain.status==='tessellation_coordinate_relation_unverified')
    return reply('original_anchor_domain_unverified',layoutId,
      nativeGridId,itemId,requestedMatchIndex,0,null);
  const rows=catalog.layoutObjectsByGrid.get(layoutId)?.get(nativeGridId)??[];
  if(!Array.isArray(rows)||rows.length!==domain.defaultObjectCount||
     rows.length>1_000_000)
    throw new TypeError('DB04_ITEM_ANCHOR_SOURCE_COUNT_MISMATCH');
  let matches=0;
  let found:Row|null=null;
  for(const row of rows){
    if(!record(row)||row.layoutId!==layoutId||
       row.gridIdNative!==nativeGridId||
       !uint(row.gridObjectIdNative)||row.gridObjectIdNative>0xffffffff||
       row.layoutObjectId!==layoutId+'#grid='+nativeGridId+
         '#object='+row.gridObjectIdNative||
       !uint(row.itemId)||!uint(row.x)||!uint(row.y)||
       row.x>=domain.anchorSizeX||row.y>=domain.anchorSizeY)
      throw new TypeError('DB04_ITEM_ANCHOR_INVALID_ORIGINAL_OBJECT');
    if(row.itemId!==itemId)continue;
    if(matches===requestedMatchIndex)found=row;
    matches++;
  }
  const status:OriginalItemAnchorFindStatus=matches===0
    ?'not_in_source_grid':found?'found':'match_index_out_of_range';
  return reply(status,layoutId,nativeGridId,itemId,
    requestedMatchIndex,matches,found);
}


/**
 * Browse a private, partially extracted original World snapshot by Item ID
 * WITHOUT knowing a world, layout or native Grid.ID in advance.
 *
 * The result points to ONE original GridObject source anchor. Candidate order
 * is source catalog insertion order (stable for the same local archive), not
 * a game-time order or world-position sort. The full matching count is read
 * inside the Worker; only one bounded record crosses to Svelte per request.
 */
export const DB04_GLOBAL_ORIGINAL_ITEM_ANCHOR_FINDER=
  'wand.db04.global-original-item-anchor-finder@1' as const;
export type GlobalOriginalItemAnchorStatus=
  'found'|'not_in_partial_original_source'|
  'match_index_out_of_range'|'source_game_version_unverified'|
  'source_anchor_domain_unverified';
export interface GlobalOriginalItemAnchorResult {
  readonly contract:typeof DB04_GLOBAL_ORIGINAL_ITEM_ANCHOR_FINDER;
  readonly status:GlobalOriginalItemAnchorStatus;
  readonly itemId:number;
  readonly requestedMatchIndex:number;
  readonly matchingOriginalDefaultObjectCount:number;
  readonly unverifiedOriginalDefaultObjectCount:number;
  readonly matchedIndex:number|null;
  readonly sourceLayoutId:string|null;
  readonly nativeGridId:number|null;
  readonly gridDataPath:string|null;
  readonly gridObjectIdNative:number|null;
  readonly sourceAnchorX:number|null;
  readonly sourceAnchorY:number|null;
  readonly coordinateBasis:'original_native_grid_local_anchor_only';
  readonly partialSourceOnly:true;
  readonly savedGridIdentityVerified:false;
  readonly worldCoordinatesVerified:false;
  readonly terrainCellProjectionVerified:false;
  readonly footprintOccupancyVerified:false;
  readonly placementLegalityVerified:false;
}
interface Candidate {
  readonly sourceLayoutId:string;
  readonly nativeGridId:number;
  readonly gridDataPath:string;
  readonly gridObjectIdNative:number;
  readonly sourceAnchorX:number;
  readonly sourceAnchorY:number;
}
function globalReply(
  status:GlobalOriginalItemAnchorStatus,itemId:number,requestedMatchIndex:number,
  matching:number,unverified:number,record:Candidate|null
):GlobalOriginalItemAnchorResult{
  return Object.freeze({
    contract:DB04_GLOBAL_ORIGINAL_ITEM_ANCHOR_FINDER,
    status,itemId,requestedMatchIndex,
    matchingOriginalDefaultObjectCount:matching,
    unverifiedOriginalDefaultObjectCount:unverified,
    matchedIndex:status==='found'?requestedMatchIndex:null,
    sourceLayoutId:record?.sourceLayoutId??null,
    nativeGridId:record?.nativeGridId??null,
    gridDataPath:record?.gridDataPath??null,
    gridObjectIdNative:record?.gridObjectIdNative??null,
    sourceAnchorX:record?.sourceAnchorX??null,
    sourceAnchorY:record?.sourceAnchorY??null,
    coordinateBasis:'original_native_grid_local_anchor_only' as const,
    partialSourceOnly:true as const,
    savedGridIdentityVerified:false as const,
    worldCoordinatesVerified:false as const,
    terrainCellProjectionVerified:false as const,
    footprintOccupancyVerified:false as const,
    placementLegalityVerified:false as const
  });
}
export function findOriginalItemAnchorAcrossGrids(
  source:unknown,itemId:number,requestedMatchIndex=0
):GlobalOriginalItemAnchorResult{
  const catalog=checkedSource(source);
  if(!uint(itemId)||itemId===0||!uint(requestedMatchIndex)||
     requestedMatchIndex>1_000_000)
    throw new TypeError('DB04_GLOBAL_ITEM_ANCHOR_QUERY_INVALID');
  if(catalog.manifest.platform!=='Steam'||
     catalog.manifest.gameVersion!=='1.26.2')
    return globalReply('source_game_version_unverified',
      itemId,requestedMatchIndex,0,0,null);
  let matching=0,unverified=0;
  let selected:Candidate|null=null;
  // This is the already-built, read-only native per-layout Grid index, not
  // a join on numeric Grid.ID across layouts or saved-map IDs.
  for(const [layoutId,gridBuckets] of catalog.layoutObjectsByGrid){
    if(typeof layoutId!=='string'||!layoutId.startsWith('SceneLayouts/')||
       !(gridBuckets instanceof Map))
      throw new TypeError('DB04_GLOBAL_ITEM_ANCHOR_LAYOUT_INDEX_INVALID');
    for(const [nativeGridId,rows] of gridBuckets){
      if(!uint(nativeGridId)||nativeGridId>0xffffffff||
         !Array.isArray(rows)||rows.length>1_000_000)
        throw new TypeError('DB04_GLOBAL_ITEM_ANCHOR_GRID_INDEX_INVALID');
      // No need to validate unrelated original records on every query.
      // The source catalog was already parsed and checked at load time.
      const present=rows.filter((row:unknown)=>
        record(row)&&row.itemId===itemId);
      if(present.length===0)continue;
      const domain=getSourceAnchorDomain(source,layoutId,nativeGridId);
      if(!domain||
         domain.status==='tessellation_coordinate_relation_unverified'){
        unverified+=present.length;
        continue;
      }
      if(domain.defaultObjectCount!==rows.length)
        throw new TypeError('DB04_GLOBAL_ITEM_ANCHOR_COUNT_MISMATCH');
      for(const row of present){
        if(!record(row)||row.layoutId!==layoutId||
           row.gridIdNative!==nativeGridId||
           !uint(row.gridObjectIdNative)||row.gridObjectIdNative>0xffffffff||
           row.layoutObjectId!==layoutId+'#grid='+nativeGridId+
             '#object='+row.gridObjectIdNative||
           !uint(row.x)||!uint(row.y)||
           row.x>=domain.anchorSizeX||row.y>=domain.anchorSizeY)
          throw new TypeError('DB04_GLOBAL_ITEM_ANCHOR_INVALID_OBJECT');
        if(matching===requestedMatchIndex)
          selected={
            sourceLayoutId:layoutId,nativeGridId,
            gridDataPath:domain.gridDataPath,
            gridObjectIdNative:row.gridObjectIdNative as number,
            sourceAnchorX:row.x as number,sourceAnchorY:row.y as number
          };
        matching++;
      }
    }
  }
  const status:GlobalOriginalItemAnchorStatus=selected?'found':
    matching>0?'match_index_out_of_range':
    unverified>0?'source_anchor_domain_unverified':
    'not_in_partial_original_source';
  return globalReply(status,itemId,requestedMatchIndex,
    matching,unverified,selected);
}
