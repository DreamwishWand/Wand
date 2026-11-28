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
export interface CurrentAcquisitionCoverage {
  readonly sourceGameVersion:string;
  readonly release:string;
  readonly status:'indexed'|'not_indexed';
  readonly all:Readonly<AcquisitionCoverageCounts>|null;
  readonly byDefinitionScope:Readonly<Record<string,Readonly<AcquisitionCoverageCounts>>>;
  readonly byNativeCategory:Readonly<Record<string,Readonly<AcquisitionCoverageCounts>>>;
  readonly collectionCandidatesByNativeCategory:Readonly<Record<string,Readonly<AcquisitionCoverageCounts>>>;
  readonly collectionSourceCandidates:Readonly<AcquisitionCoverageCounts>|null;
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
    collectionSourceCandidates:null,unresolvedOnlineHintItemIds:null});
  const [families,scopeRows,effectiveRows,legacyRows,hints]=await Promise.all([
    db.getFieldRows('nativeCategory'),db.getFieldRows('definitionScope'),db.getFieldRows('acquisition.effectiveCategories'),
    db.getFieldRows('acquisition.categories'),fields.has('acquisition.onlineHints')?db.getFieldRows('acquisition.onlineHints'):[]]);
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
  const freezeMap=(m:Map<string,Counts>)=>Object.freeze(Object.fromEntries([...m].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,freeze(v)])));
  return Object.freeze({...base,status:'indexed' as const,all:freeze(all),byDefinitionScope:freezeMap(byScope),
    byNativeCategory:freezeMap(byCategory),collectionCandidatesByNativeCategory:freezeMap(byCollectionCategory),
    collectionSourceCandidates:freeze(collection),
    unresolvedOnlineHintItemIds:fields.has('acquisition.onlineHints')?hints.filter(([id,v])=>!effective.has(id)&&Array.isArray(v)&&v.length>0).length:null});
}
