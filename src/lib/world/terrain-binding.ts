/** Native source-local terrain mapping verified against Steam v1.26.2
 * GameAssembly SHA a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653.
 * Grid.GetFloorType @ 0x42AF470 divides each integer by TessellationFactor;
 * Grid.Contains @ 0x42AF520 delegates to GridData.Contains @ 0x39078F0.
 * GridObject.Position reads the serialized X and Y; no axis swap or offset.
 * This is not world/scene transform, actual occupancy, or collision legality.
 */
import type {SourceObjectShape} from './source-object-map.ts';
import type {SavedNumericPoint,SourceGridWitness,SavedGridSourceCandidates} from './saved-grid-source-candidates.ts';
export interface TerrainRaster{readonly sizeX:number;readonly sizeY:number;readonly nativeFloorValues:Uint32Array}
export interface TerrainBinding{readonly raster:TerrainRaster;readonly factor:1|2;readonly verifiedGridOrdinals:readonly number[]}
export interface TerrainWarningRun{readonly x:number;readonly y:number;readonly width:number;readonly reason:'outside'|'floor-mismatch'}
const rec=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const uint=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=0xffffffff;
const int=(x:unknown):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=-2147483648&&x<=2147483647;
export interface TerrainScopeReceipt{readonly receipt:SavedGridSourceCandidates;readonly verifiedGridOrdinals:readonly number[]}
export function projectTerrainSession(value:unknown,scopes:readonly {key:string;witness:SourceGridWitness}[]):TerrainScopeReceipt[]{
  if(!rec(value)||value.contract!=='wand.db05.db04-terrain-session@1'||!Array.isArray(value.rows)||value.rows.length>20000||
    !Array.isArray(value.bindings)||value.bindings.length>value.rows.length||value.sourceCoverageComplete!==false||
    value.effectivePlacementVerified!==false||value.worldCoordinatesVerified!==false||value.placementLegalityVerified!==false||value.saveWritingAuthorized!==false)
    throw Error('DB04_TERRAIN_SESSION_INVALID');
  const points:SavedNumericPoint[][]=scopes.map(()=>[]),matched=scopes.map(()=>0),missing=scopes.map(()=>0),outside=scopes.map(()=>0);
  const eligible=scopes.map(()=>new Set<number>()),seen=new Set<number>();
  for(const b of value.bindings){
    if(!rec(b)||!uint(b.localOrdinal)||b.localOrdinal<1||b.localOrdinal>value.rows.length||seen.has(b.localOrdinal)||
       !uint(b.sourceRefIndex)||b.sourceRefIndex>=scopes.length||typeof b.sourceLocalCoordinateMappingVerified!=='boolean'||
       (b.savedFactor!==null&&!uint(b.savedFactor)))throw Error('DB04_TERRAIN_BINDING_INVALID');
    seen.add(b.localOrdinal);
    const row=value.rows[b.localOrdinal-1],i=b.sourceRefIndex,w=scopes[i].witness;
    if(!rec(row)||row.localOrdinal!==b.localOrdinal||!uint(row.localGridOrdinal)||row.localGridOrdinal<1||
       row.recordKind!=='full'||typeof row.itemId!=='string'||!/^[1-9][0-9]{0,19}$/.test(row.itemId)||
       typeof row.coordinatesObserved!=='boolean'||(row.orientation!==null&&(typeof row.orientation!=='string'||row.orientation.length>32)))
       throw Error('DB04_TERRAIN_ROW_INVALID');
    if(b.sourceLocalCoordinateMappingVerified){
      if(b.savedFactor!==w.tessellationFactor||!(b.savedFactor===1||b.savedFactor===2)||w.nativeSizeX===null||w.nativeSizeY===null)throw Error('DB04_TERRAIN_FACTOR_MISMATCH');
      eligible[i].add(row.localGridOrdinal);
    }
    if(!row.coordinatesObserved){missing[i]++;continue;}
    if(!int(row.x)||!int(row.y))throw Error('DB04_TERRAIN_COORD_INVALID');
    matched[i]++;
    const factor=w.tessellationFactor;
    if(w.nativeSizeX!==null&&w.nativeSizeY!==null&&(factor===1||factor===2)&&
      (row.x<0||row.y<0||row.x>=w.nativeSizeX*factor||row.y>=w.nativeSizeY*factor))outside[i]++;
    // A complete per-scope projection, no silent 1200-row truncation.
    points[i].push({localOrdinal:b.localOrdinal,localGridOrdinal:row.localGridOrdinal,itemId:row.itemId,
      x:row.x,y:row.y,orientation:row.orientation as string|null});
  }
  return scopes.map((s,i)=>({verifiedGridOrdinals:[...eligible[i]],receipt:{
    contract:'wand.db04.saved-source-numeric-candidates@1',status:matched[i]?'full_path_pair_numeric_candidates':'no_full_path_pair_candidates',
    viewKey:s.key,nativeGridId:s.witness.nativeGridId,matchedRecordCount:matched[i],displayedCount:points[i].length,
    outsideSourceNumericEnvelopeCount:outside[i],rowsWithoutCoordinates:missing[i],otherOrAmbiguousSaveRecords:0,sourceReferenceCount:1,
    dataSampled:false,points:points[i],originalSourcePathsCompared:true,saveGridIdentityVerified:false,
    savedAndSourceCoordinatesEquivalent:false,playerPlacementVerified:false,sourceTerrainOccupancyVerified:false,
    nativeCollisionRulesVerified:false,legalPlacementVerified:false,saveWritingAuthorized:false
  }}));
}
export function terrainFloorAt(binding:TerrainBinding,x:number,y:number):number|null{
  const {raster,factor}=binding;
  if(!int(x)||!int(y)||x<0||y<0||x>=raster.sizeX*factor||y>=raster.sizeY*factor)return null;
  return raster.nativeFloorValues[Math.trunc(y/factor)*raster.sizeX+Math.trunc(x/factor)]??null;
}
export function terrainWarnings(binding:TerrainBinding,shape:SourceObjectShape,x:number,y:number):TerrainWarningRun[]{
  const runs:TerrainWarningRun[]=[];
  if(!int(x)||!int(y)||shape.cellCount>65536)return runs;
  for(const run of shape.runs){
    const yy=y+run.y;
    let activeIndex=-1;
    for(let xx=x+run.x;xx<x+run.x+run.width;xx++){
      const floor=terrainFloorAt(binding,xx,yy);
      const reason=floor===null?'outside':shape.acceptedFloorTypesFlag!==undefined&&
        (floor&shape.acceptedFloorTypesFlag)===0?'floor-mismatch':null;
      const active=activeIndex>=0?runs[activeIndex]:undefined;
      if(reason&&active&&active.reason===reason&&active.x+active.width===xx){
        runs[activeIndex]={...active,width:active.width+1};
      }else if(reason){activeIndex=runs.length;runs.push({x:xx,y:yy,width:1,reason});}
      else activeIndex=-1;
    }
  }
  return runs;
}
