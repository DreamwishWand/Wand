/**
 * DB-04 local source-reference graph browsing, not a World Editor.
 *
 * Intended to run in a Web Worker against the independently constructor-
 * checked, owner-private WorldReferenceIndex. It projects bounded source-only
 * IDs/counts to Svelte without transferring the raw original JSON graph.
 * No inference of DLC rights, gameplay biome, current Save coordinates, or
 * item acquisition from source default GridObjects.
 */
import {
  WorldReferenceIndex, type NativeSourceItemReference,
  type OriginalSourcePlacementPage
} from './reference-graph.ts';

export const DB04_GRAPH_BROWSER_CONTRACT='wand.db04.native-graph-browser@1' as const;
export type Db04GraphScope='world'|'area'|'grid'|'unlinked_world';
export interface Db04GraphOption {
  readonly id:string;
  readonly label:string;
  readonly worldId:string|null;
  readonly areaRefId:string|null;
  readonly layoutId:string;
  /** Original GridDataPath, NOT a saved numeric Grid.ID. */
  readonly gridDataPath:string|null;
  readonly nativeGridId:number|null;
  readonly sourceDefaultInstances:number|null;
  readonly nativeParentWorldId:string|null;
  readonly nativeUniverseTagItemId:number|null;
}
export interface Db04GraphBrowserCatalog {
  readonly contract:typeof DB04_GRAPH_BROWSER_CONTRACT;
  readonly sourcePlatform:'Steam';
  readonly sourceGameVersion:'1.26.2';
  readonly sourceWorldManifestSha256:string;
  readonly sourceWorlds:readonly Db04GraphOption[];
  readonly sourceAreas:readonly Db04GraphOption[];
  readonly sourceGrids:readonly Db04GraphOption[];
  readonly totalSourceDefaultInstances:number;
  readonly worldUnlinkedSourceDefaultInstances:number;
  readonly sourceCoverageComplete:false;
  readonly originalSourceAuthenticationVerified:false;
  readonly contentPackIdsVerified:false;
  readonly gameplayBiomeMembershipVerified:false;
  readonly savedPlayerPlacementVerified:false;
}
export interface Db04GraphBrowserQuery {
  readonly scope:Db04GraphScope;
  readonly scopeId:string|null;
  readonly exactItemId?:string;
  readonly offset:number;
  readonly limit:number;
}
export interface Db04GraphBrowserRow {
  readonly itemId:string;
  readonly sourceDefaultInstances:number;
  readonly gridRefId:string;
  readonly sourceWorldId:string|null;
  readonly sourceAreaRefId:string|null;
}
export interface Db04GraphBrowserPage {
  readonly contract:typeof DB04_GRAPH_BROWSER_CONTRACT;
  readonly scope:Db04GraphScope;
  readonly scopeId:string|null;
  readonly exactItemId:string|null;
  readonly sourceScopeReferenceVerified:boolean;
  readonly originalSourceReferenceRows:number;
  readonly originalSourceInstances:number;
  readonly distinctItemIds:number;
  readonly offset:number;
  readonly limit:number;
  readonly rows:readonly Db04GraphBrowserRow[];
  readonly hasNextPage:boolean;
  readonly nextOffset:number|null;
  readonly sourceDefaultOnly:true;
  readonly sourceCoverageComplete:false;
  readonly contentPackRelationVerified:false;
  readonly originalItemOriginVerified:false;
  readonly acquisitionLocationVerified:false;
  readonly currentPlayerSavePlacementVerified:false;
  readonly placementLegalityVerified:false;
}
export interface Db04GraphBrowser {
  readonly catalog:Db04GraphBrowserCatalog;
  page(query:Db04GraphBrowserQuery):Db04GraphBrowserPage;
}
const validString=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=1100;
const integer=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const itemId=(x:unknown):x is string=>
  typeof x==='string'&&/^[1-9][0-9]{0,19}$/.test(x)&&
  BigInt(x)<=18446744073709551615n;
