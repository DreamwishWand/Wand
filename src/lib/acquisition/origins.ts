/** DB-02 shared acquisition origin ledger. No new production JavaScript or save writes. */
import {
  createGuideRewardIndex, loadGuideRewardIndex, DB03_REWARD_RELATION_CONTRACT,
  type GuideRewardIndex, type GuideRewardOccurrence
} from '../guide/reward-relations.ts';
import {STARPATH_PUBLIC_SHA} from '../guide/public-starpath.mjs';
import {createGuideStarpathHistory} from '../guide/starpath-history.ts';
import {hasPinnedPublicQuestAcquisitionEvidence,
  type PublicQuestAcquisitionIndex} from '../guide/public-quest-acquisition.ts';
import {OFFICIAL_CAMPAIGNS} from './official-campaigns.ts';
import {
  hasPinnedDb03RewardEvidence,
  type Db03NativeRewardCandidateIndex
} from './db03-native-rewards.ts';
import {historicalPremiumShop, type ShopAppearance} from './premium-shop-history.ts';
import {projectVerifiedSrc02Origins, type VerifiedSrc02OriginReader} from './native-origins.ts';

export const ORIGIN_SCHEMA = 'wand.db02.item-origins@1' as const;

export type OriginKind =
  | 'crafting' | 'cooking' | 'fishing' | 'mining' | 'timebending' | 'foraging'
  | 'farming' | 'loot' | 'game_shop' | 'quest_reward' | 'event_reward'
  | 'friendship_reward'
  | 'star_path_free' | 'star_path_premium' | 'star_path_vault'
  | 'twitch_drop' | 'redeem_code' | 'premium_shop'
  | 'official_campaign' | 'purchase_bonus' | 'gift' | 'other';

export type SourceKind = 'verified_liveops_cache' | 'verified_game_native'
  | 'official_publication' | 'verified_sale_snapshot' | 'unhashed_structural_candidate';
export type RouteStatus = 'confirmed_source_link' | 'static_candidate_only';
export type AccessTier = 'free' | 'premium' | 'not_applicable';

export interface OriginProvenance {
  readonly sourceId: string;
  readonly kind: SourceKind;
  readonly sourceUrl: string;
  readonly checkedOn: string;
  readonly gameVersion: string | null;
  /** Hash of the actual admitted source bytes; null for un-hashed official webpages. */
  readonly sha256: string | null;
}
export interface OriginWindow {
  readonly start: string | null;
  readonly endExclusive: string | null;
}
export interface OriginPrice {
  readonly quantity: number;
  readonly currency: string;
  readonly currencyItemId: string | null;
}
/**
 * Source-native acquisition coordinates are numeric game IDs, not decoded
 * world names. DB-04 owns world/scene interpretation.
 *
 * The r5 SRC-02 archive contains exactly five observed path families:
 * fishing, mining, growing, timebending and loot_table_candidate.
 * Static stall source candidates come from an independent stall/loot join.
 */
export type NativeOriginFamily =
  | 'fishing' | 'mining' | 'growing' | 'timebending'
  | 'loot_table_candidate' | 'static_stall_candidate';
export interface NativeOriginDetails {
  readonly family: NativeOriginFamily;
  readonly pathId: string;
  readonly definitionId: string | null;
  readonly sourceFile: string;
  readonly areaIds: readonly number[];
  readonly sceneIds: readonly number[];
  readonly rarity: number | null;
  readonly weathers: readonly string[];
  readonly timeOfDays: readonly string[];
  /** Only for growing results, never seed ownership or seed stock. */
  readonly seedItemId: string | null;
  readonly growthSeconds: number | null;
  readonly yieldedQuantity: number | null;
  readonly minHourglassLevel: number | null;
  readonly amountRange: Readonly<{min:number;max:number}> | null;
  readonly lootTableId: string | null;
  readonly lootGroupIndex: number | null;
  /** All SRC-02 LootTable acquisition contexts are explicitly false. */
  readonly lootContextVerified: false | null;
  readonly stallId: string | null;
  readonly stallSlotIndex: number | null;
  readonly candidateGroupIndexes: readonly number[];
  readonly conditionalFilter: boolean | null;
}

