/**
 * DB-02 Steam 1.26.2 original Source Object -> LootTable references.
 *
 * Exact source-field ID references were extracted offline from native frame
 * messages (not string similarity). The 375 metadata rows contain NO original
 * game bytes; the three original full-file SHA-256 hashes remain attached.
 *
 * Object -> LootTable is confirmed as an original definition reference.
 * LootTable -> possible Item ID is still STATIC and NOT a guaranteed drop.
 */
import {
  ACTIVITY_ITEM_LOOT_REFS,FURNITURE_LOOT_REFS
} from './native-loot-object-references.data.ts';
import {
  DB02_NATIVE_LOOT_SOURCE_SCHEMA,
  type NativeLootSourceIndex
} from './native-loot-source-families.ts';
import type {OriginProvenance} from './origins.ts';

export const DB02_LOOT_OBJECT_REFERENCES_SCHEMA='wand.db02.native-loot-object-references@1' as const;
const TABLE_BASE=2090000000;
const ID=/^[1-9][0-9]{0,15}$/;
export const DB02_LOOT_OBJECT_ORIGINAL_SHA256=Object.freeze({
  activityItem:'4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2',
  furniture:'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',
  lootTable:'580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c'
});
const EMPTY_REFS=Object.freeze([]) as readonly NativeLootObjectReference[];
const EMPTY_CANDIDATES=Object.freeze([]) as readonly ItemLootObjectCandidate[];

export type NativeLootObjectFamily='ActivityItem'|'Furniture';
export type NativeLootObjectWirePath='protobuf.8'|'protobuf.9'|
  'protobuf.11.1'|'protobuf.12';