function check(x:unknown,reason:string):asserts x{
  if(!x)throw new TypeError('DB04_GRAPH_BROWSER_'+reason);
}
function view(row:NativeSourceItemReference):Db04GraphBrowserRow{
  return Object.freeze({
    itemId:row.itemId,
    sourceDefaultInstances:row.instanceCount,
    gridRefId:row.gridRefId,
    sourceWorldId:row.worldId,
    sourceAreaRefId:row.areaRefId
  });
}
export function createDb04GraphBrowser(
  index:WorldReferenceIndex
):Db04GraphBrowser{
  check(index instanceof WorldReferenceIndex&&
    index.target.platform==='Steam'&&
    index.target.gameVersion==='1.26.2'&&
    /^[a-f0-9]{64}$/.test(index.target.nativeWorldManifestSha256)&&
    index.coverage.sourceCoverageComplete===false&&
    index.coverage.allDlcAndAdventurePackIdsVerified===false,
    'PRIVATE_STEAM1262_SOURCE_REQUIRED');
  const source=index.toDb00WorldRelationsSidecar();
  check(source.privateOnly===true&&
    source.publicationAuthorized===false&&
    source.doesNotOverwriteDb00ItemWorlds===true,
    'SOURCE_CANNOT_BE_PUBLISHED');
  const worlds=Object.freeze(index.listSourceWorlds().map(w=>Object.freeze({
    id:w.worldId,
    label:w.worldId,
    worldId:w.worldId,
    areaRefId:null,
    layoutId:w.defaultLayoutId,
    gridDataPath:null,
    nativeGridId:null,
    sourceDefaultInstances:null,
    nativeParentWorldId:w.nativeParentWorldId??null,
    nativeUniverseTagItemId:w.nativeUniverseTagItemId
  } satisfies Db04GraphOption)));
  const areas=Object.freeze(source.areas.map(a=>Object.freeze({
    id:a.areaRefId,
    label:a.nativeAreaTypeName===null?
      a.areaRefId:`${a.nativeAreaTypeName} · ${a.areaRefId}`,
    worldId:a.worldId,
    areaRefId:a.areaRefId,
    layoutId:a.gridLayoutId,
    gridDataPath:null,
    nativeGridId:null,
    sourceDefaultInstances:null,
    nativeParentWorldId:null,
    nativeUniverseTagItemId:null
  } satisfies Db04GraphOption)));
  const grids=Object.freeze(source.gridRefs.map(g=>Object.freeze({
    id:g.gridRefId,
    label:`Grid ${g.nativeGridId} · ${g.layoutId}`,
    worldId:g.worldId,
    areaRefId:g.areaRefId,
    layoutId:g.layoutId,
    gridDataPath:g.gridDataPath,
    nativeGridId:g.nativeGridId,
    sourceDefaultInstances:g.originalDefaultObjectCount,
    nativeParentWorldId:null,
    nativeUniverseTagItemId:null
  } satisfies Db04GraphOption)));
  const ids={
    world:new Set(worlds.map(x=>x.id)),
    area:new Set(areas.map(x=>x.id)),
    grid:new Set(grids.map(x=>x.id))
  };
  const catalog:Db04GraphBrowserCatalog=Object.freeze({
    contract:DB04_GRAPH_BROWSER_CONTRACT,
    sourcePlatform:'Steam' as const,
    sourceGameVersion:'1.26.2' as const,
    sourceWorldManifestSha256:index.target.nativeWorldManifestSha256,
    sourceWorlds:worlds,sourceAreas:areas,sourceGrids:grids,
    totalSourceDefaultInstances:index.coverage.sourceInitialGridObjects,
    worldUnlinkedSourceDefaultInstances:
      index.coverage.sourceInitialGridObjectsWithoutVerifiedWorldLink,
    sourceCoverageComplete:false as const,
    originalSourceAuthenticationVerified:false as const,
    contentPackIdsVerified:false as const,
    gameplayBiomeMembershipVerified:false as const,
    savedPlayerPlacementVerified:false as const
  });
  function originalPage(q:Db04GraphBrowserQuery):OriginalSourcePlacementPage{
    const selection={offset:q.offset,limit:q.limit};
    switch(q.scope){
      case 'world':return index.originalPlacementsInWorld(q.scopeId!,selection);
      case 'area':return index.originalPlacementsInArea(q.scopeId!,selection);
      case 'grid':return index.originalPlacementsInGrid(q.scopeId!,selection);
      case 'unlinked_world':return index.originalPlacementsWithoutWorld(selection);
    }
  }
  return Object.freeze({
    catalog,
    page(q:Db04GraphBrowserQuery):Db04GraphBrowserPage{
      check(q!==null&&typeof q==='object'&&
        ['world','area','grid','unlinked_world'].includes(q.scope)&&
        integer(q.offset)&&integer(q.limit)&&q.limit>=1&&q.limit<=128,
        'INVALID_QUERY');
      const scope=q.scope;
      const isUnlinked=scope==='unlinked_world';
      check((isUnlinked&&q.scopeId===null)||
        (!isUnlinked&&validString(q.scopeId)&&ids[scope].has(q.scopeId)),
        'UNKNOWN_SOURCE_SCOPE');
      const filter=q.exactItemId||'';
      check(filter===''||itemId(filter),'INVALID_EXACT_ITEM_ID');
      let refs:readonly NativeSourceItemReference[];
      let totalRows:number,totalInstances:number,distinct:number,
        nextOffset:number|null;
      let hasNextPage:boolean;
      if(filter!==''){
        const same=index.initialSourcePlacement(filter).values.filter(r=>
          scope==='unlinked_world'?r.worldId===null:
          scope==='world'?r.worldId===q.scopeId:
          scope==='area'?r.areaRefId===q.scopeId:
          r.gridRefId===q.scopeId
        );
        totalRows=same.length;
        totalInstances=same.reduce((sum,row)=>sum+row.instanceCount,0);
        check(Number.isSafeInteger(totalInstances),'INSTANCE_OVERFLOW');
        distinct=totalRows>0?1:0;
        refs=same.slice(q.offset,q.offset+q.limit);
        hasNextPage=q.offset+refs.length<totalRows;
        nextOffset=hasNextPage?q.offset+refs.length:null;
      }else{
        const page=originalPage(q);
        check(page.scope===scope&&
          page.scopeId===q.scopeId&&
          page.scopeIdentityInPartialSource===true&&
          page.sourceCoverageComplete===false&&
          page.itemOriginVerified===false&&
          page.acquisitionLocationVerified===false&&
          page.savedPlayerPlacementVerified===false&&
          page.placementLegalityVerified===false,
          'ORIGINAL_SOURCE_PAGE_MISMATCH');
        refs=page.rows;
        totalRows=page.matchingReferenceRowsInSubset;
        totalInstances=page.matchingOriginalInstancesInSubset;
        distinct=page.distinctItemIdsInSubset;
        hasNextPage=page.hasNextPage;
        nextOffset=page.nextOffset;
      }
      return Object.freeze({
        contract:DB04_GRAPH_BROWSER_CONTRACT,
        scope,scopeId:q.scopeId,exactItemId:filter||null,
        sourceScopeReferenceVerified:true,
        originalSourceReferenceRows:totalRows,
        originalSourceInstances:totalInstances,
        distinctItemIds:distinct,
        offset:q.offset,limit:q.limit,
        rows:Object.freeze(refs.map(view)),
        hasNextPage,nextOffset,
        sourceDefaultOnly:true as const,
        sourceCoverageComplete:false as const,
        contentPackRelationVerified:false as const,
        originalItemOriginVerified:false as const,
        acquisitionLocationVerified:false as const,
        currentPlayerSavePlacementVerified:false as const,
        placementLegalityVerified:false as const
      });
    }
  });
}
