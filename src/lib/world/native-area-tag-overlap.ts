/**
 * DB-04 native Village Area × original Item World Tag intersection.
 *
 * "Area" here is an original DefaultVillageData AreaType layout reference;
 * only a subset additionally has a native protoDb Area definition. Names and
 * NavMesh IDs never imply an in-game biome, placement permission, DLC pack
 * ownership, item origin/acquisition or current player Save placement.
 *
 * The client reuses two source-pinned, caller-held private DB-04 indexes.
 * No new game-asset parser, network load, private data export or Save mutation.
 */
import {WorldReferenceIndex,type NativeAreaReference,
  type NativeProtoDbAreaEvidence} from './reference-graph.ts';
import {DB04_NATIVE_SCOPE_CLIENT,DB04_WORLD_TAGS,
  type Db04NativeItemScopeClient,type Db04WorldTag}
  from './native-item-scope.ts';

export const DB04_NATIVE_AREA_TAG_JOIN=
  'wand.db04.native-area-world-tag-overlap@1' as const;
export const DB04_NATIVE_AREA_TAG_PROOF=
  'Meta.DefaultVillageData.areaLayoutReferences_plus_original_Item_World_Tag' as const;
export interface Db04NativeAreaTagCount {
  readonly worldTag:Db04WorldTag;
  readonly originalReferenceRows:number;
  readonly originalInstances:number;
  readonly distinctItemIds:number;
}
export interface Db04NativeAreaCount {
  readonly originalReferenceRows:number;
  readonly originalInstances:number;
  readonly distinctItemIds:number;
}
export interface Db04NativeAreaTagEvidence {
  readonly contract:typeof DB04_NATIVE_AREA_TAG_JOIN;
  readonly proof:typeof DB04_NATIVE_AREA_TAG_PROOF;
  readonly areaRefId:string;
  readonly sourceArea:Readonly<NativeAreaReference>;
  readonly originalProtoDbArea:Readonly<NativeProtoDbAreaEvidence>|null;
  readonly sourceLayoutAreaRelationVerified:true;
  readonly originalProtoDbAreaRecordVerified:boolean;
  readonly nativeGridReferenceCount:number;
  readonly sourceDefaultGridObjectReferenceRows:number;
  readonly sourceDefaultGridObjectInstances:number;
  readonly originalWorldTags:readonly Db04NativeAreaTagCount[];
  readonly noDirectWorldTag:Db04NativeAreaCount;
  readonly outsideFourOriginalItemCategories:Db04NativeAreaCount;
  readonly itemWorldTagAndAreaOverlapVerified:true;
  readonly gameUiBiomeMembershipVerified:false;
  readonly contentPackId:null;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly itemOriginWorldVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly playerSavePlacementVerified:false;
  readonly navMeshPlacementLegalityVerified:false;
  readonly sourceCoverageComplete:false;
}
export interface Db04AreaTagReverseEntry {
  readonly areaRefId:string;
  readonly sourceWorldId:string;
  readonly originalProtoDbAreaRecordVerified:boolean;
  readonly originalReferenceRows:number;
  readonly originalInstances:number;
  readonly distinctItemIds:number;
  readonly nativeWorldTagDoesNotProveBiomeOrDlc:true;
}
export interface Db04NativeAreaTagClient {
  readonly contract:typeof DB04_NATIVE_AREA_TAG_JOIN;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:'1.26.2';
    nativeWorldManifestSha256:string;
    originalItemScopeAuditSha256:string;
    originalItemScopeRowsSha256:string;
    originalTagDefinitionSha256:string;
    privateOnly:true;
    publicationAuthorized:false;
  }>;
  readonly coverage:Readonly<{
    sourceAreaReferences:number;
    nativeProtoDbAreaRecordsVerified:number;
    sourceLayoutOnlyAreaReferences:number;
    areaNativeGridReferences:number;
    sourceDefaultGridObjectReferenceRows:number;
    sourceDefaultGridObjectInstances:number;
    sourceCoverageComplete:false;
  }>;
  listSourceAreas():readonly Db04NativeAreaTagEvidence[];
  areasInSourceWorld(worldId:string):readonly Db04NativeAreaTagEvidence[];
  getSourceArea(areaRefId:string):Db04NativeAreaTagEvidence|null;
  byOriginalWorldTag(tag:Db04WorldTag):readonly Db04AreaTagReverseEntry[];
}
type MutableCount={rows:number;instances:number;itemIds:Set<string>};
const SHA=/^[a-f0-9]{64}$/;
const keys=new Set<string>(DB04_WORLD_TAGS);
const validId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB04_NATIVE_AREA_TAG_'+code);
}
function count():MutableCount{return {rows:0,instances:0,itemIds:new Set()};}
function insert(x:MutableCount,itemId:string,instances:number):void{
  x.rows++;x.instances+=instances;x.itemIds.add(itemId);
  check(Number.isSafeInteger(x.instances),'INSTANCE_OVERFLOW');
}
function finish(x:MutableCount):Db04NativeAreaCount{
  return Object.freeze({
    originalReferenceRows:x.rows,
    originalInstances:x.instances,
    distinctItemIds:x.itemIds.size
  });
}
export function createDb04NativeAreaTagClient(
  world:WorldReferenceIndex,scope:Db04NativeItemScopeClient
):Db04NativeAreaTagClient{
  check(world instanceof WorldReferenceIndex&&
    world.target.platform==='Steam'&&world.target.gameVersion==='1.26.2'&&
    SHA.test(world.target.nativeWorldManifestSha256),
    'WORLD_SOURCE_REQUIRED');
  check(scope?.contract===DB04_NATIVE_SCOPE_CLIENT&&
    scope.source?.platform==='Steam'&&
    scope.source.gameVersion===world.target.gameVersion&&
    scope.source.privateOnly===true&&
    scope.source.publicationAuthorized===false&&
    scope.source.originalItemDefinitions===13202&&
    SHA.test(scope.source.auditSha256)&&
    SHA.test(scope.source.rowsSha256)&&
    SHA.test(scope.source.originalTagSha256)&&
    typeof scope.getItem==='function',
    'PRIVATE_ORIGINAL_ITEM_SCOPE_REQUIRED');

  const byArea=new Map<string,Db04NativeAreaTagEvidence>();
  const byWorld=new Map<string,readonly Db04NativeAreaTagEvidence[]>();
  let nativeProto=0,gridReferences=0,referenceRows=0,instances=0;
  for(const root of world.listSourceWorlds()){
    if(root.worldType!=='village_layout')continue;
    check(root.worldIdKind==='derivedLayoutKey'&&
      root.contentPackId===null&&
      root.contentPackRelationVerified===false,'SOURCE_VILLAGE_IDENTITY');
    const areas:Db04NativeAreaTagEvidence[]=[];
    for(const area of world.areasInWorld(root.worldId)){
      check(!byArea.has(area.areaRefId)&&
        area.worldId===root.worldId&&
        area.sourceProof==='Meta.DefaultVillageData.areaLayoutReferences'&&
        area.sourceWorldRelationVerified===true&&
        area.gameplayBiomeMembershipVerified===false&&
        area.placementLegalityVerified===false,
        'NATIVE_AREA_SOURCE_IDENTITY');
      const proto=world.nativeProtoDbArea(area.areaRefId);
      check(proto.values.length<2&&
        (proto.status==='source_native_verified')===
          (proto.values.length===1)&&
        (area.nativeProtoDbAreaRecordVerified===true)===
          (proto.values.length===1),'NATIVE_PROTODB_AREA_PROOF_MISMATCH');
      const original=proto.values[0]??null;
      if(original!==null){
        check(original.areaRefId===area.areaRefId&&
          original.nativeAreaId===area.nativeAreaId&&
          original.navMeshPlacementLegalityVerified===false,
          'NATIVE_PROTODB_AREA_ID_MISMATCH');
        nativeProto++;
      }
      const nativeGrids=world.gridsInArea(area.areaRefId);
      check(nativeGrids.every(grid=>
        grid.areaRefId===area.areaRefId&&grid.worldId===root.worldId),
        'NATIVE_GRID_AREA_ID_MISMATCH');
      const totalNativeGridInstances=nativeGrids.reduce((n,grid)=>
        n+grid.originalDefaultObjectCount,0);
      check(Number.isSafeInteger(totalNativeGridInstances),
        'NATIVE_GRID_INSTANCE_OVERFLOW');
      const tagCounts=new Map<Db04WorldTag,MutableCount>(
        DB04_WORLD_TAGS.map(tag=>[tag,count()]));
      const untagged=count(),outside=count();
      let offset=0,expectedRows:number|null=null,expectedInstances:number|null=null;
      let areaInstances=0;
      do{
        const page=world.originalPlacementsInArea(area.areaRefId,{
          offset,limit:512
        });
        check(page.scope==='area'&&
          page.scopeId===area.areaRefId&&
          page.scopeIdentityInPartialSource===true&&
          page.sourceCoverageComplete===false&&
          page.itemOriginVerified===false&&
          page.acquisitionLocationVerified===false&&
          page.savedPlayerPlacementVerified===false&&
          page.placementLegalityVerified===false&&
          page.offset===offset&&page.limit===512,
          'NATIVE_AREA_PAGE_CONTRACT');
        if(expectedRows===null){
          expectedRows=page.matchingReferenceRowsInSubset;
          expectedInstances=page.matchingOriginalInstancesInSubset;
        }
        check(expectedRows===page.matchingReferenceRowsInSubset&&
          expectedInstances===page.matchingOriginalInstancesInSubset&&
          page.rows.length===Math.min(512,expectedRows-offset),
          'NATIVE_AREA_PAGE_CONFLICT');
        for(const ref of page.rows){
          check(ref.relation==='nativeSourceDefaultGridObject'&&
            ref.areaRefId===area.areaRefId&&
            ref.worldId===root.worldId&&
            typeof ref.itemId==='string'&&
            validId(ref.instanceCount),'SOURCE_AREA_REF_MISMATCH');
          const id=Number(ref.itemId);
          let target=outside;
          if(validId(id)&&String(id)===ref.itemId){
            const item=scope.getItem(id);
            if(item!==null){
              check(item.itemId===id&&
                Array.isArray(item.worldsDirect)&&
                item.worldsDirect.length<=1&&
                item.worldsDirect.every(tag=>keys.has(tag)),
                'ORIGINAL_ITEM_WORLD_TAG_IDENTITY');
              target=item.worldsDirect.length?
                tagCounts.get(item.worldsDirect[0])!:untagged;
            }
          }
          insert(target,ref.itemId,ref.instanceCount);
          areaInstances+=ref.instanceCount;
          check(Number.isSafeInteger(areaInstances),'SOURCE_AREA_INSTANCES_OVERFLOW');
        }
        offset+=page.rows.length;
        check(page.hasNextPage===(offset<expectedRows)&&
          page.nextOffset===(offset<expectedRows?offset:null),
          'NATIVE_AREA_NEXT_PAGE_MISMATCH');
        if(!page.hasNextPage)break;
      }while(true);
      check(offset===expectedRows&&areaInstances===expectedInstances&&
        totalNativeGridInstances===expectedInstances,
        'AREA_SOURCE_GRID_INSTANCE_CONFLICT');
      const originalWorldTags=Object.freeze(DB04_WORLD_TAGS.map(worldTag=>
        Object.freeze({worldTag,...finish(tagCounts.get(worldTag)!)})));
      const result:Db04NativeAreaTagEvidence=Object.freeze({
        contract:DB04_NATIVE_AREA_TAG_JOIN,
        proof:DB04_NATIVE_AREA_TAG_PROOF,
        areaRefId:area.areaRefId,
        sourceArea:Object.freeze({...area}),
        originalProtoDbArea:original,
        sourceLayoutAreaRelationVerified:true as const,
        originalProtoDbAreaRecordVerified:original!==null,
        nativeGridReferenceCount:nativeGrids.length,
        sourceDefaultGridObjectReferenceRows:expectedRows,
        sourceDefaultGridObjectInstances:expectedInstances,
        originalWorldTags,
        noDirectWorldTag:finish(untagged),
        outsideFourOriginalItemCategories:finish(outside),
        itemWorldTagAndAreaOverlapVerified:true as const,
        gameUiBiomeMembershipVerified:false as const,
        contentPackId:null,contentPackRelationVerified:false as const,
        dlcEntitlementVerified:false as const,
        itemOriginWorldVerified:false as const,
        acquisitionWorldVerified:false as const,
        playerSavePlacementVerified:false as const,
        navMeshPlacementLegalityVerified:false as const,
        sourceCoverageComplete:false as const
      });
      byArea.set(area.areaRefId,result);
      areas.push(result);
      gridReferences+=nativeGrids.length;
      referenceRows+=offset;
      instances+=areaInstances;
    }
    byWorld.set(root.worldId,Object.freeze(areas));
  }
  const all=Object.freeze([...byArea.values()]);
  const source=Object.freeze({
    platform:'Steam' as const,gameVersion:'1.26.2' as const,
    nativeWorldManifestSha256:world.target.nativeWorldManifestSha256,
    originalItemScopeAuditSha256:scope.source.auditSha256,
    originalItemScopeRowsSha256:scope.source.rowsSha256,
    originalTagDefinitionSha256:scope.source.originalTagSha256,
    privateOnly:true as const,publicationAuthorized:false as const
  });
  const coverage=Object.freeze({
    sourceAreaReferences:all.length,
    nativeProtoDbAreaRecordsVerified:nativeProto,
    sourceLayoutOnlyAreaReferences:all.length-nativeProto,
    areaNativeGridReferences:gridReferences,
    sourceDefaultGridObjectReferenceRows:referenceRows,
    sourceDefaultGridObjectInstances:instances,
    sourceCoverageComplete:false as const
  });
  return Object.freeze({
    contract:DB04_NATIVE_AREA_TAG_JOIN,source,coverage,
    listSourceAreas:()=>all,
    areasInSourceWorld(worldId:string):readonly Db04NativeAreaTagEvidence[]{
      check(typeof worldId==='string'&&worldId.length>0&&worldId.length<=512,
        'INVALID_WORLD_ID');
      return byWorld.get(worldId)??Object.freeze([]);
    },
    getSourceArea(areaRefId:string):Db04NativeAreaTagEvidence|null{
      check(typeof areaRefId==='string'&&areaRefId.length>0&&
        areaRefId.length<=512,'INVALID_AREA_REF_ID');
      return byArea.get(areaRefId)??null;
    },
    byOriginalWorldTag(worldTag:Db04WorldTag):readonly Db04AreaTagReverseEntry[]{
      check(typeof worldTag==='string'&&keys.has(worldTag),
        'INVALID_WORLD_TAG');
      return Object.freeze(all.flatMap(area=>{
        const value=area.originalWorldTags.find(x=>x.worldTag===worldTag)!;
        return value.originalReferenceRows?
          [Object.freeze({
            areaRefId:area.areaRefId,
            sourceWorldId:area.sourceArea.worldId!,
            originalProtoDbAreaRecordVerified:area.originalProtoDbAreaRecordVerified,
            originalReferenceRows:value.originalReferenceRows,
            originalInstances:value.originalInstances,
            distinctItemIds:value.distinctItemIds,
            nativeWorldTagDoesNotProveBiomeOrDlc:true as const
          })]:[];
      }));
    }
  });
}