export interface NativeLootObjectReference {
  readonly sourceObjectItemId:string;
  readonly sourceFamily:NativeLootObjectFamily;
  readonly sourceFile:'itemlist/ActivityItem.json'|'itemlist/Furniture.json';
  readonly sourceOriginalSha256:string;
  readonly sourceWirePath:NativeLootObjectWirePath;
  readonly lootTableId:string;
  readonly lootTableOriginalSha256:string;
  readonly sourceDefinitionRefVerified:true;
  readonly lootContextVerified:false;
  readonly actualDropVerified:false;
  readonly playerUnlockVerified:false;
}
export interface ItemLootObjectCandidate {
  readonly itemId:string;
  readonly lootOriginId:string;
  readonly lootTableId:string;
  readonly nativeNameKey:string;
  readonly staticLootProvenance:OriginProvenance;
  readonly sourceObject:NativeLootObjectReference;
  readonly sourceDefinitionRefVerified:true;
  readonly actualDropVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface NativeLootObjectReferenceCoverage {
  readonly originalGameVersion:'1.26.2';
  readonly originalPlatform:'Steam';
  readonly activityItemReferences:203;
  readonly furnitureReferences:172;
  readonly allDefinitionReferences:375;
  readonly distinctObjectItemIds:375;
  readonly distinctReferencedLootTableIds:295;
  readonly directMissionJsonLootTableIdReferences:0;
  readonly directObjectTableReferencesVerified:true;
  readonly gameplayDropSemanticsVerified:false;
  readonly completeAllNativeSourceFamilies:false;
}
export interface NativeLootObjectReferenceIndex {
  readonly schema:typeof DB02_LOOT_OBJECT_REFERENCES_SCHEMA;
  readonly coverage:NativeLootObjectReferenceCoverage;
  getLootTableReferrers(tableId:number|string):readonly NativeLootObjectReference[];
  getObjectLootTableReferences(objectItemId:number|string):readonly NativeLootObjectReference[];
  /** Join an item from SRC-02's static LootTable candidates to its native referrers.
   * NOT proof that breaking/opening a named object produces the item. */
  getItemPotentialObjectSources(
    itemId:number|string,lootIndex:NativeLootSourceIndex
  ):readonly ItemLootObjectCandidate[];
}

function ensure(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_LOOT_OBJECT_'+code);
}
function canonicalId(value:unknown):string{
  const s=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  ensure(typeof s==='string'&&ID.test(s)&&Number.isSafeInteger(Number(s)),'INVALID_ID');
  return s;
}
function add<K,V>(map:Map<K,V[]>,key:K,row:V):void{
  const found=map.get(key);
  if(found)found.push(row);else map.set(key,[row]);
}
function freezeMap<K,V>(map:Map<K,V[]>):void{
  for(const v of map.values())Object.freeze(v);
}
function build():NativeLootObjectReferenceIndex{
  const byObject=new Map<string,NativeLootObjectReference[]>();
  const byTable=new Map<string,NativeLootObjectReference[]>();
  const unique=new Set<string>();
  let count=0;
  const insert=(objectId:number,suffix:number,
    family:NativeLootObjectFamily,field:NativeLootObjectWirePath):void=>{
    ensure(Number.isSafeInteger(objectId)&&objectId>0&&
      Number.isSafeInteger(suffix)&&suffix>=0&&suffix<=2000,
      'INVALID_SOURCE_ROW');
    const sourceObjectItemId=canonicalId(objectId);
    const lootTableId=canonicalId(TABLE_BASE+suffix);
    const key=family+':'+sourceObjectItemId+':'+field+':'+lootTableId;
    ensure(!unique.has(key),'DUPLICATE_SOURCE_REFERENCE');
    unique.add(key);
    const isActivity=family==='ActivityItem';
    const ref:NativeLootObjectReference=Object.freeze({
      sourceObjectItemId,sourceFamily:family,
      sourceFile:isActivity?'itemlist/ActivityItem.json':'itemlist/Furniture.json',
      sourceOriginalSha256:isActivity?
        DB02_LOOT_OBJECT_ORIGINAL_SHA256.activityItem:
        DB02_LOOT_OBJECT_ORIGINAL_SHA256.furniture,
      sourceWirePath:field,lootTableId,
      lootTableOriginalSha256:DB02_LOOT_OBJECT_ORIGINAL_SHA256.lootTable,
      sourceDefinitionRefVerified:true,
      lootContextVerified:false,actualDropVerified:false,playerUnlockVerified:false
    });
    add(byTable,lootTableId,ref);
    add(byObject,sourceObjectItemId,ref);
    count++;
  };
  for(const [sourceId,tableSuffix,field] of ACTIVITY_ITEM_LOOT_REFS){
    const path:NativeLootObjectWirePath=field===11?'protobuf.11.1':
      field===8?'protobuf.8':'protobuf.9';
    insert(sourceId,tableSuffix,'ActivityItem',path);
  }
  for(const [sourceId,tableSuffix] of FURNITURE_LOOT_REFS)
    insert(sourceId,tableSuffix,'Furniture','protobuf.12');
  ensure(ACTIVITY_ITEM_LOOT_REFS.length===203 &&
    FURNITURE_LOOT_REFS.length===172&&count===375&&
    byObject.size===375&&byTable.size===295,'ORIGINAL_SOURCE_CENSUS');
  freezeMap(byTable);freezeMap(byObject);
  const coverage:NativeLootObjectReferenceCoverage=Object.freeze({
    originalGameVersion:'1.26.2',originalPlatform:'Steam',
    activityItemReferences:203,furnitureReferences:172,
    allDefinitionReferences:375,distinctObjectItemIds:375,
    distinctReferencedLootTableIds:295,
    directMissionJsonLootTableIdReferences:0,
    directObjectTableReferencesVerified:true,
    gameplayDropSemanticsVerified:false,
    completeAllNativeSourceFamilies:false
  });
  return Object.freeze({
    schema:DB02_LOOT_OBJECT_REFERENCES_SCHEMA,
    coverage,
    getLootTableReferrers(raw:string|number){
      return byTable.get(canonicalId(raw))??EMPTY_REFS;
    },
    getObjectLootTableReferences(raw:string|number){
      return byObject.get(canonicalId(raw))??EMPTY_REFS;
    },
    getItemPotentialObjectSources(raw:string|number,lootIndex:NativeLootSourceIndex){
      const itemId=canonicalId(raw);
      ensure(lootIndex?.schema===DB02_NATIVE_LOOT_SOURCE_SCHEMA&&
        typeof lootIndex.getItemCandidates==='function',
        'LOOT_ORIGIN_INDEX_REQUIRED');
      const routes=lootIndex.getItemCandidates(itemId);
      if(!routes.length)return EMPTY_CANDIDATES;
      const out:ItemLootObjectCandidate[]=[];
      const used=new Set<string>();
      for(const route of routes){
        ensure(route.itemId===itemId&&route.routeStatus==='static_candidate_only'&&
          route.acquisitionContextVerified===false,
          'SOURCE_LOOT_CANDIDATE_NOT_STATIC');
        for(const sourceObject of byTable.get(route.lootTableId)??EMPTY_REFS){
          const key=route.originId+'\0'+sourceObject.sourceObjectItemId;
          if(used.has(key))continue;
          used.add(key);
          out.push(Object.freeze({
            itemId,lootOriginId:route.originId,
            lootTableId:route.lootTableId,nativeNameKey:route.nativeNameKey,
            staticLootProvenance:route.source,sourceObject,
            sourceDefinitionRefVerified:true,
            actualDropVerified:false,currentAvailabilityVerified:false
          }));
        }
      }
      return Object.freeze(out);
    }
  });
}
/** Shared immutable public original-definition reference index. */
export const nativeLootObjectReferenceIndex=build();