export interface ItemOrigin {
  readonly originId: string;
  readonly itemId: string;
  readonly kind: OriginKind;
  readonly routeStatus: RouteStatus;
  readonly campaignId: string | null;
  readonly name: string;
  readonly productId: string | null;
  readonly quantity: number | null;
  readonly price: OriginPrice | null;
  readonly accessTier: AccessTier;
  readonly window: OriginWindow;
  /** One period per observed sale, keeping separate reissues instead of overwriting. */
  readonly salePeriods: readonly OriginWindow[];
  readonly conditions: readonly string[];
  readonly source: OriginProvenance;
  readonly nativeDetails?: NativeOriginDetails;
  /** Never inferred from static windows or an old announcement. */
  readonly availability: 'not_live_verified';
}

/** Official campaign records can be complete even when Item ID mapping is absent. */
export interface CampaignReward {
  readonly name: string;
  readonly itemId: string | null;
  readonly quantity: number | null;
  readonly cumulativeWatchMinutes: number | null;
}
export interface CampaignWindowEvidence {
  readonly window: OriginWindow;
  readonly officialUrl: string;
  readonly checkedOn: string;
  readonly status: 'published_schedule' | 'conflicting_official_announcement';
}
export interface OfficialCampaign {
  readonly campaignId: string;
  readonly kind: 'twitch_drop' | 'redeem_code' | 'premium_shop' |
    'official_campaign' | 'purchase_bonus' | 'gift' | 'event_reward';
  readonly name: string;
  readonly code: string | null;
  readonly productId: string | null;
  readonly window: OriginWindow;
  /** Preserve contradictory official windows without silently overwriting. */
  readonly windowEvidence?: readonly CampaignWindowEvidence[];
  readonly conditions: readonly string[];
  readonly rewards: readonly CampaignReward[];
  readonly source: OriginProvenance;
  readonly availability: 'not_live_verified';
}

export interface NativeAcquisitionReader {
  getItem(itemId: number): unknown;
}
export interface OriginDatabase {
  readonly schema: typeof ORIGIN_SCHEMA;
  readonly originCoverageComplete: false;
  getItem(itemId: number | string): {
    readonly itemId: string;
    readonly origins: readonly ItemOrigin[];
    readonly nativeAcquisition: unknown;
    readonly originCoverageComplete: false;
  };
  getCampaign(campaignId: string): OfficialCampaign | null;
  listCampaigns(): readonly OfficialCampaign[];
  getHistoricalPremiumShopWeek(weekStart: string): readonly ShopAppearance[];
  getHistoricalPremiumShopProduct(name: string): readonly ShopAppearance[];
  getHistoricalPremiumShopCoverage(): typeof historicalPremiumShop.coverage;
  getOrigin(originId: string): readonly ItemOrigin[];
  getCoverage(): {
    readonly linkedItemIds: number;
    readonly linkedRoutes: number;
    readonly campaigns: number;
    readonly rewardNamesAwaitingItemId: number;
    readonly routesBySourceKind: Readonly<Record<SourceKind, number>>;
    readonly originCoverageComplete: false;
  };
}

