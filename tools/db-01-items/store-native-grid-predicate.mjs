/** Build-only ItemGridFilter.Matches projection, pinned to original Steam 1.26.2.
 * GridSizeQualifierData from protoDb record 88. The ignore-size branch is a direct IHasTags.Tags membership test.
 * Absent tag data keeps an otherwise failing bypass route unresolved.
 */
export const GRID_QUALIFIER_SOURCE=Object.freeze({
  recordIndex:88,recordSha256:'99a5348bc8a6688173c5435f9ff0a33b627b44eb8cbc498b7225a214ab203409',
  sourceProtoDbSha256:'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623',
  nativeAssemblySha256:'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653',
  areaRanges:[[0,1,1],[2,16,2],[17,64,3],[65,999999999,4]],
  wallRanges:[[0,1,1],[2,4,2],[5,7,3],[8,999999999,4]]
});
const integer=v=>Number.isSafeInteger(v);
const positive=v=>integer(v)&&v>0&&v<=2147483647;
export function evaluateSourceGridPredicate(g,f,directTagIds){
  const result={status:'unresolved',sourceGridValidity:null,wallBranch:null,sizeQualifierCode:null,
    minimumPassed:null,maximumPassed:null,qualifierPassed:null,excludedLayersPassed:null,
    ignoreTagBranchRequired:!!f.ignoreSizeForTags?.length,basePredicatePassed:null,
    qualifierSourceRecordIndex:GRID_QUALIFIER_SOURCE.recordIndex,
    qualifierSourceRecordSha256:GRID_QUALIFIER_SOURCE.recordSha256,
    sourceProtoDbSha256:GRID_QUALIFIER_SOURCE.sourceProtoDbSha256,
    nativeAssemblySha256:GRID_QUALIFIER_SOURCE.nativeAssemblySha256,
    runtimeTagMatchingVerified:false,storeMembershipVerified:false,currentAvailabilityVerified:false};
  const knownTags=Array.isArray(directTagIds)&&directTagIds.every(v=>integer(v)&&v>0);
  result.directTagPredicateVerified=knownTags;
  result.matchedIgnoreSizeTagIds=knownTags?(f.ignoreSizeForTags??[]).filter(t=>directTagIds.includes(t)):null;
  const finish=passed=>{
    result.basePredicatePassed=passed;
    result.status=passed?'passed':result.ignoreTagBranchRequired&&!knownTags?'unresolved':'failed';
    return result;
  };
  const min=f.minArea,max=f.maxArea;
  if(!min&&!max&&!f.sizeQualifiers?.length&&!f.excludedLayers?.length)return finish(true);
  if(result.matchedIgnoreSizeTagIds?.length){result.status='passed';return result;}
  const x=g?.SizeX,y=g?.SizeY,layers=g?.Layers,flag=g?.AcceptedFloorTypesFlag;
  if(!g||!integer(x)||!integer(y)||!Array.isArray(layers))return result;
  if(!positive(x)||!positive(y)||!positive(x*y)||layers.length!==x*y){
    result.sourceGridValidity=false;return finish(false);
  }
  if(!layers.every(v=>integer(v)&&v>=0&&v<=0xffffffff))return result;
  result.sourceGridValidity=true;
  if(!integer(flag)||flag<0||flag>2147483647)return result;
  const wall=(flag&2048)!==0;result.wallBranch=wall;
  const measure=wall?x:x*y,ranges=wall?GRID_QUALIFIER_SOURCE.wallRanges:GRID_QUALIFIER_SOURCE.areaRanges;
  const range=ranges.find(([lo,hi])=>measure>=lo&&measure<=hi);
  result.sizeQualifierCode=range?range[2]:null;
  if(f.sizeQualifiers?.length&&!range)return result;
  result.qualifierPassed=!f.sizeQualifiers?.length||f.sizeQualifiers.includes(result.sizeQualifierCode);
  // Minimum and maximum accept transposition independently. For a wall
  // X is constrained and Y is compared with 1 / INT_MAX instead.
  result.minimumPassed=!min||(wall?x>=min[0]&&y>=1:
    x>=min[0]&&y>=min[1]||f.canRotate===true&&y>=min[0]&&x>=min[1]);
  result.maximumPassed=!max||(wall?x<=max[0]&&y<=2147483647:
    x<=max[0]&&y<=max[1]||f.canRotate===true&&y<=max[0]&&x<=max[1]);
  result.excludedLayersPassed=!(f.excludedLayers??[]).some(mask=>layers.some(value=>(value&mask)!==0));
  // GridArea.Create rejects simultaneous Clear+Blocking. Do not predict
  // a successful native call on an exceptional input.
  if(layers.some(v=>(v&96)===96))return result;
  return finish(result.minimumPassed&&result.maximumPassed&&result.qualifierPassed&&result.excludedLayersPassed);
}
