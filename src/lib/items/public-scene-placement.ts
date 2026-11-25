/** Static original CanPlace scene gate; NOT a placement or save-edit permission.
 * Native Steam 1.26.2 IGridEditRestriction.CanPlace (0x41059d0) checks
 * PlaceRestriction.IsValidScene (0x3900d10) before IsValidCustomRestriction
 * (0x3900f30). Missing restriction/CanPlace returns true. Scene/SceneType
 * compare exact IDs/enums; SceneWithTag/SceneWithoutTag call HasTag / negation.
 * SceneItemData implements IHasTags but not IHasSet in the pinned dump.
 */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';

const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const FURNITURE='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196';
const BUILDING='e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0';
const SCENE='d8fc56cfc282323df94461e360c26aaf98a884f01b7bd83cabf967ac2cd397d5';
const TAG='bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4';
const NATIVE_SCENE_TYPES=['Main','Village','Castle','PlayerHouse','House','DisneyWorld','Restaurant','IntroScene','Store','Cave','BoardGame','Boutique','FloatingIsland','Exhibition','VillageArea'] as const;
const KEYS=['Scene','SceneType','SceneWithTag','SceneWithoutTag'] as const;
// These declarations have a serialized GridEditRestriction field and a
// direct getter. Request furniture has a computed getter; other classes
// without that interface must not be assigned an open native scene gate.
const DIRECT_CLASSES=new Set(['FurnitureItemData','LandscapingItemData','FurnitureBlockerItemData',
  'FurnitureAncientMachineItemData','BuildingItemData','StallBuildingItemData','GardenItemData']);
const ROOM_MASK=3072, TERRAIN_MASK=(0x3fffffff&~(3072|4096|262144|1048576|2097152))>>>0;
const SPECIAL_OR_SURFACE_MASK=(4096|262144|1048576|2097152|0xc0000000)>>>0;
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const code=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<NATIVE_SCENE_TYPES.length;
const uint32=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=0xffffffff;
function check(v:unknown,why:string):asserts v{if(!v)throw new TypeError('DB01_SCENE_PLACEMENT_'+why);}
export interface NativeSceneIdentity {
  readonly sceneItemId:number;
  readonly sceneTypeCode:number;
  readonly sceneTypeName:typeof NATIVE_SCENE_TYPES[number];
  readonly sceneTypeFieldPresent:boolean;
  readonly directTagIds:readonly number[];
}
export interface StaticSceneGate {
  readonly selector:'none'|typeof KEYS[number]|'unresolved';
  readonly selectorValue:number|null;
  readonly sceneMatch:boolean|null;
  readonly customRestrictionCount:number|null;
  readonly gate:'passes_static_scene_gate'|'fails_static_scene_gate'|'custom_conditions_required'|'unresolved';
  readonly placementLegalityVerified:false;
}
/** Missing grid restriction is only a positive gate when caller has verified
 * the exact original source coverage. Unknown nested fields never pass. */