const ID = /^[1-9][0-9]{0,15}$/;
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9:._\/-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d\d-\d\d$/;
const VALID_KINDS: ReadonlySet<string> = new Set<OriginKind>([
  'crafting','cooking','fishing','mining','timebending','foraging','farming','loot',
  'game_shop','quest_reward','event_reward','friendship_reward','star_path_free',
  'star_path_premium','star_path_vault','twitch_drop','redeem_code',
  'premium_shop','official_campaign','purchase_bonus','gift','other'
]);
const ONLINE = new Set<OriginKind>([
  'star_path_free','star_path_premium','star_path_vault','twitch_drop',
  'redeem_code','premium_shop','official_campaign','purchase_bonus','gift'
]);
function assert(ok: unknown, why: string): asserts ok {
  if (!ok) throw new TypeError('DB02_ORIGINS_' + why);
}
function id(value: unknown): string {
  const key = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  assert(typeof key === 'string' && ID.test(key) && Number.isSafeInteger(Number(key)), 'ITEM_ID');
  return key;
}
function period(value: OriginWindow): void {
  assert(value !== null && typeof value === 'object', 'PERIOD');
  for (const date of [value.start, value.endExclusive]) {
    assert(date === null || (typeof date === 'string' &&
      (DATE.test(date) || (!Number.isNaN(Date.parse(date)) && /Z$/.test(date)))), 'DATE');
  }
  if (value.start && value.endExclusive)
    assert(value.start < value.endExclusive, 'PERIOD_ORDER');
}
function provenance(source: OriginProvenance): void {
  assert(source && SAFE_KEY.test(source.sourceId) &&
    ['verified_liveops_cache','verified_game_native','official_publication','verified_sale_snapshot','unhashed_structural_candidate']
      .includes(source.kind) &&
    typeof source.sourceUrl === 'string' && source.sourceUrl.length > 0 &&
    (source.sourceUrl.startsWith('https://') || source.sourceUrl.startsWith('/')) &&
    DATE.test(source.checkedOn) &&
    (source.gameVersion === null || /^\d+\.\d+\.\d+$/.test(source.gameVersion)) &&
    (source.sha256 === null || SHA.test(source.sha256)), 'PROVENANCE');
  if (source.kind === 'official_publication')
    assert(source.sourceUrl.startsWith('https://'), 'OFFICIAL_URL');
  else if(source.kind === 'unhashed_structural_candidate')
    assert(source.sha256 === null, 'UNHASHED_SOURCE_CANNOT_ASSERT_HASH');
  else assert(source.sha256 !== null, 'SOURCE_HASH');
}
function validateCampaign(c: OfficialCampaign): void {
  assert(c && SAFE_KEY.test(c.campaignId) &&
    ['twitch_drop','redeem_code','premium_shop','official_campaign',
      'purchase_bonus','gift','event_reward'].includes(c.kind) &&
    !!c.name && Array.isArray(c.rewards) && Array.isArray(c.conditions) &&
    c.availability === 'not_live_verified' &&
    (c.code === null || /^[A-Za-z0-9_-]{3,80}$/.test(c.code)) &&
    (c.productId === null || SAFE_KEY.test(c.productId)), 'CAMPAIGN');
  period(c.window);
  if(c.windowEvidence!==undefined){
    assert(Array.isArray(c.windowEvidence)&&c.windowEvidence.length>0,'CAMPAIGN_WINDOW_EVIDENCE');
    for(const claim of c.windowEvidence){
      period(claim.window);
      assert(typeof claim.officialUrl==='string' &&
        claim.officialUrl.startsWith('https://disneydreamlightvalley.com/') &&
        DATE.test(claim.checkedOn) &&
        ['published_schedule','conflicting_official_announcement'].includes(claim.status),
        'CAMPAIGN_WINDOW_SOURCE');
    }
  }
  provenance(c.source);
  for (const reward of c.rewards) {
    assert(reward && typeof reward.name === 'string' && !!reward.name &&
      (reward.itemId === null || id(reward.itemId) === reward.itemId) &&
      (reward.quantity === null || (Number.isSafeInteger(reward.quantity) && reward.quantity > 0)) &&
      (reward.cumulativeWatchMinutes === null ||
        (Number.isSafeInteger(reward.cumulativeWatchMinutes) &&
        reward.cumulativeWatchMinutes > 0)), 'CAMPAIGN_REWARD');
  }
}
function validateOrigin(o: ItemOrigin): void {
  assert(o && SAFE_KEY.test(o.originId) && id(o.itemId) === o.itemId &&
    VALID_KINDS.has(o.kind) && !!o.name && 
    ['confirmed_source_link','static_candidate_only'].includes(o.routeStatus) &&
    ['free','premium','not_applicable'].includes(o.accessTier) &&
    (o.campaignId === null || SAFE_KEY.test(o.campaignId)) &&
    (o.productId === null || SAFE_KEY.test(o.productId)) &&
    (o.quantity === null || (Number.isSafeInteger(o.quantity) && o.quantity > 0)) &&
    o.availability === 'not_live_verified' &&
    Array.isArray(o.salePeriods) && Array.isArray(o.conditions), 'ORIGIN');
  if (ONLINE.has(o.kind)) assert(o.campaignId !== null, 'ONLINE_CAMPAIGN_REQUIRED');
  if (o.price !== null) {
    assert(Number.isSafeInteger(o.price.quantity) && o.price.quantity >= 0 &&
      !!o.price.currency && (o.price.currencyItemId === null ||
      id(o.price.currencyItemId) === o.price.currencyItemId), 'PRICE');
  }
  period(o.window);
  for (const p of o.salePeriods) period(p);
  provenance(o.source);
  if (o.nativeDetails !== undefined) {
    const n = o.nativeDetails;
    const families = ['fishing','mining','growing','timebending',
      'loot_table_candidate','static_stall_candidate'];
    const isId = (v: unknown) => v === null ||
      (typeof v === 'string' && ID.test(v) && Number.isSafeInteger(Number(v)));
    const integers = (v: unknown) => Array.isArray(v) &&
      v.every(x => Number.isSafeInteger(x) && x >= 0);
    assert(n && typeof n === 'object' && families.includes(n.family) &&
      typeof n.pathId === 'string' && SAFE_KEY.test(n.pathId) &&
      typeof n.sourceFile === 'string' && n.sourceFile.startsWith('itemlist/') &&
      isId(n.definitionId) && isId(n.seedItemId) && isId(n.lootTableId) &&
      isId(n.stallId) && integers(n.areaIds) && integers(n.sceneIds) &&
      integers(n.candidateGroupIndexes) &&
      (n.rarity === null || (Number.isSafeInteger(n.rarity) && n.rarity >= 0)) &&
      (n.growthSeconds === null || (Number.isFinite(n.growthSeconds) &&
        n.growthSeconds >= 0)) &&
      (n.yieldedQuantity === null || (Number.isSafeInteger(n.yieldedQuantity) &&
        n.yieldedQuantity > 0)) &&
      (n.minHourglassLevel === null || (Number.isSafeInteger(n.minHourglassLevel) &&
        n.minHourglassLevel >= 0)) &&
      (n.lootGroupIndex === null || (Number.isSafeInteger(n.lootGroupIndex) &&
        n.lootGroupIndex >= 0)) &&
      (n.stallSlotIndex === null || (Number.isSafeInteger(n.stallSlotIndex) &&
        n.stallSlotIndex >= 0)) &&
      (n.conditionalFilter === null || typeof n.conditionalFilter === 'boolean') &&
      (n.lootContextVerified === null || n.lootContextVerified === false) &&
      Array.isArray(n.weathers) && n.weathers.every(x => typeof x === 'string') &&
      Array.isArray(n.timeOfDays) && n.timeOfDays.every(x => typeof x === 'string') &&
      (n.amountRange === null || (Number.isSafeInteger(n.amountRange.min) &&
        Number.isSafeInteger(n.amountRange.max) && n.amountRange.min >= 0 &&
        n.amountRange.min <= n.amountRange.max)), 'NATIVE_DETAILS');
    if (n.family === 'loot_table_candidate') {
      assert(o.kind === 'loot' && o.routeStatus === 'static_candidate_only' &&
        n.lootTableId !== null && n.lootGroupIndex !== null &&
        n.lootContextVerified === false, 'LOOT_CONTEXT_NOT_VERIFIED');
    }
    if (n.family === 'static_stall_candidate')
      assert(o.kind === 'game_shop' && o.routeStatus === 'static_candidate_only' &&
        n.stallId !== null, 'STALL_STOCK_NOT_VERIFIED');
    if (n.family === 'growing')
      assert(o.kind === 'farming' && n.seedItemId !== null, 'GROWING_SEED');
    if (n.family === 'timebending')
      assert(o.kind === 'timebending', 'TIMEBENDING_KIND');
    if (n.family === 'fishing' || n.family === 'mining')
      assert(o.kind === n.family, 'ACTIVITY_KIND');
  }
  // The official web articles cited in this release list names, not native Item IDs.
  if (o.routeStatus === 'confirmed_source_link')
    assert(o.source.kind !== 'official_publication' &&
      o.source.kind !== 'unhashed_structural_candidate',
      'UNVERIFIED_ORIGIN_SOURCE');
}

