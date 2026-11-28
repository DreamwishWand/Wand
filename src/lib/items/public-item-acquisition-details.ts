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
  initialInventory:'acquisition.ordinaryInitialInventorySources',
  storyUnlock:'acquisition.storyUnlockSources',
  characterUnlock:'acquisition.characterUnlockSources',
  questObjective:'acquisition.questObjectiveGrantSources',
  progression:'acquisition.ordinaryProgressionSources',
  critterBefriending:'acquisition.ordinaryCritterSources',
  conditionalQuest:'acquisition.conditionalQuestSources',
  memorySpawn:'acquisition.classifiedMemorySpawnSources',
  memoryDefaultContent:'acquisition.memoryDefaultContentSources',
  miniEventReward:'acquisition.miniEventRewardSources',
  eventLootPresent:'acquisition.eventLootPresentSources',
  eventRecurringLoot:'acquisition.eventRecurringLootSources',
  configuredStore:'acquisition.ordinaryConfiguredStoreSource',
  storeSequence:'acquisition.ordinaryStoreSequenceSources',
  storeGeneratedShelf:'acquisition.ordinaryGeneratedStoreShelfSources',
  storeGeneratedStage:'acquisition.ordinaryGeneratedStoreStageSources',
  lootPresent:'acquisition.ordinaryLootPresentSources',
  critterFeeding:'acquisition.ordinaryCritterFeedingSources',
  questLoot:'acquisition.questAdditionalLootSources',
  evolutionAcquisition:'acquisition.evolutionAcquisitionSources',
  profileLevel:'acquisition.profileLevelRewardSources',
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
      if(family==='initialInventory'){
        const groups=['Backpack','HomeStorage','Catalog','Wardrobe','Pantry','Makeup','Trimming','Buildings','Decals','Skins','AvatarFeatures','Figurines','PhotoMode','MountGear','EnvironmentalFX'];
        check((evidence.kind==='ordinary_initial_list_inventory'||evidence.kind==='ordinary_initial_container_inventory')&&evidence.category==='ordinary_gameplay'&&categories.includes('ordinary_gameplay')&&
          id(evidence.targetItemId)&&id(evidence.configuredAmount)&&typeof evidence.sourcePosition==='number'&&Number.isSafeInteger(evidence.sourcePosition)&&evidence.sourcePosition>=0&&
          typeof evidence.sourceFieldNumber==='number'&&Number.isSafeInteger(evidence.sourceFieldNumber)&&
          (evidence.kind==='ordinary_initial_list_inventory'&&evidence.sourceInventoryType==='list'&&evidence.sourceFieldNumber>=3&&evidence.sourceFieldNumber<=15||
           evidence.kind==='ordinary_initial_container_inventory'&&evidence.sourceInventoryType==='container'&&evidence.sourceFieldNumber>=1&&evidence.sourceFieldNumber<=2)&&
          evidence.sourceId===groups[evidence.sourceFieldNumber-1]&&
          evidence.sourceGameVersion===db.release.target.gameVersion&&evidence.sourceRecordIndex===97&&
          evidence.sourceRecordSha256==='9ef61e35f310002608496d9748673eaa48051444f3083752cbe3c111f039940c'&&
          evidence.sourcePayloadSha256==='d4fc13504131da7f0cb47f5b41e612e73b19936b6e4d3b858e7178c1b614a7b7'&&
          evidence.sourceProtoDbSha256==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&
          evidence.sourceProjectionSha256==='35f22a0dd42826921ce462c93b7a21910b2ff7c653a9b93a127a12bbeaab5813'&&
          evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
          evidence.nativeInitializationVerified===true&&evidence.guaranteedGrantVerified===false&&
          evidence.grantVerified===false&&evidence.playerOwnershipVerified===false,'EXTENSION_INITIAL_INVENTORY');
        output.push({family,category:'ordinary_gameplay',evidence,sourceId:null,relatedIds:[]});continue;
      }
      if(family==='miniEventReward'){
        check(categories.includes('in_game_limited_event')&&evidence.category==='in_game_limited_event'&&
          evidence.kind==='mini_event_reward_association'&&id(evidence.targetItemId)&&
          typeof evidence.eventId==='string'&&/^[A-Za-z][A-Za-z0-9_]+$/.test(evidence.eventId)&&evidence.eventId!=='TestEv'&&
          (evidence.configuredAmount===null||id(evidence.configuredAmount))&&(evidence.featuringPriority===null||id(evidence.featuringPriority))&&
          typeof evidence.sourcePosition==='number'&&Number.isSafeInteger(evidence.sourcePosition)&&evidence.sourcePosition>=0&&
          evidence.sourcePath==='Rewards['+evidence.sourcePosition+'].ItemId'&&typeof evidence.sourceRecordIndex==='number'&&
          Number.isSafeInteger(evidence.sourceRecordIndex)&&evidence.sourceRecordIndex>=1947&&evidence.sourceRecordIndex<=1965&&evidence.sourceRecordIndex!==1949&&
          typeof evidence.sourceRecordSha256==='string'&&/^[a-f0-9]{64}$/.test(evidence.sourceRecordSha256)&&
          typeof evidence.sourcePayloadSha256==='string'&&/^[a-f0-9]{64}$/.test(evidence.sourcePayloadSha256)&&
          evidence.sourceProtoDbSha256==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
          evidence.sourceGameVersion===db.release.target.gameVersion&&evidence.nativeTimeLimitedMembershipVerified===true&&
          evidence.exactGrantMechanismVerified===false&&evidence.guaranteedGrantVerified===false,'EXTENSION_MINI_EVENT_REWARD');
        output.push({family,category:'in_game_limited_event',evidence,sourceId:null,relatedIds:[]});continue;
      }
      if(family==='eventRecurringLoot'){
        const bounded=evidence.boundedLocalDateGate,blocker=evidence.kind==='event_recurring_blocker_loot';
        const spawned=blocker?evidence.blockerItemId:evidence.ephemeralItemId;
        check(categories.includes('in_game_limited_event')&&evidence.category==='in_game_limited_event'&&
          (blocker?object(bounded)&&id(bounded.conditionItemId)&&id(bounded.missionItemId)&&
            id(bounded.startLocalSeconds)&&id(bounded.endLocalSeconds)&&bounded.startLocalSeconds<bounded.endLocalSeconds&&
            object(bounded.original)&&evidence.blockerSourcePath==='source.RewardLootTableItemID'&&
            evidence.sourceFurnitureSha256===sha?.Furniture&&evidence.sourceMissionSha256===sha?.Mission:
            evidence.kind==='event_recurring_ephemeral_loot'&&evidence.ephemeralSourcePath==='source.TreasureLootTable')&&
          evidence.sourceGameVersion===db.release.target.gameVersion&&
          evidence.sourceRecurringEventSha256===sha?.RecurringEvent&&evidence.sourceEventSha256===sha?.ConditionalEvent&&
          evidence.sourceConditionSha256===sha?.Condition&&evidence.sourceActivityItemSha256===sha?.ActivityItem&&
          evidence.sourceLootTableSha256===sha?.LootTable&&evidence.sourceMemorySha256===sha?.MemoryShard&&
          evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
          id(evidence.sourceItemId)&&id(evidence.recurringEventItemId)&&id(spawned)&&
          id(evidence.tableItemId)&&id(evidence.targetItemId)&&typeof evidence.eventName==='string'&&evidence.eventName.length>0&&
          evidence.sourcePath==='source.RecurringEvent.RecurringEventItemID'&&object(evidence.conditions)&&
          typeof evidence.recurringSourcePath==='string'&&/^source\.ItemList\.Items\[\d+\]\.ItemID$/.test(evidence.recurringSourcePath)&&
          typeof evidence.tableSourcePath==='string'&&
          evidence.tableSourcePath.startsWith('source.Rewards.SubLootTables[')&&
          id(evidence.maximumRolls)&&typeof evidence.minimumRolls==='number'&&Number.isSafeInteger(evidence.minimumRolls)&&
          evidence.minimumRolls>=0&&evidence.minimumRolls<=evidence.maximumRolls&&
          evidence.guaranteedGrantVerified===false,'EXTENSION_EVENT_RECURRING_LOOT');
        const relatedIds=[evidence.recurringEventItemId,spawned,evidence.tableItemId];
        if(blocker&&object(bounded)&&id(bounded.conditionItemId)&&id(bounded.missionItemId))relatedIds.push(bounded.conditionItemId,bounded.missionItemId);
        if(evidence.orbItemId!==undefined){
          check(id(evidence.orbItemId)&&id(evidence.configuredConsumableAmount)&&id(evidence.configuredShardCount)&&
            typeof evidence.shardIndex==='number'&&Number.isSafeInteger(evidence.shardIndex)&&evidence.shardIndex>=0&&
            evidence.shardIndex<evidence.configuredShardCount&&typeof evidence.tableSourcePath==='string'&&
            evidence.tableSourcePath.endsWith('.State.ConsummableData.ItemID'),'EXTENSION_RECURRING_MEMORY_PAYLOAD');
          relatedIds.push(evidence.orbItemId);
        }
        output.push({family,category:'in_game_limited_event',evidence,sourceId:evidence.sourceItemId,
          relatedIds});continue;
      }
      if(family==='memoryDefaultContent'){
        const category=evidence.category;
        const payload=evidence.defaultContent;
        check((category==='ordinary_gameplay'||category==='in_game_limited_event')&&categories.includes(category)&&
          evidence.kind==='memory_default_consumable_grant'&&evidence.sourceGameVersion===db.release.target.gameVersion&&
          evidence.sourceActivityItemSha256===sha?.ActivityItem&&evidence.sourceMemorySha256===sha?.MemoryShard&&
          evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
          id(evidence.sourceItemId)&&id(evidence.targetItemId)&&id(evidence.orbItemId)&&
          id(evidence.configuredGrantAmount)&&id(evidence.configuredConsumableAmount)&&id(evidence.configuredShardCount)&&
          typeof evidence.shardIndex==='number'&&Number.isSafeInteger(evidence.shardIndex)&&
          evidence.shardIndex>=0&&evidence.shardIndex<evidence.configuredShardCount&&
          evidence.defaultSourcePath==='source.DefaultItem.ItemID'&&evidence.explicitGrantStateAbsent===true&&
          object(payload)&&payload.ItemID===evidence.targetItemId&&payload.Amount===evidence.configuredConsumableAmount&&
          object(payload.State)&&payload.State.MemoryShardIndex===evidence.shardIndex&&
          typeof evidence.sourcePath==='string'&&
          (evidence.routeKind==='quest_intro'&&evidence.sourceMissionSha256===sha?.Mission&&evidence.sourcePath.startsWith('source.ItemsToGive[')||
           evidence.routeKind==='quest_objective'&&evidence.sourceMissionSha256===sha?.Mission&&evidence.sourcePath.startsWith('source.Steps[')||
           evidence.routeKind==='conditional_grant'&&evidence.sourceEventSha256===sha?.ConditionalEvent&&
             evidence.sourceConditionSha256===sha?.Condition&&evidence.sourcePath.startsWith('source.GiveItem.Items['))&&
          evidence.guaranteedGrantVerified===false,'EXTENSION_MEMORY_DEFAULT_CONTENT');
        output.push({family,category,evidence,sourceId:evidence.sourceItemId,relatedIds:[evidence.orbItemId]});continue;
      }
      if(family==='characterUnlock'){
        const category=evidence.category;
        if(category===null)continue;
        check((category==='ordinary_gameplay'||category==='in_game_limited_event')&&categories.includes(category)&&
          evidence.sourceCharacterSha256===sha?.Character&&evidence.sourceGameVersion===db.release.target.gameVersion&&
          id(evidence.sourceItemId)&&id(evidence.targetItemId)&&evidence.guaranteedGrantVerified===false&&
          (evidence.kind==='character_automatic_unlock'&&evidence.sourceItemId===evidence.targetItemId&&evidence.unlockConditionCode===1&&
            evidence.sourcePath==='source.UnlockCondition'&&category==='ordinary_gameplay'||
           evidence.kind==='character_secret_condition_unlock'&&evidence.sourceItemId===evidence.targetItemId&&
            evidence.unlockConditionCode===4&&category==='ordinary_gameplay'&&
            evidence.sourcePath==='source.SecretCharacterData.CharacterUnlockCondition'&&
            evidence.sourceMissionSha256===sha?.Mission&&
            evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
            id(evidence.missionItemId)&&object(evidence.original)&&
            ['MissionStatus','MissionCompleted','MissionStepCompleted','MissionStepStatus'].some(k=>k===evidence.predicateKind)&&
            (evidence.missionStepId===null||typeof evidence.missionStepId==='number'&&Number.isSafeInteger(evidence.missionStepId)&&evidence.missionStepId>=0)&&
            (evidence.preConditions===null||object(evidence.preConditions))||
           evidence.kind==='character_quest_unlock'&&evidence.sourceMissionSha256===sha?.Mission&&
            evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
            [2,4].some(n=>n===evidence.unlockConditionCode)&&evidence.nextStateCode===0&&
            object(evidence.original)&&typeof evidence.sourcePath==='string'&&
            /^source\.Steps\[\d+\]\.SubSteps\[\d+\]\.Objectives\[\d+\]\.UnlockCharacter$/.test(evidence.sourcePath)&&
            (evidence.targetResolution==='explicit_character'||evidence.targetResolution==='mission_owner')),'EXTENSION_CHARACTER_UNLOCK');
        const relatedIds:number[]=[];
        if(evidence.kind==='character_secret_condition_unlock'){
          check(id(evidence.missionItemId),'EXTENSION_SECRET_CHARACTER_MISSION');
          relatedIds.push(evidence.missionItemId);
        }
        output.push({family,category,evidence,sourceId:evidence.sourceItemId,relatedIds});continue;
      }
      if(family==='storyUnlock'){
        const event=evidence.routeKind==='festival_puzzle',category=event?'in_game_limited_event':'ordinary_gameplay';
        check(categories.includes(category)&&evidence.category===category&&
          id(evidence.sourceItemId)&&id(evidence.targetItemId)&&
          (evidence.kind==='story_puzzle_unlock'&&evidence.sourceItemId===evidence.targetItemId||
           event&&evidence.kind==='story_event_completion_reward'&&evidence.targetItemId===evidence.rewardItemId&&
           id(evidence.configuredAmount)&&object(evidence.originalReward)&&evidence.originalReward.ItemID===evidence.targetItemId&&
           evidence.originalReward.Amount===evidence.configuredAmount&&evidence.sourcePath==='source.Reward.ItemID')&&
          evidence.sourceStorySha256===sha?.Story&&evidence.sourceMissionSha256===sha?.Mission&&
          evidence.sourceConditionSha256===sha?.Condition&&evidence.sourceActivityItemSha256===sha?.ActivityItem&&
          evidence.sourceGameVersion===db.release.target.gameVersion&&
          evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
          evidence.guaranteedGrantVerified===false&&typeof evidence.isMissionItem==='boolean'&&
          object(evidence.visibilityConditions)&&object(evidence.unlockConditions)&&
          Array.isArray(evidence.unlockCosts)&&Array.isArray(evidence.missionItemIds)&&
          evidence.missionItemIds.every(id)&&Array.isArray(evidence.conditionItemIds)&&evidence.conditionItemIds.every(id)&&
          (event?evidence.isMissionItem===true&&evidence.unlockCosts.length===0&&evidence.missionItemIds.length===0&&
            id(evidence.rewardItemId)&&id(evidence.conditionItemId)&&evidence.conditionItemIds.includes(evidence.conditionItemId)&&
            ['ParksFloatingFestival','HauntedFloatingFestival2026'].includes(String(evidence.eventName))&&
            evidence.sourceProtoDbSha256==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&
            Array.isArray(evidence.resolvedConditions)&&evidence.resolvedConditions.length>0:
            evidence.routeKind==='snippet_cost'?evidence.unlockCosts.length>0&&evidence.missionItemIds.length===0:
            evidence.routeKind==='quest_conditions'&&evidence.missionItemIds.length>0),
          'EXTENSION_STORY_UNLOCK');
        const relatedIds:number[]=[...evidence.missionItemIds,...evidence.conditionItemIds];
        for(const cost of evidence.unlockCosts){
          check(object(cost)&&id(cost.Id)&&id(cost.Amount),'EXTENSION_STORY_COST');relatedIds.push(cost.Id);
        }
        output.push({family,category,evidence,sourceId:evidence.sourceItemId,relatedIds:[...new Set(relatedIds)]});continue;
      }
      if(family==='questLoot'){
        const category=evidence.category;
        check((category==='ordinary_gameplay'||category==='in_game_limited_event')&&categories.includes(category)&&
          evidence.kind==='quest_additional_loot_candidate'&&evidence.sourceGameVersion===db.release.target.gameVersion&&
          evidence.sourceMissionSha256===sha?.Mission&&id(evidence.sourceItemId)&&id(evidence.targetItemId)&&
          id(evidence.maximumRolls)&&typeof evidence.minimumRolls==='number'&&Number.isSafeInteger(evidence.minimumRolls)&&
          evidence.minimumRolls>=0&&evidence.minimumRolls<=evidence.maximumRolls&&
          (evidence.configuredWeight===null||id(evidence.configuredWeight))&&
          object(evidence.originalEntry)&&evidence.originalEntry.ItemID===evidence.targetItemId&&
          typeof evidence.sourcePath==='string'&&/^source\.AdditionnalRewards\.SubLootTables\[\d+\]\.Items\[\d+\]\.ItemID$/.test(evidence.sourcePath)&&
          evidence.guaranteedGrantVerified===false,'EXTENSION_QUEST_ADDITIONAL_LOOT');
        output.push({family,category,evidence,sourceId:evidence.sourceItemId,relatedIds:[]});continue;
      }
      if(family==='evolutionAcquisition'){
        const category=categories.find(c=>c===evidence.category);
        check(category!==undefined&&evidence.kind==='item_evolution_acquisition'&&id(evidence.sourceItemId)&&
          evidence.baseItemId===evidence.sourceItemId&&id(evidence.targetItemId)&&evidence.targetItemId!==evidence.baseItemId&&
          typeof evidence.stepIndex==='number'&&Number.isSafeInteger(evidence.stepIndex)&&evidence.stepIndex>=0&&
          evidence.sourcePath==='source.EvolvingConditions['+evidence.stepIndex+']'&&id(evidence.configuredAmount)&&
          (evidence.previousConfiguredTargetItemId===null||id(evidence.previousConfiguredTargetItemId))&&
          ['GiftToCharacter','WaterPlant','MineMineral','CatchFish'].some(k=>k===evidence.objectiveKind)&&
          evidence.sourceGameVersion===db.release.target.gameVersion&&evidence.sourceIl2cppDumpSha256===db.release.sourceIl2cppDumpSha256&&
          (evidence.sourceFileSha256===sha?.Clothing||evidence.sourceFileSha256===sha?.Tool)&&
          evidence.requiresBaseItem===true&&evidence.progressCounterSemanticsVerified===false&&
          evidence.configuredGrantAmount===1&&evidence.nativeCompletionVerified===true&&
          evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
          evidence.sourceCategoryInherited===true&&evidence.directAcquisitionVerified===false&&
          evidence.guaranteedGrantVerified===false,'EXTENSION_EVOLUTION_ACQUISITION');
        output.push({family,category,evidence,sourceId:evidence.sourceItemId,relatedIds:[]});continue;
      }
      if(family==='profileLevel'){
        const designer=evidence.kind==='designer_level_reward';
        check(categories.includes('ordinary_gameplay')&&evidence.category==='ordinary_gameplay'&&
          (designer||evidence.kind==='player_level_reward')&&id(evidence.targetItemId)&&id(evidence.configuredAmount)&&
          typeof evidence.level==='number'&&Number.isSafeInteger(evidence.level)&&evidence.level>=2&&evidence.level<=(designer?10:49)&&
          id(evidence.configuredPoints)&&evidence.pointKind===(designer?'pixel_dust':'xp')&&
          evidence.sourceRecord===(designer?'DesignerLevelInfo':'PlayerInfo')&&evidence.sourceRecordIndex===(designer?230:401)&&
          evidence.sourceRecordSha256===(designer?'200d4eec21f964b1746920771f371497245fd7ff3d3dd7d4a5d4c58af0ae56a6':'bc6f11a35b1bf3ca70c15a02ce1ae56981b2fcfbfdfc061b7852ed1ec925817a')&&
          evidence.sourcePayloadSha256===(designer?'a4c350f1a891437e5b9c55c8b427502fb2d15d8952fe53372157786cb55f93b9':'47f95b74ada81d0a435b93b9636e3aa5105898ad3c5757816c7ffbb394471f7b')&&
          evidence.sourceProtoDbSha256==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
          evidence.sourceGameVersion===db.release.target.gameVersion&&typeof evidence.sourcePath==='string'&&
          (designer?/^DesignerLevels\[\d+\]\.ItemReward$/:/^PlayerLevels\[\d+\]\.ItemRewards\[\d+\]$/).test(evidence.sourcePath)&&
          evidence.selectionRule==='old_level_exclusive_new_level_inclusive'&&evidence.guaranteedGrantVerified===false,'EXTENSION_PROFILE_LEVEL');
        output.push({family,category:'ordinary_gameplay',evidence,sourceId:null,relatedIds:[]});continue;
      }
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
      const category=family==='conditionalQuest'||family==='memorySpawn'||family==='eventLootPresent'?evidence.category:'ordinary_gameplay';
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
            kind==='figurine_additional_reward'&&evidence.sourceFileSha256===sha?.BoardGame&&typeof evidence.sourcePath==='string'&&evidence.sourcePath.startsWith('source.AdditionalRewardItemIDs[')&&evidence.configuredAmount===null||
            kind==='figurine_rank_reward'&&evidence.sourceFileSha256===sha?.BoardGame&&evidence.sourcePath==='source.Tier'&&
            evidence.configuredAmount===1&&evidence.configuredMilestone===null&&typeof evidence.configuredTier==='number'&&[1,2,3].includes(evidence.configuredTier)&&
            evidence.selectionRule==='minimum_positive_unowned_tier_random'&&evidence.rankGate==='level_increased_and_unlocks_figurine'&&
            Array.isArray(evidence.rankRewardPoints)&&evidence.rankRewardPoints.length===26&&evidence.rankRewardPoints.every((n,i)=>n===[3,9,15,24,33,45,57,69,84,99,114,129,147,165,183,201,219,237,258,279,300,350,400,450,500,550][i])&&
            evidence.sourceProtoDbSha256==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&evidence.sourceRankingRecordIndex===394&&
            evidence.sourceRankingRecordSha256==='3204625406f5a3317e534e65dc411fe95afdc79ad6f4425a4b9ab999414e9da9'&&
            evidence.sourceRankingPayloadSha256==='4c3cfea78603697bd8be1808905ef7daaba3d4cfac5018a0582e1c51c7a3a136'&&
            evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653','EXTENSION_PROGRESS');
          const gate=evidence.rankActivity;
          if(kind==='figurine_rank_reward'||gate!==undefined){
            check((kind==='figurine_rank_reward'||kind==='figurine_additional_reward')&&object(gate)&&
              gate.requiredExpansion==='Expansion01'&&gate.preConditionItemId===2130001296&&gate.unlockMissionItemId===2070000996&&
              gate.unlockMissionState===8&&gate.unlockMissionOperator===0&&gate.sourceConditionSha256===sha?.Condition&&
              gate.sourceMissionSha256===sha?.Mission&&gate.sourceProtoDbSha256==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&
              gate.sourceActivityRecordIndex===16&&gate.sourceActivityRecordSha256==='243b5021740968b2d84eebc08a207862d115eef90b7d03dd31f24ad2268a577a'&&
              gate.sourceActivityPayloadSha256==='212e2e5dfb6b22f87c921bf3a3c42c7feeeba4cc3b7428f9975a4771b1c376f0','EXTENSION_RANK_ACTIVITY');
            const points=gate.configuredRankPointRewards,friendship=gate.configuredFriendshipRewards;
            check(object(points)&&object(points.victory)&&points.victory.normal===3&&points.victory.eager===6&&
              object(points.loss)&&points.loss.normal===1&&points.loss.eager===2&&object(points.draw)&&points.draw.normal===2&&points.draw.eager===4&&
              object(friendship)&&friendship.normal===200&&friendship.eager===1000,'EXTENSION_RANK_REWARDS');
            relatedIds.push(2130001296,2070000996);
          }
        }else if(family==='critterBefriending'){
          check(evidence.kind==='ordinary_critter_befriending'&&evidence.sourcePath==='source.BefriendingPetRewardItemID'&&id(evidence.configuredFeedingCount)&&
            evidence.sourceFileSha256===sha?.Companion,'EXTENSION_CRITTER');
        }else if(family==='storeGeneratedShelf'||family==='storeGeneratedStage'){
          const stage=family==='storeGeneratedStage';
          check(evidence.kind===(stage?'ordinary_generated_store_stage':'ordinary_generated_store_shelf')&&
            (!stage||evidence.itemNativeCategory==='Furniture'&&typeof evidence.stageLayoutType==='number'&&
              [0,1,2,3,5,6].includes(evidence.stageLayoutType)&&id(evidence.stageLayoutWeight)&&
              Array.isArray(evidence.stageSourceSize)&&evidence.stageSourceSize.length===2&&evidence.stageSourceSize.every(id)&&
              Array.isArray(evidence.stageAreaSize)&&evidence.stageAreaSize.length===2&&evidence.stageAreaSize.every(id)&&
              Array.isArray(evidence.stageSlotIndices)&&evidence.stageSlotIndices.length>0&&
              evidence.stageSlotIndices.every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))&&
            evidence.sourceDisplaySha256===sha?.Display&&
            evidence.sourceBuildingSha256===sha?.Building&&evidence.sourceDirectTagPredicateVerified===true&&
            (evidence.itemNativeCategory==='Clothing'&&evidence.sourceItemFileSha256===sha?.Clothing&&evidence.nativeGrid===null||
             evidence.itemNativeCategory==='Furniture'&&evidence.sourceItemFileSha256===sha?.Furniture&&object(evidence.nativeGrid)&&evidence.nativeGrid.status==='passed'&&evidence.nativeGrid.directTagPredicateVerified===true)&&
            evidence.sourceSetSha256===sha?.Set&&evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
            evidence.purchaseCurrencyItemId===80000000&&id(evidence.configuredPurchaseAmount)&&id(evidence.buildingItemId)&&
            (evidence.priceSource==='explicit_override'&&evidence.priceProviderRecordIndex===null||
             (evidence.priceSource==='static'||evidence.priceSource==='dynamic_cache')&&typeof evidence.priceProviderRecordIndex==='number'&&
              Number.isSafeInteger(evidence.priceProviderRecordIndex)&&evidence.priceProviderRecordIndex>=0)&&
            ((evidence.priceBandKind===undefined||evidence.priceBandKind==='configured_thresholds'&&evidence.catalogueEnumerationVerified===true)&&
              typeof evidence.tableIndex==='number'&&Number.isSafeInteger(evidence.tableIndex)&&evidence.tableIndex>=0&&
              typeof evidence.bandIndex==='number'&&Number.isSafeInteger(evidence.bandIndex)&&evidence.bandIndex>=0||
             evidence.priceBandKind==='native_unbounded_positive'&&evidence.catalogueEnumerationVerified===false&&
              typeof evidence.sourceItemId==='number'&&[2140000002,2140000003,2140000006,2140000015,2140000016].includes(evidence.sourceItemId)&&
              evidence.tableIndex===null&&evidence.bandIndex===null&&evidence.minimum===1&&evidence.maximum===2147483647)&&
            id(evidence.minimum)&&id(evidence.maximum)&&evidence.configuredPurchaseAmount>=evidence.minimum&&
            evidence.configuredPurchaseAmount<=evidence.maximum&&
            (evidence.setItemId===null||id(evidence.setItemId))&&
            (evidence.itemCatalogGateEmpty===true&&(evidence.catalogGate===undefined||object(evidence.catalogGate)&&evidence.catalogGate.kind==='empty')||
             evidence.itemCatalogGateEmpty===false&&object(evidence.catalogGate)&&object(evidence.catalogGate.original)&&
             (evidence.catalogGate.kind==='player_level'&&evidence.catalogGate.targetItemId===null||
              ['mission_completed','mission_step_completed','character_unlocked','character_friendship','realm_unlocked'].includes(String(evidence.catalogGate.kind))&&id(evidence.catalogGate.targetItemId)))&&
            evidence.inheritedSetGateEmpty===true&&evidence.configuredPoolRouteVerified===true&&
            evidence.runtimeStockVerified===false&&evidence.storeMembershipVerified===false,'EXTENSION_STORE_GENERATED');
          relatedIds.push(evidence.buildingItemId,80000000);
          if(id(evidence.setItemId))relatedIds.push(evidence.setItemId);
          if(object(evidence.catalogGate)&&id(evidence.catalogGate.targetItemId))relatedIds.push(evidence.catalogGate.targetItemId);
        }else if(family==='storeSequence'){
          check(evidence.kind==='ordinary_store_display_sequence'&&evidence.sourceDisplaySha256===sha?.Display&&
            evidence.sourceBuildingSha256===sha?.Building&&
            (evidence.sourceItemFileSha256===sha?.Furniture||evidence.sourceItemFileSha256===sha?.Clothing)&&
            evidence.purchaseCurrencyItemId===80000000&&id(evidence.configuredPurchaseAmount)&&id(evidence.buildingItemId)&&
            id(evidence.upgradeLevel)&&id(evidence.configuredDisplayQuantity)&&
            typeof evidence.sourcePath==='string'&&evidence.sourcePath.startsWith('source.UpgradeInfo[')&&
            object(evidence.sequence)&&evidence.sequence.displayItemId===sourceId&&
            evidence.storeMembershipVerified===false&&evidence.liveTransactionVerified===false,'EXTENSION_STORE_SEQUENCE');
          relatedIds.push(evidence.buildingItemId,80000000);
        }else if(family==='eventLootPresent'){
          check(category==='in_game_limited_event'&&evidence.sourceEventSha256===sha?.ConditionalEvent&&
            evidence.sourceConditionSha256===sha?.Condition&&evidence.sourceActivityItemSha256===sha?.ActivityItem&&
            evidence.sourceLootTableSha256===sha?.LootTable&&id(evidence.bagItemId)&&id(evidence.tableItemId)&&
            ['event_loot_present_spawn','event_loot_present_override','event_loot_present_reward','event_loot_present_memory_payload'].some(k=>k===evidence.kind)&&
            typeof evidence.eventName==='string'&&evidence.eventName.length>0&&object(evidence.conditions)&&
            (evidence.spawnSourcePath==='source.Spawn.LootPresentItem.Item.Item.Item'||
             evidence.spawnSourcePath==='source.Spawn.RewardOverride.ItemID'&&id(evidence.inventoryItemId)&&id(evidence.blockerItemId)&&
             evidence.sourceFurnitureSha256===sha?.Furniture&&evidence.sourceMissionSha256===sha?.Mission&&
             evidence.sourceActivityDataSha256===sha?.ActivityData&&evidence.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&
             object(evidence.rewardOverride)&&evidence.rewardOverride.ItemID===evidence.bagItemId&&Array.isArray(evidence.precursors)&&evidence.precursors.length>0),
             'EXTENSION_EVENT_LOOT');
          relatedIds.push(evidence.bagItemId,evidence.tableItemId);
          if(evidence.spawnSourcePath==='source.Spawn.RewardOverride.ItemID'){
            check(id(evidence.inventoryItemId)&&id(evidence.blockerItemId)&&Array.isArray(evidence.precursors),'EXTENSION_EVENT_OVERRIDE');
            relatedIds.push(evidence.inventoryItemId,evidence.blockerItemId);
            for(const p of evidence.precursors){
              check(object(p)&&id(p.sourceItemId)&&['event_fishing_result','event_quest_blocker_note'].some(k=>k===p.kind)&&
                p.eventName===evidence.eventName&&object(p.originalConditions)&&
                (p.kind==='event_fishing_result'?p.sourceFileSha256===sha?.ActivityData:p.sourceFileSha256===sha?.ConditionalEvent&&id(p.missionItemId)),'EXTENSION_EVENT_PRECURSOR');
              relatedIds.push(p.sourceItemId);
              if(id(p.missionItemId))relatedIds.push(p.missionItemId);
            }
          }
        }else if(family==='memorySpawn'){
          const realm=evidence.kind==='realm_fixed_memory_spawn';
          check((evidence.kind==='quest_gated_memory_spawn'||realm&&evidence.sourceSceneSha256===sha?.Scene)&&evidence.sourceEventSha256===sha?.ConditionalEvent&&
            evidence.sourceConditionSha256===sha?.Condition&&evidence.sourceMissionSha256===sha?.Mission&&
            evidence.sourceMemorySha256===sha?.MemoryShard&&id(evidence.configuredAmount)&&evidence.shardIndexValid===true&&
            typeof evidence.shardIndex==='number'&&Number.isSafeInteger(evidence.shardIndex)&&evidence.shardIndex>=0&&
            ['source.Spawn.RewardOverride.ItemID','source.Spawn.RewardOverride.State.ConsummableData.ItemID'].some(k=>k===evidence.sourcePath)&&
            Array.isArray(evidence.questGates)&&Array.isArray(evidence.sceneItemIds)&&
            (realm?evidence.questGates.length===0&&evidence.sceneItemIds.length===1&&category==='ordinary_gameplay':evidence.questGates.length>0)&&
            (evidence.conditionItemIds===undefined||Array.isArray(evidence.conditionItemIds))&&
            (evidence.characterItemIds===undefined||Array.isArray(evidence.characterItemIds))&&
            (evidence.additionalGates===undefined||Array.isArray(evidence.additionalGates)),'EXTENSION_MEMORY_SPAWN');
          for(const gate of evidence.questGates){
            check(object(gate)&&id(gate.questId)&&gate.category===category,'EXTENSION_QUEST_GATE');relatedIds.push(gate.questId);
          }
          for(const n of evidence.sceneItemIds){check(id(n),'EXTENSION_MEMORY_SCENE');relatedIds.push(n);}
          if(Array.isArray(evidence.conditionItemIds))for(const n of evidence.conditionItemIds){check(id(n),'EXTENSION_MEMORY_CONDITION');relatedIds.push(n);}
          if(Array.isArray(evidence.characterItemIds))for(const n of evidence.characterItemIds){check(id(n),'EXTENSION_MEMORY_CHARACTER');relatedIds.push(n);}
          if(Array.isArray(evidence.additionalGates))for(const g of evidence.additionalGates){
            check(object(g)&&['CharacterUnlocked','CharacterFriendship','AreaUnlocked','CommonConditions'].some(k=>k===g.kind)&&
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
      const expected=e.family==='evolutionAcquisition'?['Clothing','Tool']:e.family==='storyUnlock'?['Story']:e.family==='eventRecurringLoot'?['ConditionalEvent']:e.family==='memoryDefaultContent'?(e.evidence.routeKind==='conditional_grant'?['ConditionalEvent']:['Mission']):e.family==='characterUnlock'?(e.evidence.kind==='character_quest_unlock'?['Mission']:['Character']):e.family==='questLoot'?['Mission']:e.family==='progression'?['Story','DutyAch','BoardGame']:e.family==='conditionalQuest'||e.family==='memorySpawn'||e.family==='eventLootPresent'?['ConditionalEvent']:
        e.family==='questObjective'?['Mission']:(e.family==='storeSequence'||e.family==='storeGeneratedShelf'||e.family==='storeGeneratedStage')?['Display']:e.family==='lootPresent'?['ActivityItem']:e.family==='configuredStore'?[]:['Companion'];
      check(e.sourceId===null||source&&expected.includes(source.nativeCategory),'EXTENSION_IDENTITY');
      const related=e.relatedIds.map(n=>{const r=identity(n);check(r,'EXTENSION_RELATED');return r;});
      return Object.freeze({family:e.family,category:e.category,evidence:e.evidence,identity:source,relatedIdentities:Object.freeze(related)});
    })),
    coverageComplete:false as const,currentAvailabilityVerified:false as const
  }):null));
}
