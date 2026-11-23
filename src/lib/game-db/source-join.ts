/**
 * DB-00 read-only join for independently validated DB-02, DB-03 and DB-04
 * readers. Existing stream clients own decoding and source verification.
 *
 * An original World/Universe Tag, a configured reward, and an acquisition
 * candidate are NOT evidence of game UI membership, entitlement or ownership.
 * No private source bytes, saves, or reconstructed game records are published.
 */
import { canonicalId } from './model.ts';
import type {SharedGameDatabase,SharedDbItem} from './integrated.ts';
import type {OriginDatabase,ItemOrigin} from '../acquisition/origins.ts';
import {
  hasPinnedStaticContainerEvidence,
  type PinnedStaticContainerContents
} from '../acquisition/public-static-container.ts';
import type {GuideRewardIndex,GuideItemRelation} from '../guide/reward-relations.ts';
import type {
  PublicQuestTargetReverseReader,QuestTargetItemReference
} from '../guide/public-quest-target-reverse.ts';
import type {
  Db04NativeItemScopeClient,Db04NativeItemScopeRow,
  Db04WorldTag,Db04NativeScopePage
} from '../world/native-item-scope.ts';

export const DB00_SOURCE_JOIN_CONTRACT='wand.game-db.source-join@1' as const;
const CURRENT_SOURCE_SHA=
  '496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b';
const CURRENT_RELEASE='steam-1.26.2-native-itemlist-v1';
const SHA=/^[0-9a-f]{64}$/;
type WorldTagSource='source_native_tag_only'|'not_loaded'|'outside_scope';