function frozen<T>(v: T): Readonly<T> { return Object.freeze(v); }

/** Every route is independently addressable, including multiple sales of the same item. */
export function createAcquisitionOriginDatabase(
  origins: readonly ItemOrigin[],
  campaigns: readonly OfficialCampaign[] = [],
  native: NativeAcquisitionReader | null = null
): OriginDatabase {
  const byCampaign = new Map<string, OfficialCampaign>();
  for (const c of campaigns) {
    validateCampaign(c);
    assert(!byCampaign.has(c.campaignId), 'DUPLICATE_CAMPAIGN');
    byCampaign.set(c.campaignId, c);
  }
  const byItem = new Map<string, ItemOrigin[]>();
  const byRoute = new Map<string, ItemOrigin[]>();
  const unique = new Set<string>();
  const sources: Record<SourceKind, number> = {
    verified_liveops_cache: 0, verified_game_native: 0,
    official_publication: 0, verified_sale_snapshot: 0,
    unhashed_structural_candidate: 0
  };
  for (const o of origins) {
    validateOrigin(o);
    if (o.campaignId !== null) {
      const campaign = byCampaign.get(o.campaignId);
      assert(campaign !== undefined, 'UNKNOWN_CAMPAIGN');
      if (o.kind === 'twitch_drop' || o.kind === 'redeem_code' ||
          o.kind === 'premium_shop' || o.kind === 'purchase_bonus') {
        assert(campaign.kind === o.kind, 'CAMPAIGN_KIND');
      }
    }
    const key = o.originId + '\u0000' + o.itemId;
    assert(!unique.has(key), 'DUPLICATE_LINK');
    unique.add(key);
    (byItem.get(o.itemId) ?? (byItem.set(o.itemId, []), byItem.get(o.itemId)!)).push(o);
    (byRoute.get(o.originId) ?? (byRoute.set(o.originId, []), byRoute.get(o.originId)!)).push(o);
    sources[o.source.kind]++;
  }
  for (const links of [...byItem.values(), ...byRoute.values()]) Object.freeze(links);
  const campaignList = Object.freeze([...campaigns]);
  const coverage = frozen({
    linkedItemIds: byItem.size,
    linkedRoutes: origins.length,
    campaigns: campaigns.length,
    rewardNamesAwaitingItemId: campaigns.reduce(
      (n, c) => n + c.rewards.filter(r => r.itemId === null).length, 0),
    routesBySourceKind: frozen(sources),
    originCoverageComplete: false as const
  });
  return frozen({
    schema: ORIGIN_SCHEMA,
    originCoverageComplete: false as const,
    getItem(itemId: number | string) {
      const key = id(itemId);
      return frozen({
        itemId: key,
        origins: byItem.get(key) ?? Object.freeze([] as ItemOrigin[]),
        nativeAcquisition: native?.getItem(Number(key)) ?? null,
        originCoverageComplete: false as const
      });
    },
    getOrigin(originId: string) { return byRoute.get(originId) ?? []; },
    getCampaign(campaignId: string) { return byCampaign.get(campaignId) ?? null; },
    listCampaigns() { return campaignList; },
    getHistoricalPremiumShopWeek(weekStart:string) { return historicalPremiumShop.getWeek(weekStart); },
    getHistoricalPremiumShopProduct(name:string) { return historicalPremiumShop.getProduct(name); },
    getHistoricalPremiumShopCoverage() { return historicalPremiumShop.coverage; },
    getCoverage() { return coverage; }
  });
}

