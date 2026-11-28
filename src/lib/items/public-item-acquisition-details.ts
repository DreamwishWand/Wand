/** Resolve original source occurrences and their display identities from the
 * same pinned current Item master. The three evidence families are NOT
 * independent acquisition routes. Never count repeated evidence as grants.
 */
import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemMasterLocale,
  type NativeAcquisitionCandidate,type ItemFieldValue} from './public-item-master.ts';
import type {AdditionalItemSource} from './public-item-details.ts';
import {DB02_SOURCE_KINDS,DB02_SOURCE_ROLES,type Db01ItemSourceLink} from '../acquisition/db01-item-source-relations.ts';
import type {GameNativeItemCategory} from '../acquisition/game-native-item-categories.ts';

export interface AcquisitionSourceIdentity {
  readonly itemId:number;
  readonly nativeCategory:string;
  readonly sourceClass:string|null;
  readonly name:string|null;
  readonly iconGuid:string|null;
  readonly locale:ItemMasterLocale;
}
export interface OrdinaryQuestIntroEvidence {
  readonly questId:number;
  readonly flowIndex:number;
  readonly sourcePath:string;
  readonly configuredAmount:number;
  readonly nativeQuestGroupId:number;
  readonly nativeQuestGroup:'Village'|'Story'|'Realm';
  readonly sourceGameVersion:string;
  readonly sourceMissionSha256:string;
  readonly guaranteedGrantVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface OrdinaryProductionEvidence {
  readonly sourceItemId:number;
  readonly kind:'ordinary_seed_production'|'ordinary_bee_house_production';
  readonly sourcePath:string;
  readonly configuredQuantity:number;
  readonly quantityKind:'configured_yield'|'maximum_produced';
  readonly sourceGameVersion:string;
  readonly sourceFileSha256:string;
  readonly ordinarySourceIndependentlyClassified:true;
  readonly currentAvailabilityVerified:false;
}
const extensionFields={
  questObjective:'acquisition.questObjectiveGrantSources',
  progression:'acquisition.ordinaryProgressionSources',
  critterBefriending:'acquisition.ordinaryCritterSources',
  conditionalQuest:'acquisition.conditionalQuestSources',
  memorySpawn:'acquisition.classifiedMemorySpawnSources',
  configuredStore:'acquisition.ordinaryConfiguredStoreSource',
  lootPresent:'acquisition.ordinaryLootPresentSources',
  critterFeeding:'acquisition.ordinaryCritterFeedingSources',
  historicalStarpath:'acquisition.historicalStarpathSources'
} as const;
export type ClassificationExtensionFamily=keyof typeof extensionFields;
export interface ClassificationExtensionEvidence {
  readonly family:ClassificationExtensionFamily;
  readonly category:GameNativeItemCategory;
  readonly evidence:Readonly<Record<string,ItemFieldValue>>;
  readonly identity:AcquisitionSourceIdentity|null;
  /** Additional exact IDs, such as loot tables and quest gates. */
  readonly relatedIdentities:readonly Readonly<AcquisitionSourceIdentity>[];
}
type ExtensionRow={family:ClassificationExtensionFamily;category:GameNativeItemCategory;
  evidence:Readonly<Record<string,ItemFieldValue>>;sourceId:number|null;relatedIds:readonly number[]};
const extensionFamilies=Object.keys(extensionFields) as ClassificationExtensionFamily[];
const object=(v:unknown):v is Readonly<Record<string,ItemFieldValue>>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function extensionRows(values:Readonly<Record<string,ItemFieldValue>>,db:PublicCompleteItemMaster,categories:readonly GameNativeItemCategory[]):ExtensionRow[]{
  const output:ExtensionRow[]=[];
  const sha=db.release.sourceFilesSha256;
  for(const family of extensionFamilies){
    const value=values[extensionFields[family]];
    if(value===undefined)continue;
    const list=family==='configuredStore'?[value]:value;
    check(Array.isArray(list),'EXTENSION_LIST');
    for(const evidence of list){
      check(object(evidence)&&evidence.currentAvailabilityVerified===false,'EXTENSION_SOURCE');
      if(family==='historicalStarpath'){
        check(evidence.sourcePlatform==='Switch'&&(
          evidence.sourceGameVersion==='1.24.1'&&evidence.sourceProtoDbSha256==='36c2f64d849a5c7e2350b874e9e9443795c0675381a185d801649b587b093b60'||
          evidence.sourceGameVersion==='1.24.11'&&evidence.sourceProtoDbSha256==='6433b7f00b2d746a28b0d57367f2ba0f8274ab94821ec5be5ffeb881fc553ac2'&&
          evidence.seasonId==='PopCity2026'&&evidence.unresolvedVaultDefinitionId==='PopCity2026_VR'&&evidence.kind!=='vault')&&
          typeof evidence.seasonId==='string'&&/^[A-Za-z0-9_]+$/.test(evidence.seasonId)&&
          typeof evidence.sourceSeasonSha256==='string'&&/^[a-f0-9]{64}$/.test(evidence.sourceSeasonSha256)&&
          id(evidence.configuredAmount)&&typeof evidence.premiumOnly==='boolean'&&typeof evidence.premiumFieldPresent==='boolean'&&
          evidence.guaranteedGrantVerified===false&&categories.includes('star_path')&&
          ['normal','bonus','vault'].some(k=>k===evidence.kind),'EXTENSION_HISTORICAL_STARPATH');
        output.push({family,category:'star_path',evidence,sourceId:null,relatedIds:[]});
        continue;
      }
      check(evidence.sourceGameVersion===db.release.target.gameVersion,'EXTENSION_VERSION');
      if(family==='questObjective'){
        const category=evidence.category;
        if(category===null)continue;
        check((category==='ordinary_gameplay'||category==='in_game_limited_event')&&categories.includes(category)&&
          evidence.sourceMissionSha256===sha?.Mission&&id(evidence.sourceItemId)&&id(evidence.targetItemId)&&
          id(evidence.configuredAmount)&&['TalkToCharacter','Chase'].some(k=>k===evidence.objectiveKind)&&
          typeof evidence.sourcePath==='string'&&evidence.sourcePath.startsWith('source.Steps[')&&
          typeof evidence.cleanupConfigured==='boolean'&&evidence.guaranteedGrantVerified===false,'EXTENSION_QUEST_OBJECTIVE');
        output.push({family,category,evidence,sourceId:evidence.sourceItemId,relatedIds:[]});continue;
      }
      const category=family==='conditionalQuest'||family==='memorySpawn'?evidence.category:'ordinary_gameplay';
      check((category==='ordinary_gameplay'||category==='in_game_limited_event')&&categories.includes(category),'EXTENSION_CATEGORY');
      let sourceId:number|null=null;
      const relatedIds:number[]=[];
      if(family==='configuredStore'){
        check(evidence.kind==='ordinary_configured_store_display'&&object(evidence.display)&&
          evidence.display.sourceId==='Store_Default'&&evidence.ordinaryConfiguredRoute===true&&
          evidence.storeMembershipVerified===false&&evidence.liveTransactionVerified===false&&
          evidence.purchaseCurrencyItemId===80000000&&id(evidence.configuredPurchaseAmount)&&
          (evidence.sourceFileSha256===sha?.Furniture||evidence.sourceFileSha256===sha?.Clothing),'EXTENSION_STORE');
        relatedIds.push(80000000);
      }else{
        check(id(evidence.sourceItemId)&&evidence.guaranteedGrantVerified===false,'EXTENSION_ITEM');
        sourceId=evidence.sourceItemId;
        if(family==='progression'){
          const kind=evidence.kind;
          check(kind==='story_progress_reward'&&evidence.sourceFileSha256===sha?.Story&&evidence.sourcePath==='source.Reward.ItemID'&&id(evidence.configuredAmount)||
            kind==='achievement_milestone_reward'&&evidence.sourceFileSha256===sha?.DutyAch&&typeof evidence.sourcePath==='string'&&evidence.sourcePath.startsWith('source.Milestones[')&&id(evidence.configuredAmount)&&id(evidence.configuredMilestone)||
            kind==='figurine_additional_reward'&&evidence.sourceFileSha256===sha?.BoardGame&&typeof evidence.sourcePath==='string'&&evidence.sourcePath.startsWith('source.AdditionalRewardItemIDs[')&&evidence.configuredAmount===null,'EXTENSION_PROGRESS');
        }else if(family==='critterBefriending'){
          check(evidence.kind==='ordinary_critter_befriending'&&evidence.sourcePath==='source.BefriendingPetRewardItemID'&&id(evidence.configuredFeedingCount)&&
            evidence.sourceFileSha256===sha?.Companion,'EXTENSION_CRITTER');
        }else if(family==='memorySpawn'){
          check(evidence.kind==='quest_gated_memory_spawn'&&evidence.sourceEventSha256===sha?.ConditionalEvent&&
            evidence.sourceConditionSha256===sha?.Condition&&evidence.sourceMissionSha256===sha?.Mission&&
            evidence.sourceMemorySha256===sha?.MemoryShard&&id(evidence.configuredAmount)&&evidence.shardIndexValid===true&&
            typeof evidence.shardIndex==='number'&&Number.isSafeInteger(evidence.shardIndex)&&evidence.shardIndex>=0&&
            ['source.Spawn.RewardOverride.ItemID','source.Spawn.RewardOverride.State.ConsummableData.ItemID'].some(k=>k===evidence.sourcePath)&&
            Array.isArray(evidence.questGates)&&evidence.questGates.length>0&&Array.isArray(evidence.sceneItemIds)&&
            (evidence.characterItemIds===undefined||Array.isArray(evidence.characterItemIds))&&
            (evidence.additionalGates===undefined||Array.isArray(evidence.additionalGates)),'EXTENSION_MEMORY_SPAWN');
          for(const gate of evidence.questGates){
            check(object(gate)&&id(gate.questId)&&gate.category===category,'EXTENSION_QUEST_GATE');relatedIds.push(gate.questId);
          }
          for(const n of evidence.sceneItemIds){check(id(n),'EXTENSION_MEMORY_SCENE');relatedIds.push(n);}
          if(Array.isArray(evidence.characterItemIds))for(const n of evidence.characterItemIds){check(id(n),'EXTENSION_MEMORY_CHARACTER');relatedIds.push(n);}
          if(Array.isArray(evidence.additionalGates))for(const g of evidence.additionalGates){
            check(object(g)&&['CharacterUnlocked','CharacterFriendship','AreaUnlocked'].some(k=>k===g.kind)&&
              typeof g.sourcePath==='string'&&g.sourcePath.startsWith('source.Conditions.Conditions[')&&object(g.original),'EXTENSION_MEMORY_EXTRA_GATE');
          }
        }else if(family==='conditionalQuest'){
          check(evidence.sourceEventSha256===sha?.ConditionalEvent&&evidence.sourceConditionSha256===sha?.Condition&&id(evidence.configuredAmount)&&
            ['conditional_grant','conditional_mail_attachment','conditional_swap_grant'].some(k=>k===evidence.role)&&
            Array.isArray(evidence.questGates)&&evidence.questGates.length>0,'EXTENSION_CONDITIONAL');
          for(const gate of evidence.questGates){
            check(object(gate)&&id(gate.questId)&&gate.category===category,'EXTENSION_QUEST_GATE');
            relatedIds.push(gate.questId);
          }
        }else{
          check(id(evidence.tableItemId)&&evidence.sourceLootTableSha256===sha?.LootTable&&
            typeof evidence.tableSourcePath==='string'&&evidence.tableSourcePath.startsWith('source.Rewards.SubLootTables[')&&
            id(evidence.maximumRolls)&&typeof evidence.minimumRolls==='number'&&Number.isSafeInteger(evidence.minimumRolls)&&
            evidence.minimumRolls>=0&&evidence.minimumRolls<=evidence.maximumRolls,'EXTENSION_LOOT');
          relatedIds.push(evidence.tableItemId);
          if(family==='lootPresent')check(evidence.kind==='ordinary_loot_present_candidate'&&evidence.sourceActivityItemSha256===sha?.ActivityItem&&
            evidence.ordinarySourceIndependentlyClassified===true&&evidence.sourcePath==='source.LootTableItemID','EXTENSION_PRESENT');
          else check(evidence.kind==='ordinary_critter_feeding_candidate'&&evidence.sourceCompanionSha256===sha?.Companion&&
            id(evidence.configuredFeedingCount)&&(evidence.preference==='like'&&evidence.sourcePath==='source.LikeRewardLootTableItemID'||
            evidence.preference==='favorite'&&evidence.sourcePath==='source.FavoriteRewardLootTableItemID'),'EXTENSION_FEEDING');
        }
      }
      output.push({family,category,evidence,sourceId,relatedIds:[...new Set(relatedIds)]});
    }
  }
  return output;
}
export interface EvolutionEvidence {
  readonly kind:'item_evolution';
  readonly baseItemId:number;
  readonly targetItemId:number;
  readonly stepIndex:number;
  readonly previousConfiguredTargetItemId:number|null;
  readonly objectiveKind:'GiftToCharacter'|'WaterPlant'|'MineMineral'|'CatchFish';
  readonly configuredAmount:number;
  readonly originalAction:ItemFieldValue;
  readonly sourcePath:string;
  readonly sourceGameVersion:string;
  readonly sourceFileSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly requiresBaseItem:true;
  readonly progressCounterSemanticsVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly guaranteedGrantVerified:false;
}
export interface MemoryAppearanceEvidence {
  readonly kind:'memory_appearance_condition';
  readonly appearanceConditionCode:number;
  readonly appearanceCondition:string;
  readonly sourcePath:'source.AppearanceCondition';
  readonly conditionsFieldPresent:boolean;
  readonly conditions:ItemFieldValue;
  readonly gateStatus:'field_absent'|'explicit_empty'|'unresolved'|'configured';
  readonly configuredShardCount:number;
  readonly consummableOverrideItemId:number|null;
  readonly consummableOverrideResolved:boolean;
  readonly resolvedGate:Readonly<{
    commonConditionItemId:number;original:ItemFieldValue;sourceConditionSha256:string;
  } & ({kind:'expansion_required';expansionName:string}|{kind:'floating_festival_playable';eventName:string;sceneItemId:number;missionItemId:number})>|null;
  readonly category:'ordinary_gameplay'|'in_game_limited_event'|null;
  readonly sourceGameVersion:string;
  readonly sourceFileSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly guaranteedGrantVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface ItemAcquisitionSourceDetails {
  readonly itemId:number;
  readonly sourceGameVersion:string;
  readonly indexedStatus:'current'|'pending_update';
  readonly nativeStatus:'indexed'|'not_indexed';
  readonly additionalStatus:'indexed'|'not_indexed';
  readonly effectiveCategories:readonly GameNativeItemCategory[];
  readonly indexed:readonly Readonly<{evidence:Db01ItemSourceLink;identity:AcquisitionSourceIdentity|null}>[];
  readonly additional:readonly Readonly<{evidence:AdditionalItemSource;identity:AcquisitionSourceIdentity|null}>[];
  readonly native:readonly Readonly<{evidence:NativeAcquisitionCandidate;identity:AcquisitionSourceIdentity|null}>[];
  /** Explicit classification extensions; not independent extra grants. */
  readonly ordinaryQuestIntroStatus:'indexed'|'not_indexed';
  readonly ordinaryProductionStatus:'indexed'|'not_indexed';
  readonly ordinaryQuestIntro:readonly Readonly<{evidence:OrdinaryQuestIntroEvidence;identity:AcquisitionSourceIdentity|null}>[];
  readonly ordinaryProduction:readonly Readonly<{evidence:OrdinaryProductionEvidence;identity:AcquisitionSourceIdentity|null}>[];
  readonly evolutionStatus:'indexed'|'not_indexed';
  readonly evolutionSource:Readonly<{evidence:EvolutionEvidence;baseIdentity:AcquisitionSourceIdentity}>|null;
  readonly evolutionChain:readonly Readonly<{evidence:EvolutionEvidence;targetIdentity:AcquisitionSourceIdentity}>[];
  readonly memoryAppearanceStatus:'indexed'|'not_indexed';
  readonly memoryAppearance:Readonly<{evidence:MemoryAppearanceEvidence;consummableOverrideIdentity:AcquisitionSourceIdentity|null}>|null;
  readonly classificationExtensionStatus:Readonly<Record<ClassificationExtensionFamily,'indexed'|'not_indexed'>>;
  readonly classificationExtensions:readonly Readonly<ClassificationExtensionEvidence>[];
  readonly coverageComplete:false;
  readonly currentAvailabilityVerified:false;
}
const categoryForIndexed:Partial<Record<Db01ItemSourceLink['kind'],readonly string[]>>={
  quest:['Mission'],recipe:['ActivityData'],activity:['ActivityData'],loot_table:['LootTable'],stall:['Building']
};
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const numeric=(v:string):number|null=>/^[1-9][0-9]*$/.test(v)&&id(Number(v))?Number(v):null;
function check(ok:unknown,code:string):asserts ok {if(!ok)throw new TypeError('DB01_SOURCE_DETAILS_'+code);}
export async function readItemAcquisitionSourceDetails(db:PublicCompleteItemMaster,ids:readonly number[],locale:ItemMasterLocale):
  Promise<readonly (Readonly<ItemAcquisitionSourceDetails>|null)[]>{
  check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');
  check(ITEM_MASTER_LOCALES.includes(locale),'LOCALE');
  const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const relation='acquisition.sourceRelations',additional='acquisition.additionalSources',effective='acquisition.effectiveCategories';
  const indexedStatus=db.release.acquisitionProjection?.sourceGameVersion===db.release.target.gameVersion&&catalog.has(relation)?'current':'pending_update';
  const nativeStatus=catalog.has('acquisition.nativeCandidates')?'indexed':'not_indexed';
  const additionalStatus=catalog.has(additional)?'indexed':'not_indexed';
  const introField='acquisition.ordinaryQuestIntroSources',productionField='acquisition.ordinaryProductionSources';
  const ordinaryQuestIntroStatus=catalog.has(introField)?'indexed':'not_indexed';
  const ordinaryProductionStatus=catalog.has(productionField)?'indexed':'not_indexed';
  const classificationExtensionStatus=Object.freeze(Object.fromEntries(extensionFamilies.map(f=>[f,catalog.has(extensionFields[f])?'indexed':'not_indexed']))) as Readonly<Record<ClassificationExtensionFamily,'indexed'|'not_indexed'>>;
  const memoryField='acquisition.memoryAppearance';
  const memoryAppearanceStatus=catalog.has(memoryField)?'indexed':'not_indexed';
  const evolutionSourceField='acquisition.evolutionSource',evolutionChainField='acquisition.evolutionChain';
  const evolutionStatus=catalog.has(evolutionSourceField)&&catalog.has(evolutionChainField)?'indexed':'not_indexed';
  const fields=[...(evolutionStatus==='indexed'?[evolutionSourceField,evolutionChainField]:[]),...(memoryAppearanceStatus==='indexed'?[memoryField]:[]),...extensionFamilies.map(f=>extensionFields[f]).filter(f=>catalog.has(f)),...(indexedStatus==='current'?[relation]:[]),...(additionalStatus==='indexed'?[additional]:[]),
    ...(catalog.has(effective)?[effective]:[]),...(ordinaryQuestIntroStatus==='indexed'?[introField]:[]),
    ...(ordinaryProductionStatus==='indexed'?[productionField]:[])];
  const [rows,nativeRows]=await Promise.all([
    db.getItemFields(ids,fields.length?fields:['itemId']),
    nativeStatus==='indexed'?db.getNativeAcquisitionCandidates(ids):null
  ]);
  type Context={itemId:number;indexed:readonly Db01ItemSourceLink[];extras:readonly AdditionalItemSource[];
    native:readonly NativeAcquisitionCandidate[];categories:readonly GameNativeItemCategory[];
    intro:readonly OrdinaryQuestIntroEvidence[];production:readonly OrdinaryProductionEvidence[];extensions:readonly ExtensionRow[];memory:MemoryAppearanceEvidence|null;evolutionSource:EvolutionEvidence|null;evolutionChain:readonly EvolutionEvidence[]};
  const contexts=rows.map((row,i):Context|null=>{
    if(!row)return null;
    const record=row.values[relation] as unknown as {itemId:string;links:readonly Db01ItemSourceLink[]}|undefined;
    check(!record||record.itemId===String(row.itemId)&&Array.isArray(record.links),'RELATION_JOIN');
    const indexed:readonly Db01ItemSourceLink[]=record?.links??[];
    check(indexed.every(l=>DB02_SOURCE_KINDS.includes(l.kind)&&DB02_SOURCE_ROLES.includes(l.role)&&typeof l.sourceId==='string'&&l.gameSourceOnly===true&&l.grantedVerified===false&&l.currentlyAvailableVerified===false),'RELATION');
    const extras=(row.values[additional]??[]) as unknown as readonly AdditionalItemSource[];
    check(Array.isArray(extras)&&extras.every(l=>l.currentAvailabilityVerified===false),'ADDITIONAL');
    const native=nativeRows?.[i]??[];
    const categories=(row.values[effective]??[]) as unknown as readonly GameNativeItemCategory[];
    check(Array.isArray(categories),'CATEGORIES');
    const intro=(row.values[introField]??[]) as unknown as readonly OrdinaryQuestIntroEvidence[];
    const production=(row.values[productionField]??[]) as unknown as readonly OrdinaryProductionEvidence[];
    check(Array.isArray(intro)&&intro.every(e=>id(e.questId)&&id(e.nativeQuestGroupId)&&id(e.configuredAmount)&&
      Number.isSafeInteger(e.flowIndex)&&e.flowIndex>=0&&['Village','Story','Realm'].includes(e.nativeQuestGroup)&&
      /^source\.ItemsToGive\[\d+\]\.ItemToGive\.ItemToGive\.Item\.(?:Item|ItemIngredient)\.Item$/.test(e.sourcePath)&&
      e.sourceGameVersion===db.release.target.gameVersion&&e.sourceMissionSha256===db.release.sourceFilesSha256?.Mission&&
      e.guaranteedGrantVerified===false&&e.currentAvailabilityVerified===false),'QUEST_INTRO');
    check(Array.isArray(production)&&production.every(e=>id(e.sourceItemId)&&id(e.configuredQuantity)&&
      e.sourceGameVersion===db.release.target.gameVersion&&e.ordinarySourceIndependentlyClassified===true&&
      e.currentAvailabilityVerified===false&&(
        e.kind==='ordinary_seed_production'&&e.sourcePath==='source.ProducedItemID'&&e.quantityKind==='configured_yield'&&
          e.sourceFileSha256===db.release.sourceFilesSha256?.ActivityItem||
        e.kind==='ordinary_bee_house_production'&&e.sourcePath==='source.BeeHouse.ProducedItemID'&&e.quantityKind==='maximum_produced'&&
          e.sourceFileSha256===db.release.sourceFilesSha256?.Furniture)),'PRODUCTION');
    check(!(intro.length||production.length)||categories.includes('ordinary_gameplay'),'CLASSIFICATION_JOIN');
    const memory=(row.values[memoryField]??null) as unknown as MemoryAppearanceEvidence|null;
    if(memory)check(memory.kind==='memory_appearance_condition'&&memory.sourcePath==='source.AppearanceCondition'&&
      Number.isSafeInteger(memory.appearanceConditionCode)&&memory.appearanceConditionCode>=0&&memory.appearanceConditionCode<=13&&
      typeof memory.appearanceCondition==='string'&&id(memory.configuredShardCount)&&
      memory.sourceGameVersion===db.release.target.gameVersion&&memory.sourceFileSha256===db.release.sourceFilesSha256?.MemoryShard&&
      memory.sourceIl2cppDumpSha256===db.release.sourceIl2cppDumpSha256&&
      memory.guaranteedGrantVerified===false&&memory.currentAvailabilityVerified===false&&
      (memory.category===null||(['ordinary_gameplay','in_game_limited_event'].includes(memory.category)&&categories.includes(memory.category)))&&
      (!memory.resolvedGate||id(memory.resolvedGate.commonConditionItemId)&&memory.resolvedGate.sourceConditionSha256===db.release.sourceFilesSha256?.Condition&&
        (memory.resolvedGate.kind==='expansion_required'&&/^Expansion0[1-4]$/.test(memory.resolvedGate.expansionName)&&memory.category==='ordinary_gameplay'||
         memory.resolvedGate.kind==='floating_festival_playable'&&typeof memory.resolvedGate.eventName==='string'&&id(memory.resolvedGate.sceneItemId)&&id(memory.resolvedGate.missionItemId)&&memory.category==='in_game_limited_event'))&&
      (memory.consummableOverrideItemId===null||id(memory.consummableOverrideItemId)),'MEMORY_APPEARANCE');
    const evolutionSource=(row.values[evolutionSourceField]??null) as unknown as EvolutionEvidence|null;
    const evolutionChain=(row.values[evolutionChainField]??[]) as unknown as readonly EvolutionEvidence[];
    const validEvolution=(e:EvolutionEvidence)=>e.kind==='item_evolution'&&id(e.baseItemId)&&id(e.targetItemId)&&
      e.baseItemId!==e.targetItemId&&Number.isSafeInteger(e.stepIndex)&&e.stepIndex>=0&&
      e.sourcePath==='source.EvolvingConditions['+e.stepIndex+']'&&id(e.configuredAmount)&&
      (e.previousConfiguredTargetItemId===null||id(e.previousConfiguredTargetItemId))&&
      ['GiftToCharacter','WaterPlant','MineMineral','CatchFish'].includes(e.objectiveKind)&&
      e.sourceGameVersion===db.release.target.gameVersion&&e.sourceIl2cppDumpSha256===db.release.sourceIl2cppDumpSha256&&
      [db.release.sourceFilesSha256?.Clothing,db.release.sourceFilesSha256?.Tool].includes(e.sourceFileSha256)&&
      e.requiresBaseItem===true&&e.progressCounterSemanticsVerified===false&&e.currentAvailabilityVerified===false&&e.guaranteedGrantVerified===false;
    check(!evolutionSource||validEvolution(evolutionSource)&&evolutionSource.targetItemId===row.itemId,'EVOLUTION_SOURCE');
    check(Array.isArray(evolutionChain)&&evolutionChain.every((e,i)=>validEvolution(e)&&e.baseItemId===row.itemId&&e.stepIndex===i&&
      e.previousConfiguredTargetItemId===(i?evolutionChain[i-1].targetItemId:null)),'EVOLUTION_CHAIN');
    return {itemId:row.itemId,indexed,extras,native,categories,intro,production,extensions:extensionRows(row.values,db,categories),memory,evolutionSource,evolutionChain};
  });
  const resolveIds=new Set<number>();
  for(const context of contexts){
    if(!context)continue;
    for(const e of context.indexed){const n=categoryForIndexed[e.kind]&&numeric(e.sourceId);if(n)resolveIds.add(n);}
    for(const e of context.extras)if(id(e.sourceId))resolveIds.add(e.sourceId);
    for(const e of context.native)resolveIds.add(e[0]);
    for(const e of context.intro)resolveIds.add(e.questId);
    for(const e of context.production)resolveIds.add(e.sourceItemId);
    if(context.memory?.consummableOverrideResolved&&id(context.memory.consummableOverrideItemId))resolveIds.add(context.memory.consummableOverrideItemId);
    if(context.evolutionSource)resolveIds.add(context.evolutionSource.baseItemId);
    for(const e of context.evolutionChain)resolveIds.add(e.targetItemId);
    for(const e of context.extensions){if(e.sourceId!==null)resolveIds.add(e.sourceId);for(const n of e.relatedIds)resolveIds.add(n);}
  }
  const resolved=new Map<number,Readonly<AcquisitionSourceIdentity>>();
  const nameField='names.'+locale;
  const sourceIds=[...resolveIds].sort((a,b)=>a-b);
  // Bound each call even when a large caller batch has many source edges.
  for(let start=0;start<sourceIds.length;start+=10000){
    const items=await db.getItemFields(sourceIds.slice(start,start+10000),['nativeCategory','sourceClass',nameField,'iconGuid']);
    for(const row of items){
      if(!row)continue;
      const category=row.values.nativeCategory,cls=row.values.sourceClass,name=row.values[nameField],icon=row.values.iconGuid;
      check(typeof category==='string','IDENTITY');
      resolved.set(row.itemId,Object.freeze({itemId:row.itemId,nativeCategory:category,
        sourceClass:typeof cls==='string'?cls:null,name:typeof name==='string'&&name.length>0?name:null,
        iconGuid:typeof icon==='string'&&/^[a-f0-9]{32}$/.test(icon)?icon:null,locale}));
    }
  }
  const identity=(itemId:number|null,allowed?:readonly string[])=>{
    const r=itemId===null?undefined:resolved.get(itemId);
    return r&&(!allowed||allowed.includes(r.nativeCategory))?r:null;
  };
  return Object.freeze(contexts.map(c=>c?Object.freeze({
    itemId:c.itemId,sourceGameVersion:db.release.target.gameVersion,indexedStatus,nativeStatus,additionalStatus,
    effectiveCategories:Object.freeze([...c.categories]),
    indexed:Object.freeze(c.indexed.map(e=>Object.freeze({evidence:e,
      identity:categoryForIndexed[e.kind]?identity(numeric(e.sourceId),categoryForIndexed[e.kind]):null}))),
    additional:Object.freeze(c.extras.map(e=>Object.freeze({evidence:e,
      identity:e.kind==='character_friendship_reward'&&id(e.sourceId)?identity(e.sourceId,['Character']):
        e.kind==='pet_friendship_reward'&&id(e.sourceId)?identity(e.sourceId,['Companion']):
        e.kind==='configured_container_furniture_slot'&&id(e.sourceId)?identity(e.sourceId,['Furniture']):null}))),
    native:Object.freeze(c.native.map(e=>Object.freeze({evidence:e,identity:identity(e[0])}))),
    ordinaryQuestIntroStatus,ordinaryProductionStatus,
    ordinaryQuestIntro:Object.freeze(c.intro.map(e=>Object.freeze({evidence:e,identity:identity(e.questId,['Mission'])}))),
    ordinaryProduction:Object.freeze(c.production.map(e=>Object.freeze({evidence:e,
      identity:identity(e.sourceItemId,e.kind==='ordinary_seed_production'?['ActivityItem']:['Furniture'])}))),
    evolutionStatus,
    evolutionSource:c.evolutionSource?(()=>{const baseIdentity=identity(c.evolutionSource.baseItemId,['Clothing','Tool']);check(baseIdentity,'EVOLUTION_BASE');return Object.freeze({evidence:c.evolutionSource,baseIdentity});})():null,
    evolutionChain:Object.freeze(c.evolutionChain.map(e=>{const targetIdentity=identity(e.targetItemId,['Clothing','Tool']);check(targetIdentity,'EVOLUTION_TARGET');return Object.freeze({evidence:e,targetIdentity});})),
    memoryAppearanceStatus,
    memoryAppearance:c.memory?Object.freeze({evidence:c.memory,consummableOverrideIdentity:c.memory.consummableOverrideResolved?identity(c.memory.consummableOverrideItemId):null}):null,
    classificationExtensionStatus,
    classificationExtensions:Object.freeze(c.extensions.map(e=>{
      const source=identity(e.sourceId);
      const expected=e.family==='progression'?['Story','DutyAch','BoardGame']:e.family==='conditionalQuest'||e.family==='memorySpawn'?['ConditionalEvent']:
        e.family==='questObjective'?['Mission']:e.family==='lootPresent'?['ActivityItem']:e.family==='configuredStore'?[]:['Companion'];
      check(e.sourceId===null||source&&expected.includes(source.nativeCategory),'EXTENSION_IDENTITY');
      const related=e.relatedIds.map(n=>{const r=identity(n);check(r,'EXTENSION_RELATED');return r;});
      return Object.freeze({family:e.family,category:e.category,evidence:e.evidence,identity:source,relatedIdentities:Object.freeze(related)});
    })),
    coverageComplete:false as const,currentAvailabilityVerified:false as const
  }):null));
}