export interface Db00SourceJoinOptions{
  /** Already-validated DB-02 reader. Its source-specific statuses are retained. */
  readonly origins?:OriginDatabase;
  /** SHA-validated original static container templates, NEVER live chest contents. */
  readonly staticContainers?:PinnedStaticContainerContents;
  /** Already SHA-validated DB-03 reward index. Does not prove redemption. */
  readonly rewards?:GuideRewardIndex;
  /** Already SHA-pinned DB-03 original Quest objective Item candidates. */
  readonly questTargets?:PublicQuestTargetReverseReader;
  /** DB-04's locally SHA-validated PRIVATE source reader. */
  readonly nativeScope?:Db04NativeItemScopeClient;
  /** Independently trusted, owner-local audit+rows digests; both mandatory for nativeScope. */
  readonly nativeScopePins?:Readonly<{auditSha256:string;rowsSha256:string}>;
}
export interface Db00NativeTagEvidence{
  readonly status:WorldTagSource;
  readonly originalRow:Readonly<Db04NativeItemScopeRow>|null;
  readonly worldsDirect:readonly Db04WorldTag[];
  readonly universeTagsDirect:readonly string[];
  readonly universeSetCandidates:readonly string[];
  readonly gameUiMembershipVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00SourceJoinedItem{
  readonly itemId:string;
  readonly catalog:SharedDbItem|null;
  readonly catalogStatus:'current_published_item'|'outside_published_item_scope';
  /** null means this stream was not supplied; [] means no currently indexed route. */
  readonly origins:readonly ItemOrigin[]|null;
  readonly originCoverageComplete:false;
  /** null = source omitted; [] = no configured slot. Never merge with confirmed origins. */
  readonly staticContainerCandidates:readonly ItemOrigin[]|null;
  readonly staticContainerLiveContentsVerified:false;
  /** null means no verified reward source supplied, not "no rewards". */
  readonly starpathRelations:readonly GuideItemRelation[]|null;
  readonly starpathRewardsOnlyConfigured:true;
  /** null = not supplied, [] = no static target reference. Never a required quest item. */
  readonly questTargetCandidates:readonly QuestTargetItemReference[]|null;
  readonly questTargetRequirementsVerified:false;
  readonly questTargetPlayerProgressVerified:false;
  readonly nativeTags:Db00NativeTagEvidence;
  readonly currentlyAvailableVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00SourceWorldPage{
  readonly sourcePage:Db04NativeScopePage;
  readonly items:readonly Db00SourceJoinedItem[];
  readonly gameUiMembershipVerified:false;
}
export interface Db00SourceJoinedReader{
  readonly contract:typeof DB00_SOURCE_JOIN_CONTRACT;
  readonly snapshotId:string;
  getItem(id:string|number):Db00SourceJoinedItem;
  getItems(ids:readonly (string|number)[]):readonly Db00SourceJoinedItem[];
  /** Direct original Tag evidence only; NOT a Collection world selector. */
  byNativeWorldTag(tag:Db04WorldTag,page?:Readonly<{offset:number;limit:number}>):Db00SourceWorldPage;
}
function check(condition:unknown,code:string):asserts condition{
  if(!condition)throw new TypeError('DB00_SOURCE_JOIN_'+code);
}
function emptyTags(status:Exclude<WorldTagSource,'source_native_tag_only'>):Db00NativeTagEvidence{
  return Object.freeze({
    status,originalRow:null,
    worldsDirect:Object.freeze([]) as readonly Db04WorldTag[],
    universeTagsDirect:Object.freeze([]) as readonly string[],
    universeSetCandidates:Object.freeze([]) as readonly string[],
    gameUiMembershipVerified:false as const,
    acquisitionWorldVerified:false as const,
    dlcEntitlementVerified:false as const
  });
}
/**
 * Join original-source *evidence*, never convert a source tag or historical
 * reward into a verified DB-00 worlds/DLC/ownership fact.
 */
export function joinCurrentGameSources(
  db:SharedGameDatabase,options:Db00SourceJoinOptions={}
):Db00SourceJoinedReader{
  check(db?.contract==='wand.game-db.shared@1' &&
    db.snapshotId===CURRENT_RELEASE && db.itemCount===13202 &&
    db.target.platform==='Steam'&&db.target.gameVersion==='1.26.2'&&
    db.target.buildId===null&&db.target.sourceSha256===CURRENT_SOURCE_SHA,
    'CURRENT_STEAM_ITEMLIST_REQUIRED');
  const {origins,staticContainers,rewards,questTargets,nativeScope,nativeScopePins}=options;
  if(origins)check(origins.schema==='wand.db02.item-origins@1' &&
    origins.originCoverageComplete===false,'DB02_READER_INVALID');
  if(staticContainers)check(
    hasPinnedStaticContainerEvidence(staticContainers) &&
    staticContainers.sourceIntegrity==='original_protoDb_sha256_and_public_projection_sha256' &&
    staticContainers.coverage.definitionRecords===88 &&
    staticContainers.coverage.populatedSourceSlots===146 &&
    staticContainers.coverage.distinctItemIds===115 &&
    staticContainers.coverage.liveContentsVerified===false &&
    staticContainers.coverage.containerSpawnVerified===false &&
    staticContainers.coverage.guaranteedLootVerified===false &&
    staticContainers.coverage.personalSaveContentsIncluded===false,
    'DB02_PINNED_STATIC_CONTAINER_SOURCE_REQUIRED');
  if(rewards)check(rewards.contract==='wand.db03.reward-relations@1' &&
    rewards.evidence.platform==='Steam'&&rewards.evidence.gameVersion==='1.26.2'&&
    rewards.evidence.integrity==='pinned_public_sha256'&&
    rewards.coverage.currentAvailabilityVerified===false &&
    rewards.coverage.playerProgressIncluded===false,'DB03_SOURCE_NOT_PINNED');
  if(questTargets)check(
    questTargets.schema==='wand.db03.public-quest-target-reverse@1' &&
    questTargets.coverage.knownQuests===733 &&
    questTargets.coverage.sourceCandidateOccurrences===4897 &&
    questTargets.coverage.distinctItemIds===2551 &&
    questTargets.coverage.directOccurrences===4641 &&
    questTargets.coverage.alternativeOccurrences===256 &&
    questTargets.coverage.mandatoryRequirementVerified===false &&
    questTargets.coverage.playerProgressVerified===false &&
    typeof questTargets.getItemCandidates==='function',
    'DB03_QUEST_TARGET_SOURCE_REQUIRED');
  if(nativeScope){
    check(nativeScope.contract==='wand.db04.native-item-scope@1' &&
      nativeScope.source.platform==='Steam' &&
      nativeScope.source.gameVersion==='1.26.2' &&
      nativeScope.source.privateOnly===true &&
      nativeScope.source.publicationAuthorized===false &&
      nativeScope.source.originalItemDefinitions===13202 &&
      nativeScopePins && SHA.test(nativeScopePins.auditSha256) &&
      SHA.test(nativeScopePins.rowsSha256) &&
      nativeScope.source.auditSha256===nativeScopePins.auditSha256 &&
      nativeScope.source.rowsSha256===nativeScopePins.rowsSha256,
      'DB04_INDEPENDENT_PRIVATE_SOURCE_PINS_REQUIRED');
  }else{
    check(nativeScopePins===undefined,'DB04_PINS_WITHOUT_SOURCE');
  }
  const missing=emptyTags('not_loaded');
  const outside=emptyTags('outside_scope');
  const getItem=(raw:string|number):Db00SourceJoinedItem=>{
    const itemId=canonicalId(raw);
    const catalog=db.getItem(itemId);
    const numeric=Number(itemId);
    let nativeTags:Db00NativeTagEvidence=catalog?missing:outside;
    if(catalog&&nativeScope){
      const row=nativeScope.getItem(numeric);
      check(row && row.itemId===numeric &&
        (!catalog.nativeCategory || row.nativeCategory===catalog.nativeCategory),
        'DB04_CATALOG_IDENTITY_MISMATCH');
      nativeTags=Object.freeze({
        status:'source_native_tag_only' as const,
        originalRow:row,
        worldsDirect:Object.freeze([...row.worldsDirect]),
        universeTagsDirect:Object.freeze([...row.universeTagsDirect]),
        universeSetCandidates:Object.freeze([...row.universeSetCandidates]),
        gameUiMembershipVerified:false as const,
        acquisitionWorldVerified:false as const,
        dlcEntitlementVerified:false as const
      });
    }
    const found=origins?.getItem(itemId);
    check(!found||found.itemId===itemId && found.originCoverageComplete===false &&
      Array.isArray(found.origins) &&
      found.origins.every(origin=>origin.itemId===itemId &&
        origin.availability==='not_live_verified' &&
        (origin.routeStatus==='confirmed_source_link' ||
          origin.routeStatus==='static_candidate_only')),
      'DB02_ITEM_ID_OR_STATUS_MISMATCH');
    const configuredSlots=staticContainers?.getItemCandidates(itemId);
    check(!configuredSlots || Array.isArray(configuredSlots) &&
      configuredSlots.every(row=>row.itemId===itemId &&
        row.kind==='loot' && row.routeStatus==='static_candidate_only' &&
        row.availability==='not_live_verified' &&
        row.source.sourceId==='db02:native:steam-1262:container-template' &&
        row.source.gameVersion==='1.26.2'),
      'DB02_STATIC_CONTAINER_ITEM_OR_STATUS_MISMATCH');
    const relations=rewards?.getItemRelations(itemId);
    check(!relations||Array.isArray(relations) && relations.every(relation=>
      relation.itemId===itemId && relation.configuredRewardOnly===true &&
      relation.currentAvailabilityVerified===false &&
      relation.playerOwnershipVerified===false),'DB03_ITEM_ID_OR_STATUS_MISMATCH');
    const objectives=questTargets?.getItemCandidates(itemId);
    check(!objectives || Array.isArray(objectives)&&objectives.every(ref=>
      ref.itemId===itemId&&
      (ref.role==='direct'||ref.role==='alternative') &&
      ref.sourceCandidateOnly===true &&
      ref.mandatoryRequirementVerified===false &&
      ref.playerProgressVerified===false),
      'DB03_QUEST_TARGET_ID_OR_STATUS_MISMATCH');
    return Object.freeze({
      itemId,catalog,
      catalogStatus:catalog?'current_published_item' as const:
        'outside_published_item_scope' as const,
      origins:found?Object.freeze([...found.origins]):null,
      originCoverageComplete:false as const,
      staticContainerCandidates:configuredSlots?
        Object.freeze([...configuredSlots]):null,
      staticContainerLiveContentsVerified:false as const,
      starpathRelations:relations?Object.freeze([...relations]):null,
      starpathRewardsOnlyConfigured:true as const,
      questTargetCandidates:objectives?Object.freeze([...objectives]):null,
      questTargetRequirementsVerified:false as const,
      questTargetPlayerProgressVerified:false as const,
      nativeTags,
      currentlyAvailableVerified:false as const,
      playerOwnershipVerified:false as const
    });
  };
  return Object.freeze({
    contract:DB00_SOURCE_JOIN_CONTRACT,
    snapshotId:db.snapshotId,
    getItem,
    getItems(ids:readonly (string|number)[]){
      check(Array.isArray(ids)&&ids.length<=10000,'INVALID_BATCH');
      return Object.freeze(ids.map(getItem));
    },
    byNativeWorldTag(tag:Db04WorldTag,page?:Readonly<{offset:number;limit:number}>):
      Db00SourceWorldPage{
      check(nativeScope,'DB04_NATIVE_SCOPE_REQUIRED');
      const sourcePage=nativeScope.byWorldTag(tag,page);
      const items=sourcePage.itemIds.map(id=>{
        const joined=getItem(id);
        check(joined.catalog!==null &&
          joined.nativeTags.worldsDirect.includes(tag),
          'DB04_REVERSE_INDEX_IDENTITY_MISMATCH');
        return joined;
      });
      return Object.freeze({
        sourcePage,items:Object.freeze(items),
        gameUiMembershipVerified:false as const
      });
    }
  });
}