const STARPATH_SOURCE: OriginProvenance = Object.freeze({
  sourceId: 'db03:starpath:2026-11-22', kind:'verified_liveops_cache',
  sourceUrl:'/guide/public/starpath-cache-2026-11-22.json',
  checkedOn:'2026-11-22',gameVersion:'1.26.2',sha256:STARPATH_PUBLIC_SHA
});
const STRUCTURAL_SOURCE:OriginProvenance=Object.freeze({
  ...STARPATH_SOURCE,kind:'unhashed_structural_candidate',sha256:null
});

/**
 * Project the *DB-03-owned* relation graph. DB-03 preserves the exact original
 * reward page / slot / currency / recurrence / alternatives; DB-02 does not
 * parse the reward tables or invent historical Star Path item links.
 */
export function projectGuideRewardOrigins(index:GuideRewardIndex):{
  origins:ItemOrigin[];campaigns:OfficialCampaign[];
} {
  assert(index?.contract===DB03_REWARD_RELATION_CONTRACT &&
    index.coverage.recordedRewardSlots===67 &&
    index.coverage.historicalSeasonCatalogComplete===false &&
    index.evidence.gameVersion==='1.26.2' &&
    index.evidence.publicProjectionSha256===STARPATH_PUBLIC_SHA, 'DB03_INDEX');
  const bytesVerified=index.evidence.integrity==='pinned_public_sha256';
  const source=bytesVerified?STARPATH_SOURCE:STRUCTURAL_SOURCE;
  const origins:ItemOrigin[]=[];
  const campaigns:OfficialCampaign[]=[];
  for(const season of index.seasons){
    const campaignId='starpath:'+season.id;
    const window=frozen({start:season.startUtc,endExclusive:season.endUtcExclusive});
    const campaign:OfficialCampaign={
      campaignId,kind:'event_reward',name:season.title,code:null,productId:null,
      window,conditions:frozen([
        'Star Path rewards require progression and manual claim',
        'Premium access cost (not per-item): '+season.premiumAccessCost+
          ' Moonstones; currency Item ID '+season.premiumAccessCurrencyItemId
      ]),rewards:frozen([]),source,availability:'not_live_verified'
    };
    campaigns.push(campaign);
    for(const occurrence of index.getSeasonRewards(season.id)){
      assert(occurrence.seasonId===season.id &&
        index.getItemAcquisitionCandidates(occurrence.itemId).some(
          rel=>rel.occurrenceId===occurrence.occurrenceId
        ),'DB03_REWARD_RELATION');
      const kind:OriginKind=occurrence.section==='vault'?'star_path_vault':
        occurrence.premium?'star_path_premium':'star_path_free';
      const conditions=[
        occurrence.premium?'Premium Star Path entitlement required':'Free reward tier',
        occurrence.section==='vault'?'Vault reward':
          occurrence.section==='bonus'?'Bonus reward page':'Normal reward page'
      ];
      if(occurrence.minPurchasedFromPreviousPage!==undefined)
        conditions.push('Previous-page purchases required: '+occurrence.minPurchasedFromPreviousPage);
      if(occurrence.currencyConversionPage)
        conditions.push('Currency conversion page');
      if(occurrence.recurrent)conditions.push('Recurrent reward');
      if(occurrence.alternateItemId)
        conditions.push('Vault alternative candidate (not a guaranteed reward): '+occurrence.alternateItemId);
      const o:ItemOrigin={
        originId:'starpath:'+occurrence.occurrenceId,
        itemId:id(occurrence.itemId),kind,
        routeStatus:bytesVerified?'confirmed_source_link':'static_candidate_only',
        campaignId,name:season.title,productId:null,quantity:occurrence.amount,
        price:occurrence.price===undefined?null:{
          quantity:occurrence.price,currency:occurrence.currencyName,currencyItemId:null
        },
        accessTier:occurrence.premium?'premium':'free',window,salePeriods:frozen([]),
        conditions:frozen(conditions),source,availability:'not_live_verified'
      };
      origins.push(o);
    }
  }
  assert(origins.length===67,'DB03_REWARD_COUNT');
  return {origins,campaigns};
}

