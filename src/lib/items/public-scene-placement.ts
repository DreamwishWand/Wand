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
          selector=keys[0]??'none';
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
export function createScenePlacementReader(db:PublicCompleteItemMaster){
  const s=db.release.sourceFilesSha256;
  const pinned=db.release.target.platform==='Steam'&&db.release.sourceIl2cppDumpSha256===DUMP&&
    s?.Furniture===FURNITURE&&s?.Building===BUILDING&&s?.Scene===SCENE&&s?.Tag===TAG;
  let ready:Promise<boolean>|undefined;
  function verified(){
    if(!ready){
      ready=(async()=>{
        if(!pinned)return false;
        const c=new Map((await db.getFieldCatalog()).map(x=>[x.field,x.count]));
        return c.get('source.SceneType')===193&&c.has('source.GridEditRestriction')&&
          c.has('source.GridAreaData.AcceptedFloorTypesFlag')&&c.has('tags')&&c.has('nativeCategory');
      })();
      void ready.catch(()=>{ready=undefined;});
    }
    return ready;
  }
  async function getForScene(itemIds:readonly number[],sceneItemId:number,sceneFloorMask?:number):
    Promise<readonly (Readonly<ScenePlacementEvidence>|null)[]>{
    check(Array.isArray(itemIds)&&itemIds.length<=10000&&itemIds.every(id)&&id(sceneItemId),'IDS');
    check(sceneFloorMask===undefined||uint32(sceneFloorMask),'FLOOR_MASK');
    const indexed=await verified();
    let scene:Readonly<NativeSceneIdentity>|null=null;
    if(indexed){
      const [row]=await db.getItemFields([sceneItemId],['nativeCategory','source.SceneType','tags']);
      check(row?.values.nativeCategory==='Scene','SCENE_ID');
      const rawType=row.values['source.SceneType'],tags=row.values.tags;
      check((rawType===undefined||code(rawType))&&Array.isArray(tags)&&
        tags.every(t=>obj(t)&&id(t.id)&&t.sourceField===17),'SCENE_FACTS');
      const sceneTypeCode=rawType??0;
      scene=Object.freeze({sceneItemId,sceneTypeCode,sceneTypeName:NATIVE_SCENE_TYPES[sceneTypeCode],
        sceneTypeFieldPresent:rawType!==undefined,
        directTagIds:Object.freeze(tags.map(t=>(t as Obj).id as number))});
    }
    const rows=await db.getItemFields(itemIds,indexed?['nativeCategory','source.GridEditRestriction','source.GridAreaData.AcceptedFloorTypesFlag']:['itemId']);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const decoration=r.values.nativeCategory==='Furniture'||r.values.nativeCategory==='Building';
      const status:ScenePlacementEvidence['status']=!indexed?'not_indexed':decoration?'indexed':'not_decoration';
      const gate=scene&&decoration?evaluateStaticSceneGate(r.values['source.GridEditRestriction'],scene):null;
      const rawMask=r.values['source.GridAreaData.AcceptedFloorTypesFlag'];
      check(rawMask===undefined||uint32(rawMask),'ITEM_FLOOR_MASK');
      const acceptedFloorMask=decoration&&uint32(rawMask)?rawMask:null;
      const floorMaskOverlap=acceptedFloorMask===null||sceneFloorMask===undefined?null:
        ((acceptedFloorMask&sceneFloorMask)>>>0)!==0;
      return Object.freeze({itemId:r.itemId,status,scene,gate,acceptedFloorMask,floorMaskOverlap,placementLegalityVerified:false as const});
    }));
  }
  return Object.freeze({release:db.release,getForScene});
}
