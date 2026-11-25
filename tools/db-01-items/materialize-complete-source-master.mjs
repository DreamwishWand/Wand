/**
 * Build-only compiler for the definition-complete DB-01 source release.
 * Public assets contain sanitized source facts, never source binaries or saves.
 * Old v1/v2 releases remain compatibility views; v3 has every native ID.
 */
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync,inflateSync} from 'node:zlib';
import {createProjectionWriter,installProjectionStage} from './reuse-public-projections.mjs';
import {attachHistoricalContentOrigin} from './attach-historical-content-origin.mjs';
import {loadAcquisitionColumns} from './acquisition-columns.mjs';
import {loadStallCharacterRelations} from './stall-character-relations.mjs';
import {loadBuildingSkinRelations} from './building-skin-relations.mjs';
import {loadProtoDbAcquisition} from './protodb-acquisition.mjs';
import {loadOriginalPriceFacts} from './original-price-facts.mjs';
import {loadQuestFlowColumns} from './quest-flow-columns.mjs';
import {buildPlacementContexts} from './placement-context.mjs';
import {buildCatalogFacts} from './catalog-acquisition-facts.mjs';
import {buildStoreLayoutFacts} from './store-layout-facts.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const SHA=/^[0-9a-f]{64}$/;
const GUID=/^[0-9a-f]{32}$/;
const ID=i=>Number.isSafeInteger(i)&&i>0;
const LOCALES=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const STATES=['source_linked','unresolved_source','no_universe_in_verified_tag_fields'];
const SCOPES=['source_candidate','item_definition','other_definition'];
const FACETS=new Set(['color','furnitureStyle','clothingStyle','furnitureKind',
  'clothingSlot','disneyUniverse','worldContextTag','ingredientKind','mealKind']);