/** Structure-only test/inspection entrypoint; NEVER claims byte-level provenance. */
export function starpathOriginRecords(snapshot:unknown):{
  origins:ItemOrigin[];campaigns:OfficialCampaign[];
} {
  return projectGuideRewardOrigins(createGuideRewardIndex(snapshot));
}

/**
 * DB-03-owned 21-season official announcement history, strictly NOT
 * game-native season IDs or proven reward Item IDs. These records are
 * navigable as campaigns, but cannot become acquisition links.
 */
export function projectHistoricalGuideCampaigns(index:GuideRewardIndex):readonly OfficialCampaign[]{
  const history=createGuideStarpathHistory(index);
  assert(history.coverage.historicalCatalogueComplete===false &&
    history.coverage.nativeRewardMappingsComplete===false,'DB03_HISTORICAL_SCOPE');
  return Object.freeze(history.officialAnnouncementsOnly.map(record=>Object.freeze({
    campaignId:'starpath-history:'+record.historyKey.replace('/','-'),
    kind:'event_reward' as const,name:record.titleEn,code:null,productId:null,
    window:{start:null,endExclusive:null},
    conditions:Object.freeze([
      'Official Star Path announcement only; native Season ID and Item ID reward mapping unknown',
      'Historical event dates, reward unlock conditions and ownership not verified'
    ]),rewards:Object.freeze([] as CampaignReward[]),
    source:Object.freeze({
      sourceId:'db03:official-history:'+record.historyKey.replace('/','-'),
      kind:'official_publication' as const,sourceUrl:record.officialEvidenceUrl,
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    }),availability:'not_live_verified' as const
  })));
}