export function evaluateStaticSceneGate(restriction:unknown,scene:Readonly<NativeSceneIdentity>):Readonly<StaticSceneGate>{
  let selector:StaticSceneGate['selector']='none',selectorValue:number|null=null,sceneMatch:boolean|null=true,customRestrictionCount:number|null=0;
  if(restriction!==undefined){
    if(!obj(restriction)||Object.hasOwn(restriction,'_unresolvedFields')){
      selector='unresolved';sceneMatch=null;customRestrictionCount=null;
    }else if(restriction.CanPlace!==undefined){
      const p=restriction.CanPlace;
      if(!obj(p)||Object.hasOwn(p,'_unresolvedFields')){
        selector='unresolved';sceneMatch=null;customRestrictionCount=null;
      }else{
        const keys=KEYS.filter(k=>Object.hasOwn(p,k));
        const validKeys=new Set<string>([...KEYS,'CustomRestrictions']);
        if(keys.length>1||Object.keys(p).some(k=>!validKeys.has(k))){
          selector='unresolved';sceneMatch=null;customRestrictionCount=null;
        }else{
          selector=keys.length===0?'none':keys[0];
          const value=selector==='none'?null:p[selector];
          if(selector==='SceneType'?!code(value):selector!=='none'&&!id(value)){
            selector='unresolved';sceneMatch=null;
          }else{
            selectorValue=value as number|null;
            if(selector==='Scene')sceneMatch=value===scene.sceneItemId;
            else if(selector==='SceneType')sceneMatch=value===scene.sceneTypeCode;
            else if(selector==='SceneWithTag')sceneMatch=scene.directTagIds.includes(value as number);
            else if(selector==='SceneWithoutTag')sceneMatch=!scene.directTagIds.includes(value as number);
          }
          const custom=p.CustomRestrictions;
          customRestrictionCount=custom===undefined?0:Array.isArray(custom)?custom.length:null;
        }
      }
    }
  }
  const gate:StaticSceneGate['gate']=sceneMatch===false?'fails_static_scene_gate':
    sceneMatch===null||customRestrictionCount===null?'unresolved':
    customRestrictionCount>0?'custom_conditions_required':'passes_static_scene_gate';
  return Object.freeze({selector,selectorValue,sceneMatch,customRestrictionCount,gate,placementLegalityVerified:false});
}
export interface ScenePlacementEvidence {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed'|'not_decoration';
  readonly scene:Readonly<NativeSceneIdentity>|null;
  readonly gate:Readonly<StaticSceneGate>|null;
  readonly acceptedFloorMask:number|null;
  /** Source floor bit overlap, never a claim of empty/legal tiles. */
  readonly floorMaskOverlap:boolean|null;
  readonly placementLegalityVerified:false;
}
export interface OrdinaryDecorationScopeEvidence {
  readonly itemId:number;
  readonly scopeHint:'indoor'|'outdoor'|'both'|'unknown';
  readonly roomFloorWallCandidate:boolean|null;
  readonly terrainCandidate:boolean|null;
  readonly ordinaryPlayerHouseSceneIds:readonly number[];
  readonly ordinaryOutdoorSceneIds:readonly number[];
  readonly acceptedFloorMask:number|null;
  readonly placementLegalityVerified:false;
}
function modeCandidate(mask:number|null,bitMask:number,gates:readonly Readonly<StaticSceneGate>[]):boolean|null{
  if(mask===null||!gates.length)return null;
  if(gates.every(g=>g.gate==='fails_static_scene_gate'))return false;
  const hasBit=((mask&bitMask)>>>0)!==0;
  if(!hasBit)return ((mask&SPECIAL_OR_SURFACE_MASK)>>>0)!==0?null:false;
  if(gates.some(g=>g.gate==='passes_static_scene_gate'))return true;
  return null;
}
export function createScenePlacementReader(db:PublicCompleteItemMaster){
  const s=db.release.sourceFilesSha256;
  const pinned=db.release.target.platform==='Steam'&&db.release.sourceIl2cppDumpSha256===DUMP&&
    s?.Furniture===FURNITURE&&s?.Building===BUILDING&&s?.Scene===SCENE&&s?.Tag===TAG;
  let sceneTask:Promise<ReadonlyMap<number,Readonly<NativeSceneIdentity>>|null>|undefined;
  function scenes(){
    if(!sceneTask){
      const task=(async()=>{
        if(!pinned)return null;
        const c=new Set((await db.getFieldCatalog()).map(x=>x.field));
        if(!['source.SceneType','source.GridEditRestriction','source.GridAreaData.AcceptedFloorTypesFlag','source.Tags','nativeCategory','sourceClass'].every(f=>c.has(f)))return null;
        const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'Scene'});
        const rows=await db.getItemFields(ids,['nativeCategory','source.SceneType','source.Tags']);
        if(rows.length!==194)return null;
        const result=new Map<number,Readonly<NativeSceneIdentity>>();
        let explicitType=0,tagged=0;
        for(const row of rows){
          check(row?.values.nativeCategory==='Scene','SCENE_ID');
          const rawType=row.values['source.SceneType'],tags=row.values['source.Tags']??[];
          check((rawType===undefined||code(rawType))&&Array.isArray(tags)&&tags.every(id),'SCENE_FACTS');
          const sceneTypeCode=rawType??0;
          if(rawType!==undefined)explicitType++;
          if(tags.length)tagged++;
          result.set(row.itemId,Object.freeze({sceneItemId:row.itemId,sceneTypeCode,sceneTypeName:NATIVE_SCENE_TYPES[sceneTypeCode],
            sceneTypeFieldPresent:rawType!==undefined,directTagIds:Object.freeze([...tags] as number[])}));
        }
        // Original Scene.json complete scan: 194 rows; 193 explicit enum,
        // five scene tag rows. Refuse a partial attribute projection.
        if(explicitType!==193||tagged!==5)return null;
        return result;
      })();
      sceneTask=task;void task.catch(()=>{if(sceneTask===task)sceneTask=undefined;});
    }
    return sceneTask;
  }
  const fieldNames=['nativeCategory','sourceClass','source.GridEditRestriction','source.GridAreaData.AcceptedFloorTypesFlag'];
  const supports=(v:Obj)=>typeof v.sourceClass==='string'&&DIRECT_CLASSES.has(v.sourceClass);
  function maskOf(v:Obj){
    const raw=v['source.GridAreaData.AcceptedFloorTypesFlag'];
    check(raw===undefined||uint32(raw),'ITEM_FLOOR_MASK');
    return uint32(raw)?raw:null;
  }
  async function getForScene(itemIds:readonly number[],sceneItemId:number,sceneFloorMask?:number):
    Promise<readonly (Readonly<ScenePlacementEvidence>|null)[]>{
    check(Array.isArray(itemIds)&&itemIds.length<=10000&&itemIds.every(id)&&id(sceneItemId),'IDS');
    check(sceneFloorMask===undefined||uint32(sceneFloorMask),'FLOOR_MASK');
    const allScenes=await scenes();
    const scene=allScenes?.get(sceneItemId)??null;
    if(allScenes)check(scene,'SCENE_ID');
    const rows=await db.getItemFields(itemIds,scene?fieldNames:['itemId']);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const decoration=r.values.nativeCategory==='Furniture'||r.values.nativeCategory==='Building';
      const status:ScenePlacementEvidence['status']=!scene?'not_indexed':!decoration?'not_decoration':supports(r.values)?'indexed':'not_indexed';
      const gate=scene&&decoration&&supports(r.values)?evaluateStaticSceneGate(r.values['source.GridEditRestriction'],scene):null;
      const acceptedFloorMask=decoration?maskOf(r.values):null;
      const floorMaskOverlap=acceptedFloorMask===null||sceneFloorMask===undefined?null:
        ((acceptedFloorMask&sceneFloorMask)>>>0)!==0;
      return Object.freeze({itemId:r.itemId,status,scene,gate,acceptedFloorMask,floorMaskOverlap,placementLegalityVerified:false as const});
    }));
  }
  /** Ordinary home / village / floating island source context only. Does
   * not describe every special realm, room, surface or legal grid cell.
   * Do not use as permission to write an edited save. */
  async function getForOrdinaryDecorationModes(itemIds:readonly number[]):Promise<readonly (Readonly<OrdinaryDecorationScopeEvidence>|null)[]>{
    check(Array.isArray(itemIds)&&itemIds.length<=10000&&itemIds.every(id),'IDS');
    const allScenes=await scenes();
    const room=[...(allScenes?.values()??[])].filter(s=>s.sceneTypeCode===3);
    const terrain=[...(allScenes?.values()??[])].filter(s=>s.sceneTypeCode===1||s.sceneTypeCode===12);
    const roomIds=Object.freeze(room.map(s=>s.sceneItemId)),terrainIds=Object.freeze(terrain.map(s=>s.sceneItemId));
    const rows=await db.getItemFields(itemIds,allScenes?fieldNames:['itemId']);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const mask=maskOf(r.values),known=!!allScenes&&supports(r.values);
      const gates=(group:readonly NativeSceneIdentity[])=>known?group.map(s=>evaluateStaticSceneGate(r.values['source.GridEditRestriction'],s)):[];
      const roomFloorWallCandidate=modeCandidate(mask,ROOM_MASK,gates(room)),
        terrainCandidate=modeCandidate(mask,TERRAIN_MASK,gates(terrain));
      const scopeHint:OrdinaryDecorationScopeEvidence['scopeHint']=roomFloorWallCandidate===true&&terrainCandidate===true?'both':
        roomFloorWallCandidate===true&&terrainCandidate===false?'indoor':
        roomFloorWallCandidate===false&&terrainCandidate===true?'outdoor':'unknown';
      return Object.freeze({itemId:r.itemId,scopeHint,roomFloorWallCandidate,terrainCandidate,
        ordinaryPlayerHouseSceneIds:roomIds,ordinaryOutdoorSceneIds:terrainIds,acceptedFloorMask:mask,
        placementLegalityVerified:false as const});
    }));
  }
  return Object.freeze({release:db.release,getForScene,getForOrdinaryDecorationModes});
}