const SUBMENUS=new Set([0,1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
const json=b=>Buffer.from(JSON.stringify(b)+'\n');
const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
function check(v,c){if(!v)throw Error('DB01_COMPLETE_MASTER_'+c)}
function validAttribute(value,depth=0){
  if(depth>16)return false;
  if(typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return true;
  if(Array.isArray(value))return value.every(v=>validAttribute(v,depth+1));
  return value!==null&&typeof value==='object'&&Object.entries(value).every(([k,v])=>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)&&
    validAttribute(v,depth+1));
}
function attachAttributes(project,e,version,source,byId){
  if(e.attributesSha256===undefined)return undefined;
  check(SHA.test(e.attributesSha256),'ATTRIBUTE_SHA_FORMAT');
  const bytes=readFileSync(join(project,'data/ddv/item-master','source-attributes-steam-'+version+'.json.gz'));
  check(hash(bytes)===e.attributesSha256,'ATTRIBUTE_SHA');
  const a=JSON.parse(gunzipSync(bytes,{maxOutputLength:128*1024*1024}).toString('utf8'));
  check(a.schema==='wand.item-master.source-attributes@1'&&a.release===e.release&&
    a.gameVersion===version&&a.sourceItemsSha256===source.sourceItemsSha256&&
    a.masterArchiveSha256===e.archiveSha256&&a.definitionCount===e.count&&
    a.allOriginalFieldSemanticsVerified===false&&a.gridLayerOccupancyVerified===false&&
    a.runtimePriceVerified===false&&Array.isArray(a.items)&&a.items.length===a.count,
    'ATTRIBUTE_RELEASE');
  const seen=new Set(),coverage=new Map();
  for(const pair of a.items){
    check(Array.isArray(pair)&&pair.length===2&&ID(pair[0])&&byId.has(pair[0])&&
      !seen.has(pair[0])&&pair[1]&&typeof pair[1]==='object'&&!Array.isArray(pair[1])&&
      Object.keys(pair[1]).length>0&&validAttribute(pair[1]),'ATTRIBUTE_ROW');
    const [id,props]=pair;seen.add(id);
    const r=byId.get(id);
    check(r.sourceClass!==null&&Object.keys(props).every(k=>!Object.hasOwn(r.nativeProperties,k)),
      'ATTRIBUTE_SCALAR_DUPLICATION');
    r.sourceAttributes=props;
    for(const k of Object.keys(props))coverage.set(k,(coverage.get(k)??0)+1);
  }
  check(Object.keys(a.coverage).length===coverage.size&&
    [...coverage].every(([k,n])=>a.coverage[k]===n),'ATTRIBUTE_CENSUS');
  return {itemCount:seen.size,fieldCount:coverage.size,
    fieldOccurrences:[...coverage.values()].reduce((a,b)=>a+b,0),
    fields:a.coverage,unmappedSourceClassCount:a.unmappedSourceClassCount,
    allOriginalFieldSemanticsVerified:false,gridLayerOccupancyVerified:false,runtimePriceVerified:false};
}
// Supplement only values recovered from source declarations and the same original corpus.
function attachNativeSupplement(project,e,version,source,byId){
  if(e.nativeSupplementSha256===undefined)return undefined;
  check(SHA.test(e.nativeSupplementSha256),'NATIVE_SUPPLEMENT_SHA_FORMAT');
  const bytes=readFileSync(join(project,'data/ddv/item-master','native-supplement-steam-'+version+'.json'));
  check(hash(bytes)===e.nativeSupplementSha256,'NATIVE_SUPPLEMENT_SHA');
  const a=JSON.parse(bytes.toString('utf8'));
  check(a.schema==='wand.item-master.native-supplement@1'&&a.gameVersion===version&&
    a.sourceItemsSha256===source.sourceItemsSha256&&a.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
    a.strideOverride&&typeof a.strideOverride==='object'&&!Array.isArray(a.strideOverride),'NATIVE_SUPPLEMENT_RELEASE');
  const expected=new Set([...byId.values()].filter(r=>r.sourceAttributes?.GridAreaData?._unresolvedFields?.includes(5)).map(r=>r.itemId));
  const seen=new Set();
  for(const [key,ids] of Object.entries(a.strideOverride)){
    const value=Number(key);
    check(String(value)===key&&Number.isSafeInteger(value)&&value>=-2147483648&&value<=2147483647&&Array.isArray(ids),'STRIDE_VALUE');
    for(const id of ids){
      check(ID(id)&&expected.has(id)&&!seen.has(id),'STRIDE_ITEM');
      const grid=byId.get(id).sourceAttributes.GridAreaData;
      check(!Object.hasOwn(grid,'StrideOverride'),'STRIDE_DUPLICATE');
      grid.StrideOverride=value;
      const remaining=grid._unresolvedFields.filter(n=>n!==5);
      if(remaining.length)grid._unresolvedFields=remaining;else delete grid._unresolvedFields;
      seen.add(id);
    }
  }
  check(seen.size===expected.size,'STRIDE_CENSUS');
  return {strideOverrideCount:seen.size,runtimeSemanticsVerified:false};
}
const REFERENCE_ATTRIBUTE_TYPES={
  AdditionalRewardItemIDs:['BoardGame','Furniture'],
  CharacterInteractionSceneRestrictionsItemID:['Mission','Scene'],
  EmployeeItemIDs:['Building','Character']
};
function attachReferenceAttributes(project,e,version,source,byId){
  if(e.referenceAttributesSha256===undefined)return undefined;
  check(SHA.test(e.referenceAttributesSha256),'REFERENCE_ATTRIBUTE_DIGEST');
  const bytes=readFileSync(join(project,'data/ddv/item-master','reference-attributes-steam-'+version+'.json'));
  check(hash(bytes)===e.referenceAttributesSha256,'REFERENCE_ATTRIBUTE_SHA');
  const a=JSON.parse(bytes.toString('utf8'));
  check(a.schema==='wand.item-master.reference-attributes@1'&&a.gameVersion===version&&
    a.sourceItemsSha256===source.sourceItemsSha256&&a.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
    a.fields&&Object.keys(a.fields).length===Object.keys(REFERENCE_ATTRIBUTE_TYPES).length,'REFERENCE_ATTRIBUTE_RELEASE');
  const fields={};
  for(const [key,entries] of Object.entries(a.fields)){
    check(Object.hasOwn(REFERENCE_ATTRIBUTE_TYPES,key)&&Array.isArray(entries),'REFERENCE_ATTRIBUTE_FIELD');
    const [owner,target]=REFERENCE_ATTRIBUTE_TYPES[key];let last=0;
    for(const [id,values] of entries){
      const row=byId.get(id);
      check(ID(id)&&id>last&&row?.nativeCategory===owner&&Array.isArray(values)&&values.length>0&&
        values.every(v=>key==='EmployeeItemIDs'&&v===0||ID(v)&&byId.get(v)?.nativeCategory===target),
        'REFERENCE_ATTRIBUTE_ROW');
      last=id;
      check(!Object.hasOwn(row.nativeProperties,key),'REFERENCE_ATTRIBUTE_SCALAR');
      const props=row.sourceAttributes??(row.sourceAttributes={});
      check(!Object.hasOwn(props,key)||JSON.stringify(props[key])===JSON.stringify(values),'REFERENCE_ATTRIBUTE_CONFLICT');
      props[key]=values;
    }
    fields[key]=entries.length;
  }
  return {fields,runtimeSemanticsVerified:false};
}
// Reviewed packed numeric arrays. The source's type and category are
// retained; a numeric enum code is not a gameplay interpretation.
const REVIEWED_ROOT_ARRAYS={
  Areas:['RecurringEvent','VillageAreaType'],
  AreasToConsider:['RecurringEvent','VillageAreaType'],
  AssignablePets:['Character','int'],
  BoardGameFigurineItemIDs:['Character','int'],
  Duties:['DutyAch','int'],
  ForbiddenProfessions:['Character','int'],
  ForcedAvailableScheduleTypes:['Character','ScheduleType'],
  HangoutPreferredActivities:['Profession','HangoutActivityType'],
  IncompatibleWith:['Clothing','ClothingItemType'],
  ItemsToCheck:['RecurringEvent','int'],
  ItemsToDeleteAfterMission:['Mission','int'],
  Locations:['ActivityData','VillageAreaType'],
  NecessaryCharactersInVillage:['Dialogue','int'],
  OtherItemsIDs:['Skin','int'],
  PossibleFlowers:['RecurringEvent','int'],
  PreferredItemDifficulties:['Character','PreferredItemDifficulty'],
  SignatureItems:['Character','int'],
  SlotLootTableItemID:['Building','int'],
  Slots:['Preference','int'],
  StallEmployeeItemsIDs:['Skin','int'],
  StallItemsIDs:['Skin','int'],
  VillageAreas:['ActivityItem','VillageAreaType']
};
function attachReviewedRootArrays(project,e,version,source,byId){
  if(e.reviewedRootArraysSha256===undefined)return undefined;
  check(SHA.test(e.reviewedRootArraysSha256),'ROOT_ARRAY_DIGEST');
  const bytes=readFileSync(join(project,'data/ddv/item-master','reviewed-root-arrays-steam-'+version+'.json'));
  check(hash(bytes)===e.reviewedRootArraysSha256,'ROOT_ARRAY_SHA');
  const a=JSON.parse(bytes.toString('utf8'));
  check(a.schema==='wand.item-master.reviewed-root-arrays@1'&&a.gameVersion===version&&
    a.sourceItemsSha256===source.sourceItemsSha256&&a.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
    a.fields&&typeof a.fields==='object'&&!Array.isArray(a.fields),'ROOT_ARRAY_RELEASE');
  const fields={};
  for(const [key,entry] of Object.entries(a.fields)){
    const review=Object.hasOwn(REVIEWED_ROOT_ARRAYS,key)?REVIEWED_ROOT_ARRAYS[key]:null;
    check(review&&entry&&entry.category===review[0]&&entry.elementType===review[1]&&
      Number.isSafeInteger(entry.count)&&entry.count>0&&entry.count<=byId.size&&
      Number.isSafeInteger(entry.valueCount)&&entry.valueCount>=entry.count&&
      typeof entry.packed==='string'&&entry.packed.length<=16*1024*1024,'ROOT_ARRAY_FIELD');
    const decoded=JSON.parse(inflateSync(Buffer.from(entry.packed,'base64'),{maxOutputLength:32*1024*1024}).toString('utf8'));
    check(Array.isArray(decoded)&&decoded.length===2&&Number.isSafeInteger(decoded[0])&&
      decoded[0]>=0&&decoded[0]<=2147483647&&Array.isArray(decoded[1])&&decoded[1].length===entry.count,'ROOT_ARRAY_PAYLOAD');
    const [base,rows]=decoded;
    let id=0,valueCount=0;
    for(const parts of rows){
      check(Array.isArray(parts)&&parts.length>=2&&ID(parts[0]),'ROOT_ARRAY_ROW');
      id+=parts[0];
      const row=byId.get(id);
      check(ID(id)&&row?.nativeCategory===entry.category&&!Object.hasOwn(row.nativeProperties,key)&&
        parts.slice(1).every(v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647-base),'ROOT_ARRAY_VALUE');
      const values=parts.slice(1).map(v=>v+base),props=row.sourceAttributes??(row.sourceAttributes={});
      check(!Object.hasOwn(props,key)||JSON.stringify(props[key])===JSON.stringify(values),'ROOT_ARRAY_CONFLICT');
      props[key]=values;valueCount+=values.length;
    }
    check(valueCount===entry.valueCount,'ROOT_ARRAY_VALUE_COUNT');
    fields[key]={itemCount:entry.count,valueCount,category:entry.category,elementType:entry.elementType};
  }
  return {fields,runtimeSemanticsVerified:false};
}
// Complete reviewed numeric message trees. Empty objects retain presence;
// repeated messages keep their order. Never export raw bytes or source text.
const REVIEWED_MESSAGES={
  GrowthPeriod:['ActivityItem','Duration'],
  ProductionPeriod:['ActivityItem','Duration'],
  VillageArea:['Furniture','OptionalField'],
  RewardsXP:['Mission','MissionReward'],
  Milestones:['DutyAch','RepeatedField<AchievementMilestone>'],
  IntervalData:['RecurringEvent','RecurringEventIntervalData'],
  Cooldowns:['RecurringEvent','RepeatedField<SnippetSpawningRecurringEventItemData.Types.CooldownData>'],
  PossibleItems:['RecurringEvent','RepeatedField<WildCropsSpawningInVillageRecurringEventItemData.Types.ItemAndWeight>'],
  ItemList:['RecurringEvent','ItemSpawningRecurringEventItemData.Types.ItemAndWeightList'],
  DefaultItem:['ActivityItem','ItemInstance']
};
// Category-qualified reviews permit distinct native schemas for one field name.
const REVIEWED_MESSAGE_GROUPS={
  'LootTable.Rewards':['LootTable','Rewards','LootTable'],
  'Mission.AdditionnalRewards':['Mission','AdditionnalRewards','LootTable'],
  'Character.DailySchedule':['Character','DailySchedule','RepeatedField<CharacterItemData.Types.DailyScheduleData>'],
  'Companion.DailySchedule':['Companion','DailySchedule','RepeatedField<CritterItemData.Types.DailyScheduleData>'],
  'Companion.FavoriteItem':['Companion','FavoriteItem','ItemSelector'],
  'Companion.LikeItem':['Companion','LikeItem','ItemSelector'],
  'Building.UpgradeInfo':['Building','UpgradeInfo','RepeatedField<UpgradeData>'],
  'Condition.Conditions':['Condition','Conditions','ConditionsList'],
  'Dialogue.Conditions':['Dialogue','Conditions','ConditionsList'],
  'ConditionalEvent.Conditions':['ConditionalEvent','Conditions','ConditionsList'],
  'Mission.AvailableConditions':['Mission','AvailableConditions','ConditionsList'],
  'Mission.UnlockConditions':['Mission','UnlockConditions','ConditionsList'],
  'RecurringEvent.Conditions':['RecurringEvent','Conditions','ConditionsList'],
  'DutyAch.AvailableWhen':['DutyAch','AvailableWhen','ConditionsList'],
  'Skin.AvailableWhen':['Skin','AvailableWhen','ConditionsList'],
  'ActivityData.Conditions':['ActivityData','Conditions','ConditionsList'],
  'Character.DisableSleepConditions':['Character','DisableSleepConditions','ConditionsList'],
  'Character.OverrideNameConditions':['Character','OverrideNameConditions','ConditionsList'],
  'Character.SwitcherUnlockConditions':['Character','SwitcherUnlockConditions','ConditionsList'],
  'Skin.Conditions':['Skin','Conditions','ConditionsList'],
  'Companion.AppearanceConditions':['Companion','AppearanceConditions','ConditionsList'],
  'MemoryShard.Conditions':['MemoryShard','Conditions','ConditionsList'],
  'Scene.CharacterPresenceConditions':['Scene','CharacterPresenceConditions','ConditionsList'],
  'Story.UnlockConditions':['Story','UnlockConditions','ConditionsList'],
  'Story.VisibilityConditions':['Story','VisibilityConditions','ConditionsList'],
  'Furniture.AvailableWhen':['Furniture','AvailableWhen','ConditionsList'],
  'Companion.VisibilityConditions':['Companion','VisibilityConditions','ConditionsList'],
  'DutyAch.DescriptionCompletedWhen':['DutyAch','DescriptionCompletedWhen','ConditionsList'],
  'DutyAch.DescriptionSucceedWhen':['DutyAch','DescriptionSucceedWhen','ConditionsList'],
  'Skin.CannotRemoveWhen':['Skin','CannotRemoveWhen','ConditionsList'],
  'Character.CanHangoutConditions':['Character','CanHangoutConditions','ConditionsList'],
  'Profession.AvailableConditions':['Profession','AvailableConditions','ConditionsList'],
  'Character.BlockApplyingSkinWhen':['Character','BlockApplyingSkinWhen','ConditionsList'],
  'Character.RemoveSkinWhen':['Character','RemoveSkinWhen','ConditionsList'],
  'Character.UnassignCrewMemberConditions':['Character','UnassignCrewMemberConditions','ConditionsList'],
  'Tag.ConditionsOrHaveIngredients':['Tag','ConditionsOrHaveIngredients','ConditionsList'],
  'Upgrade.AvailableConditions':['Upgrade','AvailableConditions','ConditionsList']
};
const REVIEWED_GUID_PATHS=new Set(['UpgradeInfo.PrefabAddress','UpgradeInfo.Store.InteriorPrefabAddress','UpgradeInfo.UpgradeDialogueAddress']);
// Strings are only original, reviewed identity fields, not arbitrary source text.
const REVIEWED_CONDITION_UUIDS=new Set(['KeyholeStatus.Keyhole','KeyholeItemStatus.Keyhole','LeverStatus.Lever','Timestamp.Timestamp']);
const REVIEWED_CONDITION_KEYS=new Set(['EventTime.Event','Weather.Weather','Expansion.ExpansionName','EventTimeSegment.Event','EventTimeSegment.Segment','FloatingFestivalTime.Event','FloatingFestivalPuzzleTime.Event','FloatingFestivalPuzzleCompleted.Event','MinigameInProgress.Minigame']);
function numericTree(value,depth=0,guidPath=null,condition=false,structure=null){
  check(depth<=(structure?64:16),'MESSAGE_DEPTH');
  if(typeof value==='string'){
    const suffix=guidPath?.split('.').slice(-2).join('.');
    check(structure?Object.hasOwn(structure.paths,guidPath)&&new RegExp('^(?:'+structure.patterns[structure.paths[guidPath]]+')$').test(value):condition?(
      REVIEWED_CONDITION_UUIDS.has(suffix)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)||
      REVIEWED_CONDITION_KEYS.has(suffix)&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)
    ):REVIEWED_GUID_PATHS.has(guidPath)&&/^guid:[0-9a-f]{32}$/.test(value),'MESSAGE_STRING');
    return 1;
  }
  if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<2**53)return 1;
  if(Array.isArray(value))return value.reduce((n,v)=>n+numericTree(v,depth+1,guidPath,condition,structure),0);
  check(value!==null&&typeof value==='object','MESSAGE_VALUE');
  let n=0;
  for(const [k,v] of Object.entries(value)){
    check(/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)&&!['__proto__','constructor','prototype'].includes(k),'MESSAGE_KEY');
    n+=numericTree(v,depth+1,guidPath===null?null:guidPath+'.'+k,condition,structure);
  }
  return n;
}
// Compare source trees by value, not by JSON object key serialization order.
// Array order, missing keys and explicit zero/false remain significant.
function equalSourceTree(a,b){
  if(a===b)return true;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&
    a.length===b.length&&a.every((v,i)=>equalSourceTree(v,b[i]));
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equalSourceTree(a[k],b[k]));
}
// A complete, separately digest-pinned census of root scalar fields. Existing
// canonical projections must agree with the original; no silent replacement.
const ROOT_SCALAR_STRING_FIELDS=new Set('DisplayName IconAddress PrefabAddress DialogueAssetAddress UpdateVersion Description MaleIconAddress MalePrefabAddress AvailableDescription Weathers ImageAddress MaskDataAddress CompletedStoryDescription StartRequestButton IntroDialogue Title MaterialAddress UnlockDialogueAddress CollectionName TimeOfDay DefaultGridLayoutTypeName DefaultGridLayoutPath AlternativeIconAddress PerksPreset AvatarIconAddress DescriptionText SceneName CameraConfig SaplingPrefabAddress HarvestPrefabAddress BoardGameAIConfig HtmlColor RewardAnimationPrefabAddress MaleMakeupAddress FemaleMakeupAddress DefaultSkinIconAddress ShopData MinigameData SpecialMiningRockMaterialAddress LockedPrefabAddress PuzzleTemplateAddress BlurredIconAddress Category ExcludedItemSets Equation PluralDisplayName BurningStateVFXPrefabAddress PremadeDecorationPresetsPath EditCameraConfig SprintVfx SignatureOverrideIcon MaleGownClipAddress MaleClipAddress MaleGownClipAddress FemaleGownClipAddress FemaleClipAddress SpriteSquareAddress SpritePortraitAddress SpriteLandscapeAddress IncludedItemSets SpriteAddress MachineIconAddress EvolvingDescription TimeOfDays DescriptionUnlocked DescriptionLocked ComplexitySettings SpecificTo ExclusivePhotoPoses PortraitAddress ObjectType DescriptionSucceed DescriptionNarrative DescriptionCompleted EventName AccessoryPrefabAddress ExcludedLanguages CostTable'.split(' '));
const ROOT_SCALAR_TEXT=/^[A-Za-z0-9_./!:#, \\+*(){}\[\]^%<>=?&|\-'\u00a0\u00c0-\u024f]{1,512}$/;
function attachReviewedRootScalars(project,e,version,source,byId){
  const digests=e.reviewedRootScalars;
  if(digests===undefined)return undefined;
  check(Array.isArray(digests)&&digests.length>0&&digests.length<=100&&digests.every(x=>SHA.test(x)),'ROOT_SCALAR_DIGESTS');
  const groups=new Set(),seen=new Map();
  let pairs=0,occurrences=0,leaves=0,added=0,existing=0;
  for(const [part,digest] of digests.entries()){
    const bytes=readFileSync(join(project,'data/ddv/item-master','reviewed-root-scalars-steam-'+version+'.part'+part+'.json'));
    check(hash(bytes)===digest,'ROOT_SCALAR_SHA_'+part);
    const a=JSON.parse(bytes.toString('utf8'));
    check(a.schema==='wand.item-master.reviewed-root-scalars@1'&&a.gameVersion===version&&
      a.sourceItemsSha256===source.sourceItemsSha256&&a.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
      a.fields&&typeof a.fields==='object'&&!Array.isArray(a.fields),'ROOT_SCALAR_RELEASE');
    for(const [label,g] of Object.entries(a.fields)){
      const {category,field,declaredType,count,occurrences:occ,leafCount,packed}=g;
      check(label===category+'.'+field+'@'+declaredType&&!groups.has(label)&&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(field)&&!['ID','Name','__proto__','constructor','prototype'].includes(field)&&
        /^(?:[A-Za-z_][\w.]*|RepeatedField<[A-Za-z_][\w.]*>)$/.test(declaredType)&&
        ID(count)&&count<=byId.size&&Number.isSafeInteger(occ)&&occ>=count&&Number.isSafeInteger(leafCount)&&leafCount>=0&&
        typeof packed==='string'&&packed.length<=16*1024*1024,'ROOT_SCALAR_GROUP');
      groups.add(label);
      const rows=JSON.parse(inflateSync(Buffer.from(packed,'base64'),{maxOutputLength:32*1024*1024}).toString('utf8'));
      check(Array.isArray(rows)&&rows.length===count,'ROOT_SCALAR_ROWS');
      const repeated=declaredType.startsWith('RepeatedField<'),type=repeated?declaredType.slice(14,-1):declaredType;
      const valid=v=>type==='string'?typeof v==='string'&&ROOT_SCALAR_STRING_FIELDS.has(field)&&ROOT_SCALAR_TEXT.test(v):
        type==='bool'?typeof v==='boolean':type==='float'||type==='double'?typeof v==='number'&&Number.isFinite(v):
        Number.isSafeInteger(v)&&(type==='uint'?v>=0&&v<=0xffffffff:type==='ulong'?v>=0:type==='long'||v>=-0x80000000&&v<=0x7fffffff);
      let id=0,n=0;
      for(const pair of rows){
        check(Array.isArray(pair)&&pair.length===2&&ID(pair[0]),'ROOT_SCALAR_ROW');
        id+=pair[0];const row=byId.get(id),value=pair[1];
        check(ID(id)&&row?.nativeCategory===category&&(repeated?Array.isArray(value)&&value.every(valid):valid(value)),'ROOT_SCALAR_VALUE_'+label+'_'+id);
        let keys=seen.get(id);if(!keys){keys=new Set();seen.set(id,keys);}
        check(!keys.has(field),'ROOT_SCALAR_DUPLICATE');keys.add(field);
        const props=row.sourceAttributes??(row.sourceAttributes={});
        const hasNative=Object.hasOwn(row.nativeProperties,field),hasSource=Object.hasOwn(props,field);
        check(!(hasNative&&hasSource),'ROOT_SCALAR_DUPLICATE_PRIOR');
        if(hasNative||hasSource){
          check(equalSourceTree(hasNative?row.nativeProperties[field]:props[field],value),'ROOT_SCALAR_CONFLICT_'+label+'_'+id);
          existing++;
        }else{props[field]=value;added++;}
        n+=repeated?value.length:1;
      }
      check(n===leafCount,'ROOT_SCALAR_LEAVES');pairs+=count;occurrences+=occ;leaves+=n;
    }
  }
  return {groupCount:groups.size,itemCount:seen.size,fieldPairs:pairs,occurrences,leafCount:leaves,existingPairs:existing,addedPairs:added,identityOccurrences:byId.size*2,runtimeSemanticsVerified:false};
}
// Legacy attribute extraction retained known fields and recorded omissions.
// Permit full source-tree enrichment only for these audited original groups.
// Never change any previously decoded value, array ordering, or array length.
const LEGACY_COMPLETE_GROUPS=new Set([
  'Building.GridAreaData','Building.GridEditRestriction','Building.SpecificUnlockCost','Building.UnlockCost',
  'ActivityItem.GridAreaData','ActivityItem.CollectionVisibility','ActivityItem.GridEditRestriction',
  'Furniture.GridAreaData','Furniture.CatalogVisibilityConditions','Furniture.PriceOverride',
  'Furniture.GridEditRestriction','Furniture.CollectionVisibility','Furniture.ItemList',
  'Clothing.CatalogVisibilityConditions','Clothing.PriceOverride','Currency.GridAreaData',
  'Tool.GridAreaData','Trimming.CatalogVisibilityConditions','Skin.CollectionVisibility',
  'Story.UnlockCost','Set.CatalogVisibilityConditions','ActivityData.AppearWhen','CollectionSet.Groups'
]);
function knownSourceFieldsAgree(prior,value){
  if(prior===value)return true;
  if(prior===null||value===null||typeof prior!=='object'||typeof value!=='object')return false;
  if(Array.isArray(prior)||Array.isArray(value))return Array.isArray(prior)&&Array.isArray(value)&&
    prior.length===value.length&&prior.every((v,i)=>knownSourceFieldsAgree(v,value[i]));
  return Object.entries(prior).every(([key,v])=>key==='_unresolvedFields'
    ? Array.isArray(v)&&v.every(n=>Number.isSafeInteger(n)&&n>0)
    : Object.hasOwn(value,key)&&knownSourceFieldsAgree(v,value[key]));
}
function agreesWithPriorMessage(label,prior,value){
  if(equalSourceTree(prior,value))return true;
  if(LEGACY_COMPLETE_GROUPS.has(label))return knownSourceFieldsAgree(prior,value);
  // The original narrow crafting Result decoder deliberately omitted field 3
  // (ItemState). Only replace that explicitly marked omission, never other data.
  if(label==='ActivityData.Result@CraftingRecipeItemData.Types.ResultInstance'&&
    prior&&typeof prior==='object'&&!Array.isArray(prior)&&
    equalSourceTree(prior._unresolvedFields,[3])&&Object.hasOwn(value,'State')){
    const {_unresolvedFields,...oldKnown}=prior;
    const {State,...newKnown}=value;
    return equalSourceTree(oldKnown,newKnown);
  }
  return false;
}
function attachReviewedMessages(project,e,version,source,byId,grouped=false,structureBase=null){
  const structural=structureBase!==null;
  const digest=structural?e.reviewedStructure?.[structureBase]:grouped?e.reviewedMessageGroupsSha256:e.reviewedMessagesSha256;
  const base=structureBase??(grouped?'reviewed-message-groups':'reviewed-messages');
  if(digest===undefined)return undefined;
  check(SHA.test(digest),'MESSAGE_DIGEST');
  const bytes=readFileSync(join(project,'data/ddv/item-master',base+'-steam-'+version+'.json'));
  check(hash(bytes)===digest,'MESSAGE_SHA');
  const a=JSON.parse(bytes.toString('utf8'));
  const policy=structural?JSON.parse(readFileSync(join(project,'tools/db-01-items/reviewed-structure-policy.json'),'utf8')):null;
  check(a.schema==='wand.item-master.'+(structural?'reviewed-structure-groups':base)+'@1'&&a.gameVersion===version&&
    a.sourceItemsSha256===source.sourceItemsSha256&&a.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
    a.fields&&typeof a.fields==='object'&&!Array.isArray(a.fields),'MESSAGE_RELEASE');
  const fields={};
  for(const [label,entry] of Object.entries(a.fields)){
    const reviews=structural?policy.groups:grouped?REVIEWED_MESSAGE_GROUPS:REVIEWED_MESSAGES;
    const review=Object.hasOwn(reviews,label)?reviews[label]:null;
    const key=grouped?review?.[1]:label;
    check(review&&entry&&entry.category===review[0]&&entry.declaredType===review[grouped?2:1]&&
      (!grouped||entry.field===key)&&
      ID(entry.count)&&entry.count<=byId.size&&Number.isSafeInteger(entry.occurrences)&&entry.occurrences>=entry.count&&
      Number.isSafeInteger(entry.leafCount)&&entry.leafCount>=0&&typeof entry.packed==='string'&&entry.packed.length<=16*1024*1024,
      'MESSAGE_FIELD');
    const decoded=JSON.parse(inflateSync(Buffer.from(entry.packed,'base64'),{maxOutputLength:32*1024*1024}).toString('utf8'));
    check(Array.isArray(decoded)&&decoded.length===entry.count,'MESSAGE_ROWS');
    let id=0,occurrences=0,leafCount=0;
    const repeated=/^(?:RepeatedField|MapField)</.test(entry.declaredType);
    const message=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    for(const pair of decoded){
      check(Array.isArray(pair)&&pair.length===2&&ID(pair[0]),'MESSAGE_ROW');
      id+=pair[0];const row=byId.get(id),value=pair[1];
      check(ID(id)&&row?.nativeCategory===entry.category&&!Object.hasOwn(row.nativeProperties,key)&&
        (repeated?Array.isArray(value)&&value.length>0&&value.every(message):message(value)),'MESSAGE_OWNER');
      occurrences+=repeated?value.length:1;leafCount+=numericTree(value,0,key,entry.declaredType==='ConditionsList',structural?{paths:policy.stringPaths[label],patterns:policy.patterns}:null);
      const props=row.sourceAttributes??(row.sourceAttributes={});
      check(!Object.hasOwn(props,key)||agreesWithPriorMessage(label,props[key],value),'MESSAGE_CONFLICT_'+label+'_'+id);
      props[key]=value;
    }
    check(occurrences===entry.occurrences&&leafCount===entry.leafCount,'MESSAGE_CENSUS');
    fields[label]={itemCount:entry.count,occurrences,leafCount,category:entry.category,declaredType:entry.declaredType};
  }
  return {fields,runtimeSemanticsVerified:false};
}
// Source-declared ItemID-named numeric fields only. Membership in the same
// release is required. Do not infer a reference from an arbitrary integer.
// Reviewed root integer arrays whose names do not always end in ItemID.
// The owner and target category checks are derived from the same source corpus.
const REVIEWED_ROOT_REFERENCE_TARGETS={
  AssignablePets:['Companion','Character'],
  BoardGameFigurineItemIDs:['BoardGame'],
  Duties:['DutyAch'],
  ForbiddenProfessions:['Profession'],
  ItemsToCheck:['ActivityItem'],
  ItemsToDeleteAfterMission:['ActivityItem','Furniture'],
  NecessaryCharactersInVillage:['Character'],
  OtherItemsIDs:['Building'],
  PossibleFlowers:['ActivityItem'],
  SignatureItems:['Clothing','Furniture','Skin','ActivityItem','Tool'],
  SlotLootTableItemID:['LootTable'],
  Slots:['Preference'],
  StallEmployeeItemsIDs:['Character'],
  StallItemsIDs:['Building']
};
// Source-audited references in root ConditionsList messages. Not a runtime evaluator.
const REVIEWED_CONDITION_REFERENCE_TARGETS={
  "MissionStepStatus.Mission": [
    "Mission"
  ],
  "MissionStatus.Mission": [
    "Mission"
  ],
  "DialogueFlag.Flag": [
    "Dialogue"
  ],
  "CommonConditions.Condition": [
    "Condition"
  ],
  "CurrentScene.Scene": [
    "Scene"
  ],
  "MissionObjectiveStatus.Mission": [
    "Mission"
  ],
  "CharacterUnlocked.Character": [
    "Character"
  ],
  "MissionCompleted.Mission": [
    "Mission"
  ],
  "MissionStepCompleted.Mission": [
    "Mission"
  ],
  "CharacterFriendship.Character": [
    "Character"
  ],
  "Inventory.Item": [
    "ActivityItem",
    "Upgrade",
    "Currency",
    "Clothing",
    "Furniture"
  ],
  "PetAssigned.Pet": [
    "Companion"
  ],
  "MissionOngoing.Mission": [
    "Mission"
  ],
  "KeyholeItemStatus.Item": [
    "ActivityItem",
    "Companion"
  ],
  "BuildingUnlocked.Building": [
    "Building"
  ],
  "CurrentVillage.VillageScene": [
    "Scene"
  ],
  "ToolUnlocked.Tool": [
    "Tool"
  ],
  "FTUEEventCompleted.FTUEEvent": [
    "Ftue"
  ],
  "PetUnlocked.Pet": [
    "Companion"
  ],
  "CharacterSkin.Skin": [
    "Skin"
  ],
  "HasEverOwned.Item": [
    "Furniture"
  ],
  "WearingClothes.Clothes": [
    "Clothing"
  ],
  "MissionObjectiveCompleted.Mission": [
    "Mission"
  ],
  "RealmUnlocked.Universe": [
    "Tag"
  ],
  "MountIsUnlocked.Mount": [
    "Companion"
  ],
  "MissionObjectiveProgression.Mission": [
    "Mission"
  ],
  "MountIsRiding.Mount": [
    "Companion"
  ],
  "MemoryShard.Shard": [
    "MemoryShard"
  ],
  "StoryCompleted.Story": [
    "Story"
  ],
  "MissionAvailable.Mission": [
    "Mission"
  ],
  "PetAssignedToCharacter.Pet": [
    "Companion"
  ],
  "StallAvailable.Stall": [
    "Building"
  ],
  "MountHasUpgrade.Upgrade": [
    "Upgrade"
  ],
  "MountBondingLevel.Mount": [
    "Companion"
  ],
  "CookingRecipeVisible.Recipe": [
    "ActivityData"
  ],
  "CookingRecipeKnownWith.Tag": [
    "Tag"
  ],
  "BuildingLevel.Building": [
    "Building"
  ],
  "PetAssignedToCharacter.Character": [
    "Character"
  ],
  "IsHangingOut.Character": [
    "Character"
  ],
  "MissionObjectiveSkipped.Mission": [
    "Mission"
  ],
  "TrialState.Trial": [
    "DutyAch"
  ]
};
// Explicit source declarations whose native field names do not end in ItemID.
// Match only a canonical definition of the reviewed target category; zero,
// unresolved or differently typed values remain in the original source column.
const ROOT_DIRECT_REFERENCE_TARGETS={
  'ActivityItem.TreasureLootTable':['LootTable'],
  'ActivityData.RecipeType':['Tag'],
  'Building.Scene':['Scene'],
  'Building.SkinToBeAddedOnMaxUpgrade':['Skin'],
  'Clothing.IncompatibleWithItem':['Clothing'],
  'Companion.DefaultUpgrade':['Upgrade'],
  'Companion.Scene':['Scene'],
  'Dialogue.NearBuildingID':['Building'],
  'Formula.ForCurrency':['Currency'],
  'Mission.OwnerCharacter':['Character'],
  'Tool.DefaultUpgrade':['Upgrade']
};
const PRICE_REFERENCE_OWNERS=new Set(['Furniture','Clothing']);
const COLLECTION_TAG_REFERENCE_PATH=/^source\.Groups\[\d+\]\.CollectionsByType\[\d+\]\.[A-Za-z]+\.ByGameplayTag$/;
// Source archive paths inspected directly in reviewed-structure and quest-step
// projections. Normalize only array positions; retain exact occurrence paths.
const NESTED_DIRECT_REFERENCE_TARGETS={
  'ConditionalEvent.Spawn.SpawnLocationSource.Building.Building':['Building'],
  'ConditionalEvent.Spawn.SpawnLocationSource.AnywhereInScene.Scene':['Scene'],
  'ConditionalEvent.Spawn.SpawnLocationSourceList[].Building.Building':['Building'],
  'ConditionalEvent.Spawn.SpawnLocationSourceList[].AnywhereInScene.Scene':['Scene'],
  'ConditionalEvent.Spawn.SpawnLocationSource.NearUniqueItem.SceneID':['Scene'],
  'ConditionalEvent.Spawn.SpawnLocationSourceList[].NearUniqueItem.SceneID':['Scene'],
  'ConditionalEvent.Spawn.SpawnAnimatonData.NearUniqueItem.SceneID':['Scene'],
  'ConditionalEvent.Spawn.GardenItem.Seed':['ActivityItem'],
  'ConditionalEvent.Spawn.InboxReward':['ActivityItem'],
  'ConditionalEvent.EmptyDiffGrid.Building':['Building'],
  'ConditionalEvent.EmptyDiffGrid.IncludeList[]':['ActivityItem'],
  'ConditionalEvent.EmptyDiffGrid.ExcludeList[]':['ActivityItem'],
  'ConditionalEvent.ReplaceFurnitureOnGrid.ItemToReplaceID':['Furniture'],
  'ConditionalEvent.AddTimeLostTreasure.Location.Scene':['Scene'],
  'ConditionalEvent.SpawnSnippet.Location.Scene':['Scene'],
  'RecurringEvent.SpecificLocation.Scene':['Scene'],
  'RecurringEvent.WeedOverrides.WeedLootTable':['LootTable'],
  'RecurringEvent.SpawnInScenes.Scenes[]':['Scene'],
  'RecurringEvent.SpawnAround.TargetScene':['Scene'],
  'Building.DialogueStall.ItemsToGive[].ItemToGive':['ActivityItem'],
  'Building.GridEditRestriction.CanPlace.Scene':['Scene'],
  'Building.SpecificUnlockCost.Id':['Currency'],
  'Building.UnlockCost[].Id':['Currency'],
  'Mission.OverrideRewards.Rewards[]':['LootTable'],
  'Mission.OwnerOverrides[].Character':['Character'],
  'DutyAch.Upgrade.BuildingID':['Building'],
  'DutyAch.Upgrade.HourglassUpgradeID':['Upgrade'],
  'DutyAch.CompletionRewards[].Id':['Clothing','Furniture','ActivityItem','Currency','Companion','Skin','Tool','Upgrade','Trimming','MountGear','AvatarFeature','Makeup'],
  'DutyAch.Unlock.Area.AnyInVillage':['Scene'],
  'DutyAch.Unlock.MemoryShard.MemoryShard':['MemoryShard'],
  'DutyAch.RoyalDuty.VillageRestriction':['Scene'],
  'DutyAch.PickUp.With.Character':['Character'],
  'DutyAch.Objective.Friend.CharacterID':['Character'],
  'DutyAch.Objective.GiftToCharacter.CharacterID':['Character'],
  'DutyAch.Objective.Friend.Companions.Companions[]':['Companion'],
  'Display.UniqueTagsFilters[].UniqueTagsPerGroup.Tags[]':['Tag']
};
const SELECTOR_REFERENCE_OWNERS=new Set(['ConditionalEvent','DutyAch','Mission']);
const SELECTOR_ITEM_TARGETS=new Set(['ActivityItem','ActivityData','Furniture','Building','Character','Companion','Currency','Clothing','MemoryShard','Skin','Tool','Upgrade','Scene','Environment','Trimming','BoardGame','MountGear','AvatarFeature','Makeup','Display','Set']);
function buildReferenceColumns(rows){
  const categories=new Map(rows.map(r=>[r.itemId,r.nativeCategory]));
  const ids=new Set(categories.keys());
  const incoming=new Map(),outgoing=new Map();
  const add=(map,id,edge)=>{
    let list=map.get(id);if(!list){list=[];map.set(id,list);}list.push(edge);
  };
  for(const row of rows){
    const origin=row.itemId;
    const emit=(target,path)=>{
      if(!ID(target)||!ids.has(target))return;
      add(outgoing,origin,[target,path]);add(incoming,target,[origin,path]);
    };
    const walk=(value,path,name)=>{
      if(Array.isArray(value)){value.forEach((part,i)=>walk(part,path+'['+i+']',name));return;}
      if(value!==null&&typeof value==='object'){
        for(const [key,part] of Object.entries(value))walk(part,path+'.'+key,key);
        return;
      }
      const rootField=path.match(/^source\.([A-Za-z][A-Za-z0-9_]*)(?:\[\d+\])?$/)?.[1];
      const rootTargets=rootField&&ROOT_DIRECT_REFERENCE_TARGETS[row.nativeCategory+'.'+rootField];
      const normalizedPath=row.nativeCategory+'.'+path.slice('source.'.length).replace(/\[\d+\]/g,'[]');
      const nestedTargets=NESTED_DIRECT_REFERENCE_TARGETS[normalizedPath];
      const conditionTargets=/\.Conditions\[\d+\]\.[A-Za-z]+\.[A-Za-z]+$/.test(path)
        ? REVIEWED_CONDITION_REFERENCE_TARGETS[path.split('.').slice(-2).join('.')]:undefined;
      if(rootTargets){
        if(rootTargets.includes(categories.get(value)))emit(value,path);
      }else if(PRICE_REFERENCE_OWNERS.has(row.nativeCategory)&&path==='source.PriceOverride.Price.Id'){
        if(categories.get(value)==='Currency')emit(value,path);
      }else if(row.nativeCategory==='CollectionSet'&&COLLECTION_TAG_REFERENCE_PATH.test(path)){
        if(categories.get(value)==='Tag')emit(value,path);
      }else if(row.nativeCategory==='Companion'&&/^(?:source\.(?:FavoriteItem|LikeItem))\.(?:Item\.(?:Item|ItemIngredient)\.Item|ItemList\.(?:Item|ItemIngredient)\.ItemList\.List\[\d+\]\.Item)$/.test(path)){
        if(value!==0){
          check(categories.get(value)==='ActivityItem','COMPANION_SELECTOR_TARGET');emit(value,path);
        }
      }else if(row.nativeCategory==='Building'&&/^source\.UpgradeInfo\[\d+\]\.Cost\.Id$/.test(path)){
        check(['Currency','ActivityItem'].includes(categories.get(value)),'UPGRADE_COST_TARGET');
        emit(value,path);
      }else if(row.nativeCategory==='LootTable'&&/^source\.Rewards\.SubLootTables\[\d+\]\.(?:ItemsConditional\[\d+\]\.Conditions|AvailableWhen)\.Conditions\[\d+\]\.Mission(?:Status|ObjectiveStatus|StepStatus)\.Mission$/.test(path)){
        check(categories.get(value)==='Mission','LOOT_MISSION_TARGET');
        emit(value,path);
      }else if(row.nativeCategory==='LootTable'&&/^source\.Rewards\.SubLootTables\[\d+\]\.Items\[\d+\]\.State\.MealData\.IngredientsUsed\[\d+\]$/.test(path)){
        check(categories.get(value)==='ActivityItem','LOOT_INGREDIENT_TARGET');
        emit(value,path);
      }else if(REVIEWED_MESSAGE_GROUPS[row.nativeCategory+'.'+path.split('.')[1]]?.[2]==='ConditionsList'&&
        Object.hasOwn(REVIEWED_CONDITION_REFERENCE_TARGETS,path.split('.').slice(-2).join('.'))){
        const targets=REVIEWED_CONDITION_REFERENCE_TARGETS[path.split('.').slice(-2).join('.')];
        check(targets.includes(categories.get(value)),'CONDITION_REFERENCE_TARGET');
        emit(value,path);
      }else if((row.nativeCategory==='Mission'&&/^source\.(?:Steps|AutoAccept)\[/.test(path)||row.nativeCategory==='Character'&&/^source\.OverrideSchedules\[/.test(path))&&
        /\.(?:MissionStepStatus|MissionStatus|MissionObjectiveStatus)\.Mission$/.test(path)){
        check(categories.get(value)==='Mission','STRUCTURE_MISSION_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='Mission'&&/^source\.(?:Steps|AutoAccept)\[/.test(path)&&/\.Inventory\.Item$/.test(path)){
        check(['ActivityItem','Upgrade','Companion','Furniture'].includes(categories.get(value)),'STRUCTURE_INVENTORY_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='Furniture'&&/^source\.ToolBreakable\.(?:Tool|Upgrade)$/.test(path)){
        check(categories.get(value)===name,'STRUCTURE_TOOL_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='Preference'&&/^source\.Favorite(?:CraftingMaterials|Flowers|Ingredients|Meals|Minerals)\.(?:Inclusions\.Custom|Exclusions)\.(?:SpecificItems|DominantColor|IngredientType|IngredientTags|ContainsIngredients|MealType)\[\d+\]$/.test(path)){
        const target=name==='SpecificItems'?'ActivityItem':'Tag';
        check(categories.get(value)===target,'PREFERENCE_REFERENCE_TARGET');emit(value,path);
      }else if(row.nativeCategory==='Furniture'&&/^source\.(?:CraftingStation|TimeBendingStation)\.CraftingRecipeTypes\[\d+\]$/.test(path)){
        check(categories.get(value)==='Tag','CRAFTING_STATION_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='Furniture'&&/^source\.(?:AutoCooker|Gardener)\.ActionCost\.Id$/.test(path)){
        check(categories.get(value)==='Currency','MACHINE_COST_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='DutyAch'&&/^source\.StepDifficultyLayers\[\d+\]\.Rewards\[\d+\]\.Id$/.test(path)){
        check(categories.get(value)==='Currency','DUTY_REWARD_REFERENCE');emit(value,path);
      }else if(row.sourceClass==='RecipeItemData'&&/^source\.Ingredients\[\d+\]\.(?:Any|TagsList\.List\[\d+\])$/.test(path)){
        check(categories.get(value)==='Tag','RECIPE_INGREDIENT_TAG_REFERENCE');emit(value,path);
      }else if(row.sourceClass==='RecipeItemData'&&/^source\.Ingredients\[\d+\]\.ValidItemsList\.List\[\d+\]$/.test(path)){
        check(categories.get(value)==='ActivityItem','RECIPE_ALTERNATIVE_ITEM_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='ActivityData'&&/^source\.(?:Location|Locations\[\d+\])\.Scene$/.test(path)){
        check(categories.get(value)==='Scene','ACTIVITY_SCENE_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='ConditionalEvent'&&/^source\.SetDialogueFlag\.Flag$/.test(path)){
        check(categories.get(value)==='Dialogue','DIALOGUE_FLAG_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='Furniture'&&/^source\.Mannequin\.EmptyMannequinClothes\[\d+\]\.Value$/.test(path)){
        check(categories.get(value)==='Clothing','MANNEQUIN_CLOTHING_REFERENCE');emit(value,path);
      }else if(row.nativeCategory==='ConditionalEvent'&&path==='source.SendMailbox.Villager'){
        if(value!==0){check(categories.get(value)==='Character','MAILBOX_VILLAGER_REFERENCE');emit(value,path);}
      }else if(row.nativeCategory==='Formula'&&/^source\.TablesOfValues\[\d+\]\.Values\[\d+\]\.Key$/.test(path)&&typeof value==='string'&&/^[1-9]\d*$/.test(value)){
        const tableIndex=Number(path.match(/^source\.TablesOfValues\[(\d+)\]/)[1]);
        const table=row.sourceAttributes?.TablesOfValues?.[tableIndex];
        const target=Number(value);
        // Only ID-bearing fields, not numeric enum keys or literal amounts.
        if(/^Tags\//.test(table?.FieldName??'')){check(categories.get(target)==='Tag','FORMULA_TAG_REFERENCE');emit(target,path);}
        else if(table?.FieldName==='Building'){if(ids.has(target)){check(categories.get(target)==='Building','FORMULA_BUILDING_REFERENCE');emit(target,path);}}
        else if(['Item','TargetItem.Item','TargetMealItem'].includes(table?.FieldName)){if(ids.has(target)){check(categories.get(target)==='ActivityItem','FORMULA_ITEM_REFERENCE');emit(target,path);}}
      }else if(row.nativeCategory==='CollectionSet'&&/^source\.Groups\[\d+\]\.CollectionsByItem\[\d+\]\.ItemList\[\d+\]$/.test(path)){
        emit(value,path); // Includes explicit exclusions; path retains original polarity context.
      }else if(nestedTargets){
        if(nestedTargets.includes(categories.get(value)))emit(value,path);
      }else if(conditionTargets&&['Mission','Building','Furniture','ActivityItem','Clothing','Character','Companion','DutyAch','LootTable','ConditionalEvent','Condition','Scene','Skin','Tool','Trimming','Set','ActivityData','RecurringEvent','Upgrade','Display','MemoryShard','Currency','Preference','Story'].includes(row.nativeCategory)){
        if(conditionTargets.includes(categories.get(value)))emit(value,path);
      }else if(SELECTOR_REFERENCE_OWNERS.has(row.nativeCategory)&&/\.(?:Item\.(?:Item|ItemIngredient)\.Item|ItemList\.(?:Item|ItemIngredient)\.ItemList\.List\[\d+\]\.Item)$/.test(path)){
        if(SELECTOR_ITEM_TARGETS.has(categories.get(value)))emit(value,path);
      }else if(row.nativeCategory==='DutyAch'&&/\.(?:FilterGenerator|ItemGenerator)\.Tags\[\d+\]\.Tags\[\d+\]$|\.FilterGenerator\.IngredientsType\[\d+\]$|\.AnyCompanion\.HasTag$/.test(path)){
        if(categories.get(value)==='Tag')emit(value,path);

      }else if(/ItemIds?$/i.test(name))emit(value,path);
      else if(row.nativeCategory==='DutyAch'&&/^source\.Milestones\[\d+\]\.RewardItem$/.test(path)){
        check(ID(value)&&ids.has(value),'MILESTONE_REWARD_TARGET');emit(value,path);
      }else if(row.nativeCategory==='Mission'&&/^source\.RewardsXP\.Currency\[\d+\]\.CurrencyId$/.test(path)){
        check(categories.get(value)==='Currency','MISSION_CURRENCY_TARGET');emit(value,path);
      }
    };
    for(const props of [row.nativeProperties,row.sourceAttributes??{}]){
      for(const [key,value] of Object.entries(props)){
        const path='source.'+key;
        const reviewed=Object.hasOwn(REVIEWED_ROOT_REFERENCE_TARGETS,key)&&
          REVIEWED_ROOT_ARRAYS[key][0]===row.nativeCategory&&Array.isArray(value)&&value.every(Number.isSafeInteger);
        if(reviewed){
          for(const [i,target] of value.entries()){
            if(target===0)continue;
            check(REVIEWED_ROOT_REFERENCE_TARGETS[key].includes(categories.get(target)),'REVIEWED_REFERENCE_TARGET');
            emit(target,path+'['+i+']');
          }
        }else walk(value,path,key);
      }
    }
    // Already verified native tag fields and Set references are separate
    // canonical evidence. Do not relabel these as acquisition or ownership.
    for(const [i,tag] of row.tags.entries())emit(tag.id,'tags['+i+'].id');
    if(row.sourceSetItemId!==null)emit(row.sourceSetItemId,'sourceSetItemId');
  }
  return {incoming,outgoing};
}
const LOCALIZED_FIELDS=['Description','DescriptionText','EvolvingDescription','PluralDisplayName'];
function loadLocalizations(project,e,version,source,byId){
  if(e.localization===undefined)return undefined;
  const config=e.localization;
  check(SHA.test(config.sha256)&&Number.isSafeInteger(config.parts)&&config.parts>0&&config.parts<=100,'LOCALIZATION_METADATA');
  const packed=Buffer.concat(Array.from({length:config.parts},(_,i)=>
    readFileSync(join(project,'data/ddv/item-master','item-localizations-steam-'+version+'.json.gz.part'+i))));
  check(hash(packed)===config.sha256,'LOCALIZATION_SHA');
  const l=JSON.parse(gunzipSync(packed,{maxOutputLength:128*1024*1024}).toString('utf8'));
  check(l.schema==='wand.item-master.localized-source@1'&&l.release===e.release&&
    l.gameVersion===version&&l.sourceItemsSha256===source.sourceItemsSha256&&
    l.masterArchiveSha256===e.archiveSha256&&l.attributesSha256===e.attributesSha256&&
    Array.isArray(l.items)&&l.items.length===l.count,'LOCALIZATION_RELEASE');
  const expected=new Map();
  for(const row of byId.values()){
    if(row.nativeCategory==='Dialogue')continue;
    const fields=Object.fromEntries(LOCALIZED_FIELDS.filter(k=>typeof row.sourceAttributes?.[k]==='string')
      .map(k=>[k,row.sourceAttributes[k]]));
    if(Object.keys(fields).length)expected.set(row.itemId,fields);
  }
  const keys=new Set(),seen=new Set(),fieldCounts={};
  for(const [id,fields] of l.items){
    const actual=expected.get(id);
    check(actual&&!seen.has(id)&&Object.keys(actual).length===Object.keys(fields).length&&
      Object.entries(fields).every(([k,v])=>actual[k]===v),'LOCALIZATION_ITEM_LINK');
    seen.add(id);
    for(const [k,v] of Object.entries(fields)){keys.add(v);fieldCounts[k]=(fieldCounts[k]??0)+1;}
  }
  check(seen.size===expected.size&&keys.size===l.keyCount&&
    Object.keys(fieldCounts).length===Object.keys(l.fieldCounts).length&&
    Object.entries(fieldCounts).every(([k,v])=>l.fieldCounts[k]===v),'LOCALIZATION_LINK_CENSUS');
  check(Object.keys(l.translations).length===LOCALES.length&&Object.keys(l.evidence).length===LOCALES.length,'LOCALIZATION_LOCALES');
  for(const locale of LOCALES){
    const values=l.translations[locale],ev=l.evidence[locale];
    check(values&&ev&&SHA.test(ev.archiveSha256)&&Object.values(ev.members).every(v=>SHA.test(v))&&
      Object.keys(values).length===l.localeCounts[locale]&&
      Object.entries(values).every(([k,v])=>keys.has(k)&&typeof v==='string'&&v.trim().length>0&&v.length<=8192),
      'LOCALIZATION_VALUE_'+locale);
  }
  const all=[...keys].filter(k=>LOCALES.every(locale=>Object.hasOwn(l.translations[locale],k))).length;
  check(all===l.allLocalesKeyCount,'LOCALIZATION_ALL_LOCALES');
  return {translations:l.translations,coverage:{itemCount:l.count,keyCount:l.keyCount,
    allLocalesKeyCount:all,fieldCounts:l.fieldCounts,localeCounts:l.localeCounts,evidence:l.evidence}};
}
// Namespace bucketing keeps the text keys of one quest together while bounding
// the per-language read size. It is stable across updates and independent of IDs.
function linkedTextBucket(key){
  const ns=key.split('.',1)[0];
  let h=2166136261;
  for(let i=0;i<ns.length;i++)h=Math.imul(h^ns.charCodeAt(i),16777619);
  return (h&63).toString(16).padStart(2,'0');
}
function loadLinkedLocalizations(project,e,version,source,byId,legacy){
  const config=e.linkedLocalizations;
  if(config===undefined)return undefined;
  check(config&&Object.keys(config).length===LOCALES.length&&LOCALES.every(l=>SHA.test(config[l])),'LINKED_LOCALIZATION_CONFIG');
  const candidates=new Set();
  function visit(v){
    if(typeof v==='string'){candidates.add(v);return;}
    if(Array.isArray(v)){for(const x of v)visit(x);return;}
    if(v!==null&&typeof v==='object')for(const x of Object.values(v))visit(x);
  }
  for(const row of byId.values()){
    visit(row.nativeProperties);visit(row.sourceAttributes);
  }
  let referenceKeys=null;
  const translations={},sourceArchiveHashes={},localeCounts={};
  for(const locale of LOCALES){
    const bytes=readFileSync(join(project,'data/ddv/item-master','linked-localizations-steam-'+version+'-'+locale+'.json'));
    check(hash(bytes)===config[locale],'LINKED_LOCALIZATION_SHA_'+locale);
    const a=JSON.parse(bytes.toString('utf8'));
    check(a.schema==='wand.item-master.linked-localizations@1'&&a.gameVersion===version&&a.locale===locale&&
      a.sourceItemsSha256===source.sourceItemsSha256&&a.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
      SHA.test(a.sourceArchiveSha256)&&(!legacy||a.sourceArchiveSha256===legacy.coverage.evidence[locale].archiveSha256)&&
      ID(a.count)&&typeof a.packed==='string'&&a.packed.length<=16*1024*1024,'LINKED_LOCALIZATION_RELEASE');
    const values=JSON.parse(inflateSync(Buffer.from(a.packed,'base64'),{maxOutputLength:64*1024*1024}).toString('utf8'));
    check(values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length===a.count,'LINKED_LOCALIZATION_COUNT');
    const keys=Object.keys(values);
    for(const key of keys){
      const v=values[key];
      check(candidates.has(key)&&key.length<=1024&&typeof v==='string'&&v.trim().length>0&&v.length<=8192,'LINKED_LOCALIZATION_VALUE_'+key);
      const previous=legacy?.translations[locale]?.[key];
      if(previous!==undefined)check(previous===v,'LINKED_LOCALIZATION_CONFLICT_'+key);
    }
    if(referenceKeys===null)referenceKeys=new Set(keys);
    else check(keys.length===referenceKeys.size&&keys.every(k=>referenceKeys.has(k)),'LINKED_LOCALIZATION_LOCALE_CENSUS');
    translations[locale]=values;sourceArchiveHashes[locale]=a.sourceArchiveSha256;localeCounts[locale]=keys.length;
  }
  return {translations,coverage:{keyCount:referenceKeys.size,allLocalesKeyCount:referenceKeys.size,localeCounts,sourceArchiveHashes,bucketCount:64}};
}
// Service-neutral, sparse columns compiled from the canonical complete rows.
 // The source namespace combines decoded native scalar and structured fields.
 // Explicit null/false/zero/empty values are retained; absent fields are omitted.
// Project only explicit result/reward occurrences, never generic condition,
// ingredient, tag, exclusion or spawn references. Source roles are candidates
// independent of DB-02's six acquisition categories and runtime availability.
function nativeAcquisitionRole(category,path){
  if(category==='ActivityData'&&/^source\.(?:Result\.ItemID|ResultItemID)$/.test(path))return 'activity_result';
  if(category==='ActivityItem'&&path==='source.ProducedItemID')return 'produced_item';
  if(category==='Story'&&path==='source.Reward.ItemID')return 'story_reward';
  if(category==='BoardGame'&&/^source\.AdditionalRewardItemIDs\[\d+\]$/.test(path))return 'board_game_reward';
  if(category==='DutyAch'&&/^source\.(?:Milestones\[\d+\]\.RewardItem|CompletionRewards\[\d+\]\.Id|StepDifficultyLayers\[\d+\]\.Rewards\[\d+\]\.Id)$/.test(path))return 'duty_reward';
  if(category==='ConditionalEvent'&&/^source\.GiveItem\.Items\[\d+\]\.ItemID$/.test(path))return 'conditional_grant';
  if(category==='Mission'&&/^source\.RewardsXP\.Currency\[\d+\]\.CurrencyId$/.test(path))return 'quest_currency_reward';
  if(category==='Mission'&&/^source\.AdditionnalRewards\.SubLootTables\[\d+\]\.Items\[\d+\]\.ItemID$/.test(path))return 'quest_additional_loot_candidate';
  if(category==='LootTable'&&/^source\.Rewards\.SubLootTables\[\d+\]\.(?:Items\[\d+\]|ItemsConditional\[\d+\]\.Item)\.ItemID$/.test(path))return 'loot_table_candidate';
  return null;
}
// Earlier source-presence evidence: the audited 1.26.1 -> 1.26.2
// recovery proved all 38 non-Condition source files byte identical.
// Bound the inference to the exact full current archive and known census.
// Actual historical census from the archived Steam 1.25.3 and 1.26.1
// itemlists (39/39 each), plus the independently verified 1.26.2 source
// equality evidence and directly decoded changed Condition.json.
// Hashes below identify complete sorted file-SHA ledgers, NOT SRC-00 scans.
function historicalSourceDelta(project,source,rows){
  const h=JSON.parse(readFileSync(join(project,'data/ddv/item-master','historical-source-delta-steam-1253-1262.json'),'utf8'));
  const digestJson=value=>hash(Buffer.from(JSON.stringify(value)));
  const corpus=digestJson(Object.fromEntries(Object.entries(source.sourceFilesSha256).sort(([a],[b])=>a<b?-1:a>b?1:0)));
  const [before,expansion,hotfix]=h.snapshots;
  check(h.schema==='wand.db01.historical-source-delta@1'&&h.platform==='Steam'&&h.sourceCensus===39&&
    before.version==='1.25.3'&&expansion.version==='1.26.1'&&hotfix.version==='1.26.2'&&
    hotfix.sourceCorpusSha256===corpus&&corpus==='1f336ebb22061b588008d004e725bb7d56bd5cd6da1765520efd2aad4c115744',
    'HISTORICAL_DELTA_SOURCE');
  const current=rows.map(r=>r.itemId).sort((a,b)=>a-b), known=new Set(current);
  check(current.length===hotfix.definitionCount&&digestJson(current)===hotfix.itemIdsSha256,'HISTORICAL_CURRENT_CENSUS');
  const d=h.delta1253to1261,fix=h.delta1261to1262;
  const runs=JSON.parse(inflateSync(Buffer.from(d.newIdRuns,'base64'),{maxOutputLength:100000}));
  check(Array.isArray(runs)&&runs.length%2===0&&runs.length<=10000,'HISTORICAL_RUNS');
  const newIds=[];let last=0;
  for(let i=0;i<runs.length;i+=2){
    const [gap,n]=[runs[i],runs[i+1]];
    check(ID(gap)&&ID(n)&&newIds.length+n<=d.newCount,'HISTORICAL_RUN');
    const start=last+gap;for(let j=0;j<n;j++)newIds.push(start+j);
    last=start+n-1;
  }
  check(newIds.length===3254&&d.newCount===3254&&digestJson(newIds)===d.newIdsSha256&&
    d.newIdsSha256==='ec995d4f8253312dc6990f38c1e5ba8ccbbf42e3c7b0d14fb4e5ac76868ba7c3'&&
    newIds.every(id=>known.has(id)),'HISTORICAL_NEW_IDS');
  check(fix.newIds.length===1&&fix.newIds[0]===2130007038&&known.has(fix.newIds[0])&&
    !newIds.includes(fix.newIds[0])&&fix.absentIds.length===0&&fix.sameSourceFiles===38&&
    source.sourceFilesSha256.Condition===fix.conditionAfterSha256,'HISTORICAL_HOTFIX');
  const added=new Set(newIds),hot=new Set(fix.newIds);
  const at1261=current.filter(id=>!hot.has(id));
  const at1253=[...at1261.filter(id=>!added.has(id)),...d.absentIds].sort((a,b)=>a-b);
  check(at1261.length===expansion.definitionCount&&digestJson(at1261)===expansion.itemIdsSha256&&
    at1253.length===before.definitionCount&&new Set(at1253).size===at1253.length&&
    digestJson(at1253)===before.itemIdsSha256,'HISTORICAL_PREVIOUS_CENSUS');
  // Existing DB-02 shop evidence is an independent acquisition link, not
  // entitlement or proof that an item belongs to the free-update cohort.
  const shop=h.shopObservation;
  const shopBytes=readFileSync(join(project,shop.sourcePath));
  check(shop.sourcePath==='static/acquisition/public/shop-cache-2026-11-22.json'&&
    hash(shopBytes)===shop.sourceSha256&&shop.availabilityVerified===false&&
    shop.dlcEntitlementVerified===false,'HISTORICAL_SHOP_PIN');
  const offers=JSON.parse(shopBytes);
  const offerIds=new Set(offers.offers.flatMap(o=>o[5].map(x=>Number(x[0]))));
  const observed=newIds.filter(id=>offerIds.has(id));
  check(offers.source.snapshotKey===shop.snapshotKey&&observed.length===13&&
    JSON.stringify(observed)===JSON.stringify(shop.newItemIds),'HISTORICAL_SHOP_CENSUS');
  const shopIds=new Set(observed);
  return new Map(rows.map(row=>{
    const id=row.itemId,isHot=hot.has(id),isNew=added.has(id),isAdded=isNew||isHot;
    const first=isHot?hotfix.version:isNew?expansion.version:before.version;
    return [id,{
      firstObservedVersion:first,introducedVersion:isAdded?first:null,
      introducedAfterVersion:isHot?expansion.version:isNew?before.version:null,
      introducedAfterSourceCorpusSha256:isHot?expansion.sourceCorpusSha256:isNew?before.sourceCorpusSha256:null,
      introducedSourceCorpusSha256:isHot?hotfix.sourceCorpusSha256:isNew?expansion.sourceCorpusSha256:null,
      sourceReleaseId:isHot?'hotfix.1.26.2':isNew?'dlc.the-keepsake-sea':null,
      sourceReleaseKind:isHot?'hotfix':isNew?'paid_dlc':null,
      observationEvidence:'verified_original_source_comparison',
      nativeContentMarker:isNew?(/expansion04/i.test(row.nativeKey)?'expansion04':/update26/i.test(row.nativeKey)?'update26':null):null,
      introductionShopSnapshot:shopIds.has(id)?shop.snapshotKey:null
    }];
  }));
}
function introductionHistory(project,e,version,source,rows){
  const sameArchive=e.archiveSha256==='b659cfc12b3a1363395e595bc5bb6be76ef1da63b6003c3a785556adc3a6831d'&&
    version==='1.26.2'&&source.sourceFilesVerified===39&&
    rows.filter(r=>r.nativeCategory!=='Condition').length===33627;
  check(sameArchive||e.introductionHistorySha256!==undefined,'INTRODUCTION_HISTORY_REQUIRED');
  const historicalDelta=sameArchive?historicalSourceDelta(project,source,rows):new Map();
  let prior=new Map();
  if(e.introductionHistorySha256!==undefined){
    check(SHA.test(e.introductionHistorySha256),'INTRODUCTION_HISTORY_PIN');
    const bytes=readFileSync(join(project,'data/ddv/item-master','introduction-history-steam-'+version+'.json'));
    check(hash(bytes)===e.introductionHistorySha256,'INTRODUCTION_HISTORY_SHA');
    const h=JSON.parse(bytes);
    check(h.schema==='wand.db01.item-introduction@1'&&h.target?.platform==='Steam'&&h.target?.gameVersion===version&&
      SHA.test(h.sourceScanSha256)&&Object.keys(h.sourceFilesSha256??{}).length===source.sourceFilesVerified&&
      Object.entries(source.sourceFilesSha256).every(([k,v])=>h.sourceFilesSha256[k]===v)&&
      Array.isArray(h.items)&&h.items.length===rows.length,'INTRODUCTION_HISTORY_SOURCE');
    const ver=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
    const order=(x,y)=>{const a=x.split('.').map(Number),b=y.split('.').map(Number);return a[0]-b[0]||a[1]-b[1]||a[2]-b[2];};
    for(const [id,v] of h.items){
      const hashPair=(x,y)=>typeof x==='string'&&typeof y==='string'&&SHA.test(x)&&SHA.test(y)&&x!==y;
      const scanPair=hashPair(v?.introducedAfterSourceScanSha256,v?.introducedSourceScanSha256);
      const corpusPair=hashPair(v?.introducedAfterSourceCorpusSha256,v?.introducedSourceCorpusSha256);
      check(v&&((v.introducedAfterSourceScanSha256==null&&v.introducedSourceScanSha256==null)||scanPair)&&
        ((v.introducedAfterSourceCorpusSha256==null&&v.introducedSourceCorpusSha256==null)||corpusPair)&&
        (v.nativeContentMarker==null||['expansion04','update26'].includes(v.nativeContentMarker))&&
        (v.introductionShopSnapshot==null||v.introductionShopSnapshot==='Shop20261118'&&
          v.introducedVersion==='1.26.1'),'INTRODUCTION_COMPARISON_EVIDENCE');
      check(ID(id)&&!prior.has(id)&&v&&ver(v.firstObservedVersion)&&order(v.firstObservedVersion,version)<=0&&
        (v.introducedVersion===null&&v.introducedAfterVersion===null&&
          v.introducedAfterSourceScanSha256===null&&v.introducedSourceScanSha256===null&&
          !corpusPair&&v.contentReleaseId===null||
         ver(v.introducedVersion)&&v.introducedVersion===v.firstObservedVersion&&ver(v.introducedAfterVersion)&&
          order(v.introducedAfterVersion,v.introducedVersion)<=0&&
          (scanPair||corpusPair)&&
          (v.contentReleaseId===null||typeof v.contentReleaseId==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(v.contentReleaseId))),
        'INTRODUCTION_HISTORY_ROW');
      const releaseId=x=>typeof x==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(x);
      check((v.sourceReleaseId==null||releaseId(v.sourceReleaseId))&&
        (v.sourceReleaseKind==null||v.sourceReleaseId!=null&&['free_update','paid_dlc','hotfix','other'].includes(v.sourceReleaseKind)),
        'INTRODUCTION_SOURCE_CONTEXT');
      const hasReviewed=v.contentAssignmentSha256!=null;
      if(hasReviewed){
        check(SHA.test(v.contentAssignmentSha256)&&typeof v.contentReleaseEvidenceSha256==='string'&&
          SHA.test(v.contentReleaseEvidenceSha256)&&releaseId(v.contentReleaseId)&&
          (v.contentReleaseKind==='free_update'&&/^version\.\d+$/.test(v.contentReleaseId)&&v.contentDlcType===null||
           v.contentReleaseKind==='paid_dlc'&&v.contentReleaseId.startsWith('dlc.')&&['expansion','adventure_pack'].includes(v.contentDlcType)),
          'INTRODUCTION_CONTENT_ASSIGNMENT');
      }else{
        check(v.contentReleaseKind==null&&v.contentDlcType==null&&v.contentReleaseEvidenceSha256==null,
          'INTRODUCTION_CONTENT_EVIDENCE_REQUIRED');
      }
      // Legacy history files used a transition-wide ID. It cannot be promoted
      // to a verified per-item DLC or free-update classification.
      prior.set(id,{...v,sourceReleaseId:v.sourceReleaseId??(!hasReviewed?v.contentReleaseId:null)??null,
        contentReleaseId:hasReviewed?v.contentReleaseId:null});
    }
    check(rows.every(r=>prior.has(r.itemId)),'INTRODUCTION_HISTORY_ID_CENSUS');
  }
  return new Map(rows.map(row=>{
    const verified=historicalDelta.get(row.itemId);
    const supplied=prior.get(row.itemId);
    // The verified three-snapshot census supersedes the older 1.26.1-only
    // bootstrap. Preserve any compatible, separately reviewed attribution.
    const old=verified?{...supplied,...verified,
      contentReleaseId:supplied?.introducedVersion===verified.introducedVersion?supplied?.contentReleaseId:null,
      contentReleaseKind:supplied?.introducedVersion===verified.introducedVersion?supplied?.contentReleaseKind:null,
      contentDlcType:supplied?.introducedVersion===verified.introducedVersion?supplied?.contentDlcType:null,
      contentReleaseEvidenceSha256:supplied?.introducedVersion===verified.introducedVersion?supplied?.contentReleaseEvidenceSha256:null,
      contentAssignmentSha256:supplied?.introducedVersion===verified.introducedVersion?supplied?.contentAssignmentSha256:null
    }:supplied;
    const historical=sameArchive&&row.nativeCategory!=='Condition';
    const defaultVersion=historical?'1.26.1':version;
    let observed=old?.firstObservedVersion??defaultVersion;
    // If the verified older presence contradicts an alleged newer introduction,
    // retain the earlier presence and clear the unsupported introduction claim.
    if(historical&&observed==='1.26.2')observed='1.26.1';
    const intro=old?.introducedVersion===observed?old:null;
    return [row.itemId,{
      firstObservedVersion:observed,
      introducedVersion:intro?.introducedVersion??null,
      introducedAfterVersion:intro?.introducedAfterVersion??null,
      introducedAfterSourceScanSha256:intro?.introducedAfterSourceScanSha256??null,
      introducedSourceScanSha256:intro?.introducedSourceScanSha256??null,
      introducedAfterSourceCorpusSha256:intro?.introducedAfterSourceCorpusSha256??null,
      introducedSourceCorpusSha256:intro?.introducedSourceCorpusSha256??null,
      nativeContentMarker:old?.nativeContentMarker??null,
      introductionShopSnapshot:old?.introductionShopSnapshot??null,
      sourceReleaseId:intro?.sourceReleaseId??null,
      sourceReleaseKind:intro?.sourceReleaseKind??null,
      contentReleaseId:intro?.contentReleaseId??null,
      contentReleaseKind:intro?.contentReleaseKind??null,
      contentDlcType:intro?.contentDlcType??null,
      contentReleaseEvidenceSha256:intro?.contentReleaseEvidenceSha256??null,
      contentAssignmentSha256:intro?.contentAssignmentSha256??null,
      observationEvidence:verified?'verified_original_source_comparison':historical&&observed==='1.26.1'?'sha_identical_earlier_source':
        old&&observed===old.firstObservedVersion?'pinned_native_history':'current_source_only'
    }];
  }));
}
function writeFieldColumns(rows,release,write,assets,history,acquisition,stallRelations,skinRelations,protoAcquisition,catalogFacts,furnitureDisplayRule,storeLayout,originalPrices,questFlows,placementContexts){
  const columns=new Map();
  const split=new Set(['names','artwork','itemType','nativeProperties','sourceAttributes']);
  const add=(field,id,value)=>{
    check(/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*){0,16}$/.test(field)&&!field.split('.').some(k=>['__proto__','constructor','prototype'].includes(k)),'COLUMN_NAME');
    check(value!==undefined,'COLUMN_UNDEFINED');
    let entries=columns.get(field);
    if(!entries){entries=[];columns.set(field,entries);}
    check(!entries.length||entries[entries.length-1][0]<id,'COLUMN_DUPLICATE');
    entries.push([id,value]);
  };
  // JSON tuple keys retain exact kind/ID/role pairing, including the type
  // of a source ID. A bare ID or independent role column could cross-match.
  const sourceKeys=(id,family,links,identity)=>{
    if(!links.length)return;
    const keys=new Set(),roleKeys=new Set();
    for(const link of links){
      const [kind,sourceId,role]=identity(link);
      keys.add(JSON.stringify([kind,sourceId]));
      if(role!==undefined)roleKeys.add(JSON.stringify([kind,sourceId,role]));
    }
    add('acquisition.'+family+'SourceKeys',id,[...keys].sort());
    if(roleKeys.size)add('acquisition.'+family+'SourceRoleKeys',id,[...roleKeys].sort());
  };
  // Preserve complete object columns, and also expose nested object fields.
  // Arrays are atomic values: never flatten repeated entries and lose pairing.
  const addSource=(field,id,value,depth=0)=>{
    add(field,id,value);
    if(depth<15&&value!==null&&typeof value==='object'&&!Array.isArray(value)){
      for(const [key,child] of Object.entries(value))addSource(field+'.'+key,id,child,depth+1);
    }
  };
  // Only audited CurrencyCost occurrences; never combine acquisition costs,
  // building unlock costs and per-use costs into a single "item price".
  const currencyIds=new Set(rows.filter(r=>r.nativeCategory==='Currency').map(r=>r.itemId));
  const costEntries=row=>{
    const p=row.sourceAttributes??{};
    const result=[];
    const emit=(kind,path,cost,level=null)=>{
      if(cost===undefined||cost===null||typeof cost!=='object'||Array.isArray(cost))return;
      const currencyPresent=Object.hasOwn(cost,'Id'),amountPresent=Object.hasOwn(cost,'Amount');
      check(!currencyPresent||Number.isSafeInteger(cost.Id),'COST_CURRENCY');
      check(!amountPresent||Number.isSafeInteger(cost.Amount),'COST_AMOUNT');
      const currencyItemId=currencyPresent?cost.Id:null;
      result.push({kind,sourcePath:'source.'+path,currencyItemId,amount:amountPresent?cost.Amount:null,
        currencyFieldPresent:currencyPresent,amountFieldPresent:amountPresent,
        currencyDefinitionResolved:currencyIds.has(currencyItemId),upgradeLevel:level,
        runtimeCostVerified:false});
    };
    if(['Furniture','Clothing'].includes(row.nativeCategory)){
      emit('purchase_override','PriceOverride.Price',p.PriceOverride?.Price);
    }
    if(row.nativeCategory==='Building'){
      emit('building_specific_unlock','SpecificUnlockCost',p.SpecificUnlockCost);
      if(Array.isArray(p.UnlockCost))p.UnlockCost.forEach((cost,i)=>emit('building_unlock','UnlockCost['+i+']',cost));
      if(Array.isArray(p.UpgradeInfo))p.UpgradeInfo.forEach((u,i)=>{
        emit('building_upgrade','UpgradeInfo['+i+'].Cost',u?.Cost,Number.isSafeInteger(u?.Level)?u.Level:null);
      });
    }
    if(row.nativeCategory==='Furniture'){
      for(const key of ['AutoCooker','Gardener'])emit('machine_action',key+'.ActionCost',p[key]?.ActionCost);
    }
    return result;
  };
  // Expand original fixed32 masks into exact individual set bits for
  // selective reverse lookup. No floor, layer or placement rule is inferred.
  const uint32=v=>Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
  const bits=v=>Array.from({length:32},(_,i)=>2**i).filter(b=>Math.floor(v/b)%2===1);
  for(const row of rows){
    // Exact image references, not prefab/material/animation GUIDs and not
    // encoded media hashes. Preserve field identity for alternate icons and
    // masks so a shared GUID cannot be mistaken for an interchangeable item.
    const imageReferences=[];
    const imageGuid=(path,value)=>{
      if(typeof value!=='string')return;
      const guid=value.startsWith('guid:')?value.slice(5):value;
      if(GUID.test(guid))imageReferences.push([path,guid]);
    };
    for(const key of ['iconGuid','imageGuid','maskGuid','maskDataGuid','blurredIconGuid','alternativeIconGuid']){
      imageGuid('artwork.'+key,row.artwork?.[key]);
    }
    const imageFields=['IconAddress','MaleIconAddress','ImageAddress','MaskDataAddress',
      'AlternativeIconAddress','BlurredIconAddress','AvatarIconAddress','DefaultSkinIconAddress',
      'SignatureOverrideIcon','SpriteSquareAddress','SpritePortraitAddress','SpriteLandscapeAddress',
      'SpriteAddress','MachineIconAddress','PortraitAddress'];
    for(const key of imageFields){
      imageGuid('source.'+key,row.sourceAttributes?.[key]??row.nativeProperties?.[key]);
    }
    if(imageReferences.length){
      imageReferences.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
      add('media.sourceImageReferences',row.itemId,imageReferences);
      add('media.sourceImageGuids',row.itemId,[...new Set(imageReferences.map(r=>r[1]))].sort());
    }
    const context=placementContexts.get(row.itemId);
    if(context){
      add('placement.sourceContext',row.itemId,context);
      if(context.floor){
        add('placement.sourceFloorClass',row.itemId,context.floor.kind);
        add('placement.sourceFloorTypeNames',row.itemId,context.floor.floorTypes);
        add('placement.sourceSupportsSurface',row.itemId,context.floor.surface);
      }
      if(context.scene){
        add('placement.sourceCanPlaceKind',row.itemId,context.scene.kind);
        if(context.scene.sceneItemId!==null)add('placement.sourceCanPlaceSceneId',row.itemId,context.scene.sceneItemId);
        if(context.scene.sceneTypeCode!==null)add('placement.sourceCanPlaceSceneType',row.itemId,context.scene.sceneTypeCode);
        if(context.scene.sceneTagItemId!==null)add('placement.sourceCanPlaceSceneTagId',row.itemId,context.scene.sceneTagItemId);
      }
    }
    const g=row.sourceAttributes?.GridAreaData;
    if(g){
      if(Object.hasOwn(g,'AcceptedFloorTypesFlag')){
        check(uint32(g.AcceptedFloorTypesFlag),'PLACEMENT_FLOOR_MASK');
        add('placement.sourceAcceptedFloorBits',row.itemId,bits(g.AcceptedFloorTypesFlag));
      }
      if(Object.hasOwn(g,'Layers')){
        check(Array.isArray(g.Layers)&&g.Layers.every(uint32),'PLACEMENT_LAYER_MASK');
        const union=g.Layers.reduce((mask,v)=>(mask|v)>>>0,0);
        add('placement.sourceLayerBits',row.itemId,bits(union));
        add('placement.sourceLayerSlotCount',row.itemId,g.Layers.length);
      }
      if(Number.isSafeInteger(g.SizeX)&&Number.isSafeInteger(g.SizeY)&&g.SizeX>0&&g.SizeY>0&&Number.isSafeInteger(g.SizeX*g.SizeY)){
        add('placement.sourceSizeXY',row.itemId,[g.SizeX,g.SizeY]);
        add('placement.sourceBoundingCellCount',row.itemId,g.SizeX*g.SizeY);
        if(Array.isArray(g.Layers))add('placement.sourceLayerCountMatchesBounds',row.itemId,g.Layers.length===g.SizeX*g.SizeY);
      }
    }
    // Exact native StoreInfo furniture-type helper, NOT final shop
    // eligibility (other display filters, state, ownership still apply).
    if(furnitureDisplayRule&&row.nativeCategory==='Furniture'){
      check(row.itemType.code===4&&row.itemType.subtypeNameVerified,'STORE_FURNITURE_NATIVE_TYPE');
      add('acquisition.furnitureDisplayTypeGate',row.itemId,[0,3].includes(row.itemType.subtypeCode));
    }
    const catalog=catalogFacts.facts.get(row.itemId);
    if(catalog){
      add('acquisition.catalogFacts',row.itemId,catalog);
      add('acquisition.generatorExcluded',row.itemId,catalog.generatorExcluded);
      if(catalog.exclusionFlags.length)add('acquisition.generatorRelatedFlags',row.itemId,catalog.exclusionFlags);
      if(catalog.gateStatus==='configured_source_gate')add('acquisition.catalogGate',row.itemId,catalog.catalogVisibilityConditions);
      const refs=[...new Set(catalog.relatedConditions.filter(r=>r.resolved).map(r=>r.targetItemId))].sort((a,b)=>a-b);
      if(refs.length)add('acquisition.catalogGateRelatedItemIds',row.itemId,refs);
    }
    const storeScreen=catalogFacts.storeScreens.get(row.itemId);
    if(storeScreen){
      add('acquisition.storeDisplayScreen',row.itemId,storeScreen);
      add('acquisition.storeDisplayScreenStatus',row.itemId,storeScreen.status);
    }
    const layout=storeLayout.candidates.get(row.itemId);
    if(layout){
      add('acquisition.storeLayoutCandidates',row.itemId,layout);
      if(layout.matchingAreaKeys.length)add('acquisition.storeLayoutAreaKeys',row.itemId,layout.matchingAreaKeys);
      const dimensions=storeLayout.dimensionComparisons.get(row.itemId);
      if(dimensions?.length)add('acquisition.storeLayoutDimensionComparisons',row.itemId,dimensions);
    }
    const display=storeLayout.displayDefinitions.get(row.itemId);
    if(display)add('acquisition.storeDisplayDefinition',row.itemId,display);
    const sequences=storeLayout.sequenceLinks.get(row.itemId);
    if(sequences?.length)add('acquisition.storeDisplaySequenceLinks',row.itemId,sequences);
    const flows=questFlows.byQuest.get(row.itemId),uses=questFlows.byItem.get(row.itemId);
    if(flows?.length)add('quest.itemFlows',row.itemId,flows);
    if(uses?.length)add('quest.itemFlowUses',row.itemId,uses);
    const saleFlags=originalPrices.saleFlags.get(row.itemId);
    if(saleFlags){
      add('price.sourceSaleFlags',row.itemId,saleFlags);
      add('price.sourceUnsellable',row.itemId,saleFlags.unsellable);
    }
    const originalPrice=originalPrices.items.get(row.itemId);
    if(originalPrice){
      add('price.sourceProviderKind',row.itemId,originalPrice.providerKind);
      add('price.sourceRecordIndex',row.itemId,originalPrice.sourceRecordIndex);
      for(const [direction,values] of [['purchase',originalPrice.purchaseCosts],['sell',originalPrice.sellCosts]]){
        if(!values.length)continue;
        add('price.'+direction+'Costs',row.itemId,values);
        add('price.'+direction+'CurrencyIds',row.itemId,values.map(v=>v.currencyItemId).sort((a,b)=>a-b));
        const keys=values.filter(v=>v.amountFieldPresent).map(v=>JSON.stringify([v.currencyItemId,v.amount])).sort();
        if(keys.length)add('price.'+direction+'AmountKeys',row.itemId,keys);
      }
    }
    const costs=costEntries(row);
    if(costs.length){
      add('cost.configuredOccurrences',row.itemId,costs);
      add('cost.configuredKinds',row.itemId,[...new Set(costs.map(v=>v.kind))].sort());
      const keys=[...new Set(costs.filter(v=>v.currencyDefinitionResolved).map(v=>JSON.stringify([v.kind,v.currencyItemId])))].sort();
      if(keys.length)add('cost.configuredKindCurrencyKeys',row.itemId,keys);
      const explicit=costs.filter(v=>v.currencyDefinitionResolved&&v.amountFieldPresent);
      if(explicit.length)add('cost.configuredKindCurrencyAmountKeys',row.itemId,
        [...new Set(explicit.map(v=>JSON.stringify([v.kind,v.currencyItemId,v.amount])))].sort());
    }
    const purchaseCurrency=catalogFacts.purchaseCurrencies.get(row.itemId);
    if(purchaseCurrency){
      add('acquisition.purchaseCurrencySelection',row.itemId,purchaseCurrency);
      if(purchaseCurrency.serializedFieldPresent)add('acquisition.defaultCurrencyItemId',row.itemId,purchaseCurrency.defaultCurrencyItemId);
    }
    const gateDependents=catalogFacts.dependents.get(row.itemId);
    if(gateDependents?.length)add('acquisition.catalogGateDependents',row.itemId,gateDependents);
    const stall=stallRelations.get(row.itemId);
    if(stall){
      add('building.stallEmployeeItemIds',row.itemId,stall.employees);
      add('building.stallUnlockWithItemId',row.itemId,stall.unlock);
      if(stall.associations.length)add('building.characterAssociations',row.itemId,stall.associations);
      if(stall.relatedUniverseTagIds.length)add('building.relatedCharacterUniverseTagIds',row.itemId,stall.relatedUniverseTagIds);
    }
    const skin=skinRelations.get(row.itemId);
    if(skin){
      add('building.skinTargetSelectors',row.itemId,skin.relation);
      if(skin.relatedBuildingUniverseTagIds.length)add('building.skinTargetUniverseTagIds',row.itemId,skin.relatedBuildingUniverseTagIds);
    }
    const association=stall??skin;
    if(association?.candidate)add('browse.universeAssociation',row.itemId,{...association.candidate,applied:association.applied});
    const browseUniverses=association?.applied?[association.candidate.universeTagId]:row.universeTagIds;
    if(browseUniverses.length)add('browse.universeTagIds',row.itemId,browseUniverses);
    const rewardLinks=protoAcquisition.byItem.get(row.itemId)??[];
    const ownerRewards=protoAcquisition.byOwner.get(row.itemId);
    const extraSources=[...rewardLinks,...[protoAcquisition.shopDisplay.get(row.itemId),protoAcquisition.preDlc.get(row.itemId),protoAcquisition.designUnlock.get(row.itemId)].filter(Boolean)];
    if(extraSources.length){
      add('acquisition.additionalSources',row.itemId,extraSources);
      sourceKeys(row.itemId,'additional',extraSources,l=>[l.kind,l.sourceId]);
    }
    if(ownerRewards?.length)add('acquisition.individualFriendshipRewards',row.itemId,ownerRewards);
    const effectiveCategories=acquisition?.summary.get(row.itemId)?.categories??[];
    const friendship=rewardLinks.some(link=>link.amount!==null);
    const effective=friendship&&!effectiveCategories.includes('ordinary_gameplay')?['ordinary_gameplay',...effectiveCategories]:effectiveCategories;
    if(effective.length)add('acquisition.effectiveCategories',row.itemId,effective);
    if(acquisition){
      const summary=acquisition.summary.get(row.itemId);
      const relations=acquisition.relations.get(row.itemId);
      if(summary){
        add('acquisition.summary',row.itemId,summary);
        if(summary.categories.length)add('acquisition.categories',row.itemId,summary.categories);
        if(summary.unresolvedOnlineHints.length)add('acquisition.onlineHints',row.itemId,summary.unresolvedOnlineHints);
      }
      if(relations){
        add('acquisition.sourceRelations',row.itemId,relations);
        sourceKeys(row.itemId,'indexed',relations.links,l=>[l.kind,l.sourceId,l.role]);
      }
    }
    for(const [key,value] of Object.entries(history.get(row.itemId)))add('history.'+key,row.itemId,value);
    for(const [key,value] of Object.entries(row)){
      if(!split.has(key)){add(key,row.itemId,value);continue;}
      const prefix=key==='nativeProperties'||key==='sourceAttributes'?'source':key;
      for(const [name,part] of Object.entries(value)){
        if(prefix==='source')addSource(prefix+'.'+name,row.itemId,part);
        else add(prefix+'.'+name,row.itemId,part);
      }
    }
  }
  const refs=buildReferenceColumns(rows);
  const sourceCategories=new Map(rows.map(row=>[row.itemId,row.nativeCategory]));
  for(const row of rows){
    const candidates=(refs.incoming.get(row.itemId)??[]).flatMap(([sourceId,path])=>{
      const role=nativeAcquisitionRole(sourceCategories.get(sourceId),path);
      return role===null?[]:[[sourceId,role,path]];
    });
    if(candidates.length){
      add('acquisition.nativeCandidates',row.itemId,candidates);
      sourceKeys(row.itemId,'native',candidates,l=>['item_definition',l[0],l[1]]);
    }
    for(const direction of ['incoming','outgoing']){
      const values=refs[direction].get(row.itemId);
      if(values?.length)add('references.'+direction,row.itemId,values);
    }
  }
  const fields=[];
  for(const [field,entries] of [...columns].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    const blocks=[];
    // Frequently inspected acquisition details use smaller blocks; category
    // columns retain the compact bulk-filter layout.
    const narrow=['acquisition.summary','acquisition.sourceRelations','acquisition.additionalSources','acquisition.individualFriendshipRewards','acquisition.catalogFacts','acquisition.catalogGateDependents'].includes(field);
    const rowLimit=narrow?256:4096,byteLimit=narrow?128*1024:1024*1024;
    // Bound bytes as well as row count; large mission step arrays stay atomic.
    for(let start=0;start<entries.length;){
      let end=start,bytes=256;
      while(end<entries.length&&end-start<rowLimit){
        const size=Buffer.byteLength(JSON.stringify(entries[end]))+1;
        if(end>start&&bytes+size>byteLimit)break;
        bytes+=size;end++;
      }
      const items=entries.slice(start,end);
      start=end;
      const path='fields/'+field+'/'+blocks.length+'.json';
      const meta=write(path,{schema:'wand.item-master.field-block@1',release,field,items},items.length);
      check(meta.bytes<=16*1024*1024,'COLUMN_BLOCK_TOO_LARGE');
      assets[path]=meta;
      blocks.push({path,firstId:items[0][0],lastId:items[items.length-1][0],count:items.length});
    }
    fields.push({field,count:entries.length,blocks});
  }
  assets['fields/index.json']=write('fields/index.json',{
    schema:'wand.item-master.fields@1',release,definitionCount:rows.length,fields
  },fields.length);
}
function sourceCodes(row){
  const codes=new Set(row.collectionSourceCandidates.map(c=>c.submenuCode).filter(c=>SUBMENUS.has(c)));
  // Native item-type browse fallback is not evidence of game Collection membership.
  if(row.nativeCategory==='Furniture')codes.add(3);
  if(row.nativeCategory==='Clothing')codes.add(4);
  if(row.nativeCategory==='ActivityItem'){
    const code=new Map([[2,0],[4,0],[11,0],[10,1],[3,2],[8,8],[16,9],[17,10]]).get(row.itemType.subtypeCode);
    if(code!==undefined)codes.add(code);
  }
  return [...codes].sort((a,b)=>a-b);
}
function validLinks(links,byId,menus){
  return Array.isArray(links)&&links.every(c=>ID(c.setId)&&menus.has(c.setId)&&
    Number.isSafeInteger(c.groupIndex)&&c.groupIndex>=0&&
    menus.get(c.setId).submenuCode===c.submenuCode&&typeof c.evidence==='string'&&
    (c.sourceRecipeItemId==null||byId.has(c.sourceRecipeItemId))&&
    (c.sourceSetItemId==null||byId.has(c.sourceSetItemId)));
}
/** Build-time source census; do not infer design similarity from these counts. */
function exploreThemeCensus(explore,byId){
  const counts=values=>Object.fromEntries([...values.reduce((m,k)=>m.set(k,(m.get(k)??0)+1),new Map())].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))));
  for(const universe of [2000500023,2000500017]){
    const items=explore.filter(r=>r.universes.includes(universe));
    const groups=new Map();
    const styles=new Map();
    for(const item of items){
      if(item.sourceSetItemId!==null){
        const set=groups.get(item.sourceSetItemId)??[];set.push(item);groups.set(item.sourceSetItemId,set);
      }
      for(const style of new Set(item.tags.filter(([k])=>k==='furnitureStyle').map(([,v])=>v))){
        const list=styles.get(style)??[];list.push(item);styles.set(style,list);
      }
    }
    const styleCount=item=>new Set(item.tags.filter(([k])=>k==='furnitureStyle').map(([,v])=>v)).size;
    const namedSets=[...groups].sort((a,b)=>b[1].length-a[1].length||a[0]-b[0]).slice(0,18).map(([id,list])=>({
      id,label:byId.get(id)?.names?.en??null,count:list.length,
      categories:counts(list.map(r=>r.nativeCategory)),
      sample:list.map(r=>r.names.en).filter(Boolean).slice(0,5)
    }));
    const styleSummary=[...styles].sort((a,b)=>b[1].length-a[1].length).map(([style,list])=>({
      style,count:list.length,sample:list.map(r=>r.names.en).filter(Boolean).slice(0,6)
    }));
    console.log('EXPLORE_THEME_CENSUS '+JSON.stringify({universe,total:items.length,
      byCategory:counts(items.map(r=>r.nativeCategory)),
      withSet:items.filter(r=>r.sourceSetItemId!==null).length,
      distinctSets:groups.size,setsWithMultipleItems:[...groups.values()].filter(g=>g.length>1).length,
      setsWithMultipleNativeCategories:[...groups.values()].filter(g=>new Set(g.map(i=>i.nativeCategory)).size>1).length,
      styleCoverage:items.filter(r=>styleCount(r)>0).length,
      multipleStyles:items.filter(r=>styleCount(r)>1).length,styleSummary,namedSets}));
  }
}

export function materializeCompleteSourceMaster(project,entry,baseRelease,baseFiles){
  const e=entry.complete;
  if(!e)return;
  const version=entry.gameVersion;
  check(typeof e.release==='string'&&e.release.startsWith('steam-'+version+'-item-id-master-v')&&
    e.release!==baseRelease.version&&e.release!==entry.expanded?.release&&
    Number.isSafeInteger(e.count)&&e.count>=baseRelease.count&&e.count<=1_000_000&&
    Number.isSafeInteger(e.parts)&&e.parts>=1&&e.parts<=100&&SHA.test(e.archiveSha256),'VERSION_ENTRY');
  const packed=Buffer.concat(Array.from({length:e.parts},(_,i)=>
    readFileSync(join(project,'data/ddv/item-master','complete-source-steam-'+version+'.json.gz.part'+i))));
  check(hash(packed)===e.archiveSha256,'ARCHIVE_SHA');
  const source=JSON.parse(gunzipSync(packed,{maxOutputLength:128*1024*1024}).toString('utf8'));
  check(source.schema==='wand.item-master.complete-source@1'&&source.release===e.release&&
    source.target.platform==='Steam'&&source.target.gameVersion===version&&
    source.sourceItemsSha256===baseRelease.source.sourceItemsSha256&&
    SHA.test(source.sourceIl2cppDumpSha256)&&source.count===e.count&&
    Array.isArray(source.items)&&source.items.length===e.count&&
    Object.keys(source.sourceFilesSha256).length===source.sourceFilesVerified&&
    Object.values(source.sourceFilesSha256).every(s=>SHA.test(s))&&
    source.coverage.definitionCount===e.count&&source.coverage.runtimeCollectionMembershipVerified===false&&
    source.coverage.allOriginalFieldSemanticsVerified===false,'SCHEMA');
  const rows=source.items;
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  check(byId.size===e.count&&rows.every((r,i)=>i===0||rows[i-1].itemId<r.itemId),'ID_CENSUS');
  const sourceAttributeCoverage=attachAttributes(project,e,version,source,byId);
  const nativeSupplementCoverage=attachNativeSupplement(project,e,version,source,byId);
  const referenceAttributeCoverage=attachReferenceAttributes(project,e,version,source,byId);
  const reviewedRootArrayCoverage=attachReviewedRootArrays(project,e,version,source,byId);
  const reviewedMessageCoverage=attachReviewedMessages(project,e,version,source,byId);
  const reviewedMessageGroupCoverage=attachReviewedMessages(project,e,version,source,byId,true);
  let reviewedStructureCoverage;
  if(e.reviewedStructure!==undefined){
    check(Object.keys(e.reviewedStructure).length===2&&SHA.test(e.reviewedStructure['reviewed-structure'])&&SHA.test(e.reviewedStructure['reviewed-quest-steps']),'STRUCTURE_DIGESTS');
    const other=attachReviewedMessages(project,e,version,source,byId,true,'reviewed-structure');
    const quest=attachReviewedMessages(project,e,version,source,byId,true,'reviewed-quest-steps');
    check(!Object.keys(other.fields).some(key=>Object.hasOwn(quest.fields,key)),'STRUCTURE_DUPLICATE');
    reviewedStructureCoverage={fields:{...other.fields,...quest.fields},runtimeSemanticsVerified:false};
  }
  // Legacy localization archive was built from the original attribute projection.
  // Verify that exact census before adding new source keys, which need their own
  // localized-text coverage; do not imply every newly exposed key is translated.
  const localizations=loadLocalizations(project,e,version,source,byId);
  const reviewedRootScalarCoverage=attachReviewedRootScalars(project,e,version,source,byId);
  const linkedLocalizations=loadLinkedLocalizations(project,e,version,source,byId,localizations);
  // Verify no existing public definition is lost or silently replaced.
  for(const [path,raw] of baseFiles){
    if(!path.startsWith('id/'))continue;
    for(const prev of JSON.parse(raw.toString('utf8')).items){
      const next=byId.get(prev.itemId);
      check(next&&prev.nativeCategory===next.nativeCategory&&prev.nativeKey===next.nativeKey&&
        prev.iconGuid===next.iconGuid&&LOCALES.every(l=>prev.names[l]===next.names[l]),
        'BASE_IDENTITY_'+prev.itemId);
    }
  }
  const menus=new Map(source.collectionMenus.map(r=>[r.setId,r]));
  const universes=new Map(source.universeTags.map(r=>[r.tagId,r]));
  const worlds=new Map(source.worldTags.map(r=>[r.tagId,r]));
  const validLabels=(r)=>ID(r.tagId)&&byId.get(r.tagId)?.nativeCategory==='Tag'&&
    typeof r.key==='string'&&LOCALES.every(l=>r.names[l]===null||
      typeof r.names[l]==='string'&&r.names[l].length>0);
  check(menus.size===source.collectionMenus.length&&
    [...menus.keys()].every(i=>byId.get(i)?.nativeCategory==='CollectionSet')&&
    universes.size===source.universeTags.length&&source.universeTags.every(validLabels)&&
    worlds.size===source.worldTags.length&&source.worldTags.every(validLabels)&&
    source.collectionSelectors.length===source.coverage.sourceSelectorCount,'RELATION_CENSUS');
  const buckets=Array.from({length:256},()=>[]);
  const f={schema:'wand.collection.db01-complete-source-facets@1',release:e.release,
    sourceArchiveSha256:e.archiveSha256,sourceItemCount:rows.length,
    nativeSubtypeItems:[],items:[],categoryItems:[],activityTypeItems:[],
    universeSourceItems:[],universeSourceTagItems:[],universeSourceStatusItems:[],
    worldSourceTagItems:[],sourceSetItems:[],craftingRecipeResultItems:[],
    definitionScopeItems:[],browseItems:[],
    universeTags:source.universeTags,worldTags:source.worldTags,
    gameRuntimeMembershipVerified:false};
  const explore=[];
  const placementContexts=buildPlacementContexts(source,rows);
  const stallRelations=loadStallCharacterRelations(project,source,byId);
  const skinRelations=loadBuildingSkinRelations(project,source,byId);
  const names={};
  for(const l of LOCALES)names[l]=[];
  for(const r of rows){
    const i=r.itemId;
    check(ID(i)&&typeof r.nativeCategory==='string'&&r.nativeCategory in source.sourceFilesSha256&&
      typeof r.nativeKey==='string'&&r.nativeKey.length>0&&
      (r.iconGuid===null||GUID.test(r.iconGuid))&&
      r.artwork&&Object.values(r.artwork).every(g=>GUID.test(g))&&
      (r.artwork.iconGuid??null)===r.iconGuid&&
      r.names&&LOCALES.every(l=>r.names[l]===null||typeof r.names[l]==='string'&&r.names[l].length>0)&&
      r.nameVerified===LOCALES.every(l=>r.names[l]!==null)&&
      r.itemType?.name===r.nativeCategory&&Number.isSafeInteger(r.itemType.code)&&
      Math.floor(i/10000000)===r.itemType.code&&
      Math.floor((i%10000000)/100000)===r.itemType.subtypeCode&&
      typeof r.itemType.subtypeNameVerified==='boolean'&&
      Array.isArray(r.tags)&&r.tags.every(t=>ID(t.id)&&byId.get(t.id)?.nativeCategory==='Tag'&&
        typeof t.key==='string'&&typeof t.facet==='string'&&Number.isSafeInteger(t.sourceField))&&
      validLinks(r.collectionPositiveSourceLinks,byId,menus)&&validLinks(r.collectionExclusions,byId,menus)&&
      validLinks(r.collectionSourceCandidates,byId,menus)&&
      SCOPES.includes(r.definitionScope)&&STATES.includes(r.universeSourceStatus)&&
      (r.universeSourceStatus==='source_linked')===(r.universeTagIds.length>0)&&
      r.universeTagIds.every(t=>universes.has(t))&&
      JSON.stringify(r.universeTagIds)===JSON.stringify(uniq([
        ...r.universeDirectTagIds,...r.universeSetTagIds,...r.universePredicateTagIds]))&&
      r.worldTagIds.every(t=>worlds.has(t))&&
      (r.sourceSetItemId===null||byId.get(r.sourceSetItemId)?.nativeCategory==='Set')&&
      r.craftingRecipeItemIds.every(t=>byId.get(t)?.itemType.subtypeName==='CraftingRecipe')&&
      Array.isArray(r.sourceFrame)&&r.sourceFrame.length===2&&r.sourceFrame.every(Number.isSafeInteger)&&
      r.sourceFrame[0]>=0&&r.sourceFrame[1]>0&&Array.isArray(r.observedFields)&&
      r.observedFields.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isSafeInteger)&&v[0]>0&&v[2]>0&&[0,1,2,5].includes(v[1]))&&
      r.nativeProperties&&Object.values(r.nativeProperties).every(v=>typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))&&
      r.collectionMembershipVerified===false&&r.worldMembershipVerified===false&&r.availabilityVerified===false,
      'ROW_'+i);
    const excluded=new Set(r.collectionExclusions.map(c=>c.setId+':'+c.groupIndex));
    const actual=r.collectionPositiveSourceLinks.filter(c=>!excluded.has(c.setId+':'+c.groupIndex));
    check(JSON.stringify(actual)===JSON.stringify(r.collectionSourceCandidates),'POLARITY_'+i);
    buckets[i&255].push(r);
    const type=r.itemType;
    f.nativeSubtypeItems.push([i,type.name,type.subtypeCode,type.subtypeName]);
    f.definitionScopeItems.push([i,r.definitionScope]);
    if(type.name==='ActivityItem')f.activityTypeItems.push([i,type.subtypeCode,type.subtypeName]);
    const tags=r.tags.filter(t=>FACETS.has(t.facet)).map(t=>[t.facet,t.key]);
    if(tags.length)f.items.push([i,tags]);
    // Source-complete decorative candidates: never require Collection membership.
    // Exclude quest requests, blockers and character/mount skins, not a
    // statement of legal placement or player ownership.
    if((type.name==='Furniture'&&[0,1,2,3,7,8,9].includes(type.subtypeCode))||
       (type.name==='Trimming'&&[0,1].includes(type.subtypeCode))||
       (type.name==='Building'&&[0,1,2,3,4,5].includes(type.subtypeCode))||
       (type.name==='Skin'&&[1,2,3,6].includes(type.subtypeCode))||
       (type.name==='Environment'&&(r.iconGuid||Object.values(r.names).some(Boolean)))){
      const association=stallRelations.get(i)??skinRelations.get(i);
      explore.push({itemId:i,names:r.names,nativeCategory:type.name,subtype:type.subtypeCode,
        tags:tags.filter(t=>['color','furnitureStyle','furnitureKind'].includes(t[0])),
        universes:association?.applied?[association.candidate.universeTagId]:r.universeTagIds,
        universeStatus:association?.applied?'source_linked':r.universeSourceStatus,
        ...(association?.applied?{universeAssociation:association.candidate,
          originalUniverseStatus:r.universeSourceStatus}:{}),iconGuid:r.iconGuid,
        ...(placementContexts.has(i)?{sourcePlacement:placementContexts.get(i)}:{}),
        sourceSetItemId:r.sourceSetItemId,
        sourceSetNames:r.sourceSetItemId===null?{}:byId.get(r.sourceSetItemId)?.names??{},
        prefabGuid:r.artwork.prefabGuid??null,nativeKey:r.nativeKey,
        footprintSignature:r.sourceAttributes?.GridAreaData&&
          Number.isSafeInteger(r.sourceAttributes.GridAreaData.SizeX)&&
          Number.isSafeInteger(r.sourceAttributes.GridAreaData.SizeY)&&
          Array.isArray(r.sourceAttributes.GridAreaData.Layers)&&
          !r.sourceAttributes.GridAreaData._unresolvedFields?.length
          ?hash(json(r.sourceAttributes.GridAreaData)):null});
    }
    const codes=sourceCodes(r);if(codes.length)f.categoryItems.push([i,codes]);
    if(r.universeTagIds.length){
      f.universeSourceTagItems.push([i,r.universeTagIds]);
      f.universeSourceItems.push([i,r.universeTagIds.map(t=>universes.get(t).key)]);
    }
    f.universeSourceStatusItems.push([i,r.universeSourceStatus]);
    if(r.worldTagIds.length)f.worldSourceTagItems.push([i,r.worldTagIds]);
    if(r.sourceSetItemId!==null)f.sourceSetItems.push([i,r.sourceSetItemId]);
    if(r.craftingRecipeItemIds.length)f.craftingRecipeResultItems.push([i,r.craftingRecipeItemIds]);
    // Include source-matched definitions and item-like classes as browse
    // candidates. This does not declare them all visible/owned/collectible.
    if(r.definitionScope!=='other_definition'){
      f.browseItems.push([i,r.nativeCategory,type.subtypeCode,r.iconGuid,r.definitionScope]);
      for(const l of LOCALES)if(r.names[l]!==null)names[l].push([i,r.names[l]]);
    }
  }
  check(f.nativeSubtypeItems.length===e.count&&
    f.universeSourceStatusItems.length===e.count&&
    f.craftingRecipeResultItems.length===source.coverage.recipeResultItemIds&&
    f.craftingRecipeResultItems.reduce((n,r)=>n+r[1].length,0)===source.coverage.recipeResultLinks&&
    f.worldSourceTagItems.length===source.coverage.worldTagItemIds&&
    rows.reduce((n,r)=>n+r.collectionPositiveSourceLinks.length,0)===source.coverage.positiveSourceLinks&&
    rows.reduce((n,r)=>n+r.collectionExclusions.length,0)===source.coverage.negativeSourceLinks,
    'FACT_CENSUS');
  for(const [key,count] of [['taggedItems','items'],['categoryItemCount','categoryItems'],
    ['activityTypeItemCount','activityTypeItems'],['nativeSubtypeItemCount','nativeSubtypeItems'],
    ['universeSourceItemCount','universeSourceItems'],['universeSourceTagCount','universeSourceTagItems'],
    ['universeSourceStatusItemCount','universeSourceStatusItems'],['worldSourceTagCount','worldSourceTagItems'],
    ['browseItemCount','browseItems']])f[key]=f[count].length;
  exploreThemeCensus(explore,byId);
  const acquisition=loadAcquisitionColumns(project,version,e.acquisitionProjection,rows);
  const protoAcquisition=loadProtoDbAcquisition(project,source,byId);
  const originalPrices=loadOriginalPriceFacts(project,source,byId);
  const questFlows=loadQuestFlowColumns(project,source,rows);
  const catalogFacts=buildCatalogFacts(source,rows);
  const storeLayout=buildStoreLayoutFacts(source,rows,catalogFacts.storeScreens);
  const furnitureDisplayRule=source.target.platform==='Steam'&&version==='1.26.2'&&
    source.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'&&
    source.sourceFilesSha256.Furniture==='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196';
  if(furnitureDisplayRule)check(rows.filter(r=>r.nativeCategory==='Furniture').length===6746&&
    rows.filter(r=>r.nativeCategory==='Furniture'&&[0,3].includes(r.itemType.subtypeCode)).length===5288,
    'STORE_FURNITURE_ORIGINAL_CENSUS');
  console.log('DB01_FRIENDSHIP_NEW_CLASSIFICATION '+JSON.stringify({
    additionalOrdinaryGameplay:[...protoAcquisition.byItem].filter(([id,links])=>links.some(l=>l.amount!==null)&&!acquisition?.summary.get(id)?.categories.includes('ordinary_gameplay')).length,
    previouslyUnclassified:[...protoAcquisition.byItem].filter(([id,links])=>links.some(l=>l.amount!==null)&&!acquisition?.summary.get(id)?.classified).length}));
  const index={schema:'wand.item-master.release@1',scope:'complete',version:e.release,target:source.target,
    ...(acquisition?{acquisitionProjection:acquisition.metadata}:{}),
    ...(originalPrices.metadata?{originalPriceProjection:originalPrices.metadata}:{}),
    ...(questFlows.metadata?{questFlowProjection:questFlows.metadata}:{}),
    count:e.count,bucketCount:256,archiveSha256:e.archiveSha256,
    ...(e.introductionHistorySha256?{introductionHistorySha256:e.introductionHistorySha256}:{}),
    sourceFilesVerified:source.sourceFilesVerified,sourceFilesSha256:source.sourceFilesSha256,
    sourceItemsSha256:source.sourceItemsSha256,sourceIl2cppDumpSha256:source.sourceIl2cppDumpSha256,
    coverage:{...source.coverage,itemNamesVerified:source.coverage.nameVerified,
      itemNamesUnverified:e.count-source.coverage.nameVerified,itemIconGuid:source.coverage.iconGuid,
      sourceTagReferences:rows.reduce((n,r)=>n+r.tags.length,0),
      itemsWithSourceTag:rows.filter(r=>r.tags.length>0).length,
      sourceCollectionCandidateReferences:rows.reduce((n,r)=>n+r.collectionSourceCandidates.length,0),
      itemsWithSourceCollectionCandidates:source.coverage.collectionCandidateItemIds,
      worldMembershipVerified:false,collectionMembershipVerified:false,
      acquisitionCoverageComplete:false,publishedR2ImageUrlAvailable:false},
    ...(sourceAttributeCoverage?{attributesSha256:e.attributesSha256,sourceAttributeCoverage}:{}),
    ...(nativeSupplementCoverage?{nativeSupplementSha256:e.nativeSupplementSha256,nativeSupplementCoverage}:{}),
    ...(referenceAttributeCoverage?{referenceAttributesSha256:e.referenceAttributesSha256,referenceAttributeCoverage}:{}),
    ...(reviewedRootArrayCoverage?{reviewedRootArraysSha256:e.reviewedRootArraysSha256,reviewedRootArrayCoverage}:{}),
    ...(reviewedMessageCoverage?{reviewedMessagesSha256:e.reviewedMessagesSha256,reviewedMessageCoverage}:{}),
    ...(reviewedMessageGroupCoverage?{reviewedMessageGroupsSha256:e.reviewedMessageGroupsSha256,reviewedMessageGroupCoverage}:{}),
    ...(reviewedStructureCoverage?{reviewedStructure:e.reviewedStructure,reviewedStructureCoverage}:{}),
    ...(reviewedRootScalarCoverage?{reviewedRootScalars:e.reviewedRootScalars,reviewedRootScalarCoverage}:{}),
    ...(localizations?{localizationSha256:e.localization.sha256,localizationCoverage:localizations.coverage}:{}),
    ...(linkedLocalizations?{linkedLocalizations:e.linkedLocalizations,linkedLocalizationCoverage:linkedLocalizations.coverage}:{}),
    shards:{},assets:{}};
  const root=join(project,'static/ddv/item-master');
  mkdirSync(root,{recursive:true});
  const stage=mkdtempSync(join(root,'.complete-'));
  const destination=join(root,'steam-'+version+'-complete');
  try{
    const {write,stats}=createProjectionWriter(root,stage,destination);
    for(let i=0;i<256;i++){
      const key=i.toString(16).padStart(2,'0'),path='id/'+key+'.json';
      index.shards[path]=write(path,{schema:'wand.item-master.shard@1',bucket:key,items:buckets[i]},buckets[i].length);
    }
    write('explore.json',{schema:'wand.explore.catalog@2',release:e.release,items:explore,
      universeTags:source.universeTags},explore.length);
    index.assets['collection-facets.json']=write('collection-facets.json',f,f.sourceItemCount);
    for(const l of LOCALES)index.assets['locale/'+l+'.json']=write('locale/'+l+'.json',
      {schema:'wand.item-master.complete-browse-names@1',release:e.release,locale:l,items:names[l]},names[l].length);
    index.assets['source-relations.json']=write('source-relations.json',{
      schema:'wand.item-master.complete-source-relations@1',release:e.release,
      collectionMenus:source.collectionMenus,collectionSelectors:source.collectionSelectors,
      ignoredSentinels:source.ignoredSentinels,universeTags:source.universeTags,worldTags:source.worldTags,
      sourceFieldDeclarations:source.sourceFieldDeclarations,
      ...(storeLayout.areas.length?{storeLayoutAreas:storeLayout.areas}:{}),gameRuntimeMembershipVerified:false
    },source.collectionSelectors.length);
    if(localizations)for(const locale of LOCALES){
      const entries=Object.entries(localizations.translations[locale]);
      const path='text/'+locale+'.json';
      index.assets[path]=write(path,{schema:'wand.item-master.localized-text@1',release:e.release,locale,items:entries},entries.length);
    }
    if(linkedLocalizations)for(const locale of LOCALES){
      const buckets=Array.from({length:64},()=>[]);
      for(const [k,v] of Object.entries(linkedLocalizations.translations[locale]))buckets[parseInt(linkedTextBucket(k),16)].push([k,v]);
      for(const [i,items] of buckets.entries()){
        const bucket=i.toString(16).padStart(2,'0'),path='linked-text/'+locale+'/'+bucket+'.json';
        index.assets[path]=write(path,{schema:'wand.item-master.linked-text-block@1',release:e.release,locale,bucket,items},items.length);
        check(index.assets[path].bytes<=16*1024*1024,'LINKED_TEXT_BLOCK_TOO_LARGE');
      }
    }
    writeFieldColumns(rows,e.release,write,index.assets,attachHistoricalContentOrigin(project,source,introductionHistory(project,e,version,source,rows)),acquisition,stallRelations,skinRelations,protoAcquisition,catalogFacts,furnitureDisplayRule,storeLayout,originalPrices,questFlows,placementContexts);
    write('index.json',index,index.count);
    installProjectionStage(stage,destination);
    console.log('DB-01 projection reuse:',JSON.stringify(stats));
  }catch(err){rmSync(stage,{recursive:true,force:true});throw err;}
  console.log('DB-01 complete-source master:',rows.length,'definitions,',source.coverage.nativeCategoryCount,'native classes,',source.coverage.sourceSelectorCount,'resolved source selectors');
}