/** Normal consumer: DB-03 verifies the 34,617 source bytes and pinned SHA-256 first. */
export async function loadStarpathAcquisitionDatabase(
  fetcher: typeof fetch = fetch,
  native: NativeAcquisitionReader | null = null,
  basePath = ''
): Promise<OriginDatabase> {
  assert(basePath === '' || (basePath.startsWith('/') && !basePath.includes('..') && !basePath.endsWith('/')), 'BASE_PATH');
  const guide = await loadGuideRewardIndex(
    basePath + '/guide/public/starpath-cache-2026-11-22.json', fetcher
  );
  const {origins, campaigns} = projectGuideRewardOrigins(guide);
  return createAcquisitionOriginDatabase(origins, campaigns, native);
}

/** Source-authenticated DB-03 paths plus independent official campaign history. */
export async function loadUnifiedAcquisitionOriginDatabase(
  fetcher: typeof fetch = fetch,
  native: NativeAcquisitionReader | null = null,
  basePath = '',
  nativeItemIds: readonly (string | number)[] = [],
  db03NativeRewards: Db03NativeRewardCandidateIndex | null = null,
  db03PublicQuestRewards: PublicQuestAcquisitionIndex | null = null
): Promise<OriginDatabase> {
  assert(basePath === '' || (basePath.startsWith('/') && !basePath.includes('..') && !basePath.endsWith('/')), 'BASE_PATH');
  const guide = await loadGuideRewardIndex(
    basePath + '/guide/public/starpath-cache-2026-11-22.json', fetcher
  );
  const starpath = projectGuideRewardOrigins(guide);
  // Import only requested Item IDs from the exact verified private r5 bundle.
  // Other callers retain the static native view without making source claims.
  const nativeRoutes = nativeItemIds.length ? projectVerifiedSrc02Origins(
    native as VerifiedSrc02OriginReader, nativeItemIds
  ) : [];
  // The optional DB-03 result is assembled from owner-selected private source
  // files by loadVerifiedDb03RewardCandidates; never fetch or publish them here.
  if(db03NativeRewards!==null){
    assert(hasPinnedDb03RewardEvidence(db03NativeRewards) &&
      db03NativeRewards.schema==='wand.db02.db03-source-reward-candidates@1' &&
      db03NativeRewards.sourceIntegrity===
        'pinned_original_sha256_and_original_file_equivalence' &&
      db03NativeRewards.sourceGameVersion==='1.26.1' &&
      db03NativeRewards.targetGameVersion==='1.26.2' &&
      db03NativeRewards.coverage.sourceCandidates===618 &&
      db03NativeRewards.coverage.guaranteedGrantsVerified===false &&
      db03NativeRewards.coverage.conditionsSourceReused===false &&
      db03NativeRewards.coverage.currentAvailabilityVerified===false &&
      Array.isArray(db03NativeRewards.origins),
      'DB03_VERIFIED_PRIVATE_REWARDS_REQUIRED');
  }
  if(db03PublicQuestRewards!==null){
    assert(hasPinnedPublicQuestAcquisitionEvidence(db03PublicQuestRewards) &&
      db03PublicQuestRewards.schema==='wand.db03.public-quest-acquisition-origins@1' &&
      db03PublicQuestRewards.sourceIntegrity==='pinned_public_quest_reward_sha256' &&
      db03PublicQuestRewards.coverage.totalItemOriginCandidates===395 &&
      db03PublicQuestRewards.coverage.guaranteedGrantVerified===false &&
      db03PublicQuestRewards.origins.length===395,
      'DB03_PINNED_PUBLIC_QUEST_REWARDS_REQUIRED');
  }
  return createAcquisitionOriginDatabase(
    [...starpath.origins, ...nativeRoutes, ...(db03NativeRewards?.origins??[]),
      ...(db03PublicQuestRewards?.origins??[])],
    [...starpath.campaigns, ...projectHistoricalGuideCampaigns(guide),
      ...OFFICIAL_CAMPAIGNS], native
  );
}
