import type {WorldPreviewCatalog} from './preview-views.ts';

type RecordValue=Record<string,unknown>;
const record=(v:unknown):v is RecordValue=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=0xffffffff;
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;

export function createDiffGridWitness(catalog:WorldPreviewCatalog,layoutId:string,nativeGridId:number,platform:string,gameVersion:string){
 if(platform!=='Steam'||gameVersion!=='1.26.2')return null;
 const layout=catalog.layouts.get(layoutId);
 if(!record(layout)||layout.layoutKind!=='nativeGridCollection'||!record(layout.source))return null;
 const type=layout.source.nativeType;
 let layoutType:string|null=null;
 if(type==='Meta.GridCollection')layoutType='Meta.GridCollection, Meta';
 else if(type==='realm_source_with_embedded_Meta.GridCollection')layoutType='Meta.DefaultRealmData, Meta';
 else if(type==='offgrid_source_with_embedded_Meta.GridCollection')layoutType='Meta.DefaultOffGridBuildingData, Meta';
 else if(type==='floating_island_source_with_embedded_Meta.GridCollection')layoutType='Meta.DefaultFloatingIslandData, Meta';
 else if(type==='interior_source_with_embedded_Meta.GridCollection'){
   if(layoutId.startsWith('SceneLayouts/Houses/PlayerHouse'))layoutType='Meta.DefaultPlayerHouseData, Meta';
   else if(/^SceneLayouts\/Houses\/[^/]+House\//.test(layoutId))layoutType='Meta.DefaultCharacterHouseData, Meta';
   else if(layoutId.startsWith('SceneLayouts/Rooms/Boutique/'))layoutType='Meta.DefaultBoutiqueBuildingData, Meta';
 }
 if(!layoutType||!Array.isArray(layout.nativeGridEntries))return null;
 const matches=layout.nativeGridEntries.filter((e:unknown)=>record(e)&&e.gridIdNative===nativeGridId);
 if(matches.length!==1)return null;
 const entry=matches[0] as RecordValue;
 if(entry.defaultHashEvidence!=='source_native_method_correlated'||!int(entry.defaultGridHashCode)||
    !int(entry.defaultGridDataHashCode)||typeof entry.gridDataPath!=='string'||!catalog.grids.has(entry.gridDataPath)||
    !uint(entry.defaultObjectCount)||entry.defaultObjectCount>100000)return null;
 const rows=(catalog.layoutObjectsByLayout.get(layoutId)??[]).filter((v:unknown)=>record(v)&&v.gridIdNative===nativeGridId);
 if(rows.length!==entry.defaultObjectCount)return null;
 const seen=new Set<number>();
 const defaultObjects=rows.map((v:unknown)=>{
   if(!record(v)||!uint(v.gridObjectIdNative)||seen.has(v.gridObjectIdNative)||!uint(v.itemId)||v.itemId===0||
       !int(v.x)||!int(v.y)||!uint(v.orientationCode)||v.orientationCode>15)throw Error('DIFFGRID_DEFAULT_OBJECT_INVALID');
   seen.add(v.gridObjectIdNative);
   return {gridObjectIdNative:v.gridObjectIdNative,itemId:v.itemId,x:v.x,y:v.y,orientationCode:v.orientationCode,
       plainSource:v.stateSha256===null&&v.stateByteCount===0&&v.fromNativeCode===null};
 });
 const terrain=catalog.grids.get(entry.gridDataPath);
 const factor=entry.tessellationFactor;
 const gridBounds=terrain&&uint(terrain.sizeX)&&uint(terrain.sizeY)&&terrain.sizeX>0&&terrain.sizeY>0&&
    terrain.sizeX<=65536&&terrain.sizeY<=65536&&terrain.sizeX*terrain.sizeY<=16777216&&(factor===1||factor===2)
    ?{width:terrain.sizeX*factor,height:terrain.sizeY*factor,factor}:null;
 return {contract:'wand.db05.diffgrid-effective-witness@1',gameVersion,platform,layoutId,layoutType,nativeGridId,
    hashes:[entry.defaultGridHashCode,entry.defaultGridDataHashCode],defaultObjects,gridBounds};
}

export interface DiffGridPoint{readonly itemId:string;readonly x:number;readonly y:number;readonly orientation:string;readonly origin:'default'|'modified'|'added'}
export interface EffectiveDiffGridPreview{
 readonly grids:readonly {readonly localGridOrdinal:number;readonly points:readonly DiffGridPoint[];readonly lookupEnumerationDivergenceCount:number}[];
 readonly hashMismatchCount:number;readonly unresolvedCount:number;
}
export function parseEffectiveDiffGridPreview(v:unknown):EffectiveDiffGridPreview{
 if(!record(v)||v.contract!=='wand.db05.diffgrid-effective-preview@1'||v.sourceAuthenticityVerified!==false||
    v.saveWritingAuthorized!==false||v.placementLegalityVerified!==false||!uint(v.hashMismatchCount)||!uint(v.unresolvedCount)||
    !Array.isArray(v.grids)||v.grids.length>8192)throw Error('DIFFGRID_PREVIEW_INVALID');
 let total=0;
 const grids=v.grids.map((g:unknown,i:number)=>{
   if(!record(g)||g.localGridOrdinal!==i+1||!uint(g.lookupEnumerationDivergenceCount)||!Array.isArray(g.points)||
      (total+=g.points.length)>100000)throw Error('DIFFGRID_PREVIEW_GRID_INVALID');
   const points=g.points.map((p:unknown):DiffGridPoint=>{
      if(!record(p)||typeof p.itemId!=='string'||!/^[1-9][0-9]{0,9}$/.test(p.itemId)||!uint(Number(p.itemId))||
         !int(p.x)||!int(p.y)||typeof p.orientation!=='string'||p.orientation.length>32||
         (p.origin!=='default'&&p.origin!=='modified'&&p.origin!=='added'))throw Error('DIFFGRID_PREVIEW_POINT_INVALID');
      return {itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation,origin:p.origin};
   });
   return {localGridOrdinal:i+1,points,lookupEnumerationDivergenceCount:g.lookupEnumerationDivergenceCount};
 });
 return {grids,hashMismatchCount:v.hashMismatchCount,unresolvedCount:v.unresolvedCount};
}
