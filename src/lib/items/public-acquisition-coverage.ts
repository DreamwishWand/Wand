/** Actual current canonical acquisition coverage, not the pinned legacy
 * source-sidecar census. Count definition scope separately from collectibility. */
import type {PublicCompleteItemMaster,ItemDefinitionScope} from './public-item-master.ts';
import {DB02_ACQUISITION_CATEGORY_ORDER,type GameNativeItemCategory} from '../acquisition/game-native-item-categories.ts';
export interface AcquisitionCoverageCounts {
  readonly definitions:number;
  readonly classified:number;
  readonly unclassified:number;
  readonly newlyClassifiedSinceLegacy:number;
  readonly byCategory:Readonly<Record<GameNativeItemCategory,number>>;
}
export interface NativeCollectionCoverageCounts {
  readonly candidates:number;
  readonly eligible:number;
  readonly excluded:number;
  readonly unknown:number;
  readonly eligibleClassified:number;
  readonly eligibleUnclassified:number;
  readonly excludedClassified:number;
  readonly excludedUnclassified:number;
  readonly unknownClassified:number;
  readonly unknownUnclassified:number;
}
export interface NativeCollectionCoverage {
  readonly total:Readonly<NativeCollectionCoverageCounts>;
  readonly byNativeCategory:Readonly<Record<string,Readonly<NativeCollectionCoverageCounts>>>;
  readonly eligibleUnclassifiedItemIds:readonly number[];
  readonly unknownUnclassifiedItemIds:readonly number[];
  readonly runtimeMembershipVerified:false;
}
export interface CurrentAcquisitionCoverage {
  readonly sourceGameVersion:string;
  readonly release:string;
  readonly status:'indexed'|'not_indexed';
  readonly all:Readonly<AcquisitionCoverageCounts>|null;
  readonly byDefinitionScope:Readonly<Record<string,Readonly<AcquisitionCoverageCounts>>>;
  readonly byNativeCategory:Readonly<Record<string,Readonly<AcquisitionCoverageCounts>>>;
  readonly collectionCandidatesByNativeCategory:Readonly<Record<string,Readonly<AcquisitionCoverageCounts>>>;
  readonly collectionSourceCandidates:Readonly<AcquisitionCoverageCounts>|null;
  /** Only the verified CharacterItemData.CanBeCollected predicate, not full collection UI membership. */
  readonly nativeCharacterCollectionPredicate:Readonly<{definitions:number;eligible:number;excluded:number;eligibleClassified:number;eligibleUnclassified:number}>|null;
  /** Static native predicates only; absent or unresolved predicates remain unknown. */
  readonly nativeCollectionCoverage:Readonly<NativeCollectionCoverage>|null;
  readonly unresolvedOnlineHintItemIds:number|null;
  readonly missingItemIdMeans:'unclassified_not_unobtainable';
  readonly runtimeMembershipVerified:false;
  readonly currentAvailabilityVerified:false;
}
type Counts={definitions:number;classified:number;unclassified:number;newlyClassifiedSinceLegacy:number;byCategory:Record<GameNativeItemCategory,number>};
const create=():Counts=>({definitions:0,classified:0,unclassified:0,newlyClassifiedSinceLegacy:0,
  byCategory:Object.fromEntries(DB02_ACQUISITION_CATEGORY_ORDER.map(c=>[c,0])) as Record<GameNativeItemCategory,number>});
const freeze=(c:Counts)=>Object.freeze({...c,byCategory:Object.freeze(c.byCategory)});
function check(ok:unknown,why:string):asserts ok{if(!ok)throw TypeError('DB01_CURRENT_ACQUISITION_COVERAGE_'+why);}
const scopes:readonly ItemDefinitionScope[]=['source_candidate','item_definition','other_definition'];
export async function readCurrentAcquisitionCoverage(db:PublicCompleteItemMaster):Promise<Readonly<CurrentAcquisitionCoverage>>{
  const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const required=['nativeCategory','definitionScope','acquisition.categories','acquisition.effectiveCategories'];
  const base={sourceGameVersion:db.release.target.gameVersion,release:db.release.version,
    missingItemIdMeans:'unclassified_not_unobtainable' as const,runtimeMembershipVerified:false as const,currentAvailabilityVerified:false as const};
  if(!required.every(f=>fields.has(f)))return Object.freeze({...base,status:'not_indexed' as const,all:null,
    byDefinitionScope:Object.freeze({}),byNativeCategory:Object.freeze({}),collectionCandidatesByNativeCategory:Object.freeze({}),
    collectionSourceCandidates:null,nativeCharacterCollectionPredicate:null,nativeCollectionCoverage:null,unresolvedOnlineHintItemIds:null});
  const [families,scopeRows,effectiveRows,legacyRows,hints,characterModes,predicateRows]=await Promise.all([
    db.getFieldRows('nativeCategory'),db.getFieldRows('definitionScope'),db.getFieldRows('acquisition.effectiveCategories'),
    db.getFieldRows('acquisition.categories'),fields.has('acquisition.onlineHints')?db.getFieldRows('acquisition.onlineHints'):[],
    fields.has('acquisition.characterUnlockMode')?db.getFieldRows('acquisition.characterUnlockMode'):[],
    fields.has('collection.nativeCanBeCollected')?db.getFieldRows('collection.nativeCanBeCollected'):[]]);
  const scopeById=new Map(scopeRows),effective=new Map(effectiveRows),legacy=new Map(legacyRows);
  const all=create(),collection=create(),byScope=new Map<string,Counts>(scopes.map(s=>[s,create()]));
  const byCategory=new Map<string,Counts>(),byCollectionCategory=new Map<string,Counts>();
  const seen=new Set<number>();
  const bump=(target:Counts,categories:readonly GameNativeItemCategory[],newly:boolean)=>{
    target.definitions++;if(categories.length){target.classified++;if(newly)target.newlyClassifiedSinceLegacy++;}
    else target.unclassified++;
    for(const category of categories)target.byCategory[category]++;
  };
  function group(map:Map<string,Counts>,key:string){let c=map.get(key);if(!c){c=create();map.set(key,c);}return c;}
  for(const [id,family] of families){
    const scope=scopeById.get(id),current=effective.get(id)??[],old=legacy.get(id)??[];
    check(typeof family==='string'&&typeof scope==='string'&&scopes.some(s=>s===scope)&&!seen.has(id),'DEFINITION');
    check(Array.isArray(current)&&Array.isArray(old)&&current.every(c=>DB02_ACQUISITION_CATEGORY_ORDER.some(x=>x===c))&&
      new Set(current).size===current.length&&old.every(c=>current.includes(c)),'CATEGORIES');
    seen.add(id);
    const categories=current as readonly GameNativeItemCategory[],newly=old.length===0&&current.length>0;
    bump(all,categories,newly);bump(group(byScope,scope),categories,newly);bump(group(byCategory,family),categories,newly);
    if(scope==='source_candidate'){bump(collection,categories,newly);bump(group(byCollectionCategory,family),categories,newly);}
  }
  check(scopeById.size===seen.size&&[...effective.keys(),...legacy.keys()].every(id=>seen.has(id)),'CENSUS');
  let nativeCharacterCollectionPredicate:CurrentAcquisitionCoverage['nativeCharacterCollectionPredicate']=null;
  const characterFamilies=families.filter(([,family])=>family==='Character');
  if(characterModes.length&&characterModes.length===characterFamilies.length){
    const characterIds=new Set(characterFamilies.map(([id])=>id));
    let eligible=0,excluded=0,eligibleClassified=0,verified=0;
    for(const [id,mode] of characterModes){
      check(characterIds.has(id),'CHARACTER_MODE_ID');
      if(!mode||typeof mode!=='object'||Array.isArray(mode))continue;
      const value=mode as Readonly<Record<string,unknown>>;
      if(value.nativeCollectionPredicateVerified!==true||value.nativeCollectionPredicate!=='not_is_debug'||typeof value.nativeCanBeCollected!=='boolean')continue;
      check(typeof value.debug==='boolean'&&value.nativeCanBeCollected===!value.debug,'CHARACTER_PREDICATE');
      verified++;
      if(value.nativeCanBeCollected){eligible++;if(effective.has(id))eligibleClassified++;}
      else excluded++;
    }
    if(verified===characterModes.length)nativeCharacterCollectionPredicate=Object.freeze({
      definitions:verified,eligible,excluded,eligibleClassified,eligibleUnclassified:eligible-eligibleClassified});
  }
  let nativeCollectionCoverage:CurrentAcquisitionCoverage['nativeCollectionCoverage']=null;
  if(fields.has('collection.nativeCanBeCollected')){
    const predicates=new Map<number,boolean>();
    for(const [id,value] of predicateRows){
      check(seen.has(id)&&typeof value==='boolean'&&!predicates.has(id),'NATIVE_COLLECTION_PREDICATE');
      predicates.set(id,value);
    }
    type MutableNativeCounts={-readonly [K in keyof NativeCollectionCoverageCounts]:NativeCollectionCoverageCounts[K]};
    const newCounts=():MutableNativeCounts=>({candidates:0,eligible:0,excluded:0,unknown:0,eligibleClassified:0,
      eligibleUnclassified:0,excludedClassified:0,excludedUnclassified:0,unknownClassified:0,unknownUnclassified:0});
    const total=newCounts(),groups=new Map<string,MutableNativeCounts>();
    const eligibleUnclassifiedItemIds:number[]=[],unknownUnclassifiedItemIds:number[]=[];
    const count=(c:MutableNativeCounts,value:boolean|undefined,classified:boolean)=>{
      c.candidates++;
      if(value===true){c.eligible++;if(classified)c.eligibleClassified++;else c.eligibleUnclassified++;}
      else if(value===false){c.excluded++;if(classified)c.excludedClassified++;else c.excludedUnclassified++;}
      else{c.unknown++;if(classified)c.unknownClassified++;else c.unknownUnclassified++;}
    };
    for(const [id,family] of families){
      if(scopeById.get(id)!=='source_candidate')continue;
      check(typeof family==='string','NATIVE_COLLECTION_FAMILY');
      const value=predicates.get(id),classified=effective.has(id);
      let counts=groups.get(family);if(!counts){counts=newCounts();groups.set(family,counts);}
      count(total,value,classified);count(counts,value,classified);
      if(!classified&&value===true)eligibleUnclassifiedItemIds.push(id);
      else if(!classified&&value===undefined)unknownUnclassifiedItemIds.push(id);
    }
    check(total.candidates===collection.definitions&&total.eligibleUnclassified+total.excludedUnclassified+total.unknownUnclassified===collection.unclassified,'NATIVE_COLLECTION_CENSUS');
    nativeCollectionCoverage=Object.freeze({total:Object.freeze(total),
      byNativeCategory:Object.freeze(Object.fromEntries([...groups].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,Object.freeze(v)]))),
      eligibleUnclassifiedItemIds:Object.freeze(eligibleUnclassifiedItemIds.sort((a,b)=>a-b)),
      unknownUnclassifiedItemIds:Object.freeze(unknownUnclassifiedItemIds.sort((a,b)=>a-b)),runtimeMembershipVerified:false});
  }
  const freezeMap=(m:Map<string,Counts>)=>Object.freeze(Object.fromEntries([...m].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,freeze(v)])));
  return Object.freeze({...base,status:'indexed' as const,all:freeze(all),byDefinitionScope:freezeMap(byScope),
    byNativeCategory:freezeMap(byCategory),collectionCandidatesByNativeCategory:freezeMap(byCollectionCategory),
    collectionSourceCandidates:freeze(collection),nativeCharacterCollectionPredicate,nativeCollectionCoverage,
    unresolvedOnlineHintItemIds:fields.has('acquisition.onlineHints')?hints.filter(([id,v])=>!effective.has(id)&&Array.isArray(v)&&v.length>0).length:null});
}
